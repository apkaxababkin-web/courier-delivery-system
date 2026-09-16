/**
 * Invoice/act PDF renderer.
 * Geometry is expressed only in PDFKit's native top-left coordinate system.
 * This is deliberate: mixing bottom-up PDF coordinates with PDFKit drawing
 * coordinates caused the acceptance preview to render stray grids far below
 * the actual invoice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatMoney } from "../../shared/billing-format";
import type { DocumentSetData } from "./billingDocumentData";
import { fitSize, type DocumentOverlays, type OverlayPlacement } from "./documentImages";

function fontsDirectory(): string {
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(bundleDir, "assets", "fonts"),
    path.join(bundleDir, "..", "..", "assets", "fonts"),
    path.join(bundleDir, "..", "assets", "fonts"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Не найден каталог шрифтов для PDF. Проверены: ${candidates.join(", ")}`);
  return found;
}

const FONT_DIR = fontsDirectory();
const FONT_REGULAR = path.join(FONT_DIR, "LiberationSerif-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "LiberationSerif-Bold.ttf");

if (process.env.PDF_FONTS_PROBE === "1") {
  console.log(JSON.stringify({
    probe: "pdf-fonts", moduleUrl: import.meta.url, fontDir: FONT_DIR,
    regular: FONT_REGULAR, bold: FONT_BOLD,
    regularExists: fs.existsSync(FONT_REGULAR), boldExists: fs.existsSync(FONT_BOLD),
  }));
  process.exit(0);
}

export function pdfFontFiles(): { regular: string; bold: string } {
  return { regular: FONT_REGULAR, bold: FONT_BOLD };
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
  save(): Doc;
  restore(): Doc;
  opacity(value: number): Doc;
  image(src: string | Buffer, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  openImage(src: string | Buffer): { width: number; height: number };
  widthOfString(text: string): number;
  end(): void;
  [key: string]: unknown;
}

const PAGE_W = 595.28;
const M = 30;
const CONTENT_W = PAGE_W - M * 2;
const BODY = 10.5;
const SMALL = 8.4;
const TITLE = 16;
const STEP = 12.2;

function createDoc(): Doc {
  for (const file of [FONT_REGULAR, FONT_BOLD]) {
    if (!fs.existsSync(file)) throw new Error(`Не найден шрифт для PDF: ${file}`);
  }
  const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, autoFirstPage: true }) as unknown as Doc;
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Regular", FONT_REGULAR);
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Bold", FONT_BOLD);
  return doc;
}

function collect(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = doc as unknown as { on(event: string, cb: (...args: any[]) => void): void };
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.end();
  });
}

function ids(parts: Array<string | null>): string {
  return parts.filter(Boolean).join(", ");
}

function sellerLines(data: DocumentSetData): string[] {
  return [
    data.seller.name,
    ids([
      data.seller.inn ? `ИНН ${data.seller.inn}` : null,
      data.seller.kpp ? `КПП ${data.seller.kpp}` : null,
      data.seller.ogrn ? `ОГРН(ИП) ${data.seller.ogrn}` : null,
    ]),
    data.seller.address,
    data.seller.phone ? `Тел.: ${data.seller.phone}` : "",
  ].filter(Boolean);
}

function buyerLines(data: DocumentSetData): string[] {
  return [
    data.buyer.name,
    ids([
      data.buyer.inn ? `ИНН ${data.buyer.inn}` : null,
      data.buyer.kpp ? `КПП ${data.buyer.kpp}` : null,
      data.buyer.ogrn ? `ОГРН(ИП) ${data.buyer.ogrn}` : null,
    ]),
    data.buyer.address,
  ].filter(Boolean);
}

function party(doc: Doc, label: string, lines: string[], y: number): number {
  const valueX = 232;
  doc.font("Bold").fontSize(BODY).text(label, 150, y, { width: 76, align: "right", lineBreak: false });
  doc.font("Bold").fontSize(BODY);
  let cy = y;
  for (const line of lines.slice(0, 4)) {
    doc.text(line, valueX, cy, { width: PAGE_W - M - valueX, lineBreak: false });
    cy += STEP;
  }
  return cy;
}

function bank(doc: Doc, data: DocumentSetData, top: number): number {
  const left = M;
  const right = PAGE_W - M;
  const split = 330;
  const rowH = 18;
  const height = rowH * 4;
  const lx = split + 6;
  const vx = split + 63;

  doc.save().lineWidth(0.55).stroke("#000");
  doc.rect(left, top, right - left, height).stroke();
  for (let i = 1; i < 4; i++) doc.moveTo(left, top + rowH * i).lineTo(right, top + rowH * i).stroke();
  doc.moveTo(split, top).lineTo(split, top + height).stroke();
  doc.restore();

  doc.font("Regular").fontSize(SMALL);
  doc.text("Банк получателя", left + 4, top + 3, { width: 200, lineBreak: false });
  doc.text("Сч. №", lx, top + 3, { width: 50, lineBreak: false });

  doc.font("Regular").fontSize(BODY);
  doc.text(data.seller.bankName || "", left + 4, top + rowH + 2, { width: split - left - 8, lineBreak: false });
  doc.text("БИК", lx, top + rowH + 2, { width: 50, lineBreak: false });
  doc.text(data.seller.bankBik || "", vx, top + rowH + 2, { width: right - vx - 4, lineBreak: false });
  doc.text("Сч. №", lx, top + rowH * 2 + 2, { width: 50, lineBreak: false });
  doc.text(data.seller.bankCorrespondentAccount || "", vx, top + rowH * 2 + 2, { width: right - vx - 4, lineBreak: false });

  doc.font("Regular").fontSize(SMALL).text("Получатель", left + 4, top + rowH * 3 + 3, { width: 72, lineBreak: false });
  doc.font("Regular").fontSize(BODY);
  doc.text([data.seller.inn ? `ИНН ${data.seller.inn}` : "", data.seller.shortName || data.seller.name].filter(Boolean).join("  "), left + 78, top + rowH * 3 + 2, { width: split - left - 82, lineBreak: false });
  doc.text("Сч. №", lx, top + rowH * 3 + 2, { width: 50, lineBreak: false });
  doc.text(data.seller.bankAccount || "", vx, top + rowH * 3 + 2, { width: right - vx - 4, lineBreak: false });
  return top + height;
}

function title(doc: Doc, text: string, y: number): void {
  doc.font("Bold").fontSize(TITLE).text(text, M, y, { width: CONTENT_W, align: "center", lineBreak: false });
}

const COLS = [
  { x: M, w: 28, a: "left" as const },
  { x: M + 28, w: 238, a: "left" as const },
  { x: M + 266, w: 52, a: "center" as const },
  { x: M + 318, w: 58, a: "center" as const },
  { x: M + 376, w: 78, a: "right" as const },
  { x: M + 454, w: CONTENT_W - 454, a: "right" as const },
];

function serviceTable(doc: Doc, data: DocumentSetData, top: number): number {
  const headerH = 22;
  const rowH = 28;
  const lines = data.lines.length ? data.lines : [{ position: 1, name: data.serviceName, unit: "усл.", quantity: 1, price: data.totalAmount, amount: data.totalAmount }];
  const bottom = top + headerH + rowH * lines.length;

  doc.save().lineWidth(0.55).stroke("#000");
  doc.rect(M, top, CONTENT_W, bottom - top).stroke();
  doc.moveTo(M, top + headerH).lineTo(PAGE_W - M, top + headerH).stroke();
  for (let i = 1; i < COLS.length; i++) doc.moveTo(COLS[i].x, top).lineTo(COLS[i].x, bottom).stroke();
  doc.restore();

  const captions = ["№", "Наименование", "Ед.", "Кол-во", "Цена, руб.", "Сумма, руб."];
  captions.forEach((caption, i) => {
    const col = COLS[i];
    let size = 9.2;
    doc.font("Bold").fontSize(size);
    while (doc.widthOfString(caption) > col.w - 6 && size > 7.4) { size -= 0.2; doc.fontSize(size); }
    doc.text(caption, col.x + 3, top + 6, { width: col.w - 6, align: col.a, lineBreak: false });
  });

  lines.forEach((line, idx) => {
    const vals = [String(line.position), line.name, line.unit, String(line.quantity).replace(".", ","), formatMoney(line.price), formatMoney(line.amount)];
    const y = top + headerH + 7 + idx * rowH;
    doc.font("Regular").fontSize(BODY);
    vals.forEach((value, i) => {
      const col = COLS[i];
      doc.text(value, col.x + 3, y, { width: col.w - 6, align: col.a, lineBreak: false });
    });
  });
  return bottom;
}

function totals(doc: Doc, data: DocumentSetData, top: number, finalLabel: string): number {
  const rows: Array<[string, string, boolean]> = [
    ["Итого:", formatMoney(data.totalAmount), false],
    ["Ставка НДС:", data.vat.rateText, false],
  ];
  if (data.vat.vatAmount !== null) rows.push(["Сумма НДС:", formatMoney(data.vat.vatAmount), false]);
  rows.push([finalLabel, formatMoney(data.totalAmount), true]);
  let y = top;
  for (const [label, value, bold] of rows) {
    doc.font(bold ? "Bold" : "Regular").fontSize(BODY);
    doc.text(label, 394, y, { width: 96, lineBreak: false });
    doc.text(value, 493, y, { width: PAGE_W - M - 493, align: "right", lineBreak: false });
    y += 14;
  }
  return y;
}

function summary(doc: Doc, data: DocumentSetData, y: number): number {
  doc.font("Regular").fontSize(BODY).text(`Всего наименований ${data.lines.length}, на сумму ${data.totalAmountText} руб.`, M, y, { width: CONTENT_W, lineBreak: false });
  doc.font("Bold").fontSize(BODY).text(data.amountInWords, M, y + 14, { width: CONTENT_W, lineBreak: false });
  return y + 32;
}

function invoiceSignatures(doc: Doc, data: DocumentSetData, top: number): void {
  const roleX = M;
  const lineX = 174;
  const lineW = 150;
  const nameX = 346;
  const row = (y: number, role: string, name: string) => {
    doc.font("Regular").fontSize(BODY).text(role, roleX, y, { width: 136, lineBreak: false });
    doc.save().lineWidth(0.5).stroke("#000").moveTo(lineX, y + 12).lineTo(lineX + lineW, y + 12).stroke().restore();
    doc.font("Regular").fontSize(SMALL).text("подпись", lineX, y + 14, { width: lineW, align: "center", lineBreak: false });
    doc.font("Regular").fontSize(BODY).text(name, nameX, y, { width: PAGE_W - M - nameX, lineBreak: false });
  };
  row(top, data.seller.directorPosition || "Руководитель", data.seller.directorName || data.seller.name);
  row(top + 38, "Главный бухгалтер", data.seller.accountantName || data.seller.directorName || "");
}

function actSignatures(doc: Doc, data: DocumentSetData, top: number): void {
  doc.font("Regular").fontSize(BODY);
  doc.text("Исполнитель", M, top, { width: 74, lineBreak: false });
  doc.text(data.seller.directorName || data.seller.name, 110, top, { width: 180, lineBreak: false });
  doc.text("Заказчик", 315, top, { width: 60, lineBreak: false });
  doc.text(data.buyer.name || "", 382, top, { width: PAGE_W - M - 382, lineBreak: false });
  const ly = top + 22;
  doc.save().lineWidth(0.5).stroke("#000").moveTo(106, ly).lineTo(290, ly).stroke().moveTo(377, ly).lineTo(PAGE_W - M, ly).stroke().restore();
  doc.font("Regular").fontSize(SMALL).text("подпись", 106, ly + 2, { width: 184, align: "center", lineBreak: false }).text("подпись", 377, ly + 2, { width: PAGE_W - M - 377, align: "center", lineBreak: false });
}

function overlays(doc: Doc, images: DocumentOverlays | undefined): void {
  if (!images) return;
  const draw = (bytes: Buffer | null, box: OverlayPlacement | null) => {
    if (!bytes || !box) return;
    try {
      const image = doc.openImage(bytes);
      const fitted = fitSize(image.width, image.height, box.width, box.height);
      const x = box.x + (box.width - fitted.width) / 2;
      const y = box.y + (box.height - fitted.height) / 2;
      doc.save().opacity(1).image(bytes, x, y, { width: fitted.width, height: fitted.height }).restore();
    } catch { /* optional image */ }
  };
  draw(images.signatureBytes, images.signature);
  draw(images.stampBytes, images.stamp);
}

