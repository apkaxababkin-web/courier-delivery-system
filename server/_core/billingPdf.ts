/**
 * PDF generation for the client document set: invoice and act of performed works.
 *
 * Deterministic, server-side, no browser and no external service. Cyrillic support
 * comes from fonts bundled in the repository (server/assets/fonts), so the result
 * does not depend on fonts installed in the host or container.
 *
 * The layout follows the official Russian forms: requisites of both parties, the
 * bank block, the itemised table, totals, the amount in words and signatures.
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatMoney, groupThousands } from "../../shared/billing-format";
import type { DocumentSetData } from "./billingDocumentData";

const FONT_DIR = path.join(__dirname, "..", "assets", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "LiberationSerif-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "LiberationSerif-Bold.ttf");

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

/**
 * "Почтовый адрес: …" line, printed only when the customer postal address is
 * actually known and differs from the already printed address. Missing OGRN or
 * postal address must never break a document.
 */
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
  moveDown(lines?: number): Doc;
  moveTo(x: number, y: number): Doc;
  lineTo(x: number, y: number): Doc;
  stroke(): Doc;
  rect(x: number, y: number, w: number, h: number): Doc;
  fill(color: string): Doc;
  save(): Doc;
  restore(): Doc;
  y: number;
  page: { width: number; height: number; margins: { left: number; right: number; top: number; bottom: number } };
  addPage(): Doc;
  image(src: string | Buffer, x?: number, y?: number, options?: Record<string, unknown>): Doc;
  heightOfString(text: string, options?: Record<string, unknown>): number;
  currentLineHeight(includingGap?: boolean): number;
  widthOfString(text: string): number;
  on(event: string, cb: () => void): Doc;
  end(): void;
  [key: string]: unknown;
}

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Column layout shared by the invoice and the act tables.
const COLUMNS = [
  { key: "position", title: "№", width: 26, align: "center" as const },
  { key: "name", title: "Наименование", width: 214, align: "left" as const },
  { key: "unit", title: "Ед.", width: 36, align: "center" as const },
  { key: "quantity", title: "Кол-во", width: 52, align: "right" as const },
  { key: "price", title: "Цена, руб.", width: 88, align: "right" as const },
  { key: "amount", title: "Сумма, руб.", width: 99, align: "right" as const },
];

function createDoc(): Doc {
  assertFonts();
  const doc = new PDFDocument({ size: "A4", margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, autoFirstPage: true }) as unknown as Doc;
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Regular", FONT_REGULAR);
  (doc as unknown as { registerFont(name: string, src: string): void }).registerFont("Bold", FONT_BOLD);
  doc.font("Regular").fontSize(10);
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

function drawTableHeader(doc: Doc, y: number): number {
  const rowHeight = 26;
  let x = MARGIN;
  doc.save().rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fill("#F1F5F9").restore();
  doc.font("Bold").fontSize(9);
  for (const column of COLUMNS) {
    doc.text(column.title, x + 3, y + 8, { width: column.width - 6, align: column.align });
    x += column.width;
  }
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke();
  doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + CONTENT_WIDTH, y + rowHeight).stroke();
  doc.font("Regular").fontSize(10);
  return y + rowHeight;
}

function drawTableRow(doc: Doc, y: number, values: string[]): number {
  const available = CONTENT_WIDTH;
  let height = 18;
  COLUMNS.forEach((column, index) => {
    const text = values[index] ?? "";
    height = Math.max(height, doc.heightOfString(text, { width: column.width - 6 }) + 8);
  });

  let x = MARGIN;
  COLUMNS.forEach((column, index) => {
    doc.text(values[index] ?? "", x + 3, y + 4, { width: column.width - 6, align: column.align });
    x += column.width;
  });
  doc.moveTo(MARGIN, y + height).lineTo(MARGIN + available, y + height).stroke();
  // vertical separators
  let vx = MARGIN;
  for (const column of COLUMNS.slice(0, -1)) {
    vx += column.width;
    doc.moveTo(vx, y).lineTo(vx, y + height).stroke();
  }
  return y + height;
}

function drawTableTop(doc: Doc, y: number): void {
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke();
  let vx = MARGIN;
  for (const column of COLUMNS.slice(0, -1)) {
    vx += column.width;
    doc.moveTo(vx, y).lineTo(vx, y + 26).stroke();
  }
}

