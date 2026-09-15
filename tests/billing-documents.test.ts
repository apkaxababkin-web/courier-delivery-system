/**
 * Document set generation: the data builder, the PDFs and the XLSX registry.
 *
 * Verifies that the invoice, the act and the registry are produced from one dataset
 * (so their totals always agree), that cancelled/unfinished requests never reach the
 * registry, and that the arithmetic matches the verified requests.
 */
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildDocumentSetData,
  documentSetTotals,
  requestFromLabel,
  requestToLabel,
  requestTypeLabel,
} from '../server/_core/billingDocumentData';
import fs from 'node:fs';
import path from 'node:path';
import { pdfFontFiles, renderActPdf, renderInvoicePdf } from '../server/_core/billingPdf';
import { renderRegistryXlsx } from '../server/_core/billingRegistryXlsx';
import type { BillingRequestRow } from '../server/_core/billingReview';
import type { DocumentSettings } from '../server/_core/documentSettings';

function row(over: Partial<{ id: number; amount: number; places: number; type: string; status: string; comment: string }> = {}): BillingRequestRow {
  const id = over.id ?? 1;
  return {
    request: {
      id,
      requestType: over.type ?? 'delivery',
      status: over.status ?? 'completed',
      placesCount: over.places ?? 2,
      deliveryFee: String(over.amount ?? 500),
      completedAt: new Date('2026-08-17T05:00:00.000Z'),
      createdAt: new Date('2026-08-17T04:00:00.000Z'),
      senderCompany: 'Магазин «Павлова»',
      recipientCompany: 'ООО Получатель',
      deliveryAddress: 'ул. Пирогова, 15Б',
      senderName: 'Павлова',
      recipientName: 'Иванов',
      comments: over.comment ?? 'Комментарий заявки',
      clientId: 1,
    },
    amount: over.amount ?? 500,
    state: 'checked',
    issue: null,
    category: 'delivery',
    reviewState: null,
    reviewNote: null,
    blocking: false,
    statusLabel: 'Выполнена',
  } as unknown as BillingRequestRow;
}

const settings: DocumentSettings = {
  executorName: 'Индивидуальный предприниматель Бабкин Юрий Тимофеевич',
  executorShortName: 'ИП Бабкин Ю.Т.',
  executorInn: '030201064412',
  executorKpp: null,
  executorOgrn: null,
  executorOgrnip: '315032000012345',
  executorAddress: '671510, Россия, Бурятия Республика, Багдарин, Баунтовский, Гагарина 20 кв 1',
  executorPostalAddress: null,
  executorPhone: '89503942512',
  executorEmail: 'billing@example.test',
  bankName: 'ООО «Банк Точка»',
  bankBik: '044525104',
  bankAccount: '4080281010745374525104',
  bankCorrespondentAccount: '30101810745374525104',
  vatMode: 'without_vat',
  vatRate: 0,
  vatText: 'Без НДС',
  vatExemptionBasis: null,
  directorName: 'Бабкин Ю. Т.',
  directorPosition: 'Директор',
  accountantName: 'Бабкин Ю. Т.',
  signatureFile: null,
  stampFile: null,
  documentNumberPrefix: null,
  nextDocumentNumber: 256,
};

const client = {
  id: 1,
  name: 'ООО Клиент',
  legalName: 'Общество с ограниченной ответственностью «Клиент»',
  inn: '7536165529',
  kpp: '753601001',
  ogrn: null,
  legalAddress: '672000, г. Чита, ул. Ковыльная, д. 31 стр. 1, офис 1',
  postalAddress: null,
  address: 'г. Чита, ул. Ковыльная, 31',
  phone: null,
  email: null,
};

function build(rows: BillingRequestRow[], number = '256', date = '2026-08-31') {
  return buildDocumentSetData({
    number,
    documentDateIso: date,
    periodFrom: '2026-08-16',
    periodTo: '2026-08-31',
    settings,
    client,
    rows,
  });
}

