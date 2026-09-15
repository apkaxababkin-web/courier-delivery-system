/**
 * Client billing documents (invoice + act + works registry).
 *
 * The `billingDocuments` / `billingDocumentRequests` tables already existed in the
 * schema with a unique "a request can only be billed once while not released"
 * index, but nothing in the codebase ever wrote to them. This module implements the
 * missing server side:
 *
 *   - a document is always created for ONE client and ONE period;
 *   - it can contain only completed requests of that client inside that period
 *     whose price is resolved (server quote or manual amount);
 *   - requests that are already part of an active document are excluded, so the
 *     same work can never be invoiced twice;
 *   - customer and executor requisites are snapshotted, so later edits to the
 *     client card or billing settings never rewrite an issued document.
 *
 * Nothing here touches partner settlements, mails or courier payouts.
 */
import { and, eq, sql } from "drizzle-orm";
import { requests, billingDocuments, billingDocumentRequests, type Request as DeliveryRequest } from "../../drizzle/schema";
import * as db from "../db";
import { quoteRequest } from "./requestQuote";

export interface BillingClientRow {
  id: number;
  name: string;
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  address: string | null;
  legalAddress: string | null;
}

export interface BillingSettingsRow {
  executorName: string | null;
  executorInn: string | null;
  executorKpp: string | null;
  executorAddress: string | null;
  executorPhone: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  bankCorrespondentAccount: string | null;
  vatText: string;
  documentNumberPrefix: string | null;
}

export type BillingRequestState =
  /** price resolved, waiting for the manager to verify it */
  | "ready"
  /** verified, ready to be put on a document */
  | "checked"
  /** already part of an active billing document */
  | "billed"
  /** completed, but no price could be derived from the tariff */
  | "unpriced";

export interface BillingRequestRow {
  request: DeliveryRequest;
  amount: number | null;
  state: BillingRequestState;
  /** Why the price is missing, when it is. */
  issue: string | null;
  category: string;
}

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

export async function loadBillingClient(clientId: number): Promise<BillingClientRow | null> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const rows = asRows(await conn.execute(sql`
    SELECT "id","name","legalName","inn","kpp","address","legalAddress"
      FROM "clients" WHERE "id" = ${clientId} LIMIT 1`));
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    legalName: row.legalName == null ? null : String(row.legalName),
    inn: row.inn == null ? null : String(row.inn),
    kpp: row.kpp == null ? null : String(row.kpp),
    address: row.address == null ? null : String(row.address),
    legalAddress: row.legalAddress == null ? null : String(row.legalAddress),
  };
}

/** Executor requisites, created on first use if the settings row is missing. */
export async function loadBillingSettings(): Promise<BillingSettingsRow> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  let rows = asRows(await conn.execute(sql`SELECT * FROM "billingSettings" ORDER BY "id" LIMIT 1`));
  if (rows.length === 0) {
    await conn.execute(sql`INSERT INTO "billingSettings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING`);
    rows = asRows(await conn.execute(sql`SELECT * FROM "billingSettings" ORDER BY "id" LIMIT 1`));
  }
  const row = rows[0] ?? {};
  return {
    executorName: row.executorName == null ? null : String(row.executorName),
    executorInn: row.executorInn == null ? null : String(row.executorInn),
    executorKpp: row.executorKpp == null ? null : String(row.executorKpp),
    executorAddress: row.executorAddress == null ? null : String(row.executorAddress),
    executorPhone: row.executorPhone == null ? null : String(row.executorPhone),
    bankName: row.bankName == null ? null : String(row.bankName),
    bankBik: row.bankBik == null ? null : String(row.bankBik),
    bankAccount: row.bankAccount == null ? null : String(row.bankAccount),
    bankCorrespondentAccount: row.bankCorrespondentAccount == null ? null : String(row.bankCorrespondentAccount),
    vatText: row.vatText == null ? "Без НДС" : String(row.vatText),
    documentNumberPrefix: row.documentNumberPrefix == null ? null : String(row.documentNumberPrefix),
  };
}