function signaturesBlock(doc: Doc, data: DocumentSetData, labels: { left: string; right: string; rightName: string }): void {
  doc.moveDown(1.2);
  const y = doc.y;
  doc.font("Bold").fontSize(10).text(`${labels.left}`, MARGIN, y, { width: 90, continued: false });
  doc.font("Regular");
  doc.text(`${data.seller.directorPosition}`, MARGIN + 90, y, { width: 160 });
  const lineY = y + 22;
  doc.moveTo(MARGIN + 90, lineY).lineTo(MARGIN + 250, lineY).stroke();
  doc.fontSize(8).text("подпись", MARGIN + 90, lineY + 2, { width: 160, align: "center" });
  doc.fontSize(10).text(data.seller.directorName, MARGIN + 262, y, { width: 120 });

  if (data.seller.signatureFile) {
    const signaturePath = path.resolve(process.cwd(), data.seller.signatureFile);
    if (fs.existsSync(signaturePath)) {
      try { doc.image(signaturePath, MARGIN + 92, lineY - 24, { fit: [120, 22] }); } catch { /* optional decoration */ }
    }
  }
  if (data.seller.stampFile) {
    const stampPath = path.resolve(process.cwd(), data.seller.stampFile);
    if (fs.existsSync(stampPath)) {
      try { doc.image(stampPath, MARGIN + 220, y - 10, { fit: [70, 70] }); } catch { /* optional decoration */ }
    }
  }

  doc.fontSize(10).text(labels.right, MARGIN + 330, y, { width: 80 });
  doc.moveTo(MARGIN + 330, lineY).lineTo(MARGIN + 470, lineY).stroke();
  doc.fontSize(8).text("подпись", MARGIN + 330, lineY + 2, { width: 140, align: "center" });
  doc.fontSize(10).text(labels.rightName, MARGIN + 330, lineY + 14, { width: 160 });
}

