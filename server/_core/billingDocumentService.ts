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
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import {
  billingDocumentEvents,
  billingDocumentFiles,
  billingDocuments,
  billingDocumentRequests,
} from "../../drizzle/schema";
import * as db from "../db";
import { formatMoney, formatDateRu, groupThousands, sumMoney } from "../../shared/billing-format";
import {
  activeBillingMembership,
  billableRows,
  buildClientBillingOverview,
  clientDocumentName,
  clientPostalAddress,
  loadClientRequisites,
  missingClientRequisites,
  type BillingOverview,
  type BillingRequestRow,
} from "./billingReview";
import { loadDocumentSettings, missingExecutorRequisites, type DocumentSettings } from "./documentSettings";
import {
  documentOverlays,
  resolveDocumentImages,
  snapshotDocumentAssets,
  type DocumentImages,
  type DocumentSignatureSnapshot,
} from "./documentImages";
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

/**
 * Resolve a stored file URL, refusing anything outside the uploads roots.
 *
 * This is the ONLY place that turns a stored `fileUrl` into an absolute path, so
 * the writer (`issueDocumentSet`), the deleter and the download routes can never
 * disagree when `BILLING_DOCUMENTS_DIR` points somewhere else than the default
 * `<cwd>/uploads/billing-documents`.
 */
export function resolveStoredFilePath(fileUrl: string): string | null {
  const relative = String(fileUrl ?? "").replace(/^\/+/, "");
  if (!relative) return null;

  const normalized = path.normalize(relative);
  // Never follow a path that climbs out of the uploads tree.
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;

  const relativeToUploads = relative.replace(/^uploads[/\\]billing-documents[/\\]?/, "");
  const roots = allowedFileRoots();
  // Both candidates are inside the uploads tree; prefer the one that exists, so an
  // absolute path is produced correctly whether the stored URL was written
  // relative to the process directory or relative to the configured directory.
  const candidates = [
    path.resolve(BILLING_DOCUMENTS_DIR, relativeToUploads),
    path.resolve(process.cwd(), relative),
  ].filter((candidate) => roots.some((root) => candidate === root || candidate.startsWith(root + path.sep)));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? null;
}

/** Same as resolveStoredFilePath but throws the billing error for the service. */
function resolveStoredFile(fileUrl: string): string {
  const resolved = resolveStoredFilePath(fileUrl);
  if (!resolved) throw new BillingDocumentError("Путь к файлу вне каталога загрузок", 400);
  return resolved;
}

export class BillingDocumentError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Audit kinds recorded for a document set. The lifecycle is append-only: nothing
 * is ever deleted from the history, an annulled document keeps its composition.
 */
export type BillingDocumentEventKind =
  | "issued"            // new set created
  | "reissued"          // this set replaced an annulled one
  | "voided"            // annulled by a manager
  | "requests_released" // its requests were returned for re-billing
  | "replaced_by"       // annulled set: another set took over its requests
  | "payment_set"       // marked as paid
  | "payment_cleared"   // payment mark removed
  | "rolled_back";      // set rolled back and its requests returned to review

/** Append one lifecycle event. Never throws into the caller's flow. */
async function recordDocumentEvent(input: {
  documentId: number;
  kind: BillingDocumentEventKind;
  managerId: number | null;
  managerName?: string | null;
  note?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const conn = await db.getDb();
    if (!conn) return;
    let managerName = input.managerName ?? null;
    if (!managerName && input.managerId) {
      const row = rows(await conn.execute(sql`SELECT "name" FROM "managers" WHERE "id" = ${input.managerId} LIMIT 1`))[0];
      managerName = row?.name == null ? null : String(row.name);
    }
    await conn.insert(billingDocumentEvents).values({
      billingDocumentId: input.documentId,
      kind: input.kind,
      managerId: input.managerId,
      managerName,
      note: input.note ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
    });
  } catch (error) {
    console.error("[billing] failed to record document event", { kind: input.kind, error });
  }
}