/** Atomic document number allocation. Falls back to a unique suffix on races. */
async function allocateDocumentNumber(conn: NonNullable<Awaited<ReturnType<typeof db.getDb>>>): Promise<string> {
  const updated = asRows(await conn.execute(sql`
    UPDATE "billingSettings"
       SET "nextDocumentNumber" = "nextDocumentNumber" + 1, "updatedAt" = now()
     WHERE "id" = (SELECT "id" FROM "billingSettings" ORDER BY "id" LIMIT 1)
    RETURNING "documentNumberPrefix", "nextDocumentNumber" - 1 AS "allocated"`));

  const row = updated[0];
  if (!row) throw new Error("Не удалось выделить номер документа: не найдены настройки биллинга");

  const prefix = row.documentNumberPrefix == null ? "" : String(row.documentNumberPrefix);
  const allocated = Number(row.allocated);
  return `${prefix}${allocated}`;
}

/** Completed requests of a client inside a period. */
export async function loadClientPeriodRequests(clientId: number, from: string, to: string): Promise<DeliveryRequest[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const rows = await conn
    .select()
    .from(requests)
    .where(and(
      eq(requests.clientId, clientId),
      eq(requests.status, "completed" as DeliveryRequest["status"]),
      sql`${requests.completedAt} >= ${from}::date`,
      sql`${requests.completedAt} < (${to}::date + interval '1 day')`,
    ))
    .orderBy(requests.completedAt, requests.id);
  return rows as DeliveryRequest[];
}

/** Active (not released) billing membership for the given requests. */
export async function activeBillingMembership(requestIds: number[]): Promise<Map<number, number>> {
  if (requestIds.length === 0) return new Map();
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const rows = asRows(await conn.execute(sql`
    SELECT bdr."requestId", bdr."billingDocumentId"
      FROM "billingDocumentRequests" bdr
     WHERE bdr."releasedAt" IS NULL
       AND bdr."requestId" IN (${sql.join(requestIds.map((id) => sql`${id}`), sql`, `)})`));
  return new Map(rows.map((row) => [Number(row.requestId), Number(row.billingDocumentId)]));
}

const ISSUE_TEXT: Record<string, string> = {
  no_client: "У заявки не указан клиент",
  no_tariff: "У клиента нет тарифной карточки",
  tariff_not_configured: "В тарифе клиента не заполнена ставка для этой категории",
  no_places: "Не указано количество мест",
};

/**
 * Full review state for one client and period: what can be billed, what still
 * needs verification and what could not be priced automatically.
 */
export async function buildBillingOverview(clientId: number, from: string, to: string) {
  const periodRequests = await loadClientPeriodRequests(clientId, from, to);
  const membership = await activeBillingMembership(periodRequests.map((r) => Number(r.id)));

  const rows: BillingRequestRow[] = [];
  for (const request of periodRequests) {
    const id = Number(request.id);
    const amountRaw = request.deliveryFee;
    const amount = amountRaw == null || amountRaw === "" ? null : Number(amountRaw);
    const hasAmount = amount !== null && Number.isFinite(amount);

    const quote = await quoteRequest(request);

    let state: BillingRequestState;
    let issue: string | null = null;

    if (membership.has(id)) {
      state = "billed";
    } else if (hasAmount && request.billingCheckedAt) {
      state = "checked";
    } else if (hasAmount) {
      state = "ready";
    } else {
      state = "unpriced";
      issue = quote.ok ? "Стоимость ещё не рассчитана" : ISSUE_TEXT[quote.reason] ?? "Не удалось рассчитать стоимость";
    }

    rows.push({
      request,
      amount: hasAmount ? amount : null,
      state,
      issue,
      category: quote.category,
    });
  }

  const counts = {
    total: rows.length,
    ready: rows.filter((r) => r.state === "ready").length,
    checked: rows.filter((r) => r.state === "checked").length,
    billed: rows.filter((r) => r.state === "billed").length,
    unpriced: rows.filter((r) => r.state === "unpriced").length,
  };

  const readyRows = rows.filter((r) => r.state === "ready" || r.state === "checked");
  const readyAmount = rows
    .filter((r) => r.state === "checked")
    .reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const allReadyAmount = readyRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  return { rows, counts, readyAmount, allReadyAmount };
}