function partyBlock(doc: Doc, title: string, lines: string[]): void {
  doc.font("Bold").fontSize(10).text(title, MARGIN, doc.y);
  doc.font("Regular").fontSize(9);
  for (const line of lines.filter(Boolean)) {
    doc.text(line, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  }
  doc.moveDown(0.4);
}

/**
 * Счёт на оплату.
 */
export async function renderInvoicePdf(data: DocumentSetData): Promise<Buffer> {
  const doc = createDoc();

  doc.font("Bold").fontSize(14).text(`Счёт №${data.number} от ${data.documentDateText} г.`, MARGIN, MARGIN, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  doc.moveDown(0.8);

  doc.font("Bold").fontSize(10).text("Поставщик (Исполнитель):", MARGIN, doc.y);
  doc.font("Regular").fontSize(9);
  doc.text(data.seller.name, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text([
    data.seller.inn ? `ИНН ${data.seller.inn}` : "",
    data.seller.kpp ? `КПП ${data.seller.kpp}` : "",
    data.seller.ogrn ? `ОГРН(ИП) ${data.seller.ogrn}` : "",
  ].filter(Boolean).join(", "), MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text(data.seller.address, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  if (data.seller.phone) doc.text(`Тел.: ${data.seller.phone}`, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  if (data.seller.email) doc.text(`E-mail: ${data.seller.email}`, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.moveDown(0.5);

  doc.font("Bold").fontSize(10).text("Покупатель (Заказчик):", MARGIN, doc.y);
  doc.font("Regular").fontSize(9);
  doc.text(data.buyer.name, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text([
    data.buyer.inn ? `ИНН ${data.buyer.inn}` : "",
    data.buyer.kpp ? `КПП ${data.buyer.kpp}` : "",
    data.buyer.ogrn ? `ОГРН(ИП) ${data.buyer.ogrn}` : "",
  ].filter(Boolean).join(", "), MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text(data.buyer.address, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  if (buyerPostalLine(data)) {
    doc.text(buyerPostalLine(data) as string, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  }
  doc.moveDown(0.5);

  doc.font("Bold").fontSize(10).text("Банк получателя:", MARGIN, doc.y);
  doc.font("Regular").fontSize(9);
  doc.text(data.seller.bankName, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text(`БИК ${data.seller.bankBik}`, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text(`К/с ${data.seller.bankCorrespondentAccount}`, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.text(`Р/с ${data.seller.bankAccount}`, MARGIN + 8, doc.y, { width: CONTENT_WIDTH - 8 });
  doc.moveDown(0.6);

  doc.font("Regular").fontSize(9).text(`Период оказания услуг: ${data.periodText}`, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.4);

  let y = doc.y + 4;
  drawTableTop(doc, y);
  y = drawTableHeader(doc, y);
  for (const line of data.lines) {
    y = drawTableRow(doc, y, [
      String(line.position),
      line.name,
      line.unit,
      String(line.quantity),
      formatMoney(line.price),
      formatMoney(line.amount),
    ]);
  }
  doc.y = y + 8;

  const totalsX = MARGIN + 200;
  const totalsWidth = CONTENT_WIDTH - 200;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Bold" : "Regular").fontSize(10);
    doc.text(label, totalsX, doc.y, { width: 150 });
    doc.text(value, totalsX + 150, doc.y - doc.currentLineHeight(), { width: totalsWidth - 150, align: "right" });
    doc.moveDown(0.2);
  };
  totalRow("Итого:", formatMoney(data.totalAmount));
  totalRow("Ставка НДС:", data.vat.rateText);
  if (data.vat.netAmount !== null) totalRow("Сумма без НДС:", formatMoney(data.vat.netAmount));
  if (data.vat.vatAmount !== null) totalRow("Сумма НДС:", formatMoney(data.vat.vatAmount));
  totalRow("Всего к оплате:", formatMoney(data.totalAmount), true);

  doc.moveDown(0.6);
  doc.font("Regular").fontSize(10);
  doc.text(`Всего наименований ${data.lines.length}, на сумму ${data.totalAmountText} руб.`, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.font("Bold").text(data.amountInWords, MARGIN, doc.y, { width: CONTENT_WIDTH });
  if (data.seller.vatExemptionBasis) {
    doc.font("Regular").fontSize(9).text(data.seller.vatExemptionBasis, MARGIN, doc.y, { width: CONTENT_WIDTH });
  }

  signaturesBlock(doc, data, {
    left: data.seller.directorPosition ? "Руководитель" : "Руководитель",
    right: "Бухгалтер",
    rightName: data.seller.accountantName ?? data.seller.directorName,
  });

  return collect(doc);
}

/**
 * Акт выполненных работ / оказанных услуг.
 */
export async function renderActPdf(data: DocumentSetData): Promise<Buffer> {
  const doc = createDoc();

  doc.font("Bold").fontSize(14).text(`Акт №${data.number} от ${data.documentDateText} г.`, MARGIN, MARGIN, {
    width: CONTENT_WIDTH,
    align: "center",
  });
  doc.moveDown(0.8);

  partyBlock(doc, "Исполнитель:", [
    data.seller.name,
    [data.seller.inn ? `ИНН ${data.seller.inn}` : "", data.seller.kpp ? `КПП ${data.seller.kpp}` : ""].filter(Boolean).join(", "),
    data.seller.address,
    data.seller.phone ? `Тел.: ${data.seller.phone}` : "",
  ]);

  partyBlock(doc, "Заказчик:", [
    data.buyer.name,
    [
      data.buyer.inn ? `ИНН ${data.buyer.inn}` : "",
      data.buyer.kpp ? `КПП ${data.buyer.kpp}` : "",
      data.buyer.ogrn ? `ОГРН(ИП) ${data.buyer.ogrn}` : "",
    ].filter(Boolean).join(", "),
    data.buyer.address,
    buyerPostalLine(data),
  ].filter((line): line is string => Boolean(line && line.trim())));

  doc.font("Regular").fontSize(9).text(`Период оказания услуг: ${data.periodText}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);

  let y = doc.y + 4;
  drawTableTop(doc, y);
  y = drawTableHeader(doc, y);
  for (const line of data.lines) {
    y = drawTableRow(doc, y, [
      String(line.position),
      line.name,
      line.unit,
      String(line.quantity),
      formatMoney(line.price),
      formatMoney(line.amount),
    ]);
  }
  doc.y = y + 8;

  const totalsX = MARGIN + 200;
  const totalsWidth = CONTENT_WIDTH - 200;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? "Bold" : "Regular").fontSize(10);
    doc.text(label, totalsX, doc.y, { width: 150 });
    doc.text(value, totalsX + 150, doc.y - doc.currentLineHeight(), { width: totalsWidth - 150, align: "right" });
    doc.moveDown(0.2);
  };
  totalRow("Итого:", formatMoney(data.totalAmount));
  totalRow("Ставка НДС:", data.vat.rateText);
  if (data.vat.vatAmount !== null) totalRow("Сумма НДС:", formatMoney(data.vat.vatAmount));
  totalRow("Всего:", formatMoney(data.totalAmount), true);

  doc.moveDown(0.6);
  doc.font("Regular").fontSize(10);
  doc.text(`Всего наименований ${data.lines.length}, на сумму ${data.totalAmountText} руб.`, MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.font("Bold").text(data.amountInWords, MARGIN, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.8);
  doc.font("Regular").fontSize(10).text(
    "Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.",
    MARGIN,
    doc.y,
    { width: CONTENT_WIDTH, align: "justify" },
  );

  signaturesBlock(doc, data, {
    left: "Исполнитель",
    right: "Заказчик",
    rightName: data.buyer.name,
  });

  return collect(doc);
}