export interface DocumentHistoryEntry {
  id: number;
  kind: BillingDocumentEventKind;
  managerId: number | null;
  managerName: string | null;
  note: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

/** Full audit trail of one document set, oldest first. */
export async function documentHistory(documentId: number): Promise<DocumentHistoryEntry[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const list = rows(await conn.execute(sql`
    SELECT "id","kind","managerId","managerName","note","details","createdAt"
      FROM "billingDocumentEvents"
     WHERE "billingDocumentId" = ${documentId}
     ORDER BY "createdAt", "id"`));

  return list.map((row) => {
    let details: Record<string, unknown> | null = null;
    if (row.details != null) {
      try {
        details = JSON.parse(String(row.details)) as Record<string, unknown>;
      } catch {
        details = { raw: String(row.details) };
      }
    }
    return {
      id: Number(row.id),
      kind: String(row.kind) as BillingDocumentEventKind,
      managerId: row.managerId == null ? null : Number(row.managerId),
      managerName: row.managerName == null ? null : String(row.managerName),
      note: row.note == null ? null : String(row.note),
      details,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  });
}

export interface DocumentPreview {
  ready: boolean;
  blockers: string[];
  number: string;
  /** Calendar year used for this document number. */
  numberYear: number;
  /** Manager must enter the first real number for this transition year. */
  numberInitializationRequired: boolean;
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
  /**
   * Requests of this period that would enter the set but are still held by an
   * active document. A manager must explicitly release them (see
   * releaseDocumentRequests) before the set can be issued.
   */
  blockedRequestIds: number[];
  /** Documents those blocked requests belong to, for the message in the UI. */
  blockingDocuments: { documentId: number; number: string; status: string; documentDate: string | null }[];
}

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const list = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

function documentYear(documentDateIso: string): number {
  const year = Number(documentDateIso.slice(0, 4));
  if (!Number.isSafeInteger(year) || year < 2000 || year > 9999) {
    throw new BillingDocumentError("Некорректная дата документа", 400);
  }
  return year;
}

interface AnnualNumberPreview {
  year: number;
  number: string;
  initializationRequired: boolean;
}

async function annualNumberPreview(
  documentDateIso: string,
  firstDocumentNumber?: number,
): Promise<AnnualNumberPreview> {
  const conn = await db.getDb();
  if (!conn) throw new BillingDocumentError("База данных недоступна", 503);

  const settings = await loadDocumentSettings();
  const prefix = settings.documentNumberPrefix ?? "";
  const year = documentYear(documentDateIso);

  const result = rows(await conn.execute(sql`
    SELECT "nextNumber", "initialized"
      FROM "billingDocumentNumberSequences"
     WHERE "year" = ${year}
     LIMIT 1`));
  const row = result[0];

  // A year without a row is a normal new calendar year.
  // Its first document starts from No. 1 automatically.
  if (!row) {
    return {
      year,
      number: `${prefix}1`,
      initializationRequired: false,
    };
  }

  const initialized = Boolean(row.initialized);
  const nextNumber = Number(row.nextNumber);

  if (!initialized) {
    if (firstDocumentNumber == null) {
      return { year, number: "", initializationRequired: true };
    }
    if (!Number.isSafeInteger(firstDocumentNumber) || firstDocumentNumber <= 0) {
      throw new BillingDocumentError(
        "Первый номер счёта должен быть положительным целым числом",
        400,
      );
    }
    return {
      year,
      number: `${prefix}${firstDocumentNumber}`,
      initializationRequired: false,
    };
  }

  if (!Number.isSafeInteger(nextNumber) || nextNumber <= 0) {
    throw new BillingDocumentError(
      `Некорректный следующий номер документов за ${year} год`,
      500,
    );
  }

  return {
    year,
    number: `${prefix}${nextNumber}`,
    initializationRequired: false,
  };
}

export interface SuggestedBillingPeriod {
  lastPeriodFrom: string | null;
  lastPeriodTo: string | null;
  lastDocumentNumber: string | null;
  nextDateFrom: string | null;
}

function nextIsoDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function getSuggestedBillingPeriod(
  clientId: number,
): Promise<SuggestedBillingPeriod> {
  const conn = await db.getDb();
  if (!conn) throw new BillingDocumentError("База данных недоступна", 503);

  const result = rows(await conn.execute(sql`
    SELECT
      "number",
      "periodFrom",
      "periodTo"
    FROM "billingDocuments"
    WHERE "clientId" = ${clientId}
      AND "status" IN ('issued', 'paid')
    ORDER BY "periodTo" DESC, "id" DESC
    LIMIT 1`));

  const row = result[0];

  if (!row) {
    return {
      lastPeriodFrom: null,
      lastPeriodTo: null,
      lastDocumentNumber: null,
      nextDateFrom: null,
    };
  }

  const lastPeriodFrom = String(row.periodFrom).slice(0, 10);
  const lastPeriodTo = String(row.periodTo).slice(0, 10);

  return {
    lastPeriodFrom,
    lastPeriodTo,
    lastDocumentNumber: String(row.number),
    nextDateFrom: nextIsoDate(lastPeriodTo),
  };
}

export async function currentDocumentNumber(
  documentDateIso = new Date().toISOString().slice(0, 10),
  firstDocumentNumber?: number,
): Promise<string> {
  return (await annualNumberPreview(documentDateIso, firstDocumentNumber)).number;
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
  images: DocumentImages,
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
    images,
  });
}