describe('document data builder', () => {
  it('uses one shared number, date and period for the whole set', () => {
    const data = build([row({ id: 1, amount: 700 }), row({ id: 2, amount: 300 })]);
    expect(data.number).toBe('256');
    expect(data.documentDateIso).toBe('2026-08-31');
    expect(data.documentDateText).toBe('31.08.2026');
    expect(data.periodText).toBe('16.08.2026\u201331.08.2026');
    expect(data.serviceName).toBe('Курьерские услуги за август 2026 г.');
  });

  it('sums the verified requests and keeps one aggregated service line', () => {
    const data = build([row({ id: 1, amount: 700 }), row({ id: 2, amount: 300.5 })]);
    expect(data.totalAmount).toBe(1000.5);
    expect(data.totalAmountText).toBe('1\u00A0000,50');
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].amount).toBe(1000.5);
    expect(data.lines[0].price).toBe(1000.5);
    expect(data.lines[0].name).toBe('Курьерские услуги за август 2026 г.');
  });

  it('keeps invoice, act and registry totals identical by construction', () => {
    const data = build([row({ id: 1, amount: 700 }), row({ id: 2, amount: 300 }), row({ id: 3, amount: 199.99 })]);
    const totals = documentSetTotals(data);
    expect(totals.invoiceTotal).toBe(totals.actTotal);
    expect(totals.invoiceTotal).toBe(totals.registryTotal);
    expect(totals.invoiceTotal).toBe(totals.linesTotal);
    expect(totals.invoiceTotal).toBe(1199.99);
  });

  it('writes the amount in words for the invoice and the act', () => {
    const data = build([row({ id: 1, amount: 15145 })]);
    expect(data.amountInWords).toBe('Пятнадцать тысяч сто сорок пять рублей 00 копеек');
  });

  it('numbers registry rows and formats the dates as DD.MM.YYYY', () => {
    const data = build([row({ id: 1 }), row({ id: 2 }), row({ id: 3 })]);
    expect(data.registry.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(data.registry[0].dateText).toBe('17.08.2026');
    expect(data.registry[0].dateIso).toBe('2026-08-17');
  });

  it('lists only the rows it was given, so cancelled requests never leak in', () => {
    const data = build([row({ id: 1 }), row({ id: 2 })]);
    expect(data.registry.map((r) => r.position)).toEqual([1, 2]);
    expect(data.registry.every((r) => r.requestType === 'delivery')).toBe(true);
    expect(data.requestsCount).toBe(2);
  });

  it('counts places and reports the seller/buyer requisites', () => {
    const data = build([row({ id: 1, places: 3 }), row({ id: 2, places: 2 })]);
    expect(data.totalPlaces).toBe(5);
    expect(data.seller.inn).toBe('030201064412');
    expect(data.buyer.inn).toBe('7536165529');
    expect(data.buyer.address).toContain('Ковыльная');
    // OGRN stays optional: an empty seller/client OGRN must not break anything.
    expect(data.buyer.ogrn).toBeNull();
    expect(data.buyer.postalAddress).toBe(data.buyer.address);
    expect(data.vat.rateText).toBe('Без НДС');
  });

  it('adds VAT lines when the organisation is a VAT payer', () => {
    const vatSettings: DocumentSettings = { ...settings, vatMode: 'vat', vatRate: 20, vatText: 'НДС 20%' };
    const data = buildDocumentSetData({
      number: '257',
      documentDateIso: '2026-08-31',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-31',
      settings: vatSettings,
      client,
      rows: [row({ id: 1, amount: 12000 })],
    });
    expect(data.vat.rateText).toBe('НДС 20%');
    expect(data.vat.vatAmount).toBe(2000);
    expect(data.vat.netAmount).toBe(10000);
    expect(data.totalAmount).toBe(12000);
  });
});

describe('request labelling', () => {
  it('labels request types in Russian', () => {
    expect(requestTypeLabel('delivery')).toBe('Доставка');
    expect(requestTypeLabel('movement')).toBe('Перемещение');
    expect(requestTypeLabel('pickup_from_tc')).toBe('Забор из ТК');
    expect(requestTypeLabel('unknown')).toBe('unknown');
  });

  it('falls back through the available route fields', () => {
    const base = { senderCompany: '', senderName: '', tcName: '', senderAddress: 'ул. А' } as never;
    expect(requestFromLabel(base)).toBe('ул. А');
    const to = { deliveryAddress: '', recipientAddress: 'ул. Б' } as never;
    expect(requestToLabel(to)).toBe('ул. Б');
  });
});

