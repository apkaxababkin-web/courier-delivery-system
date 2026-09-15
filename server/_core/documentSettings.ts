/**
 * Document settings — our own organisation requisites used by invoices and acts.
 *
 * Reuses the existing billingSettings singleton (executor/bank/vat fields) and the
 * columns added by migration 0015. Nothing here is hard-coded: an empty field is a
 * configuration gap that blocks issuing documents, it is never silently filled.
 *
 * Signature and stamp images are optional and stored as files on disk, with only
 * the path kept in the database (same approach as request attachments).
 */
import { sql } from "drizzle-orm";
import * as db from "../db";

export interface DocumentSettings {
  executorName: string | null;
  executorShortName: string | null;
  executorInn: string | null;
  executorKpp: string | null;
  executorOgrn: string | null;
  executorOgrnip: string | null;
  executorAddress: string | null;
  executorPostalAddress: string | null;
  executorPhone: string | null;
  executorEmail: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  bankCorrespondentAccount: string | null;
  vatMode: string;
  vatRate: number;
  vatText: string;
  vatExemptionBasis: string | null;
  directorName: string | null;
  directorPosition: string | null;
  accountantName: string | null;
  signatureFile: string | null;
  stampFile: string | null;
  /** Print the organisation stamp on invoices and acts. */
  addStampToDocuments: boolean;
  documentNumberPrefix: string | null;
  nextDocumentNumber: number;
}

export const EMPTY_DOCUMENT_SETTINGS: DocumentSettings = {
  executorName: null,
  executorShortName: null,
  executorInn: null,
  executorKpp: null,
  executorOgrn: null,
  executorOgrnip: null,
  executorAddress: null,
  executorPostalAddress: null,
  executorPhone: null,
  executorEmail: null,
  bankName: null,
  bankBik: null,
  bankAccount: null,
  bankCorrespondentAccount: null,
  vatMode: "without_vat",
  vatRate: 0,
  vatText: "Без НДС",
  vatExemptionBasis: null,
  directorName: null,
  directorPosition: "Директор",
  accountantName: null,
  signatureFile: null,
  stampFile: null,
  addStampToDocuments: false,
  documentNumberPrefix: null,
  nextDocumentNumber: 1,
};

function rows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const list = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function mapRow(row: Record<string, unknown>): DocumentSettings {
  return {
    executorName: str(row.executorName),
    executorShortName: str(row.executorShortName),
    executorInn: str(row.executorInn),
    executorKpp: str(row.executorKpp),
    executorOgrn: str(row.executorOgrn),
    executorOgrnip: str(row.executorOgrnip),
    executorAddress: str(row.executorAddress),
    executorPostalAddress: str(row.executorPostalAddress),
    executorPhone: str(row.executorPhone),
    executorEmail: str(row.executorEmail),
    bankName: str(row.bankName),
    bankBik: str(row.bankBik),
    bankAccount: str(row.bankAccount),
    bankCorrespondentAccount: str(row.bankCorrespondentAccount),
    vatMode: str(row.vatMode) ?? "without_vat",
    vatRate: Number(row.vatRate ?? 0),
    vatText: str(row.vatText) ?? "Без НДС",
    vatExemptionBasis: str(row.vatExemptionBasis),
    directorName: str(row.directorName),
    directorPosition: str(row.directorPosition) ?? "Директор",
    accountantName: str(row.accountantName),
    signatureFile: str(row.signatureFile),
    stampFile: str(row.stampFile),
    addStampToDocuments: row.addStampToDocuments === true || row.addStampToDocuments === "true",
    documentNumberPrefix: str(row.documentNumberPrefix),
    nextDocumentNumber: Number(row.nextDocumentNumber ?? 1),
  };
}

/** Settings row, created on first access so the UI always has something to edit. */
export async function loadDocumentSettings(): Promise<DocumentSettings> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  let list = rows(await conn.execute(sql`SELECT * FROM "billingSettings" ORDER BY "id" LIMIT 1`));
  if (list.length === 0) {
    await conn.execute(sql`INSERT INTO "billingSettings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`);
    list = rows(await conn.execute(sql`SELECT * FROM "billingSettings" ORDER BY "id" LIMIT 1`));
  }
  return mapRow(list[0] ?? {});
}