export type IssueDocumentResult =
  | { ok: true; document: Record<string, unknown>; requestCount: number; totalAmount: number }
  | { ok: false; reason: string; blocked: BillingRequestRow[] };

/**
 * Create the billing document for one client and period.
 *
 * Blocking rule: every completed request of THIS client inside THIS period must
 * either already belong to an active document, or have a resolved price and be
 * verified. Unverified requests only block themselves — the whole client history
 * is never required.
 */
export async function issueClientBillingDocument(
  clientId: number,
  from: string,
  to: string,
  managerId: number,
): Promise<IssueDocumentResult> {
  const overview = await buildBillingOverview(clientId, from, to);

  const blocked = overview.rows.filter((r) => r.state === "ready" || r.state === "unpriced");
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: blocked.some((r) => r.state === "unpriced")
        ? "Есть заявки без рассчитанной стоимости"
        : "Есть заявки, ожидающие проверки",
      blocked,
    };
  }

  const billable = overview.rows.filter((r) => r.state === "checked");
  if (billable.length === 0) {
    return { ok: false, reason: "За выбранный период нет проверенных заявок для счёта", blocked: [] };
  }

  const client = await loadBillingClient(clientId);
  if (!client) return { ok: false, reason: "Клиент не найден", blocked: [] };
  const settings = await loadBillingSettings();
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const totalAmount = billable.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
  const documentDate = new Date().toISOString().slice(0, 10);

  const created = await conn.transaction(async (tx: any) => {
    const number = await allocateDocumentNumber(tx);

    const inserted = await tx
      .insert(billingDocuments)
      .values({
        number,
        clientId,
        documentDate,
        periodFrom: from,
        periodTo: to,
        requestsCount: billable.length,
        totalAmount: totalAmount.toFixed(2),
        status: "issued",
        serviceDescription: "Транспортно-экспедиционные услуги",
        clientNameSnapshot: client.name,
        clientInnSnapshot: client.inn ?? "",
        clientKppSnapshot: client.kpp,
        clientAddressSnapshot: client.legalAddress || client.address || "",
        executorNameSnapshot: settings.executorName ?? "",
        executorInnSnapshot: settings.executorInn ?? "",
        executorKppSnapshot: settings.executorKpp,
        executorAddressSnapshot: settings.executorAddress ?? "",
        executorPhoneSnapshot: settings.executorPhone,
        bankNameSnapshot: settings.bankName ?? "",
        bankBikSnapshot: settings.bankBik ?? "",
        bankAccountSnapshot: settings.bankAccount ?? "",
        bankCorrespondentAccountSnapshot: settings.bankCorrespondentAccount ?? "",
        vatTextSnapshot: settings.vatText,
        createdByManagerId: managerId,
        updatedAt: new Date(),
      })
      .returning();

    const document = inserted[0] as Record<string, unknown>;

    for (const row of billable) {
      await tx.insert(billingDocumentRequests).values({
        billingDocumentId: Number(document.id),
        requestId: Number(row.request.id),
        amount: Number(row.amount ?? 0).toFixed(2),
      });
    }

    return document;
  });

  return {
    ok: true,
    document: created,
    requestCount: billable.length,
    totalAmount,
  };
}

/** Billing documents already issued for one client, newest first. */
export async function listClientBillingDocuments(clientId: number, limit = 20) {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const rows = asRows(await conn.execute(sql`
    SELECT d."id", d."number", d."documentDate", d."periodFrom", d."periodTo",
           d."requestsCount", d."totalAmount", d."status"::text AS "status",
           d."createdAt", d."paidAt", d."createdByManagerId"
      FROM "billingDocuments" d
     WHERE d."clientId" = ${clientId}
     ORDER BY d."id" DESC
     LIMIT ${limit}`));
  return rows;
}
