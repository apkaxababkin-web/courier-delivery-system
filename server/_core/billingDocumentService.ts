/**
 * Client document set service: preview, issue, annul and payment tracking.
 *
 * One set = invoice PDF + act PDF + registry XLSX, for one client, one period and
 * one frozen list of verified requests. The three files are rendered from a single
 * dataset, so the totals can never disagree.
 *
 * Files are written under uploads/billing-documents/<documentId>/ and only their
 * paths are stored in the database, matching the existing uploads convention.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { billingDocumentFiles, billingDocuments, billingDocumentRequests } from "../../drizzle/schema";
import * as db from "../db";
import { formatMoney, formatDateRu, groupThousands, sumMoney } from "../../shared/billing-format";
import {
  billableRows,
  buildClientBillingOverview,
  clientDocumentName,
  loadClientRequisites,
  missingClientRequisites,
  type BillingOverview,
  type BillingRequestRow,
} from "./billingReview";
import { loadDocumentSettings, missingExecutorRequisites, type DocumentSettings } from "./documentSettings";
import { buildDocumentSetData, documentSetTotals, type DocumentSetData } from "./billingDocumentData";
import { renderActPdf, renderInvoicePdf } from "./billingPdf";
import { renderRegistryXlsx } from "./billingRegistryXlsx";

const BILLING_DOCUMENTS_DIR = process.env.BILLING_DOCUMENTS_DIR || path.join(process.cwd(), "uploads", "billing-documents");

/**
 * Absolute paths a stored file URL may point at: the generated document set
 * directory, and the uploads root for anything stored by the routes.
 *
 * Resolving against the configured directory (not only process.cwd()) matters:
 * without it, deleting a payment proof would look for the file in the process
 * directory and could touch an unrelated file with the same name.
 */
function allowedFileRoots(): string[] {
  return [path.resolve(BILLING_DOCUMENTS_DIR), path.resolve(process.cwd(), "uploads")];
}

/** Resolve a stored file URL, refusing anything outside the uploads roots. */
function resolveStoredFile(fileUrl: string): string {
  const relative = String(fileUrl).replace(/^\/+/, "");
  const relativeToUploads = relative.replace(/^uploads[/\\]billing-documents[/\\]?/, "");
  const candidates = [
    // The logical path is authoritative: uploads/billing-documents/<id>/<file>.
    path.resolve(BILLING_DOCUMENTS_DIR, relativeToUploads),
    path.resolve(process.cwd(), relative),
  ];
  const roots = allowedFileRoots();
  for (const candidate of candidates) {
    const inside = roots.some((root) => candidate === root || candidate.startsWith(root + path.sep));
    if (inside) return candidate;
  }
  throw new BillingDocumentError("Путь к файлу вне каталога загрузок", 400);
}

export class BillingDocumentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface DocumentPreview {
  ready: boolean;
  blockers: string[];
  number: string;
  documentDateIso: string;
  documentDateText: string;
  clientName: string;
  periodFrom: string;
  periodTo: string;
  periodText: string;
  requestsCount: number;
  totalPlaces: number;
  totalAmount: number;
  totalAmountText: string;
  amountInWords: string;
  vatRateText: string;
  lines: { name: string; quantity: number; price: number; amount: number }[];
  /** Non-blocking warnings, e.g. requests already on another document. */
  warnings: string[];
}

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const list = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

export async function currentDocumentNumber(): Promise<string> {
  const settings = await loadDocumentSettings();
  const prefix = settings.documentNumberPrefix ?? "";
  return `${prefix}${settings.nextDocumentNumber}`;
}

async function loadOverviewOrThrow(clientId: number, from: string, to: string): Promise<BillingOverview> {
  if (from > to) throw new BillingDocumentError("Дата начала периода позже даты окончания", 400);
  const overview = await buildClientBillingOverview(clientId, from, to);
  return overview;
}

async function buildData(
  clientId: number,
  from: string,
  to: string,
  documentDateIso: string,
  settings: DocumentSettings,
  rowsToBill: BillingRequestRow[],
  number: string,
): Promise<DocumentSetData> {
  const client = await loadClientRequisites(clientId);
  if (!client) throw new BillingDocumentError("Клиент не найден", 404);
  return buildDocumentSetData({
    number,
    documentDateIso,
    periodFrom: from,
    periodTo: to,
    settings,
    client,
    rows: rowsToBill,
  });
}

/**
 * Preview: shows exactly what would be issued (number, date, client, period, count,
 * total) plus every reason the set is not ready. Reserves nothing and writes nothing.
 */
