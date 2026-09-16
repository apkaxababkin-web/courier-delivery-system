/**
 * PDF generation for the client document set: invoice and act.
 *
 * Both templates are reproduced from the reference documents that were used before
 * (Счет №256 / Акт №256): absolute coordinates, one page each, the same block order,
 * the same table geometry and the same signature area. The page is A4 595.28 × 841.89
 * with a 28.8pt frame; all numbers below were measured from those references.
 *
 * Fonts: Liberation Serif (Arial-metric compatible) is resolved ESM-safely next to
 * the bundle — see fontsDirectory(). Never use __dirname here.
 *
 * The signature and stamp are drawn last, as overlays in a fixed box: they never
 * change the flow of the text above them, are never stretched and may be absent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatMoney, groupThousands } from "../../shared/billing-format";
import type { DocumentSetData } from "./billingDocumentData";
import { fitSize, type DocumentOverlays, type OverlayPlacement } from "./documentImages";

/**
 * Fonts are shipped as a sibling directory of the compiled bundle.
 *
 * The backend is bundled by esbuild into a single ES module (`dist/index.js`) and
 * runs as ESM, where `__dirname` does not exist. `import.meta.url` is the
 * ESM-safe equivalent and esbuild keeps it untouched for `--format=esm`, so the
 * resolved directory is the one holding the running bundle:
 *
 *   bundle   (repo)      : <repo>/dist/index.js     -> <repo>/dist/assets/fonts
 *   bundle   (container) : /app/dist/index.js       -> /app/dist/assets/fonts
 *   sources  (tsx/vitest) : <repo>/server/_core/*.ts -> <repo>/server/assets/fonts
 *
 * `pnpm run build:backend` copies server/assets into dist/assets so both layouts
 * are identical; the Dockerfile copies that directory into the image untouched.
 */
function fontsDirectory(): string {
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Running from the bundle: dist/assets/fonts (and the container equivalent).
    path.join(bundleDir, "assets", "fonts"),
    // Running the sources directly (tsx / vitest): server/assets/fonts.
    path.join(bundleDir, "..", "..", "assets", "fonts"),
    // Bundled with the bundle one level deeper than the assets root.
    path.join(bundleDir, "..", "assets", "fonts"),
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      `Не найден каталог шрифтов для PDF. Проверены: ${candidates.join(", ")}. ` +
        "Убедитесь, что server/assets скопирован в dist/assets (pnpm run build:assets).",
    );
  }
  return found;
}

