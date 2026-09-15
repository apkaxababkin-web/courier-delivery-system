/**
 * Server-side price quotation for client requests.
 *
 * This module is the single source of truth for "how much does this completed
 * request cost the client". Previously the amount was computed only in the
 * manager browser (ClientsViewV2), which is why the price appeared only after a
 * manager opened the client card and the reconciliation tab.
 *
 * Rules (mirroring the historical client-side behaviour, so existing amounts keep
 * their meaning):
 *   - the tariff comes from clientTariffs, latest row for the request's client;
 *   - the category is derived from the request type;
 *   - amount = firstPlace + max(0, places - 1) * nextPlace;
 *   - a category whose rate is not configured (<= 0) is NOT a price: the quote is
 *     left unresolved instead of inventing 0.
 *
 * A resolved quote is written to requests.deliveryFee together with
 * requests.quoteCalculatedAt; requests.quoteSource records where the amount came
 * from ('tariff' | 'manual_fee'). Requests that a manager already verified
 * (billingCheckedAt) or that are already part of a billing document are never
 * recalculated.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { requests, type Request as DeliveryRequest } from "../../drizzle/schema";
import * as db from "../db";

export const QUOTE_SOURCES = ["tariff", "manual_fee"] as const;
export type QuoteSource = (typeof QUOTE_SOURCES)[number];

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

/** Tariff category used for a request. */
export type TariffCategory = "delivery" | "transportCompany" | "movement" | "other";

/** Numeric tariff rates for one client. */
export interface ClientTariffRates {
  deliveryFirstPlace: number;
  deliveryNextPlace: number;
  transportCompanyFirstPlace: number;
  transportCompanyNextPlace: number;
  movementFirstPlace: number;
  movementNextPlace: number;
  otherFirstPlace: number;
  otherNextPlace: number;
}

export const EMPTY_TARIFF_RATES: ClientTariffRates = {
  deliveryFirstPlace: 0,
  deliveryNextPlace: 0,
  transportCompanyFirstPlace: 0,
  transportCompanyNextPlace: 0,
  movementFirstPlace: 0,
  movementNextPlace: 0,
  otherFirstPlace: 0,
  otherNextPlace: 0,
};

/** Only the fields the quote depends on, so this works with partial rows. */
export interface QuoteInput {
  requestType?: string | null;
  placesCount?: number | null;
  tcName?: string | null;
  tcAddress?: string | null;
  trackingNumber?: string | null;
  clientId?: number | null;
}

export type QuoteResult =
  | {
      ok: true;
      amount: number;
      category: TariffCategory;
      firstPlace: number;
      nextPlace: number;
      places: number;
    }
  | {
      ok: false;
      /** Why no price could be derived. */
      reason: "no_client" | "no_tariff" | "tariff_not_configured" | "no_places";
      category: TariffCategory;
      places: number;
    };

export function toTariffRates(row: Record<string, unknown> | null | undefined): ClientTariffRates {
  const num = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  if (!row) return { ...EMPTY_TARIFF_RATES };
  return {
    deliveryFirstPlace: num(row.deliveryFirstPlace),
    deliveryNextPlace: num(row.deliveryNextPlace),
    transportCompanyFirstPlace: num(row.transportCompanyFirstPlace),
    transportCompanyNextPlace: num(row.transportCompanyNextPlace),
    movementFirstPlace: num(row.movementFirstPlace),
    movementNextPlace: num(row.movementNextPlace),
    otherFirstPlace: num(row.otherFirstPlace),
    otherNextPlace: num(row.otherNextPlace),
  };
}

/** Category mapping identical to the historical ClientView logic. */
export function tariffCategoryFor(request: QuoteInput): TariffCategory {
  if (request.requestType === "movement") return "movement";

  if (
    request.requestType === "pickup_from_tc" ||
    Boolean(request.tcName) ||
    Boolean(request.tcAddress) ||
    Boolean(request.trackingNumber)
  ) {
    return "transportCompany";
  }

  if (request.requestType === "delivery") return "delivery";

  return "other";
}

/**
 * Pure quote calculation. `hasTariffRow` distinguishes "this client has no tariff
 * card at all" from "this category is not priced in the card".
 */