export async function previewDocumentSet(
  clientId: number,
  from: string,
  to: string,
  documentDateIso?: string,
): Promise<DocumentPreview> {
  const overview = await loadOverviewOrThrow(clientId, from, to);
  const settings = await loadDocumentSettings();
  const client = await loadClientRequisites(clientId);
  const number = await currentDocumentNumber();
  const dateIso = documentDateIso || new Date().toISOString().slice(0, 10);

  const billable = billableRows(overview);
  const data = client && billable.length > 0
    ? await buildData(clientId, from, to, dateIso, settings, billable, number)
    : null;

  const blockers = [...overview.readiness.blockers];

  // Client requisites block the printed documents.
  const clientGaps = missingClientRequisites(client);
  if (clientGaps.length > 0) {
    blockers.push(...clientGaps.map((gap: { label: string }) => `У клиента не заполнено: ${gap.label}`));
  }
  const executorGaps = missingExecutorRequisites(settings);
  if (executorGaps.length > 0) {
    blockers.push(...executorGaps.map((gap: { label: string }) => `Не заполнены наши реквизиты: ${gap.label}`));
  }
  if (billable.length === 0 && overview.rows.length > 0) {
    blockers.push("Нет проверенных выполненных заявок для документов");
  }

  // Duplicate guard: a request already on an active document must not be re-billed.
  const warnings: string[] = [];
  const alreadyDocumented = overview.rows.filter((row) => row.state === "billed").length;
  if (alreadyDocumented > 0) {
    warnings.push(`Заявок уже включено в другие счета: ${alreadyDocumented}`);
  }
  const duplicates = overview.documentedRequestIds.filter((id) => billable.some((row) => Number(row.request.id) === id));
  if (duplicates.length > 0) {
    blockers.push("Часть выбранных заявок уже включена в выставленный документ");
  }

  return {
    ready: blockers.length === 0 && billable.length > 0,
    blockers: [...new Set(blockers)],
    number,
    documentDateIso: dateIso,
    documentDateText: formatDateRu(dateIso),
    clientName: client ? clientDocumentName(client) : "",
    periodFrom: from,
    periodTo: to,
    periodText: data?.periodText ?? "",
    requestsCount: billable.length,
    totalPlaces: data?.totalPlaces ?? 0,
    totalAmount: data?.totalAmount ?? 0,
    totalAmountText: data ? formatMoney(data.totalAmount) : formatMoney(0),
    amountInWords: data?.amountInWords ?? "",
    vatRateText: data?.vat.rateText ?? settings.vatText,
    lines: data?.lines.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price, amount: line.amount })) ?? [],
    warnings,
  };
}

export type PreviewKind = "invoice" | "act" | "registry";