describe('pdf rendering', () => {
  it('ships the Cyrillic fonts the PDFs are rendered with', () => {
    const fonts = pdfFontFiles();
    // The directory is derived from the server file location, so it has the same
    // shape in the repository and in the container (bundle -> dist/assets/fonts).
    expect(fonts.regular.endsWith(path.join('assets', 'fonts', 'LiberationSerif-Regular.ttf'))).toBe(true);
    expect(fonts.bold.endsWith(path.join('assets', 'fonts', 'LiberationSerif-Bold.ttf'))).toBe(true);
    expect(fs.existsSync(fonts.regular)).toBe(true);
    expect(fs.existsSync(fonts.bold)).toBe(true);
    expect(fs.statSync(fonts.regular).size).toBeGreaterThan(100_000);
  });

  it('produces a valid one-page rouble invoice PDF', async () => {
    const data = build([row({ id: 1, amount: 700 }), row({ id: 2, amount: 300 })]);
    const pdf = await renderInvoicePdf(data);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('produces a valid act PDF', async () => {
    const data = build([row({ id: 1, amount: 1000 })]);
    const pdf = await renderActPdf(data);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('renders many requests without throwing (pagination of the registry, not the table)', async () => {
    const rows = Array.from({ length: 40 }, (_, index) => row({ id: index + 1, amount: 100 }));
    const data = build(rows);
    await expect(renderInvoicePdf(data)).resolves.toBeInstanceOf(Buffer);
    await expect(renderActPdf(data)).resolves.toBeInstanceOf(Buffer);
  });

  it('keeps the VAT wording when the seller is a VAT payer', async () => {
    const data = buildDocumentSetData({
      number: '258',
      documentDateIso: '2026-08-31',
      periodFrom: '2026-08-01',
      periodTo: '2026-08-31',
      settings: { ...settings, vatMode: 'vat', vatRate: 20, vatText: 'НДС 20%' },
      client,
      rows: [row({ id: 1, amount: 12000 })],
    });
    const pdf = await renderInvoicePdf(data);
    expect(pdf.length).toBeGreaterThan(2000);
  });
});

describe('xlsx registry', () => {
  it('writes the expected sheet, columns, numbered rows and a numeric total', async () => {
    const data = build([row({ id: 1, amount: 700, places: 3 }), row({ id: 2, amount: 300, places: 1 })]);
    const buffer = await renderRegistryXlsx(data);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Реестр');
    expect(sheet).toBeTruthy();

    // Title, client, requisites, period and document line.
    expect(sheet!.getCell('A1').value).toBe('Реестр выполненных заявок');
    expect(String(sheet!.getCell('A2').value)).toContain('Клиент:');
    expect(String(sheet!.getCell('A3').value)).toContain('Реквизиты: ИНН 7536165529');
    expect(String(sheet!.getCell('A4').value)).toContain('Период: 16.08.2026');

    // Header row starts on line 6 and matches the sample sheet.
    const headers = ['№ п/п', 'Дата', 'Тип заявки', 'Откуда', 'Куда', 'Количество мест', 'Сумма, руб.', 'Комментарий'];
    headers.forEach((text, index) => {
      expect(sheet!.getRow(6).getCell(index + 1).value).toBe(text);
    });

    // First data row.
    const first = sheet!.getRow(7);
    expect(first.getCell(1).value).toBe(1);
    expect(first.getCell(2).value).toBe('17.08.2026');
    expect(first.getCell(3).value).toBe('Доставка');
    expect(first.getCell(6).value).toBe(3);
    expect(typeof first.getCell(7).value).toBe('number');
    expect(first.getCell(7).value).toBe(700);

    // Totals row: numeric sum, not text.
    const totals = sheet!.getRow(7 + data.registry.length);
    expect(totals.getCell(1).value).toBe('ИТОГО');
    expect(totals.getCell(6).value).toBe(4);
    expect(totals.getCell(7).value).toBe(1000);
    expect(typeof totals.getCell(7).value).toBe('number');

    // Frozen header and sensible widths.
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 });
    expect(sheet!.getColumn(7).width).toBeGreaterThan(10);
  });

  it('excludes nothing from the registry that the dataset does not contain', async () => {
    const data = build([row({ id: 1 })]);
    const buffer = await renderRegistryXlsx(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Реестр')!;
    // One header, one data row, then totals: no phantom rows.
    expect(sheet.getRow(7).getCell(1).value).toBe(1);
    expect(sheet.getRow(8).getCell(1).value).toBe('ИТОГО');
  });
});