export function computeQuote(
  request: QuoteInput,
  rates: ClientTariffRates,
  hasTariffRow: boolean,
): QuoteResult {
  const category = tariffCategoryFor(request);
  const places = Math.max(1, Number(request.placesCount || 1));

  if (request.clientId === null || request.clientId === undefined) {
    return { ok: false, reason: "no_client", category, places };
  }

  if (!hasTariffRow) return { ok: false, reason: "no_tariff", category, places };

  const firstPlace = category === "movement"
    ? rates.movementFirstPlace
    : category === "transportCompany"
      ? rates.transportCompanyFirstPlace
      : category === "delivery"
        ? rates.deliveryFirstPlace
        : rates.otherFirstPlace;

  const nextPlace = category === "movement"
    ? rates.movementNextPlace
    : category === "transportCompany"
      ? rates.transportCompanyNextPlace
      : category === "delivery"
        ? rates.deliveryNextPlace
        : rates.otherNextPlace;

  // A zero/negative base rate means "no price configured", never a free service.
  if (!Number.isFinite(firstPlace) || firstPlace <= 0) {
    return { ok: false, reason: "tariff_not_configured", category, places };
  }

  const safeNext = Number.isFinite(nextPlace) && nextPlace > 0 ? nextPlace : 0;
  const amount = firstPlace + Math.max(0, places - 1) * safeNext;

  return { ok: true, amount, category, firstPlace, nextPlace: safeNext, places };
}

/** Latest tariff card of a client, or null when the client has none. */
export async function loadClientTariffRates(clientId: number): Promise<{ rates: ClientTariffRates; hasTariffRow: boolean }> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const rows = await conn.execute(sql`
    SELECT "deliveryFirstPlace","deliveryNextPlace","transportCompanyFirstPlace","transportCompanyNextPlace",
           "movementFirstPlace","movementNextPlace","otherFirstPlace","otherNextPlace"
      FROM "clientTariffs"
     WHERE "clientId" = ${clientId}
     ORDER BY id DESC
     LIMIT 1`);
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  const row = (list as Record<string, unknown>[])[0] ?? null;

  return { rates: toTariffRates(row), hasTariffRow: row !== null };
}

/** Quote for a request using the client's current tariff card. */
export async function quoteRequest(request: QuoteInput): Promise<QuoteResult> {
  if (request.clientId === null || request.clientId === undefined) {
    return computeQuote(request, EMPTY_TARIFF_RATES, false);
  }

  const { rates, hasTariffRow } = await loadClientTariffRates(Number(request.clientId));
  return computeQuote(request, rates, hasTariffRow);
}

/** True when the request is held by an active billing document. */
export async function isRequestBilled(requestId: number): Promise<boolean> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  // `active` is the single source of truth: releasing an annulled document clears
  // it, which is what makes the request billable again.
  const rows = await conn.execute(sql`
    SELECT 1 FROM "billingDocumentRequests"
     WHERE "requestId" = ${requestId} AND "active"
     LIMIT 1`);
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  return (list as unknown[]).length > 0;
}

/** Request ids that currently belong to an active billing document. */
export async function billedRequestIdSet(requestIds: number[]): Promise<Set<number>> {
  if (requestIds.length === 0) return new Set();
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const rows = await conn
    .select({ requestId: sql<number>`"requestId"` })
    .from(sql`"billingDocumentRequests"`)
    .where(and(
      inArray(sql`"requestId"`, requestIds),
      sql`"active"`,
    ));
  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [];
  return new Set((list as { requestId: number }[]).map((row) => Number(row.requestId)));
}

export type QuoteOutcome = {
  requestId: number;
  status: "calculated" | "skipped" | "unresolved";
  amount?: number;
  reason?: string;
  preserved?: "checked" | "manual" | "billed" | "not_completed" | "already_calculated";
};

/**
 * Write the quote into the request. Never touches a request that is already
 * verified, already billed, manually priced or not completed.
 */
export async function applyQuoteForRequest(
  request: DeliveryRequest,
  options: { force?: boolean } = {},
): Promise<QuoteOutcome> {
  const requestId = Number(request.id);
  const force = options.force === true;

  if (request.status !== "completed") {
    return { requestId, status: "skipped", preserved: "not_completed" };
  }

  if (!force) {
    if (await isRequestBilled(requestId)) {
      return { requestId, status: "skipped", preserved: "billed" };
    }
    if (request.billingCheckedAt) {
      return { requestId, status: "skipped", preserved: "checked" };
    }
    // A price that did not come from the tariff card is a manual amount.
    if (request.quoteSource === "manual_fee") {
      return { requestId, status: "skipped", preserved: "manual" };
    }
    if (request.quoteCalculatedAt) {
      return { requestId, status: "skipped", preserved: "already_calculated" };
    }
  }

  const result = await quoteRequest(request);
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  if (!result.ok) {
    // No invented price: clear a stale tariff amount and mark the request as
    // unresolved so it shows up as "requires attention".
    await conn
      .update(requests)
      .set({ deliveryFee: null, quoteCalculatedAt: null, updatedAt: new Date() })
      .where(eq(requests.id, requestId));
    return { requestId, status: "unresolved", reason: result.reason };
  }

  await conn
    .update(requests)
    .set({
      deliveryFee: result.amount.toFixed(2),
      quoteCalculatedAt: new Date(),
      quoteSource: "tariff",
      updatedAt: new Date(),
    })
    .where(eq(requests.id, requestId));

  return { requestId, status: "calculated", amount: result.amount };
}