export async function renderInvoicePdf(data: DocumentSetData, images?: DocumentOverlays): Promise<Buffer> {
  const doc = createDoc();
  let y = 34;
  y = party(doc, "Получатель:", sellerLines(data), y) + 5;
  y = party(doc, "Плательщик:", buyerLines(data), y) + 12;
  y = bank(doc, data, y) + 26;
  title(doc, `Счет №${data.number} от ${data.documentDateText} г.`, y);
  y += 32;
  y = serviceTable(doc, data, y) + 8;
  y = totals(doc, data, y, "Всего к оплате:") + 4;
  y = summary(doc, data, y) + 28;
  invoiceSignatures(doc, data, y);
  overlays(doc, images);
  return collect(doc);
}

export async function renderActPdf(data: DocumentSetData, images?: DocumentOverlays): Promise<Buffer> {
  const doc = createDoc();
  let y = 42;
  y = party(doc, "Исполнитель:", sellerLines(data), y) + 8;
  y = party(doc, "Заказчик:", buyerLines(data), y) + 22;
  title(doc, `Акт №${data.number} от ${data.documentDateText} г.`, y);
  y += 34;
  y = serviceTable(doc, data, y) + 8;
  y = totals(doc, data, y, "Всего:") + 4;
  y = summary(doc, data, y) + 18;
  doc.font("Regular").fontSize(BODY).text("Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству, срокам оказания услуг не имеет.", M, y, { width: CONTENT_W });
  y += 40;
  actSignatures(doc, data, y);
  overlays(doc, images);
  return collect(doc);
}