/** Preview file, generated on the fly. Nothing is persisted and no number is reserved. */
export async function renderPreviewFile(
  clientId: number,
  from: string,
  to: string,
  kind: PreviewKind,
  documentDateIso?: string,
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const overview = await loadOverviewOrThrow(clientId, from, to);
  const billable = billableRows(overview);
  if (billable.length === 0) throw new BillingDocumentError("Нет проверенных заявок для документов", 400);

  const settings = await loadDocumentSettings();
  const number = await currentDocumentNumber();
  const dateIso = documentDateIso || new Date().toISOString().slice(0, 10);
  const data = await buildData(clientId, from, to, dateIso, settings, billable, number);
  const suffix = `${number}_${dateIso}`;

  if (kind === "invoice") {
    return { buffer: await renderInvoicePdf(data), fileName: `Счет_${suffix}.pdf`, contentType: "application/pdf" };
  }
  if (kind === "act") {
    return { buffer: await renderActPdf(data), fileName: `Акт_${suffix}.pdf`, contentType: "application/pdf" };
  }
  return { buffer: await renderRegistryXlsx(data), fileName: `Реестр_${suffix}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

/** Allocate the next document number atomically (row lock on the settings row). */
async function allocateNumber(tx: {
  execute: (query: unknown) => Promise<unknown>;
}): Promise<string> {
  const updated = rows(await tx.execute(sql`
    UPDATE "billingSettings"
       SET "nextDocumentNumber" = "nextDocumentNumber" + 1, "updatedAt" = now()
     WHERE "id" = (SELECT "id" FROM "billingSettings" ORDER BY "id" LIMIT 1)
    RETURNING "documentNumberPrefix", ("nextDocumentNumber" - 1) AS "allocated"`));
  const row = updated[0];
  if (!row) throw new BillingDocumentError("Не удалось выделить номер документа: не найдены настройки документов", 500);
  const prefix = row.documentNumberPrefix == null ? "" : String(row.documentNumberPrefix);
  return `${prefix}${Number(row.allocated)}`;
}

export interface IssuedDocument {
  id: number;
  number: string;
  documentDateIso: string;
  documentDateText: string;
  clientId: number;
  clientName: string;
  periodFrom: string;
  periodTo: string;
  requestsCount: number;
  totalAmount: number;
  invoiceFile: string;
  actFile: string;
  registryFile: string;
  totals: ReturnType<typeof documentSetTotals>;
}

/**
 * Issue the set: reserve the number, render the three files, freeze the snapshot.
 * The request links are written inside the same transaction and the unique active
 * index guarantees a request cannot land on two documents.
 */
export async function issueDocumentSet(
  clientId: number,
  from: string,
  to: string,
  managerId: number,
  documentDateIso?: string,
): Promise<IssuedDocument> {
  const preview = await previewDocumentSet(clientId, from, to, documentDateIso);
  if (!preview.ready) {
    throw new BillingDocumentError(preview.blockers.join("; ") || "Комплект документов не готов", 400);
  }

  const overview = await loadOverviewOrThrow(clientId, from, to);
  const billable = billableRows(overview);
  if (billable.length === 0) throw new BillingDocumentError("Нет проверенных заявок для документов", 400);

  const settings = await loadDocumentSettings();
  const client = await loadClientRequisites(clientId);
  if (!client) throw new BillingDocumentError("Клиент не найден", 404);

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const dateIso = preview.documentDateIso;
  const number = preview.number;

  // Render before writing anything, so a rendering failure leaves no documents.
  const data = await buildData(clientId, from, to, dateIso, settings, billable, number);
  const [invoice, act, registry] = await Promise.all([
    renderInvoicePdf(data),
    renderActPdf(data),
    renderRegistryXlsx(data),
  ]);

  const totals = documentSetTotals(data);
  if (totals.invoiceTotal !== totals.actTotal || totals.invoiceTotal !== totals.registryTotal || totals.invoiceTotal !== totals.linesTotal) {
    throw new BillingDocumentError("Итоговые суммы счёта, акта и реестра не совпадают — документы не созданы", 500);
  }

  const created = await conn.transaction(async (tx: {
    execute: (query: unknown) => Promise<unknown>;
    insert: (table: unknown) => { values: (values: unknown) => { returning: () => Promise<unknown[]> } };
  }) => {
    const allocated = await allocateNumber(tx);

    const insertedRows = await tx
      .insert(billingDocuments)
      .values({
        number: allocated,
        clientId,
        documentDate: dateIso,
        documentDateText: formatDateRu(dateIso),
        periodFrom: from,
        periodTo: to,
        requestsCount: billable.length,
        totalAmount: data.totalAmount.toFixed(2),
        status: "issued",
        serviceDescription: data.serviceName,
        serviceNameSnapshot: data.serviceName,
        periodTextSnapshot: data.periodText,
        vatModeSnapshot: settings.vatMode,
        vatRateSnapshot: settings.vatMode === "vat" ? Number(settings.vatRate).toFixed(2) : "0",
        vatAmountSnapshot: data.vat.vatAmount === null ? null : data.vat.vatAmount.toFixed(2),
        vatTextSnapshot: data.vat.rateText,
        clientNameSnapshot: data.buyer.name,
        clientInnSnapshot: data.buyer.inn ?? "",
        clientKppSnapshot: data.buyer.kpp,
        clientOgrnSnapshot: null,
        clientAddressSnapshot: data.buyer.address,
        executorNameSnapshot: data.seller.name,
        executorInnSnapshot: data.seller.inn ?? "",
        executorKppSnapshot: data.seller.kpp,
        executorAddressSnapshot: data.seller.address,
        executorPhoneSnapshot: data.seller.phone,
        bankNameSnapshot: data.seller.bankName,
        bankBikSnapshot: data.seller.bankBik,
        bankAccountSnapshot: data.seller.bankAccount,
        bankCorrespondentAccountSnapshot: data.seller.bankCorrespondentAccount,
        directorNameSnapshot: data.seller.directorName,
        directorPositionSnapshot: data.seller.directorPosition,
        accountantNameSnapshot: data.seller.accountantName,
        createdByManagerId: managerId,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const document = insertedRows[0] as Record<string, unknown>;
    const documentId = Number(document.id);

    for (const row of billable) {
      await tx.insert(billingDocumentRequests).values({
        billingDocumentId: documentId,
        requestId: Number(row.request.id),
        amount: Number(row.amount ?? 0).toFixed(2),
      });
    }

    return document;
  });

  const documentId = Number((created as Record<string, unknown>).id);
  const expectedNumber = String((created as Record<string, unknown>).number);

  // Files are written after the transaction commits; if writing fails the document
  // exists but without files, which is reported as a generation error below.
  const dir = path.join(BILLING_DOCUMENTS_DIR, String(documentId));
  await fs.mkdir(dir, { recursive: true });
  const invoiceName = `invoice-${expectedNumber}.pdf`;
  const actName = `act-${expectedNumber}.pdf`;
  const registryName = `registry-${expectedNumber}.xlsx`;
  await fs.writeFile(path.join(dir, invoiceName), invoice);
  await fs.writeFile(path.join(dir, actName), act);
  await fs.writeFile(path.join(dir, registryName), registry);

  const invoiceFile = path.relative(process.cwd(), path.join(dir, invoiceName));
  const actFile = path.relative(process.cwd(), path.join(dir, actName));
  const registryFile = path.relative(process.cwd(), path.join(dir, registryName));

  await conn
    .update(billingDocuments)
    .set({ invoiceFile, actFile, registryFile, updatedAt: new Date() })
    .where(eq(billingDocuments.id, documentId));

  return {
    id: documentId,
    number: expectedNumber,
    documentDateIso: dateIso,
    documentDateText: formatDateRu(dateIso),
    clientId,
    clientName: data.buyer.name,
    periodFrom: from,
    periodTo: to,
    requestsCount: billable.length,
    totalAmount: data.totalAmount,
    invoiceFile,
    actFile,
    registryFile,
    totals,
  };
}

// ─── Lifecycle: list, annul, payment ─────────────────────────────────────────

export interface BillingDocumentListRow {
  id: number;
  number: string;
  documentDate: string;
  documentDateText: string | null;
  clientId: number;
  clientName: string;
  periodFrom: string;
  periodTo: string;
  requestsCount: number;
  totalAmount: number;
  status: "issued" | "paid" | "cancelled";
  vatText: string | null;
  invoiceFile: string | null;
  actFile: string | null;
  registryFile: string | null;
  paidAt: string | null;
  paidByManagerId: number | null;
  paymentComment: string | null;
  paymentProofs: { id: number; originalName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

export async function listDocuments(options: { clientId?: number; limit?: number } = {}): Promise<BillingDocumentListRow[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  const list = rows(await conn.execute(sql`
    SELECT d.*, c."name" AS "clientName"
      FROM "billingDocuments" d
      JOIN "clients" c ON c."id" = d."clientId"
     ${options.clientId ? sql`WHERE d."clientId" = ${options.clientId}` : sql``}
     ORDER BY d."id" DESC
     LIMIT ${limit}`));

  const ids = list.map((row) => Number(row.id));
  const files = ids.length === 0 ? [] : rows(await conn.execute(sql`
    SELECT "id","billingDocumentId","originalName","mimeType","sizeBytes","createdAt"
      FROM "billingDocumentFiles"
     WHERE "billingDocumentId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
       AND "kind" = 'payment_proof'
     ORDER BY "id"`));

  const byDocument = new Map<number, BillingDocumentListRow["paymentProofs"]>();
  for (const file of files) {
    const key = Number(file.billingDocumentId);
    const entry = byDocument.get(key) ?? [];
    entry.push({
      id: Number(file.id),
      originalName: String(file.originalName),
      mimeType: String(file.mimeType),
      sizeBytes: Number(file.sizeBytes),
      createdAt: new Date(file.createdAt as string).toISOString(),
    });
    byDocument.set(key, entry);
  }

  return list.map((row) => ({
    id: Number(row.id),
    number: String(row.number),
    documentDate: String(row.documentDate).slice(0, 10),
    documentDateText: row.documentDateText == null ? null : String(row.documentDateText),
    clientId: Number(row.clientId),
    clientName: String(row.clientName ?? ""),
    periodFrom: String(row.periodFrom).slice(0, 10),
    periodTo: String(row.periodTo).slice(0, 10),
    requestsCount: Number(row.requestsCount),
    totalAmount: Number(row.totalAmount),
    status: row.status as BillingDocumentListRow["status"],
    vatText: row.vatTextSnapshot == null ? null : String(row.vatTextSnapshot),
    invoiceFile: row.invoiceFile == null ? null : String(row.invoiceFile),
    actFile: row.actFile == null ? null : String(row.actFile),
    registryFile: row.registryFile == null ? null : String(row.registryFile),
    paidAt: row.paidAt ? new Date(row.paidAt as string).toISOString() : null,
    paidByManagerId: row.paidByManagerId == null ? null : Number(row.paidByManagerId),
    paymentComment: row.paymentComment == null ? null : String(row.paymentComment),
    paymentProofs: byDocument.get(Number(row.id)) ?? [],
    voidedAt: row.voidedAt ? new Date(row.voidedAt as string).toISOString() : null,
    voidReason: row.voidReason == null ? null : String(row.voidReason),
    createdAt: new Date(row.createdAt as string).toISOString(),
  }));
}

export async function getDocument(documentId: number): Promise<BillingDocumentListRow | null> {
  const list = await listDocuments({ limit: 500 });
  return list.find((row) => row.id === documentId) ?? null;
}

/** Annul a document: keeps the record, blocks re-use until the links are released. */
export async function voidDocument(documentId: number, managerId: number, reason: string): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const document = await getDocument(documentId);
  if (!document) throw new BillingDocumentError("Документ не найден", 404);
  if (document.status === "cancelled") throw new BillingDocumentError("Документ уже аннулирован", 400);
  if (document.status === "paid") throw new BillingDocumentError("Нельзя аннулировать оплаченный документ", 400);

  await conn
    .update(billingDocuments)
    .set({ status: "cancelled", voidedAt: new Date(), voidedByManagerId: managerId, voidReason: reason, updatedAt: new Date() })
    .where(eq(billingDocuments.id, documentId));
}

/** Mark a document as paid (or back to issued) and record who did it. */
export async function setDocumentPaid(
  documentId: number,
  managerId: number,
  paid: boolean,
  comment: string | null,
): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const document = await getDocument(documentId);
  if (!document) throw new BillingDocumentError("Документ не найден", 404);
  if (document.status === "cancelled") throw new BillingDocumentError("Документ аннулирован", 400);

  await conn
    .update(billingDocuments)
    .set({
      status: paid ? "paid" : "issued",
      paidAt: paid ? new Date() : null,
      paidByManagerId: paid ? managerId : null,
      paymentComment: comment,
      updatedAt: new Date(),
    })
    .where(eq(billingDocuments.id, documentId));
}

export interface StoredBillingFile {
  id: number;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  fileUrl: string;
}

/** Record an uploaded payment proof (bytes already written by the route). */
export async function attachDocumentFile(input: {
  documentId: number;
  kind: "payment_proof";
  originalName: string;
  storedName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  managerId: number | null;
}): Promise<StoredBillingFile> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const document = await getDocument(input.documentId);
  if (!document) throw new BillingDocumentError("Документ не найден", 404);

  const inserted = await conn
    .insert(billingDocumentFiles)
    .values({
      billingDocumentId: input.documentId,
      kind: input.kind,
      originalName: input.originalName,
      storedName: input.storedName,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedByManagerId: input.managerId,
    })
    .returning();

  const row = inserted[0] as Record<string, unknown>;
  return {
    id: Number(row.id),
    originalName: String(row.originalName),
    storedName: String(row.storedName),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    fileUrl: String(row.fileUrl),
  };
}

export async function findDocumentFile(fileId: number): Promise<(StoredBillingFile & { billingDocumentId: number }) | null> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const row = rows(await conn.execute(sql`SELECT * FROM "billingDocumentFiles" WHERE "id" = ${fileId} LIMIT 1`))[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    billingDocumentId: Number(row.billingDocumentId),
    originalName: String(row.originalName),
    storedName: String(row.storedName),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    fileUrl: String(row.fileUrl),
  };
}

export async function deleteDocumentFile(fileId: number): Promise<boolean> {
  const file = await findDocumentFile(fileId);
  if (!file) return false;
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  await conn.execute(sql`DELETE FROM "billingDocumentFiles" WHERE "id" = ${fileId}`);
  const absolute = resolveStoredFile(file.fileUrl);
  await fs.unlink(absolute).catch(() => undefined);
  return true;
}

export function billingDocumentsDirectory(): string {
  return BILLING_DOCUMENTS_DIR;
}

/** Human readable summary used by the preview screen and activity notes. */
export function documentSummary(data: DocumentSetData): string {
  return `№${data.number} от ${data.documentDateText}: ${data.buyer.name}, ${data.periodText}, заявок ${data.requestsCount}, сумма ${groupThousands(data.totalAmount)},${String(Math.round((data.totalAmount % 1) * 100)).padStart(2, "0")} руб.`;
}

export { sumMoney };