/** Mark a request's amount as a manual entry (never auto-recalculated again). */
export async function markManualPrice(requestId: number): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  await conn
    .update(requests)
    .set({ quoteSource: "manual_fee", quoteCalculatedAt: null, updatedAt: new Date() })
    .where(eq(requests.id, requestId));
}

/**
 * Automatic quote after a request becomes completed.
 * Safe to call from every completion path: it is idempotent and never overwrites
 * a verified, billed or manually corrected amount.
 */
export async function quoteCompletedRequest(requestId: number): Promise<QuoteOutcome> {
  const request = await db.getRequestById(requestId);
  if (!request) return { requestId, status: "skipped", preserved: "not_completed" };
  return applyQuoteForRequest(request as DeliveryRequest);
}

/** Quote every eligible completed request of one client. */
export async function quoteClientRequests(
  clientId: number,
  options: { from?: string; to?: string } = {},
): Promise<QuoteOutcome[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const conditions = [eq(requests.clientId, clientId), eq(requests.status, "completed" as DeliveryRequest["status"])];
  if (options.from) conditions.push(sql`${requests.completedAt} >= ${options.from}::date`);
  if (options.to) conditions.push(sql`${requests.completedAt} < (${options.to}::date + interval '1 day')`);

  const rows = await conn.select().from(requests).where(and(...conditions)).orderBy(requests.id);
  const outcomes: QuoteOutcome[] = [];
  for (const row of rows as DeliveryRequest[]) {
    outcomes.push(await applyQuoteForRequest(row));
  }
  return outcomes;
}

// ─── Historical backfill ─────────────────────────────────────────────────────
// Old completed requests were priced only if a manager happened to open the client
// card, so many rows still have no amount. The backfill is explicit, previewable
// and strictly additive: it only fills an amount that is currently missing.

export interface BackfillCandidate {
  requestId: number;
  clientId: number;
  clientName: string | null;
  requestType: string;
  completedAt: string | null;
  placesCount: number | null;
  category: TariffCategory;
  /** null when the tariff cannot price this request. */
  amount: number | null;
  /** Why it cannot be priced, when amount is null. */
  issue: string | null;
}

export interface BackfillPreview {
  candidates: BackfillCandidate[];
  pricable: number;
  unresolved: number;
  byClient: { clientId: number; clientName: string | null; pricable: number; unresolved: number }[];
  skipped: {
    checked: number;
    billed: number;
    manual: number;
    alreadyCalculated: number;
    withoutClient: number;
  };
}

/**
 * Requests eligible for the historical backfill:
 *   completed, has a client, deliveryFee IS NULL or empty,
 *   quoteCalculatedAt IS NULL, quoteSource IS NULL, billingCheckedAt IS NULL.
 */
async function loadBackfillEligible(clientId?: number): Promise<DeliveryRequest[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const conditions = [
    eq(requests.status, "completed" as DeliveryRequest["status"]),
    sql`${requests.clientId} IS NOT NULL`,
    sql`(${requests.deliveryFee} IS NULL OR ${requests.deliveryFee}::text = '')`,
    isNull(requests.quoteCalculatedAt),
    isNull(requests.quoteSource),
    isNull(requests.billingCheckedAt),
  ];
  if (clientId !== undefined) conditions.push(eq(requests.clientId, clientId));

  const rows = await conn.select().from(requests).where(and(...conditions)).orderBy(requests.clientId, requests.id);
  return rows as DeliveryRequest[];
}

