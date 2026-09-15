/**
 * Read a generated PDF back: page geometry, positioned text and image placements.
 *
 * The documents are produced with subsetted CID fonts, so the text is decoded through
 * each font's ToUnicode CMap and advanced with its own /W widths. This is what lets a
 * test assert real coordinates ("the caption is below its rule", "the overlay landed
 * in its box") instead of trusting the layout constants.
 */
import fs from "node:fs";
import zlib from "node:zlib";

export interface TextRun {
  x: number;
  y: number;
  size: number;
  text: string;
  /** Index of the BT/ET block, i.e. of one pdfkit text call. */
  block: number;
}

function pdfObjects(raw: string): Map<number, string> {
  const objects = new Map<number, string>();
  const re = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) objects.set(Number(m[1]), m[2]);
  return objects;
}

function streamOf(objects: Map<number, string>, num: number): Buffer | null {
  const body = objects.get(num);
  if (!body) return null;
  const start = body.indexOf("stream");
  if (start < 0) return null;
  const data = body.slice(start + 6).replace(/^\r?\n/, "");
  const bytes = Buffer.from(data.slice(0, data.lastIndexOf("endstream")), "latin1");
  return /FlateDecode/.test(body) ? zlib.inflateSync(bytes) : bytes;
}

function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();
  let m: RegExpExecArray | null;
  const chars = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = chars.exec(text)) !== null) {
    for (const pair of m[1].match(/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>/g) ?? []) {
      const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(pair)!;
      map.set(parseInt(r[1], 16), String.fromCharCode(...(r[2].match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))));
    }
  }
  const ranges = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = ranges.exec(text)) !== null) {
    for (const row of m[1].match(/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*(?:<[0-9A-Fa-f]+>|\[[^\]]*\])/g) ?? []) {
      const r = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])/.exec(row)!;
      const lo = parseInt(r[1], 16);
      if (r[3].startsWith("[")) {
        (r[3].match(/<[0-9A-Fa-f]+>/g) ?? []).forEach((unit, index) => {
          const hex = unit.slice(1, -1);
          map.set(lo + index, String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16))));
        });
      } else {
        const hi = parseInt(r[2], 16);
        const base = parseInt(r[3].slice(1, -1), 16);
        for (let c = lo; c <= hi; c += 1) map.set(c, String.fromCharCode(base + (c - lo)));
      }
    }
  }
  return map;
}

const mul = (a: number[], b: number[]): number[] => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

export interface PdfInspection {
  pages: number;
  mediaBox: { width: number; height: number };
  runs: TextRun[];
  images: { x: number; y: number; width: number; height: number }[];
}