const TEXT_FIELDS: [keyof DocumentSettings, number][] = [
  ["executorName", 500],
  ["executorShortName", 500],
  ["executorInn", 20],
  ["executorKpp", 20],
  ["executorOgrn", 20],
  ["executorOgrnip", 20],
  ["executorAddress", 5000],
  ["executorPostalAddress", 5000],
  ["executorPhone", 50],
  ["executorEmail", 320],
  ["bankName", 500],
  ["bankBik", 20],
  ["bankAccount", 50],
  ["bankCorrespondentAccount", 50],
  ["vatText", 100],
  ["vatExemptionBasis", 5000],
  ["directorName", 255],
  ["directorPosition", 255],
  ["accountantName", 255],
  ["documentNumberPrefix", 50],
];

export class DocumentSettingsError extends Error {}

function cleanText(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") throw new DocumentSettingsError(`Некорректное поле «${label}»`);
  const text = String(value).trim();
  if (text.length > max) throw new DocumentSettingsError(`Поле «${label}» длиннее ${max} символов`);
  if (text.includes("\0")) throw new DocumentSettingsError(`Поле «${label}» содержит недопустимый символ`);
  return text === "" ? null : text;
}

/**
 * Update settings from a manager form. Only the fields present in the payload are
 * touched, so a partial form cannot wipe the rest of the configuration.
 */
export async function saveDocumentSettings(
  input: Record<string, unknown>,
  options: { signatureFile?: string | null; stampFile?: string | null } = {},
): Promise<DocumentSettings> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  await loadDocumentSettings();

  const updates: Record<string, unknown> = {};
  for (const [field, max] of TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      updates[field] = cleanText(input[field], max, field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "vatMode")) {
    const mode = String(input.vatMode ?? "");
    if (mode !== "vat" && mode !== "without_vat") throw new DocumentSettingsError("Некорректный режим НДС");
    updates.vatMode = mode;
  }

  if (Object.prototype.hasOwnProperty.call(input, "vatRate")) {
    const rate = Number(String(input.vatRate ?? "0").replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new DocumentSettingsError("Некорректная ставка НДС");
    updates.vatRate = rate;
  }

  if (Object.prototype.hasOwnProperty.call(input, "addStampToDocuments")) {
    const value = input.addStampToDocuments;
    if (typeof value !== "boolean") throw new DocumentSettingsError("Некорректное значение флага печати");
    updates.addStampToDocuments = value;
  }

  if (Object.prototype.hasOwnProperty.call(input, "nextDocumentNumber")) {
    const next = Number(input.nextDocumentNumber);
    if (!Number.isSafeInteger(next) || next < 1) throw new DocumentSettingsError("Некорректный следующий номер документа");
    updates.nextDocumentNumber = next;
  }

  if (options.signatureFile !== undefined) updates.signatureFile = options.signatureFile;
  if (options.stampFile !== undefined) updates.stampFile = options.stampFile;

  if (Object.keys(updates).length > 0) {
    const columns = Object.keys(updates).map((key) => sql`${sql.identifier(key)} = ${updates[key]}`);
    columns.push(sql`"updatedAt" = now()`);
    await conn.execute(sql`
      UPDATE "billingSettings"
         SET ${sql.join(columns, sql`, `)}
       WHERE "id" = (SELECT "id" FROM "billingSettings" ORDER BY "id" LIMIT 1)`);
  }

  return await loadDocumentSettings();
}

export interface RequisiteGap {
  field: string;
  label: string;
}

/**
 * Fields the printed documents genuinely cannot do without. Kept deliberately
 * short: a missing optional requisite must not block an otherwise ready period.
 */
export function missingExecutorRequisites(settings: DocumentSettings): RequisiteGap[] {
  const gaps: RequisiteGap[] = [];
  if (!settings.executorName) gaps.push({ field: "executorName", label: "Полное наименование исполнителя" });
  if (!settings.executorInn) gaps.push({ field: "executorInn", label: "ИНН исполнителя" });
  if (!settings.bankName) gaps.push({ field: "bankName", label: "Название банка" });
  if (!settings.bankBik) gaps.push({ field: "bankBik", label: "БИК" });
  if (!settings.bankAccount) gaps.push({ field: "bankAccount", label: "Расчётный счёт" });
  if (!settings.bankCorrespondentAccount) gaps.push({ field: "bankCorrespondentAccount", label: "Корреспондентский счёт" });
  if (!settings.executorAddress) gaps.push({ field: "executorAddress", label: "Юридический адрес исполнителя" });
  if (!settings.directorName) gaps.push({ field: "directorName", label: "ФИО руководителя" });
  if (settings.vatMode === "vat" && !(settings.vatRate > 0)) {
    gaps.push({ field: "vatRate", label: "Ставка НДС" });
  }
  return gaps;
}