/** Read-only preview of what the backfill would do. */
export async function previewQuoteBackfill(clientId?: number): Promise<BackfillPreview> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const eligible = await loadBackfillEligible(clientId);

  // Counts of rows deliberately left alone, for transparency.
  const skippedResult = await conn.execute(sql`
    SELECT
      count(*) FILTER (WHERE "billingCheckedAt" IS NOT NULL)::int AS checked,
      count(*) FILTER (WHERE "quoteSource" = 'manual_fee')::int AS manual,
      count(*) FILTER (WHERE "quoteCalculatedAt" IS NOT NULL)::int AS calculated,
      count(*) FILTER (WHERE "clientId" IS NULL)::int AS without_client
      FROM requests
     WHERE status = 'completed' AND ("deliveryFee" IS NULL OR "deliveryFee"::text = '')`);
  const skippedRows = rowsOf(skippedResult)[0] as Record<string, unknown> | undefined;

  const skippedBilled = await conn.execute(sql`
    SELECT count(*)::int AS n FROM "billingDocumentRequests" WHERE "active"`);
  const billedCount = Number(rowsOf(skippedBilled)[0]?.n ?? 0);

  const clientNames = new Map<number, string | null>();
  for (const row of eligible) {
    const id = Number(row.clientId);
    if (!clientNames.has(id)) clientNames.set(id, null);
  }
  if (clientNames.size > 0) {
    const names = rowsOf(await conn.execute(sql`
      SELECT "id","name" FROM "clients" WHERE "id" IN (${sql.join([...clientNames.keys()].map((id) => sql`${id}`), sql`, `)})`));
    for (const row of names) clientNames.set(Number(row.id), row.name == null ? null : String(row.name));
  }

  const candidates: BackfillCandidate[] = [];
  const byClient = new Map<number, { clientId: number; clientName: string | null; pricable: number; unresolved: number }>();

  for (const row of eligible) {
    const quote = await quoteRequest(row);
    const id = Number(row.clientId);
    const entry = byClient.get(id) ?? { clientId: id, clientName: clientNames.get(id) ?? null, pricable: 0, unresolved: 0 };
    if (quote.ok) entry.pricable += 1;
    else entry.unresolved += 1;
    byClient.set(id, entry);

    candidates.push({
      requestId: Number(row.id),
      clientId: id,
      clientName: clientNames.get(id) ?? null,
      requestType: String(row.requestType),
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      placesCount: row.placesCount ?? null,
      category: quote.category,
      amount: quote.ok ? quote.amount : null,
      issue: quote.ok ? null : quote.reason,
    });
  }

  return {
    candidates,
    pricable: candidates.filter((c) => c.amount !== null).length,
    unresolved: candidates.filter((c) => c.amount === null).length,
    byClient: [...byClient.values()].sort((a, b) => b.pricable + b.unresolved - (a.pricable + a.unresolved)),
    skipped: {
      checked: Number(skippedRows?.checked ?? 0),
      billed: billedCount,
      manual: Number(skippedRows?.manual ?? 0),
      alreadyCalculated: Number(skippedRows?.calculated ?? 0),
      withoutClient: Number(skippedRows?.without_client ?? 0),
    },
  };
}

export interface BackfillResult {
  considered: number;
  calculated: number;
  unresolved: number;
  totalAmount: number;
  byClient: { clientId: number; clientName: string | null; calculated: number; unresolved: number; amount: number }[];
  unresolvedRequests: { requestId: number; clientId: number; issue: string | null }[];
}

/** Apply the historical backfill. Only fills amounts that are currently missing. */
export async function runQuoteBackfill(options: { clientId?: number } = {}): Promise<BackfillResult> {
  const preview = await previewQuoteBackfill(options.clientId);
  const eligible = await loadBackfillEligible(options.clientId);

  const byClient = new Map<number, { clientId: number; clientName: string | null; calculated: number; unresolved: number; amount: number }>();
  const unresolvedRequests: { requestId: number; clientId: number; issue: string | null }[] = [];
  let calculated = 0;
  let unresolved = 0;
  let totalAmount = 0;

  for (const row of eligible) {
    const outcome = await applyQuoteForRequest(row);
    const id = Number(row.clientId);
    const entry = byClient.get(id) ?? {
      clientId: id,
      clientName: preview.candidates.find((c) => c.clientId === id)?.clientName ?? null,
      calculated: 0,
      unresolved: 0,
      amount: 0,
    };

    if (outcome.status === "calculated") {
      entry.calculated += 1;
      entry.amount += Number(outcome.amount ?? 0);
      calculated += 1;
      totalAmount += Number(outcome.amount ?? 0);
    } else if (outcome.status === "unresolved") {
      entry.unresolved += 1;
      unresolved += 1;
      unresolvedRequests.push({ requestId: outcome.requestId, clientId: id, issue: outcome.reason ?? null });
    }

    byClient.set(id, entry);
  }

  return {
    considered: eligible.length,
    calculated,
    unresolved,
    totalAmount,
    byClient: [...byClient.values()].sort((a, b) => b.calculated + b.unresolved - (a.calculated + a.unresolved)),
    unresolvedRequests,
  };
}
