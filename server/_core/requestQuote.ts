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

  // Smart tariff matching uses the request snapshots, not mutable directories.
  senderAddress?: string | null;
  deliveryAddress?: string | null;
  recipientAddress?: string | null;

  // completedAt is preferred because billing is based on performed work.
  // scheduledAt/createdAt are fallbacks for legacy rows.
  completedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface SmartTariffRule {
  id: number;
  clientId: number;
  name: string;
  requestType: string | null;
  fromAddressNormalized: string | null;
  toAddressNormalized: string | null;
  weekdays: string | null;
  firstPlacePrice: number;
  nextPlacePrice: number;
  priority: number;
}

export interface SmartTariffMatch {
  rule: SmartTariffRule;
  amount: number;
  firstPlace: number;
  nextPlace: number;
  places: number;
}

/**
 * Conservative address key used for tariff matching.
 * We intentionally do not perform fuzzy/geographic matching here: a manager-created
 * tariff must never silently price a different route.
 */
export function normalizeTariffAddress(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestFromAddress(request: QuoteInput): string {
  // TC pickup historically stores the origin in tcAddress.
  return normalizeTariffAddress(request.senderAddress || request.tcAddress);
}

function requestToAddress(request: QuoteInput): string {
  return normalizeTariffAddress(request.deliveryAddress || request.recipientAddress);
}

function dateOfRequest(request: QuoteInput): Date | null {
  const raw = request.completedAt || request.scheduledAt || request.createdAt;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO weekday from the stored business wall-clock timestamp: Monday=1 ... Sunday=7.
 *
 * requests.completedAt/scheduledAt/createdAt are PostgreSQL timestamp without time zone.
 * Their calendar value is already the application's business-local time, so applying an
 * additional timezone conversion here would shift the stored business day.
 */
export function tariffWeekday(request: QuoteInput): number | null {
  const date = dateOfRequest(request);
  if (!date) return null;
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function weekdaySet(value: string | null): Set<number> | null {
  if (!value?.trim()) return null;
  const days = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return days.length ? new Set(days) : null;
}

function smartRuleSpecificity(rule: SmartTariffRule): number {
  let score = 0;
  if (rule.requestType) score += 8;
  if (rule.fromAddressNormalized) score += 4;
  if (rule.toAddressNormalized) score += 4;
  if (rule.weekdays) score += 2;
  return score;
}

export function smartRuleMatches(rule: SmartTariffRule, request: QuoteInput): boolean {
  if (request.clientId == null || Number(request.clientId) !== rule.clientId) return false;

  if (rule.requestType && rule.requestType !== request.requestType) return false;

  const from = requestFromAddress(request);
  const to = requestToAddress(request);

  if (
    rule.fromAddressNormalized &&
    normalizeTariffAddress(rule.fromAddressNormalized) !== from
  ) {
    return false;
  }

  if (
    rule.toAddressNormalized &&
    normalizeTariffAddress(rule.toAddressNormalized) !== to
  ) {
    return false;
  }

  const allowedDays = weekdaySet(rule.weekdays);
  if (allowedDays) {
    const day = tariffWeekday(request);
    if (day == null || !allowedDays.has(day)) return false;
  }

  return true;
}

/**
 * Select the most specific matching rule.
 * Explicit priority only breaks ties between rules of equal specificity.
 */
export function chooseSmartTariffRule(
  rules: SmartTariffRule[],
  request: QuoteInput,
): SmartTariffRule | null {
  return rules
    .filter((rule) => smartRuleMatches(rule, request))
    .sort((a, b) =>
      smartRuleSpecificity(b) - smartRuleSpecificity(a) ||
      b.priority - a.priority ||
      b.id - a.id
    )[0] ?? null;
}

export function computeSmartTariff(
  rule: SmartTariffRule,
  request: QuoteInput,
): SmartTariffMatch | null {
  const firstPlace = Number(rule.firstPlacePrice);
  const nextPlaceRaw = Number(rule.nextPlacePrice);
  const places = Math.max(1, Number(request.placesCount || 1));

  if (!Number.isFinite(firstPlace) || firstPlace < 0) return null;

  const nextPlace =
    Number.isFinite(nextPlaceRaw) && nextPlaceRaw > 0 ? nextPlaceRaw : 0;

  return {
    rule,
    amount: firstPlace + Math.max(0, places - 1) * nextPlace,
    firstPlace,
    nextPlace,
    places,
  };
}

export async function loadSmartTariffRules(clientId: number): Promise<SmartTariffRule[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const result = await conn.execute(sql`
    SELECT
      "id",
      "clientId",
      "name",
      "requestType",
      "fromAddressNormalized",
      "toAddressNormalized",
      "weekdays",
      "firstPlacePrice",
      "nextPlacePrice",
      "priority"
    FROM "clientTariffRules"
    WHERE "clientId" = ${clientId}
      AND "isActive" = true
    ORDER BY "priority" DESC, "id" DESC
  `);

  return rowsOf(result).map((row) => ({
    id: Number(row.id),
    clientId: Number(row.clientId),
    name: String(row.name ?? ""),
    requestType: row.requestType == null ? null : String(row.requestType),
    fromAddressNormalized:
      row.fromAddressNormalized == null ? null : String(row.fromAddressNormalized),
    toAddressNormalized:
      row.toAddressNormalized == null ? null : String(row.toAddressNormalized),
    weekdays: row.weekdays == null ? null : String(row.weekdays),
    firstPlacePrice: Number(row.firstPlacePrice),
    nextPlacePrice: Number(row.nextPlacePrice),
    priority: Number(row.priority ?? 0),
  }));
}

export async function quoteSmartTariff(
  request: QuoteInput,
): Promise<SmartTariffMatch | null> {
  if (request.clientId == null) return null;

  const rules = await loadSmartTariffRules(Number(request.clientId));
  const rule = chooseSmartTariffRule(rules, request);
  return rule ? computeSmartTariff(rule, request) : null;
}

export type QuoteResult =
  | {
      ok: true;
      amount: number;
      category: TariffCategory;
      firstPlace: number;
      nextPlace: number;
      places: number;
      /** Smart rule used for this quote; null means legacy/base tariff. */
      tariffRuleId: number | null;
      /** Immutable audit snapshot written together with the calculated amount. */
      tariffRuleSnapshot: string | null;
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

  return {
    ok: true,
    amount,
    category,
    firstPlace,
    nextPlace: safeNext,
    places,
    tariffRuleId: null,
    tariffRuleSnapshot: null,
  };
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

  // A client-specific smart rule has priority over the legacy/base tariff card.
  const smart = await quoteSmartTariff(request);
  if (smart) {
    return {
      ok: true,
      amount: smart.amount,
      category: tariffCategoryFor(request),
      firstPlace: smart.firstPlace,
      nextPlace: smart.nextPlace,
      places: smart.places,
      tariffRuleId: smart.rule.id,
      tariffRuleSnapshot: JSON.stringify({
        version: 1,
        ruleId: smart.rule.id,
        clientId: smart.rule.clientId,
        name: smart.rule.name,
        requestType: smart.rule.requestType,
        fromAddressNormalized: smart.rule.fromAddressNormalized,
        toAddressNormalized: smart.rule.toAddressNormalized,
        weekdays: smart.rule.weekdays,
        firstPlacePrice: smart.rule.firstPlacePrice,
        nextPlacePrice: smart.rule.nextPlacePrice,
        priority: smart.rule.priority,
      }),
    };
  }

  // No smart rule matched: preserve the existing tariff behaviour unchanged.
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
  preserved?: "checked" | "manual" | "billed" | "not_completed" | "already_calculated" | "different_tariff_rule";
};

/**
 * Write the quote into the request. Never touches a request that is already
 * verified, already billed, manually priced or not completed.
 */
export async function applyQuoteForRequest(
  request: DeliveryRequest,
  options: {
    force?: boolean;
    repriceAutomatic?: boolean;
    onlyTariffRuleId?: number;
    affectedTariffRuleId?: number;
  } = {},
): Promise<QuoteOutcome> {
  const requestId = Number(request.id);
  const force = options.force === true;
  const repriceAutomatic = options.repriceAutomatic === true;

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
    if (request.quoteCalculatedAt && !repriceAutomatic) {
      return { requestId, status: "skipped", preserved: "already_calculated" };
    }

    // Safe repricing is allowed only for prices that were produced by the
    // tariff engine itself. Legacy/unknown non-null amounts are preserved.
    if (
      repriceAutomatic &&
      request.deliveryFee != null &&
      request.quoteSource !== "tariff"
    ) {
      return { requestId, status: "skipped", preserved: "manual" };
    }
  }

  const result = await quoteRequest(request);

  // Targeted smart-tariff repricing is intentionally a no-op unless the
  // requested rule is the actual winning quote for this request. This prevents
  // creation of one rule from repricing unrelated automatic client requests.
  if (
    options.onlyTariffRuleId !== undefined &&
    (!result.ok || result.tariffRuleId !== options.onlyTariffRuleId)
  ) {
    return {
      requestId,
      status: "skipped",
      preserved: "different_tariff_rule",
    };
  }

  // Editing a smart tariff affects two safe groups:
  // 1) requests for which the edited rule is the winner after the edit;
  // 2) requests previously stamped with this rule, even if the edit means
  //    they no longer match it. Those rows must fall back to another smart
  //    rule, the base tariff, or unresolved instead of keeping a stale price.
  if (
    options.affectedTariffRuleId !== undefined &&
    request.quoteTariffRuleId !== options.affectedTariffRuleId &&
    (!result.ok || result.tariffRuleId !== options.affectedTariffRuleId)
  ) {
    return {
      requestId,
      status: "skipped",
      preserved: "different_tariff_rule",
    };
  }

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  if (!result.ok) {
    // No invented price: clear a stale tariff amount and mark the request as
    // unresolved so it shows up as "requires attention".
    await conn
      .update(requests)
      .set({
        deliveryFee: null,
        quoteCalculatedAt: null,
        quoteSource: null,
        quoteTariffRuleId: null,
        quoteTariffSnapshot: null,
        updatedAt: new Date(),
      })
      .where(eq(requests.id, requestId));
    return { requestId, status: "unresolved", reason: result.reason };
  }

  await conn
    .update(requests)
    .set({
      deliveryFee: result.amount.toFixed(2),
      quoteCalculatedAt: new Date(),
      quoteSource: "tariff",
      quoteTariffRuleId: result.tariffRuleId,
      quoteTariffSnapshot: result.tariffRuleSnapshot,
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
    .set({
      quoteSource: "manual_fee",
      quoteCalculatedAt: null,
      quoteTariffRuleId: null,
      quoteTariffSnapshot: null,
      updatedAt: new Date(),
    })
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
  options: {
    from?: string;
    to?: string;
    repriceAutomatic?: boolean;
    onlyTariffRuleId?: number;
    affectedTariffRuleId?: number;
  } = {},
): Promise<QuoteOutcome[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const conditions = [eq(requests.clientId, clientId), eq(requests.status, "completed" as DeliveryRequest["status"])];
  if (options.from) conditions.push(sql`${requests.completedAt} >= ${options.from}::date`);
  if (options.to) conditions.push(sql`${requests.completedAt} < (${options.to}::date + interval '1 day')`);

  const rows = await conn.select().from(requests).where(and(...conditions)).orderBy(requests.id);
  const outcomes: QuoteOutcome[] = [];
  for (const row of rows as DeliveryRequest[]) {
    outcomes.push(await applyQuoteForRequest(row, {
      repriceAutomatic: options.repriceAutomatic === true,
      onlyTariffRuleId: options.onlyTariffRuleId,
      affectedTariffRuleId: options.affectedTariffRuleId,
    }));
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
