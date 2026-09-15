/**
 * XLSX registry of completed works for one client and period.
 *
 * The layout follows the reconciliation sheet the managers already use: a title,
 * client and period lines, then a bordered table with numbered rows, dates in
 * DD.MM.YYYY, numeric money columns and wrapped comments, and a totals row.
 *
 * Only confirmed completed services are listed. Cancelled, unfinished and disputed
 * requests stay in the internal review screen and never reach the official registry.
 */
import ExcelJS from "exceljs";
import { formatDateRu, groupThousands } from "../../shared/billing-format";
import type { DocumentSetData } from "./billingDocumentData";

const HEADER_ROW = 6;

function thin(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF94A3B8" } };
  return { top: side, left: side, bottom: side, right: side };
}

export async function renderRegistryXlsx(data: DocumentSetData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "МИГ · Расчёты";
  workbook.created = new Date(`${data.documentDateIso}T00:00:00.000Z`);

  const sheet = workbook.addWorksheet("Реестр", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    views: [{ state: "frozen", ySplit: HEADER_ROW, topLeftCell: `A${HEADER_ROW + 1}` }],
  });

  sheet.columns = [
    { key: "position", width: 7 },
    { key: "date", width: 12 },
    { key: "type", width: 24 },
    { key: "from", width: 32 },
    { key: "to", width: 34 },
    { key: "places", width: 10 },
    { key: "amount", width: 14 },
    { key: "comment", width: 52 },
  ];

  const columnCount = sheet.columns.length;

  // Title, client and period.
  sheet.mergeCells(1, 1, 1, columnCount);
  const title = sheet.getCell(1, 1);
  title.value = "Реестр выполненных заявок";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "left" };
  sheet.getRow(1).height = 22;

  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.getCell(2, 1).value = `Клиент: ${data.buyer.name}`;
  sheet.getCell(2, 1).font = { bold: true, size: 11 };

  // Requisites are printed only when they exist: neither INN nor OGRN is required.
  const buyerRequisites = [
    data.buyer.inn ? `ИНН ${data.buyer.inn}` : "",
    data.buyer.kpp ? `КПП ${data.buyer.kpp}` : "",
    data.buyer.ogrn ? `ОГРН(ИП) ${data.buyer.ogrn}` : "",
  ].filter(Boolean).join(", ");
  sheet.mergeCells(3, 1, 3, columnCount);
  sheet.getCell(3, 1).value = buyerRequisites ? `Реквизиты: ${buyerRequisites}` : "";
  sheet.getCell(3, 1).font = { size: 10, color: { argb: "FF475569" } };

  sheet.mergeCells(4, 1, 4, columnCount);
  sheet.getCell(4, 1).value = `Период: ${data.periodText}`;
  sheet.getCell(4, 1).font = { size: 11 };

  sheet.mergeCells(5, 1, 5, columnCount);
  sheet.getCell(5, 1).value = `Счёт №${data.number} от ${data.documentDateText} г. · заявок: ${data.requestsCount}`;
  sheet.getCell(5, 1).font = { size: 10, color: { argb: "FF475569" } };

  // Header row.
  const header = sheet.getRow(HEADER_ROW);
  const headers = ["№ п/п", "Дата", "Тип заявки", "Откуда", "Куда", "Количество мест", "Сумма, руб.", "Комментарий"];
  headers.forEach((text, index) => {
    const cell = header.getCell(index + 1);
    cell.value = text;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    cell.border = thin();
  });
  header.height = 30;

  // Data rows.
  data.registry.forEach((row, index) => {
    const excelRow = sheet.getRow(HEADER_ROW + 1 + index);
    const values: (string | number | null)[] = [
      row.position,
      row.dateText,
      row.requestTypeLabel,
      row.from,
      row.to,
      row.placesCount,
      row.amount,
      row.comment,
    ];
    values.forEach((value, cellIndex) => {
      const cell = excelRow.getCell(cellIndex + 1);
      cell.value = value;
      cell.border = thin();
      cell.alignment = {
        vertical: "top",
        wrapText: cellIndex === 3 || cellIndex === 4 || cellIndex === 7,
        horizontal: cellIndex === 0 || cellIndex === 5 ? "center" : cellIndex === 6 ? "right" : "left",
      };
      if (cellIndex === 6) cell.numFmt = '#,##0.00';
      cell.font = { size: 10 };
    });
  });

  // Totals row.
  const totalsRowIndex = HEADER_ROW + 1 + data.registry.length;
  const totalsRow = sheet.getRow(totalsRowIndex);
  totalsRow.getCell(1).value = "ИТОГО";
  totalsRow.getCell(6).value = data.totalPlaces || null;
  totalsRow.getCell(7).value = data.totalAmount;
  totalsRow.getCell(8).value = `заявок: ${data.requestsCount}`;
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = totalsRow.getCell(column);
    cell.font = { bold: true, size: 10 };
    cell.border = thin();
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    if (column === 6) cell.alignment = { horizontal: "center" };
    if (column === 7) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: "right" }; }
    if (column === 8) cell.alignment = { horizontal: "right" };
  }

  // Amount in words, matching the invoice and the act.
  const wordsRowIndex = totalsRowIndex + 2;
  sheet.mergeCells(wordsRowIndex, 1, wordsRowIndex, columnCount);
  const wordsCell = sheet.getCell(wordsRowIndex, 1);
  wordsCell.value = `Всего наименований ${data.lines.length}, на сумму ${groupThousands(data.totalAmount)},${String(Math.round((data.totalAmount % 1) * 100)).padStart(2, "0")} руб.`;
  wordsCell.font = { size: 10 };
  sheet.mergeCells(wordsRowIndex + 1, 1, wordsRowIndex + 1, columnCount);
  const wordsValueCell = sheet.getCell(wordsRowIndex + 1, 1);
  wordsValueCell.value = data.amountInWords;
  wordsValueCell.font = { bold: true, size: 10 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