/** Read back page geometry, positioned text and image placements from the bytes. */
export function inspectPdf(buffer: Buffer): PdfInspection {
  const raw = buffer.toString("latin1");
  const objects = pdfObjects(raw);
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = /\/MediaBox\s*\[([^\]]+)\]/.exec(raw);
  const mediaBox = box
    ? { width: Number(box[1].trim().split(/\s+/)[2]), height: Number(box[1].trim().split(/\s+/)[3]) }
    : { width: 0, height: 0 };

  const fontInfo = new Map<number, { cmap: Map<number, string>; widths: Map<number, number> }>();
  for (const [num, body] of objects) {
    if (!/\/Subtype\s*\/Type0/.test(body)) continue;
    const toUni = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
    const desc = /\/DescendantFonts\s*\[\s*(\d+)\s+0\s+R/.exec(body);
    const cmap = toUni ? parseCMap((streamOf(objects, Number(toUni[1])) ?? Buffer.from("")).toString("latin1")) : new Map<number, string>();
    const widths = new Map<number, number>();
    if (desc) {
      // The advance widths live on the CIDFont (the descendant), not on the Type0
      // wrapper, as "start [w1 w2 …]" runs.
      const cid = objects.get(Number(desc[1])) ?? "";
      const w = /\/W\s*\[([\s\S]*?)\]\s*(?=\/|>>)/.exec(cid);
      if (w) {
        const re2 = /(\d+)\s*\[\s*([-\d\s.]+)\]/g;
        let m2: RegExpExecArray | null;
        while ((m2 = re2.exec(w[1])) !== null) {
          m2[2].trim().split(/\s+/).map(Number).forEach((value, index) => widths.set(Number(m2![1]) + index, value));
        }
      }
    }
    fontInfo.set(num, { cmap, widths });
  }

  const pageImages = new Set<string>();
  const pageFonts = new Map<string, number>();
  for (const body of objects.values()) {
    // The page may reference its resources indirectly, or pdfkit may inline the
    // dictionary; look at the dictionary body in both cases.
    const resNum = /\/Resources\s+(\d+)\s+0\s+R/.exec(body);
    const resBody = resNum ? (objects.get(Number(resNum[1])) ?? "") : body;
    const xobjects = /\/XObject\s*<<([^>]*)>>/.exec(resBody);
    if (xobjects) {
      const ire = /\/(I\d+|Im\d+)\s+\d+\s+0\s+R/g;
      let im: RegExpExecArray | null;
      while ((im = ire.exec(xobjects[1])) !== null) pageImages.add(im[1]);
    }
    const fonts = /\/Font\s*<<([^>]*)>>/.exec(resBody);
    if (!fonts) continue;
    const re = /\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonts[1])) !== null) pageFonts.set(m[1], Number(m[2]));
  }

  let content = "";
  for (const [num] of objects) {
    const bytes = streamOf(objects, num);
    if (!bytes) continue;
    const text = bytes.toString("latin1");
    if (/BT/.test(text) && text.length > content.length) content = text;
  }

  const runs: TextRun[] = [];
  const images: PdfInspection["images"] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = tm.slice();
  let current: { cmap: Map<number, string>; widths: Map<number, number> } | null = null;
  let size = 12;
  let charSpacing = 0;
  let hscale = 100;
  let block = 0;

  const show = (hex: string): void => {
    const clean = hex.replace(/\s/g, "");
    const codes: number[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) codes.push(parseInt(clean.slice(i, i + 2), 16));
    const text = codes.map((code) => current?.cmap.get(code) ?? "").join("");
    const trm = mul([size * hscale / 100, 0, 0, size, 0, 0], mul(tm, ctm));
    if (text.trim()) runs.push({ x: trm[4], y: trm[5], size, text, block });
    let width = 0;
    for (const code of codes) width += ((current?.widths.get(code) ?? 0) / 1000) * size + charSpacing;
    tm = mul([1, 0, 0, 1, width * hscale / 100, 0], tm);
  };

  const tokens = content.match(/\[[^\]]*\]|\((?:\\.|[^\\()])*\)|\/[^\s/\[\]()<>]+|<[0-9A-Fa-f\s]+>|-?[\d.]+|[A-Za-z'"*]+/g) ?? [];
  const operands: (number | string)[] = [];
  for (const token of tokens) {
    if (/^-?[\d.]+$/.test(token)) { operands.push(Number(token)); continue; }
    if (token.startsWith("/") || token.startsWith("<") || token.startsWith("(") || token.startsWith("[")) { operands.push(token); continue; }
    switch (token) {
      case "q": stack.push(ctm.slice()); break;
      case "Q": if (stack.length) ctm = stack.pop()!; break;
      case "cm": if (operands.length >= 6) ctm = mul(operands.slice(-6).map(Number), ctm); break;
      case "BT": block += 1; tm = [1, 0, 0, 1, 0, 0]; tlm = tm.slice(); break;
      case "Tf": {
        // "Tf" is ("/F3" size): font name first, size second.
        const name = String(operands[operands.length - 2] ?? "").replace("/", "");
        size = Number(operands[operands.length - 1]) || 0;
        current = fontInfo.get(pageFonts.get(name) ?? -1) ?? null;
        break;
      }
      case "Tc": charSpacing = Number(operands[operands.length - 1]) || 0; break;
      case "Tz": hscale = Number(operands[operands.length - 1]) || 100; break;
      case "Tm": if (operands.length >= 6) { tm = operands.slice(-6).map(Number); tlm = tm.slice(); } break;
      case "Td":
      case "TD":
        if (operands.length >= 2) {
          tlm = mul([1, 0, 0, 1, Number(operands[operands.length - 2]), Number(operands[operands.length - 1])], tlm);
          tm = tlm.slice();
        }
        break;
      case "Tj": {
        const hex = String(operands[operands.length - 1] ?? "");
        if (hex.startsWith("<")) show(hex.slice(1, -1));
        break;
      }
      case "TJ": {
        const arr = String(operands[operands.length - 1] ?? "");
        if (arr.startsWith("[")) {
          for (const part of arr.match(/<[0-9A-Fa-f\s]+>|-?[\d.]+/g) ?? []) {
            if (part.startsWith("<")) show(part.slice(1, -1));
            // A positive number in a TJ array moves the cursor BACK, i.e. the
            // negative of the adjustment, exactly like pdfkit writes it.
            else tm = mul([1, 0, 0, 1, (Number(part) / 1000) * size * hscale / 100, 0], tm);
          }
        }
        break;
      }
      case "Do": {
        const name = String(operands[operands.length - 1] ?? "").replace("/", "");
        if (pageImages.has(name)) {
          const corner = mul([1, 0, 0, 1, 0, 0], ctm);
          const opposite = mul([1, 0, 0, 1, 1, 1], ctm);
          images.push({
            x: Math.min(corner[4], opposite[4]),
            y: Math.min(corner[5], opposite[5]),
            width: Math.abs(opposite[4] - corner[4]),
            height: Math.abs(opposite[5] - corner[5]),
          });
        }
        break;
      }
      default: break;
    }
    operands.length = 0;
  }

  return { pages, mediaBox, runs, images };
}

/**
 * Group runs into logical lines: one line per pdfkit text call (BT block), ordered
 * top-down. Grouping by baseline alone would merge the label and its value, which are
 * two separate calls on the same line.
 */
export function linesOf(inspection: PdfInspection): { y: number; text: string; x: number }[] {
  const byBlock = new Map<number, TextRun[]>();
  for (const run of inspection.runs) {
    const list = byBlock.get(run.block) ?? [];
    list.push(run);
    byBlock.set(run.block, list);
  }

  return [...byBlock.values()]
    .map((parts) => {
      const sorted = parts.sort((a, b) => (b.y - a.y) || (a.x - b.x));
      return {
        y: sorted[0].y,
        x: sorted[0].x,
        text: sorted.map((part) => part.text.replace(/\u0000/g, "")).join(""),
      };
    })
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));
}

export function allText(inspection: PdfInspection): string {
  return linesOf(inspection).map((line) => line.text).join("\n");
}