const FONT_DIR = fontsDirectory();
const FONT_REGULAR = path.join(FONT_DIR, "LiberationSerif-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "LiberationSerif-Bold.ttf");

/**
 * Diagnostic probe for the compiled bundle: `PDF_FONTS_PROBE=1 node dist/index.js`
 * prints where the fonts were resolved from and how they were resolved, then stops
 * before any server or database work. It exists so the compiled artifact can be
 * asserted end-to-end (used by tests/compiled-bundle.test.ts) instead of trusting
 * the sources. It never runs in normal operation.
 */
if (process.env.PDF_FONTS_PROBE === "1") {
  console.log(JSON.stringify({
    probe: "pdf-fonts",
    moduleUrl: import.meta.url,
    fontDir: FONT_DIR,
    regular: FONT_REGULAR,
    bold: FONT_BOLD,
    regularExists: fs.existsSync(FONT_REGULAR),
    boldExists: fs.existsSync(FONT_BOLD),
  }));
  process.exit(0);
}

/** Fonts used inside the generated PDFs. */
export function pdfFontFiles(): { regular: string; bold: string } {
  return { regular: FONT_REGULAR, bold: FONT_BOLD };
}

function assertFonts(): void {
  for (const file of [FONT_REGULAR, FONT_BOLD]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Не найден шрифт для PDF: ${file}. Проверьте, что каталог server/assets/fonts скопирован в образ.`);
    }
  }
}

/** "Почтовый адрес: …" line, printed only when it differs from the printed address. */
function buyerPostalLine(data: DocumentSetData): string | null {
  const postal = (data.buyer.postalAddress ?? "").trim();
  if (!postal) return null;
  if (postal === (data.buyer.address ?? "").trim()) return null;
  return `Почтовый адрес: ${postal}`;
}

interface Doc {
  font(name: string): Doc;
  fontSize(size: number): Doc;
  text(text: string, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  moveTo(x: number, y: number): Doc;
  lineTo(x: number, y: number): Doc;
  stroke(color?: string): Doc;
  lineWidth(width: number): Doc;
  rect(x: number, y: number, w: number, h: number): Doc;
  fill(color?: string): Doc;
  opacity(value: number): Doc;
  save(): Doc;
  restore(): Doc;
  y: number;
  page: { width: number; height: number; margins: { left: number; right: number; top: number; bottom: number } };
  addPage(): Doc;
  image(src: string | Buffer, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  openImage(src: string | Buffer): { width: number; height: number };
  heightOfString(text: string, options?: Record<string, unknown>): number;
  widthOfString(text: string): number;
  currentLineHeight(includingGap?: boolean): number;
  on(event: string, cb: (chunk: Buffer) => void): Doc;
  on(event: string, cb: () => void): Doc;
  end(): void;
  [key: string]: unknown;
}

type FontName = "Regular" | "Bold";

// ─── Page geometry measured from the reference documents ─────────────────────
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const FRAME_LEFT = 28.8;
const FRAME_TOP = 28.8;
const FRAME_WIDTH = 537.6;
const FRAME_HEIGHT = 784.9;

/** Font sizes of the reference: body 16, column captions 16.5, title 21. */
const SIZE_BODY = 12;
const SIZE_SMALL = 9.8;
const SIZE_CAPTION = 10.5;
/**
 * Floor for a table caption: «Наименование» is 80pt wide at 12pt in Liberation Serif
 * while the reference column is 66pt in this grid, so the caption is reduced only for
 * itself (the reference prints it at ≈11pt in Arial) instead of being abbreviated.
 */
const CAPTION_MIN_SIZE = 9.6;
const SIZE_TITLE = 15.8;

/** Value column of «Получатель:» / «Плательщик:» blocks. */
const LABEL_VALUE_X = 261.8;
const LABEL_VALUE_WIDTH = FRAME_LEFT + FRAME_WIDTH - LABEL_VALUE_X - 4;
/** Distance between two wrapped party lines. */
const PARTY_LINE_STEP = 11.5;

/** Bank block of the invoice (4 rows of the reference grid). */
const BANK = {
  top: 718.2,
  rowHeight: 13.15,
  splitX: 297,
  labelColumnWidth: 58.54,
  /** First line of the organisation name printed under the grid. */
  organisationBaseline: 658,
};

/** Table geometry: 6 columns, fixed row height, totals in the free right area. */
const TABLE_COLUMNS = [
  { x: 36.3, width: 22, align: "left" as const },
  { x: 224, width: 66, align: "left" as const },
  { x: 300, width: 44, align: "right" as const },
  { x: 356, width: 60, align: "right" as const },
  { x: 426, width: 66, align: "right" as const },
  { x: 494, width: 70, align: "right" as const },
];
const TABLE_BORDERS = [219.9, 297, 348, 420, 490];
const TABLE_HEADER_HEIGHT = 14.5;
const TABLE_ROW_HEIGHT = 15;
/** Free space under a row where a long service name may continue. */
const NAME_FLOW_WIDTH = 380;
const TOTALS_LABEL_X = 426;
const TOTALS_VALUE_X = 490;
const TOTALS_VALUE_WIDTH = FRAME_LEFT + FRAME_WIDTH - TOTALS_VALUE_X - 3;

/** Signature lines shared by both documents. */
const SIGNATURE_X1 = 219.9;
const SIGNATURE_X2 = 476.8;

/**
 * Vertical map of the invoice. Bands are computed so no two blocks can overlap:
 *   805       Получатель (4 lines × 10.5)
 *   752.9     Плательщик (3 lines × 10.5)
 *   718.2     банковский блок (4 × 13.15 = 52.6)
 *   586.8     заголовок
 *   580.5     таблица: шапка + 3 строки по 15
 *   511.2     итоги (до 4 строк × 14.3)
 *   462       «Всего наименований», сумма прописью
 *   419.6/396.3 подписи
 */
const INVOICE = {
  recipientBaseline: 810,
  payerBaseline: 760,
  titleBaseline: 596,
  table: { headerTop: 580.9, headerBaseline: 574.6, firstRowBaseline: 563.6, totalsBaseline: 0 },
  tableBottom: 549,
  amountItemsBaseline: 500,
  amountWordsBaseline: 489,
  signatureTopLine: 419.6,
  signatureBottomLine: 386,
};
/** Vertical map of the act, same band logic as the invoice. */
const ACT = {
  executorBaseline: 794.1,
  customerBaseline: 738,
  titleBaseline: 700,
  table: { headerTop: 673, headerBaseline: 666.5, firstRowBaseline: 655.1, totalsBaseline: 0 },
  amountItemsBaseline: 570,
  amountWordsBaseline: 559,
  fulfilmentBaseline: 530,
  signatureLabelBaseline: 445,
  signatureLine: 433.3,
};
/**
 * pdfkit counts `y` DOWN from the top of the page, while every position in this
 * file is a PDF point counted UP from the bottom (the way the reference documents
 * are measured). DOC_Y converts between them, including the small optical offset
 * pdfkit adds above the first baseline of a text box.
 */
function docY(pdfBaseline: number, _fontSize?: number): number {
  // Measured on this pdfkit build with `lineBreak: false`:
  //   final baseline = 833.1 - y  =>  y = 833.1 - baseline.
  // 833.1 = PAGE_HEIGHT - 8.79 (pdfkit's line box above the first baseline).
  return 833.1 - pdfBaseline;
}

function createDoc(): Doc {
  assertFonts();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: FRAME_TOP, bottom: FRAME_TOP, left: FRAME_LEFT, right: FRAME_LEFT },
    autoFirstPage: true,
  }) as unknown as Doc;
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Regular", FONT_REGULAR);
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Bold", FONT_BOLD);
  doc.font("Regular").fontSize(SIZE_BODY);
  return doc;
}

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    (doc as unknown as { on(event: string, cb: (chunk: Buffer) => void): void }).on("data", (chunk: Buffer) => chunks.push(chunk));
    (doc as unknown as { on(event: string, cb: (err: Error) => void): void }).on("end", () => resolve(Buffer.concat(chunks)));
    (doc as unknown as { on(event: string, cb: (err: Error) => void): void }).on("error", reject);
    doc.end();
  });
}

/** Greedy word wrap with the real font metrics. */
function wrapText(doc: Doc, value: string, maxWidth: number, font: FontName = "Regular", size: number = SIZE_BODY): string[] {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  doc.font(font).fontSize(size);

  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || doc.widthOfString(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * One wrapped paragraph placed by its FIRST baseline. `lineStep` is the distance
 * to the next line; a taller paragraph simply continues towards the bottom of the
 * page and can never push the following block, because every block has an absolute
 * position.
 */
function paragraph(
  doc: Doc,
  text: string,
  x: number,
  firstBaseline: number,
  maxWidth: number,
  options: { font?: FontName; lineStep?: number; size?: number; maxLines?: number } = {},
): void {
  const font = options.font ?? "Regular";
  const size = options.size ?? SIZE_BODY;
  const lineStep = options.lineStep ?? size + 1.6;
  const lines = wrapText(doc, text, maxWidth, font, size);
  const limited = options.maxLines ? lines.slice(0, options.maxLines) : lines;

  doc.font(font).fontSize(size);
  limited.forEach((line, index) => {
    doc.text(line, x, docY(firstBaseline - index * lineStep, size), { width: maxWidth + 1, lineBreak: false });
  });
}

/**
 * «Получатель:» / «Плательщик:» block: the label sits on the first line and every
 * value line is wrapped on its own, so a long name or address wraps inside the
 * value column instead of running over the label.
 */
function party(
  doc: Doc,
  label: string,
  lines: string[],
  firstBaseline: number,
  options: { labelX?: number; valueX?: number; valueWidth?: number; lineStep?: number; maxLines?: number } = {},
): void {
  const labelX = options.labelX ?? 190;
  const valueX = options.valueX ?? LABEL_VALUE_X;
  const valueWidth = options.valueWidth ?? LABEL_VALUE_WIDTH;
  const lineStep = options.lineStep ?? 11;

  doc.font("Bold").fontSize(SIZE_BODY);
  const labelWidth = doc.widthOfString(label) + 6;
  doc.text(label, valueX - labelWidth, docY(firstBaseline, SIZE_BODY), { width: labelWidth, lineBreak: false });

  const budget = options.maxLines ?? 8;
  let drawn = 0;
  let baseline = firstBaseline;
  for (const value of lines.filter(Boolean)) {
    if (drawn >= budget) break;
    const wrapped = wrapText(doc, value, valueWidth, "Bold");
    doc.font("Bold").fontSize(SIZE_BODY);
    for (const line of wrapped) {
      if (drawn >= budget) break;
      doc.text(line, valueX, docY(baseline, SIZE_BODY), { width: valueWidth + 1, lineBreak: false });
      baseline -= lineStep;
      drawn += 1;
    }
  }
}

/** Build the party lines of the invoice/act from the snapshot data. */
function partyLines(partyData: { name: string; inn: string | null; kpp?: string | null; ogrn?: string | null; address: string; additional?: string | null }): string[] {
  const ids = [
    partyData.inn ? `ИНН ${partyData.inn}` : "",
    partyData.kpp ? `КПП ${partyData.kpp}` : "",
    partyData.ogrn ? `ОГРН(ИП) ${partyData.ogrn}` : "",
  ].filter(Boolean).join(", ");

  return [
    partyData.name,
    ids ? `${ids},` : "",
    partyData.address ? `${partyData.address},` : "",
    partyData.additional ? `${partyData.additional}.` : "",
  ].filter(Boolean);
}

/** The outer frame every reference document has. */
function drawFrame(doc: Doc): void {
  doc.save()
    .lineWidth(0.6).stroke("#8A8A8A")
    .rect(FRAME_LEFT, FRAME_TOP, FRAME_WIDTH, FRAME_HEIGHT).stroke()
    .restore();
}

function horizontalRule(doc: Doc, y: number, x1: number, x2: number): void {
  doc.save()
    .lineWidth(0.6).stroke("#000000")
    .moveTo(x1, y).lineTo(x2, y).stroke()
    .restore();
}

/**
 * Invoice bank block: the 2×2 grid of «Банк получателя» / «Получатель» with its own
 * internal rules. The grid is drawn as filled thin rectangles plus strokes, matching
 * the reference cell borders.
 */
function drawBankBlock(doc: Doc, data: DocumentSetData): void {
  const left = FRAME_LEFT;
  const right = FRAME_LEFT + FRAME_WIDTH;
  const top = BANK.top;
  const rowHeight = BANK.rowHeight;
  const bottom = top - rowHeight * 4;
  const splitX = BANK.splitX;
  const valueX = splitX + BANK.labelColumnWidth + 3;
  const valueWidth = right - valueX - 4;
  const smallBaseline = (row: number): number => top - rowHeight * row + rowHeight - 4;
  const bodyBaseline = (row: number): number => top - rowHeight * row + rowHeight - 3.5;

  doc.save().lineWidth(0.6).stroke("#8A8A8A");
  doc.rect(left, top, FRAME_WIDTH, rowHeight * 4).stroke();
  for (let i = 1; i <= 3; i += 1) {
    doc.moveTo(left, top - i * rowHeight).lineTo(right, top - i * rowHeight).stroke();
  }
  doc.moveTo(splitX, top).lineTo(splitX, bottom).stroke();
  doc.moveTo(splitX + BANK.labelColumnWidth, top).lineTo(splitX + BANK.labelColumnWidth, top - rowHeight).stroke();
  doc.moveTo(splitX + BANK.labelColumnWidth, top - rowHeight * 2)
    .lineTo(splitX + BANK.labelColumnWidth, top - rowHeight * 3).stroke();
  doc.restore();

  // Row 1 keeps only the captions (the reference form has no values in that row).
  doc.font("Regular").fontSize(SIZE_SMALL);
  doc.text("Банк получателя", left + 3, docY(smallBaseline(1), SIZE_SMALL), { width: splitX - left - 6, align: "left", lineBreak: false });
  doc.text("Сч. №", splitX + 3, docY(smallBaseline(1), SIZE_SMALL), { width: BANK.labelColumnWidth - 6, lineBreak: false });

  // Row 2: bank name (left) and BIK (right half).
  paragraph(doc, data.seller.bankName, left + 3, bodyBaseline(2), splitX - left - 6, { maxLines: 1 });
  doc.font("Regular").fontSize(SIZE_BODY);
  doc.text("БИК", valueX - 40, docY(bodyBaseline(2), SIZE_BODY), { width: 36, align: "right", lineBreak: false });
  doc.text(data.seller.bankBik ?? "", valueX + 4, docY(bodyBaseline(2), SIZE_BODY), { width: valueWidth - 4, lineBreak: false });

  // Row 3: correspondent account. Row 4: the account itself.
  doc.text("Сч. №", valueX - 40, docY(bodyBaseline(3), SIZE_BODY), { width: 36, align: "right", lineBreak: false });
  doc.text(data.seller.bankCorrespondentAccount ?? "", valueX + 4, docY(bodyBaseline(3), SIZE_BODY), { width: valueWidth - 4, lineBreak: false });

  // The last row carries «Получатель», the INN and the organisation name.
  doc.font("Regular").fontSize(SIZE_SMALL);
  doc.text("Получатель", left + 3, docY(smallBaseline(4), SIZE_SMALL), { width: splitX - left - 6, lineBreak: false });
}

/** Column grid of the table, measured from the reference document. */
function tableColumns(): { x: number; width: number; align: "left" | "center" | "right" }[] {
  return TABLE_COLUMNS.map((column) => ({ ...column }));
}

/**
 * The service table. The row area is fixed: text is placed by its own baseline and
 * the row line is drawn at a known offset, so nothing can grow into the totals.
 */
function drawServiceTable(
  doc: Doc,
  data: DocumentSetData,
  geometry: { headerTop: number; headerBaseline: number; firstRowBaseline: number; totalsBaseline: number },
  totals: readonly [string, string, boolean][],
): number {
  const left = FRAME_LEFT;
  const right = FRAME_LEFT + FRAME_WIDTH;
  const columns = tableColumns();

  // Header row: top rule, caption row, bottom rule.
  horizontalRule(doc, geometry.headerTop, left, right);
  horizontalRule(doc, geometry.headerTop - TABLE_HEADER_HEIGHT, left, right);
  for (const border of TABLE_BORDERS) {
    doc.save().lineWidth(0.6).stroke("#000000")
      .moveTo(border, geometry.headerTop)
      .lineTo(border, geometry.headerTop - TABLE_HEADER_HEIGHT).stroke()
      .restore();
  }

  doc.font("Bold").fontSize(SIZE_CAPTION);
  // Captions are the exact wording of the reference document («Наименование», not a
  // shortened form). A caption is shrunk only as far as it must be to stay on one
  // line inside its own column; the column itself never moves, so the data grid and
  // the totals block stay where the reference puts them.
  const captions = ["№", "Наименование", "Ед.", "Кол-во", "Цена р.", "Сумма р."];
  captions.forEach((caption, index) => {
    const column = columns[index];
    let size = SIZE_CAPTION;
    doc.font("Bold").fontSize(size);
    while (doc.widthOfString(caption) > column.width && size > CAPTION_MIN_SIZE) {
      size = Math.round((size - 0.25) * 100) / 100;
      doc.font("Bold").fontSize(size);
    }
    doc.text(caption, column.x, docY(geometry.headerBaseline, size), {
      width: column.width,
      align: column.align === "left" && index > 1 ? "right" : "left",
      lineBreak: false,
    });
  });

  // Rows.
  doc.font("Regular").fontSize(SIZE_BODY);
  let baseline = geometry.firstRowBaseline;
  for (const line of data.lines) {
    const values = [
      String(line.position),
      line.name,
      line.unit,
      String(line.quantity).replace(".", ","),
      formatMoney(line.price),
      formatMoney(line.amount),
    ];
    const nameWidth = columns[1].width;
    const nameLines = wrapText(doc, values[1], nameWidth);
    const first = nameLines[0] ?? "";
    const rest = nameLines.slice(1).join(" ");
    const restLines = rest ? wrapText(doc, rest, NAME_FLOW_WIDTH) : [];

    doc.font("Regular").fontSize(SIZE_BODY);
    doc.text(values[0], columns[0].x, docY(baseline, SIZE_BODY), { width: columns[0].width, lineBreak: false });
    doc.text(first, columns[1].x, docY(baseline, SIZE_BODY), { width: nameWidth + 1, lineBreak: false });
    doc.text(values[2], columns[2].x, docY(baseline, SIZE_BODY), { width: columns[2].width, align: "right", lineBreak: false });
    doc.text(values[3], columns[3].x, docY(baseline, SIZE_BODY), { width: columns[3].width, align: "right", lineBreak: false });
    doc.text(values[4], columns[4].x, docY(baseline, SIZE_BODY), { width: columns[4].width, align: "right", lineBreak: false });
    doc.text(values[5], columns[5].x, docY(baseline, SIZE_BODY), { width: columns[5].width, align: "right", lineBreak: false });

    // A longer service name continues under the table row, in the free space left
    // of the totals block, and never overlaps them.
    restLines.forEach((extra, index) => {
      doc.font("Regular").fontSize(SIZE_BODY);
      doc.text(extra, FRAME_LEFT + 3, docY(baseline - 12.5 * (index + 1), SIZE_BODY), { width: NAME_FLOW_WIDTH, lineBreak: false });
    });

    baseline -= TABLE_ROW_HEIGHT;
  }

  // Totals: label column starts at the reference split, values right aligned.
  // Totals sit in their own band under the amount column: they can never run into
  // the table rows above or the amount summary below.
  let totalsBaseline = geometry.firstRowBaseline - TABLE_ROW_HEIGHT * (data.lines.length - 1) - 13;
  for (const [label, value, bold] of totals) {
    doc.font(bold ? "Bold" : "Regular").fontSize(SIZE_BODY);
    doc.text(label, TOTALS_LABEL_X, docY(totalsBaseline, SIZE_BODY), { width: 110, lineBreak: false });
    doc.text(value, TOTALS_VALUE_X, docY(totalsBaseline, SIZE_BODY), { width: TOTALS_VALUE_WIDTH, align: "right", lineBreak: false });
    totalsBaseline -= 14.3;
  }

  const rowsBottom = geometry.firstRowBaseline - TABLE_ROW_HEIGHT * (data.lines.length - 1);
  return Math.min(rowsBottom - 6, totalsBaseline + 14.3 - 6);
}

/**
 * Signature and stamp are overlays: fixed boxes, aspect ratio preserved, drawn after
 * the text so they can never reflow the document. Missing files are skipped.
 */
function drawOverlays(doc: Doc, overlays: DocumentOverlays | undefined): void {
  if (!overlays) return;

  const draw = (bytes: Buffer | null, box: OverlayPlacement | null): void => {
    if (!bytes || !box) return;
    try {
      // The bytes that were read once are drawn here; nothing is re-read from disk.
      const image = doc.openImage(bytes);
      const fitted = fitSize(image.width, image.height, box.width, box.height);
      const x = box.x + (box.width - fitted.width) / 2;
      const y = box.y + (box.height - fitted.height) / 2;
      doc.save().opacity(1).image(bytes, x, y, { width: fitted.width, height: fitted.height }).restore();
    } catch {
      // A broken image must never break the document.
    }
  };

  draw(overlays.signatureBytes, overlays.signature);
  draw(overlays.stampBytes, overlays.stamp);
}

/** "Всего наименований N, на сумму X" plus the amount in words. */
function drawAmountSummary(doc: Doc, data: DocumentSetData, itemsBaseline: number, wordsBaseline: number): void {
  doc.font("Regular").fontSize(SIZE_BODY);
  doc.text(
    `Всего наименований ${data.lines.length}, на сумму ${data.totalAmountText} руб.`,
    FRAME_LEFT,
    docY(itemsBaseline, SIZE_BODY),
    { width: FRAME_WIDTH, lineBreak: false },
  );
  paragraph(doc, data.amountInWords, FRAME_LEFT, wordsBaseline, FRAME_WIDTH, { font: "Bold", maxLines: 2 });
}

/**
 * Счёт на оплату — reproduced from the reference invoice: same blocks, same
 * coordinates, one page.
 */
export async function renderInvoicePdf(data: DocumentSetData, overlays?: DocumentOverlays): Promise<Buffer> {
  const doc = createDoc();
  drawFrame(doc);

  // ─── Получатель / Плательщик ──────────────────────────────────────────
  party(doc, "Получатель:", partyLines({
    name: data.seller.name,
    inn: data.seller.inn,
    ogrn: data.seller.ogrn,
    address: data.seller.address,
    additional: data.seller.phone ? `Тел.: ${data.seller.phone}` : null,
  }), INVOICE.recipientBaseline, { lineStep: PARTY_LINE_STEP, maxLines: 4 });

  party(doc, "Плательщик:", partyLines({
    name: data.buyer.name,
    inn: data.buyer.inn,
    kpp: data.buyer.kpp,
    address: data.buyer.address,
    additional: buyerPostalLine(data),
  }), INVOICE.payerBaseline, { lineStep: PARTY_LINE_STEP, maxLines: 3 });

  // ─── Банк получателя ──────────────────────────────────────────────────
  drawBankBlock(doc, data);
  paragraph(doc, data.seller.inn ? `ИНН ${data.seller.inn}` : "", FRAME_LEFT + 3, BANK.organisationBaseline, BANK.splitX - FRAME_LEFT - 6, { maxLines: 1 });
  paragraph(doc, data.seller.name, FRAME_LEFT + 3, BANK.organisationBaseline - 12, BANK.splitX - FRAME_LEFT - 6, { lineStep: 10.5, maxLines: 2 });

  // ─── Title, table, totals ─────────────────────────────────────────────
  doc.font("Bold").fontSize(SIZE_TITLE).text(
    `Счет №${data.number} от ${data.documentDateText} г.`,
    FRAME_LEFT,
    docY(INVOICE.titleBaseline, SIZE_TITLE),
    { width: FRAME_WIDTH, align: "center", lineBreak: false },
  );

  const totals: [string, string, boolean][] = [
    ["Итого:", formatMoney(data.totalAmount), false],
    ["Ставка НДС:", data.vat.rateText, false],
  ];
  if (data.vat.netAmount !== null) totals.push(["Сумма без НДС:", formatMoney(data.vat.netAmount), false]);
  if (data.vat.vatAmount !== null) totals.push(["Сумма НДС:", formatMoney(data.vat.vatAmount), false]);
  totals.push(["Всего к оплате:", formatMoney(data.totalAmount), true]);
  const invoiceTableBottom = drawServiceTable(doc, data, INVOICE.table, totals);

  drawAmountSummary(doc, data, invoiceTableBottom, invoiceTableBottom - 12);

  // ─── Signatures ───────────────────────────────────────────────────────
  // Signature area of the reference invoice: the line is on the left, the role and
  // the name are printed to the right of it, «подпись» sits under the line. Nothing
  // is printed above the line, so a long position or name cannot collide with it.
  const accountant = `Главный бухгалтер${(data.seller.accountantName || data.seller.directorName) ? ` ${data.seller.accountantName || data.seller.directorName}` : ""}`;
  const director = `${data.seller.directorPosition || "Директор"}${data.seller.directorName ? ` ${data.seller.directorName}` : ""}`;

  horizontalRule(doc, INVOICE.signatureTopLine, SIGNATURE_X1, SIGNATURE_X2);
  horizontalRule(doc, INVOICE.signatureBottomLine, SIGNATURE_X1, SIGNATURE_X2);

  // Director on the first line, chief accountant on the second; the role is printed
  // above its own rule, «подпись» below it, so a long name or position can never
  // touch the rule.
  const invoiceDirectorLabel = `${data.seller.directorPosition || "Директор"}${data.seller.directorName ? ` ${data.seller.directorName}` : ""}`;
  const invoiceAccountantLabel = `Главный бухгалтер${(data.seller.accountantName || data.seller.directorName) ? ` ${data.seller.accountantName || data.seller.directorName}` : ""}`;
  paragraph(doc, invoiceDirectorLabel, SIGNATURE_X1 + 4, INVOICE.signatureTopLine + 10, 340, { font: "Bold" });
  paragraph(doc, invoiceAccountantLabel, SIGNATURE_X1 + 4, INVOICE.signatureBottomLine + 10, 340, { font: "Bold" });

  doc.font("Regular").fontSize(SIZE_SMALL);
  doc.text("подпись", SIGNATURE_X1 + 4, docY(INVOICE.signatureTopLine - 10, SIZE_SMALL), { width: 206, align: "center", lineBreak: false });
  doc.text("подпись", SIGNATURE_X1 + 4, docY(INVOICE.signatureBottomLine - 10, SIZE_SMALL), { width: 206, align: "center", lineBreak: false });
  void accountant;

  drawOverlays(doc, overlays);
  return collect(doc);
}

/**
 * Акт выполненных работ (оказанных услуг) — reproduced from the reference act.
 */
export async function renderActPdf(data: DocumentSetData, overlays?: DocumentOverlays): Promise<Buffer> {
  const doc = createDoc();
  drawFrame(doc);

  party(doc, "Исполнитель:", partyLines({
    name: data.seller.name,
    inn: data.seller.inn,
    ogrn: data.seller.ogrn,
    address: data.seller.address,
    additional: data.seller.phone ? `Тел.: ${data.seller.phone}` : null,
  }), ACT.executorBaseline, { lineStep: PARTY_LINE_STEP, maxLines: 4 });

  party(doc, "Заказчик:", partyLines({
    name: data.buyer.name,
    inn: data.buyer.inn,
    kpp: data.buyer.kpp,
    address: data.buyer.address,
    additional: buyerPostalLine(data),
  }), ACT.customerBaseline, { lineStep: PARTY_LINE_STEP, maxLines: 3 });

  doc.font("Bold").fontSize(SIZE_TITLE).text(
    `Акт №${data.number} от ${data.documentDateText} г.`,
    FRAME_LEFT,
    docY(ACT.titleBaseline, SIZE_TITLE),
    { width: FRAME_WIDTH, align: "center", lineBreak: false },
  );

  const totals: [string, string, boolean][] = [
    ["Итого:", formatMoney(data.totalAmount), false],
    ["Ставка НДС:", data.vat.rateText, false],
  ];
  if (data.vat.vatAmount !== null) totals.push(["Сумма НДС:", formatMoney(data.vat.vatAmount), false]);
  totals.push(["Всего :", formatMoney(data.totalAmount), true]);
  drawServiceTable(doc, data, ACT.table, totals);

  drawAmountSummary(doc, data, ACT.amountItemsBaseline, ACT.amountWordsBaseline);

  paragraph(
    doc,
    "Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству, срокам оказания услуг не имеет.",
    FRAME_LEFT,
    ACT.fulfilmentBaseline,
    FRAME_WIDTH,
    { lineStep: 11, maxLines: 2 },
  );

  // ─── Signatures: Исполнитель слева, Заказчик справа ───────────────────
  const executorName = data.seller.directorName || data.seller.name;
  doc.font("Regular").fontSize(SIZE_BODY);
  doc.text("Исполнитель", 30.6, docY(ACT.signatureLabelBaseline, SIZE_BODY), { width: 78, lineBreak: false });
  doc.text(executorName, 110, docY(ACT.signatureLabelBaseline, SIZE_BODY), { width: 180, lineBreak: false });
  doc.text("Заказчик", 359.1, docY(ACT.signatureLabelBaseline, SIZE_BODY), { width: 62, lineBreak: false });
  doc.text(data.buyer.name || "", 424, docY(ACT.signatureLabelBaseline, SIZE_BODY), { width: 140, lineBreak: false });

  horizontalRule(doc, ACT.signatureLine, 90.3, 297);
  horizontalRule(doc, ACT.signatureLine, 359.1, 564.6);
  doc.font("Regular").fontSize(SIZE_SMALL);
  // Captions sit under the lines, exactly like the reference act.
  doc.text("подпись", 90.3, docY(ACT.signatureLine - 11, SIZE_SMALL), { width: 206.7, align: "center", lineBreak: false });
  doc.text("подпись", 359.1, docY(ACT.signatureLine - 11, SIZE_SMALL), { width: 205.5, align: "center", lineBreak: false });

  drawOverlays(doc, overlays);
  return collect(doc);
}