/**
 * Resolve the images an issued document must print.
 *
 * The document snapshot wins; a document issued before the snapshot columns existed
 * has NULL there and falls back to the current settings (historical behaviour).
 */
function imagesForDocument(
  snapshot: DocumentSignatureSnapshot,
  settings: DocumentSettings,
): DocumentImages {
  return resolveDocumentImages(snapshot, settings);
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
  const dateIso = documentDateIso || new Date().toISOString().slice(0, 10);
  const annualNumber = await annualNumberPreview(dateIso);
  const number = annualNumber.number;

  const billable = billableRows(overview);
  // A preview always shows the CURRENT settings: nothing is frozen yet.
  const previewImages = resolveDocumentImages({}, settings);
  const data = client && billable.length > 0
    ? await buildData(clientId, from, to, dateIso, settings, billable, number, previewImages)
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

  // A request that an active document holds is reported as "billed" and therefore
  // never enters `billable`; it still has to be visible here, because a manager can
  // only re-issue the period after explicitly releasing those requests. Requests
  // that were already billed when the manager verified them are the candidates.
  const blockingCandidates = overview.rows
    .filter((row) => row.request.billingCheckedAt != null || row.state === "checked")
    .map((row) => Number(row.request.id));
  const blockingMembership = await activeBillingMembership(blockingCandidates);
  const blockedRequestIds = [...blockingMembership.keys()].sort((a, b) => a - b);
  const blockingDocuments = blockedRequestIds.length === 0
    ? []
    : rows(await (await db.getDb())!.execute(sql`
        SELECT d."id", d."number", d."status", d."documentDate"
          FROM "billingDocuments" d
         WHERE d."id" IN (${sql.join(
           [...new Set(blockingMembership.values())].map((id) => sql`${id}`),
           sql`, `,
         )})
         ORDER BY d."id"`)).map((row) => ({
      documentId: Number(row.id),
      number: String(row.number),
      status: String(row.status),
      documentDate: row.documentDate == null ? null : String(row.documentDate).slice(0, 10),
    }));

  if (blockedRequestIds.length > 0) {
    blockers.push(
      `Заявок удерживается другими документами: ${blockedRequestIds.length}. ` +
        "Освободите заявки у аннулированного документа, чтобы выставить их заново.",
    );
  }

  return {
    ready: blockers.length === 0 && billable.length > 0,
    blockers: [...new Set(blockers)],
    number,
    numberYear: annualNumber.year,
    numberInitializationRequired: annualNumber.initializationRequired,
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
    blockedRequestIds,
    blockingDocuments,
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
  firstDocumentNumber?: number,
): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const overview = await loadOverviewOrThrow(clientId, from, to);
  const billable = billableRows(overview);
  if (billable.length === 0) throw new BillingDocumentError("Нет проверенных заявок для документов", 400);

  const settings = await loadDocumentSettings();
  const dateIso = documentDateIso || new Date().toISOString().slice(0, 10);
  const number = kind === "registry"
    ? ""
    : await currentDocumentNumber(dateIso, firstDocumentNumber);

  if (kind !== "registry" && !number) {
    const year = documentYear(dateIso);
    throw new BillingDocumentError(
      `Для предпросмотра первого счёта ${year} года укажите начальный номер`,
      409,
    );
  }

  const data = await buildData(clientId, from, to, dateIso, settings, billable, number, resolveDocumentImages({}, settings));
  const safeClientName = data.buyer.name
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim() || "Клиент";
  const filePeriod = `${formatDateRu(from)}-${formatDateRu(to)}`;

  if (kind === "invoice") {
    return {
      buffer: await renderInvoicePdf(data, documentOverlays("invoice", resolveDocumentImages({}, settings))),
      fileName: `Счет_${number}_${safeClientName}_${filePeriod}.pdf`,
      contentType: "application/pdf",
    };
  }
  if (kind === "act") {
    return {
      buffer: await renderActPdf(data, documentOverlays("act", resolveDocumentImages({}, settings))),
      fileName: `Акт_${number}_${safeClientName}_${filePeriod}.pdf`,
      contentType: "application/pdf",
    };
  }
  const reconciliationPeriod = filePeriod;
  return {
    buffer: await renderRegistryXlsx(data, { reconciliation: true }),
    fileName: `Сверка_${safeClientName}_${reconciliationPeriod}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

/** Allocate the next document number atomically using the annual sequence row lock. */
/**
 * Reserve the id the next issued document will get.
 *
 * `nextval` is exactly what the `serial` primary key would use, so passing it back to
 * the insert changes nothing. It is reserved BEFORE any file is written, which is what
 * lets the files live at their final path and the row be created afterwards.
 */
async function reserveDocumentId(conn: { execute: (query: unknown) => Promise<unknown> }): Promise<number> {
  // `pg_get_serial_sequence` only knows about OWNED sequences (what `serial` creates).
  // The schema also has the plain `billingDocuments_id_seq`, which the tests use, so the
  // conventional name is the fallback.
  const result = rows(await conn.execute(sql`
    SELECT nextval(COALESCE(
      pg_get_serial_sequence('"billingDocuments"', 'id'),
      '"billingDocuments_id_seq"'
    )) AS id`));
  const id = Number(result[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new BillingDocumentError("Не удалось зарезервировать идентификатор документа", 500);
  }
  return id;
}

async function allocateNumber(
  tx: { execute: (query: unknown) => Promise<unknown> },
  documentDateIso: string,
  firstDocumentNumber?: number,
): Promise<string> {
  const year = documentYear(documentDateIso);

  const settingsRows = rows(await tx.execute(sql`
    SELECT "documentNumberPrefix"
      FROM "billingSettings"
     ORDER BY "id"
     LIMIT 1`));
  const settings = settingsRows[0];
  if (!settings) {
    throw new BillingDocumentError(
      "Не удалось выделить номер документа: не найдены настройки документов",
      500,
    );
  }
  const prefix = settings.documentNumberPrefix == null
    ? ""
    : String(settings.documentNumberPrefix);

  // Create a normal new-year sequence if this year has never been seen.
  // ON CONFLICT makes concurrent first issues converge on the same row.
  await tx.execute(sql`
    INSERT INTO "billingDocumentNumberSequences"
      ("year", "nextNumber", "initialized")
    VALUES (${year}, 1, true)
    ON CONFLICT ("year") DO NOTHING`);

  const sequenceRows = rows(await tx.execute(sql`
    SELECT "nextNumber", "initialized"
      FROM "billingDocumentNumberSequences"
     WHERE "year" = ${year}
     FOR UPDATE`));
  const sequence = sequenceRows[0];

  if (!sequence) {
    throw new BillingDocumentError(
      `Не удалось получить нумерацию документов за ${year} год`,
      500,
    );
  }

  let allocated: number;

  if (!Boolean(sequence.initialized)) {
    if (
      firstDocumentNumber == null ||
      !Number.isSafeInteger(firstDocumentNumber) ||
      firstDocumentNumber <= 0
    ) {
      throw new BillingDocumentError(
        `Для первого счёта ${year} года укажите начальный номер`,
        409,
      );
    }

    allocated = firstDocumentNumber;

    // Historical numbers are never reusable, even when the old document was
    // cancelled/rolled back. Check explicitly so the manager gets a clear error
    // instead of a database unique-index failure.
    const formattedNumber = `${prefix}${allocated}`;
    const duplicateRows = rows(await tx.execute(sql`
      SELECT "id", "status"
        FROM "billingDocuments"
       WHERE EXTRACT(YEAR FROM "documentDate") = ${year}
         AND "number" = ${formattedNumber}
       LIMIT 1`));

    if (duplicateRows.length > 0) {
      throw new BillingDocumentError(
        `Номер №${formattedNumber} уже использовался в ${year} году. Укажите следующий свободный номер.`,
        409,
      );
    }

    await tx.execute(sql`
      UPDATE "billingDocumentNumberSequences"
         SET "nextNumber" = ${allocated + 1},
             "initialized" = true,
             "updatedAt" = now()
       WHERE "year" = ${year}`);
  } else {
    allocated = Number(sequence.nextNumber);

    if (!Number.isSafeInteger(allocated) || allocated <= 0) {
      throw new BillingDocumentError(
        `Некорректный следующий номер документов за ${year} год`,
        500,
      );
    }

    await tx.execute(sql`
      UPDATE "billingDocumentNumberSequences"
         SET "nextNumber" = ${allocated + 1},
             "updatedAt" = now()
       WHERE "year" = ${year}`);
  }

  // Keep the old setting informationally synchronized for the existing
  // settings screen. It is no longer the source of truth.
  await tx.execute(sql`
    UPDATE "billingSettings"
       SET "nextDocumentNumber" = ${allocated + 1},
           "updatedAt" = now()
     WHERE "id" = (SELECT "id" FROM "billingSettings" ORDER BY "id" LIMIT 1)`);

  return `${prefix}${allocated}`;
}

export interface IssuedDocument {
  id: number;
  number: string;
  /** Set when this document replaced an annulled one. */
  replacesDocumentId: number | null;
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

export interface IssueDocumentSetOptions {
  /** Printed date of the whole set; defaults to today. */
  documentDateIso?: string;
  /**
   * Annulled document this set replaces. Its requests must already have been
   * released (releaseDocumentRequests); passing the id links the history and
   * records "replaced_by" on the old document.
   */
  replacesDocumentId?: number | null;
  /** Used once for an explicitly uninitialized transition year. */
  firstDocumentNumber?: number;
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
  documentDateIsoOrOptions?: string | IssueDocumentSetOptions,
): Promise<IssuedDocument> {
  const options: IssueDocumentSetOptions = typeof documentDateIsoOrOptions === "string"
    ? { documentDateIso: documentDateIsoOrOptions }
    : (documentDateIsoOrOptions ?? {});
  const documentDateIso = options.documentDateIso;
  const replacesDocumentId = options.replacesDocumentId ?? null;
  const firstDocumentNumber = options.firstDocumentNumber;
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

  if (preview.numberInitializationRequired && firstDocumentNumber == null) {
    throw new BillingDocumentError(
      `Для первого счёта ${preview.numberYear} года укажите начальный номер`,
      409,
    );
  }

  // ─── Atomic issue ─────────────────────────────────────────────────────────
  //
  // allocateNumber locks the sequence row for this calendar year. We keep that
  // lock until the document, files and request links are complete. Therefore
  // concurrent issues receive different numbers, and each rendered file contains
  // the exact number stored in its billingDocuments row.
  let frozen: { signatureFile: string | null; stampFile: string | null } = {
    signatureFile: null,
    stampFile: null,
  };
  let invoiceFile = "";
  let actFile = "";
  let registryFile = "";
  let issuedData: DocumentSetData | null = null;
  let issuedTotals: ReturnType<typeof documentSetTotals> | null = null;

  const created = await conn.transaction(async (tx: {
    execute: (query: unknown) => Promise<unknown>;
    insert: (table: unknown) => { values: (values: unknown) => { returning: () => Promise<unknown[]> } };
  }) => {
    const documentId = await reserveDocumentId(tx);
    const allocatedNumber = await allocateNumber(tx, dateIso, firstDocumentNumber);

    // Rendering happens only after the definitive annual number is allocated.
    // Two concurrent previews may both show No. 1; committed documents will still
    // correctly be rendered and stored as No. 1, No. 2, No. 3, and so on.
    const issuedImages = resolveDocumentImages({}, settings);
    const data = await buildData(
      clientId,
      from,
      to,
      dateIso,
      settings,
      billable,
      allocatedNumber,
      issuedImages,
    );

    const [invoice, act, registry] = await Promise.all([
      renderInvoicePdf(data, documentOverlays("invoice", issuedImages)),
      renderActPdf(data, documentOverlays("act", issuedImages)),
      renderRegistryXlsx(data),
    ]);

    const totals = documentSetTotals(data);
    if (
      totals.invoiceTotal !== totals.actTotal ||
      totals.invoiceTotal !== totals.registryTotal ||
      totals.invoiceTotal !== totals.linesTotal
    ) {
      throw new BillingDocumentError(
        "Итоговые суммы счёта, акта и реестра не совпадают — документы не созданы",
        500,
      );
    }

    issuedData = data;
    issuedTotals = totals;

    const dir = path.join(BILLING_DOCUMENTS_DIR, String(documentId));
    const invoiceName = `invoice-${allocatedNumber}.pdf`;
    const actName = `act-${allocatedNumber}.pdf`;
    const registryName = `registry-${allocatedNumber}.xlsx`;

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, invoiceName), invoice);
      await fs.writeFile(path.join(dir, actName), act);
      await fs.writeFile(path.join(dir, registryName), registry);

      // Freeze the exact image assets used by the rendered document.
      frozen = snapshotDocumentAssets(documentId, issuedImages);
      invoiceFile = path.relative(process.cwd(), path.join(dir, invoiceName));
      actFile = path.relative(process.cwd(), path.join(dir, actName));
      registryFile = path.relative(process.cwd(), path.join(dir, registryName));

      const insertedRows = await tx
        .insert(billingDocuments)
        .values({
          id: documentId,
          number: allocatedNumber,
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
          clientOgrnSnapshot: data.buyer.ogrn,
          clientAddressSnapshot: data.buyer.address,
          clientPostalAddressSnapshot: clientPostalAddress(client),
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
          replacesDocumentId,
          generatedAt: new Date(),
          updatedAt: new Date(),
          invoiceFile,
          actFile,
          registryFile,
          signatureFileSnapshot: frozen.signatureFile,
          stampFileSnapshot: frozen.stampFile,
          stampEnabledSnapshot: Boolean(issuedImages.stampBytes),
        })
        .returning();

      const document = insertedRows[0] as Record<string, unknown>;
      if (Number(document.id) !== documentId) {
        throw new BillingDocumentError(
          "Идентификатор документа изменился во время выпуска — документы не созданы",
          500,
        );
      }

      for (const row of billable) {
        await tx.insert(billingDocumentRequests).values({
          billingDocumentId: documentId,
          requestId: Number(row.request.id),
          amount: Number(row.amount ?? 0).toFixed(2),
          active: true,
        });
      }

      return document;
    } catch (failure) {
      // Database changes, including the allocated annual number, roll back together.
      // Remove any files already written so no orphaned set remains on disk.
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      throw failure;
    }
  });

  if (!issuedData || !issuedTotals) {
    throw new BillingDocumentError(
      "Комплект документов не был сформирован",
      500,
    );
  }

  const data: DocumentSetData = issuedData;
  const totals: ReturnType<typeof documentSetTotals> = issuedTotals;

  const documentId = Number((created as Record<string, unknown>).id);
  const expectedNumber = String((created as Record<string, unknown>).number);

  // Audit trail. The replacement is recorded on BOTH documents, so the history of
  // the annulled set always answers "which document took these requests over".
  await recordDocumentEvent({
    documentId,
    kind: replacesDocumentId ? "reissued" : "issued",
    managerId,
    note: replacesDocumentId
      ? `Перевыставление вместо аннулированного документа №${replacesDocumentId}`
      : null,
    details: {
      number: expectedNumber,
      periodFrom: from,
      periodTo: to,
      requestIds: billable.map((row) => Number(row.request.id)),
      totalAmount: data.totalAmount,
      ...(replacesDocumentId ? { replacesDocumentId } : {}),
    },
  });

  if (replacesDocumentId) {
    await recordDocumentEvent({
      documentId: replacesDocumentId,
      kind: "replaced_by",
      managerId,
      note: `Заменён документом №${expectedNumber}`,
      details: { replacedByDocumentId: documentId, replacedByNumber: expectedNumber },
    });
  }

  return {
    id: documentId,
    number: expectedNumber,
    replacesDocumentId,
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
  /** Annulled document this set replaced, if any. */
  replacesDocumentId: number | null;
  /** True when the requests of this (annulled) document are free again. */
  requestsReleased: boolean;
  /** How many links still hold their requests. */
  activeRequestsCount: number;
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

  const membership = ids.length === 0 ? [] : rows(await conn.execute(sql`
    SELECT "billingDocumentId",
           count(*) FILTER (WHERE "active")::int AS "activeCount",
           count(*)::int AS "totalCount"
      FROM "billingDocumentRequests"
     WHERE "billingDocumentId" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
     GROUP BY "billingDocumentId"`));
  const membershipByDocument = new Map<number, { active: number; total: number }>();
  for (const row of membership) {
    membershipByDocument.set(Number(row.billingDocumentId), {
      active: Number(row.activeCount),
      total: Number(row.totalCount),
    });
  }

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
    replacesDocumentId: row.replacesDocumentId == null ? null : Number(row.replacesDocumentId),
    requestsReleased: (membershipByDocument.get(Number(row.id))?.active ?? 0) === 0,
    activeRequestsCount: membershipByDocument.get(Number(row.id))?.active ?? 0,
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

  await recordDocumentEvent({
    documentId,
    kind: "voided",
    managerId,
    note: reason,
    details: { number: document.number, totalAmount: document.totalAmount, requestsCount: document.requestsCount },
  });
}


export interface RolledBackDocument {
  documentId: number;
  releasedRequestIds: number[];
}

/**
 * Roll back an issued/paid billing set in one transaction.
 *
 * The document itself and its historical request membership are retained for
 * audit. Active request links are released so the requests can be reviewed and
 * billed again. A paid document is returned to a non-active cancelled state and
 * its payment mark is cleared.
 *
 * "cancelled" is an internal persistence status here; the manager UI calls this
 * operation "Откатить счёт".
 */
export async function rollbackDocument(
  documentId: number,
  managerId: number,
  reason: string,
): Promise<RolledBackDocument> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const cleanReason = String(reason ?? "").trim();
  if (!cleanReason) {
    throw new BillingDocumentError("Укажите причину отката", 400);
  }

  const result = await conn.transaction(async (tx: any) => {
    /*
     * Lock the document and its active memberships. This prevents two managers
     * from rolling back the same set concurrently and keeps document state,
     * released memberships and the audit event atomic.
     */
    const lockedDocumentRows = rows(await tx.execute(sql`
      SELECT "id", "status", "number", "requestsCount", "totalAmount"
        FROM "billingDocuments"
       WHERE "id" = ${documentId}
       FOR UPDATE
    `));

    const lockedDocument = lockedDocumentRows[0];
    if (!lockedDocument) {
      throw new BillingDocumentError("Документ не найден", 404);
    }
    if (String(lockedDocument.status) === "cancelled") {
      throw new BillingDocumentError("Документ уже откатан", 400);
    }

    const activeRows = rows(await tx.execute(sql`
      SELECT "requestId"
        FROM "billingDocumentRequests"
       WHERE "billingDocumentId" = ${documentId}
         AND "active"
       ORDER BY "requestId"
       FOR UPDATE
    `));
    const requestIds = activeRows.map((row) => Number(row.requestId));

    await tx
      .update(billingDocuments)
      .set({
        status: "cancelled",
        paidAt: null,
        paidByManagerId: null,
        paymentComment: null,
        voidedAt: new Date(),
        voidedByManagerId: managerId,
        voidReason: cleanReason,
        updatedAt: new Date(),
      })
      .where(eq(billingDocuments.id, documentId));

    if (requestIds.length > 0) {
      await tx
        .update(billingDocumentRequests)
        .set({
          active: false,
          releasedAt: new Date(),
          releasedByManagerId: managerId,
          releaseNote: cleanReason,
        })
        .where(sql`${billingDocumentRequests.billingDocumentId} = ${documentId} AND ${billingDocumentRequests.active} = true`);
    }

    const managerRows = rows(await tx.execute(sql`
      SELECT "name"
        FROM "managers"
       WHERE "id" = ${managerId}
       LIMIT 1
    `));
    const managerName = managerRows[0]?.name == null
      ? null
      : String(managerRows[0].name);

    await tx.insert(billingDocumentEvents).values({
      billingDocumentId: documentId,
      kind: "rolled_back",
      managerId,
      managerName,
      note: cleanReason,
      details: JSON.stringify({
        number: String(lockedDocument.number),
        previousStatus: String(lockedDocument.status),
        totalAmount: Number(lockedDocument.totalAmount),
        requestsCount: Number(lockedDocument.requestsCount),
        releasedCount: requestIds.length,
        releasedRequestIds: requestIds,
      }),
    });

    return requestIds;
  });

  return {
    documentId,
    releasedRequestIds: result,
  };
}

export interface ReleasedDocumentRequests {
  documentId: number;
  /** Request ids that became billable again. */
  releasedRequestIds: number[];
}

/**
 * Explicitly release the requests of an ANNULLED document so they can be put on a
 * new one.
 *
 * Safety rules:
 *   * only an annulled document can be released — an issued or paid one must not
 *     lose its requests;
 *   * the membership rows are kept and stamped (releasedAt / releasedByManagerId /
 *     releaseNote) and switched to active = false, so the composition of the old
 *     document stays readable for ever;
 *   * the partial unique index on active links still guarantees that a request can
 *     never sit on two active documents at the same time.
 */
export async function releaseDocumentRequests(
  documentId: number,
  managerId: number,
  note: string | null,
): Promise<ReleasedDocumentRequests> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const document = await getDocument(documentId);
  if (!document) throw new BillingDocumentError("Документ не найден", 404);
  if (document.status === "paid") {
    throw new BillingDocumentError("Нельзя освободить заявки оплаченного документа", 400);
  }
  if (document.status !== "cancelled") {
    throw new BillingDocumentError("Освободить заявки можно только у аннулированного документа", 400);
  }

  const active = rows(await conn.execute(sql`
    SELECT "requestId" FROM "billingDocumentRequests"
     WHERE "billingDocumentId" = ${documentId} AND "active"
     ORDER BY "requestId"`));
  const requestIds = active.map((row) => Number(row.requestId));
  if (requestIds.length === 0) {
    return { documentId, releasedRequestIds: [] };
  }

  await conn.transaction(async (tx: { execute: (query: unknown) => Promise<unknown> }) => {
    await tx.execute(sql`
      UPDATE "billingDocumentRequests"
         SET "active" = false,
             "releasedAt" = now(),
             "releasedByManagerId" = ${managerId},
             "releaseNote" = ${note}
       WHERE "billingDocumentId" = ${documentId} AND "active"`);
  });

  await recordDocumentEvent({
    documentId,
    kind: "requests_released",
    managerId,
    note,
    details: {
      requestIds,
      releasedCount: requestIds.length,
      documentNumber: document.number,
    },
  });

  return { documentId, releasedRequestIds: requestIds };
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

  await recordDocumentEvent({
    documentId,
    kind: paid ? "payment_set" : "payment_cleared",
    managerId,
    note: comment,
    details: { number: document.number, totalAmount: document.totalAmount },
  });
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
