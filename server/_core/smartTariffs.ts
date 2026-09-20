import { and, eq, inArray, sql } from "drizzle-orm";
import * as db from "../db";
import { clientTariffRules, requests } from "../../drizzle/schema";
import {
  normalizeTariffAddress,
  quoteClientRequests,
} from "./requestQuote";
import { activeBillingMembership } from "./billingReview";

function rowsOf(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(rows) ? rows as Record<string, unknown>[] : [];
}

function requestFromAddress(request: Record<string, any>): string {
  return normalizeTariffAddress(
    request.senderAddress || request.tcAddress || "",
  );
}

function requestToAddress(request: Record<string, any>): string {
  return normalizeTariffAddress(
    request.deliveryAddress || request.recipientAddress || "",
  );
}

function requestDate(request: Record<string, any>): Date | null {
  const raw =
    request.completedAt ||
    request.scheduledAt ||
    request.createdAt;

  if (!raw) return null;

  const date = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoWeekday(request: Record<string, any>): number | null {
  const date = requestDate(request);
  if (!date) return null;

  // Request timestamps are PostgreSQL timestamp without time zone and represent
  // the application's business-local wall clock. Do not convert them a second time.
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export interface SmartTariffSelectionPreview {
  clientId: number;
  requestIds: number[];
  selectedCount: number;

  /** Existing completed requests with the same exact normalized route/type. */
  matchedCount: number;
  /** Matching requests whose automatic price may be recalculated safely. */
  eligibleCount: number;
  /** Matching requests frozen by billing/check/manual or other safeguards. */
  protectedCount: number;

  /**
   * Exact weekday breakdown for the matching route/type.
   * Keys are ISO weekdays 1..7.
   */
  eligibleByWeekday: Record<number, number>;
  protectedByWeekday: Record<number, number>;

  commonRequestType: string | null;
  commonFromAddress: string | null;
  commonToAddress: string | null;

  weekdays: number[];
  suggestedWeekdays: string | null;

  sameRequestType: boolean;
  sameFromAddress: boolean;
  sameToAddress: boolean;

  canCreateRouteRule: boolean;

  examples: {
    id: number;
    requestType: string | null;
    fromAddress: string;
    toAddress: string;
    weekday: number | null;
    placesCount: number;
    currentPrice: number | null;
    quoteSource: string | null;
  }[];
}

/**
 * Analyse requests selected by the manager.
 *
 * We only infer facts that are literally common to every selected request.
 * No fuzzy address guessing is used: this prevents accidental broad tariffs.
 */
export async function previewSmartTariffSelection(
  clientId: number,
  requestIds: number[],
): Promise<SmartTariffSelectionPreview> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const ids = unique(
    requestIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  );

  if (ids.length === 0) {
    throw new Error("Выберите хотя бы одну заявку");
  }

  type SelectedRequest = {
    id: number;
    clientId?: number | null;
    requestType?: string | null;
    senderAddress?: string | null;
    tcAddress?: string | null;
    deliveryAddress?: string | null;
    recipientAddress?: string | null;
    completedAt?: Date | string | null;
    scheduledAt?: Date | string | null;
    createdAt?: Date | string | null;
    placesCount?: number | null;
    deliveryFee?: string | number | null;
    quoteSource?: string | null;
    billingCheckedAt?: Date | string | null;
  };

  const selected = (await conn
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.clientId, clientId),
        inArray(requests.id, ids),
      ),
    )) as SelectedRequest[];

  if (selected.length !== ids.length) {
    throw new Error(
      "Часть выбранных заявок не найдена или относится к другому клиенту",
    );
  }

  const billed = await activeBillingMembership(ids);

  if (billed.size > 0) {
    throw new Error(
      "Нельзя обучать тариф по заявкам, уже включённым в выставленные документы",
    );
  }

  const types: string[] = unique<string>(
    selected.map((r: SelectedRequest) => String(r.requestType ?? "")),
  );

  const fromAddresses: string[] = unique<string>(
    selected.map((r: SelectedRequest) => requestFromAddress(r)),
  );

  const toAddresses: string[] = unique<string>(
    selected.map((r: SelectedRequest) => requestToAddress(r)),
  );

  const weekdays: number[] = unique<number>(
    selected
      .map((r: SelectedRequest) => isoWeekday(r))
      .filter((day: number | null): day is number => day !== null),
  ).sort((a: number, b: number) => a - b);

  const sameRequestType = types.length === 1 && Boolean(types[0]);
  const sameFromAddress =
    fromAddresses.length === 1 && Boolean(fromAddresses[0]);
  const sameToAddress =
    toAddresses.length === 1 && Boolean(toAddresses[0]);

  let matchedCount = 0;
  let eligibleCount = 0;
  let protectedCount = 0;
  const eligibleByWeekday: Record<number, number> = {};
  const protectedByWeekday: Record<number, number> = {};

  if (sameRequestType && sameFromAddress && sameToAddress) {
    const candidates = (await conn
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.clientId, clientId),
          eq(requests.status, "completed"),
        ),
      )) as SelectedRequest[];

    const matching = candidates.filter(
      (request) =>
        String(request.requestType ?? "") === types[0] &&
        requestFromAddress(request) === fromAddresses[0] &&
        requestToAddress(request) === toAddresses[0],
    );

    matchedCount = matching.length;

    const matchingIds = matching.map((request) => Number(request.id));
    const matchingBilled = await activeBillingMembership(matchingIds);

    for (const request of matching) {
      const id = Number(request.id);

      // These are the same financial protections used by automatic repricing:
      // billed, manager-checked and explicit manual prices are immutable.
      const protectedFinancially =
        matchingBilled.has(id) ||
        Boolean(request.billingCheckedAt) ||
        request.quoteSource === "manual_fee" ||
        (
          request.deliveryFee != null &&
          request.deliveryFee !== "" &&
          request.quoteSource !== "tariff"
        );

      const weekday = isoWeekday(request);

      if (protectedFinancially) {
        protectedCount += 1;
        if (weekday !== null) {
          protectedByWeekday[weekday] =
            (protectedByWeekday[weekday] ?? 0) + 1;
        }
      } else {
        eligibleCount += 1;
        if (weekday !== null) {
          eligibleByWeekday[weekday] =
            (eligibleByWeekday[weekday] ?? 0) + 1;
        }
      }
    }
  }

  return {
    clientId,
    requestIds: ids,
    selectedCount: selected.length,
    matchedCount,
    eligibleCount,
    protectedCount,
    eligibleByWeekday,
    protectedByWeekday,

    commonRequestType:
      sameRequestType ? types[0] : null,

    commonFromAddress:
      sameFromAddress ? fromAddresses[0] : null,

    commonToAddress:
      sameToAddress ? toAddresses[0] : null,

    weekdays,
    suggestedWeekdays:
      weekdays.length > 0 ? weekdays.join(",") : null,

    sameRequestType,
    sameFromAddress,
    sameToAddress,

    canCreateRouteRule:
      sameRequestType &&
      sameFromAddress &&
      sameToAddress,

    examples: selected.map((r: SelectedRequest) => ({
      id: Number(r.id),
      requestType:
        r.requestType == null ? null : String(r.requestType),
      fromAddress: requestFromAddress(r as any),
      toAddress: requestToAddress(r as any),
      weekday: isoWeekday(r as any),
      placesCount: Math.max(1, Number(r.placesCount || 1)),
      currentPrice:
        r.deliveryFee == null || r.deliveryFee === ""
          ? null
          : Number(r.deliveryFee),
      quoteSource:
        r.quoteSource == null ? null : String(r.quoteSource),
    })),
  };
}

export interface CreateSmartTariffInput {
  clientId: number;
  requestIds: number[];

  name: string;
  firstPlacePrice: number;
  nextPlacePrice: number;

  /**
   * "selected" = use exactly the weekdays observed in the selection.
   * "weekdays" = Monday-Friday.
   * "weekend" = Saturday-Sunday.
   * "all" = every day.
   * An explicit array may also be supplied by the UI.
   */
  daysMode?: "selected" | "weekdays" | "weekend" | "all";
  weekdays?: number[];

  priority?: number;
  createdByManagerId?: number | null;

  /** Recalculate eligible existing requests after saving the rule. */
  applyExisting?: boolean;
}

function normalizeDays(days: number[]): number[] {
  return unique(
    days
      .map(Number)
      .filter(
        (day) =>
          Number.isInteger(day) &&
          day >= 1 &&
          day <= 7,
      ),
  ).sort((a, b) => a - b);
}

function resolveDays(
  preview: SmartTariffSelectionPreview,
  input: CreateSmartTariffInput,
): number[] | null {
  if (input.weekdays) {
    const explicit = normalizeDays(input.weekdays);
    return explicit.length > 0 ? explicit : null;
  }

  switch (input.daysMode) {
    case "weekdays":
      return [1, 2, 3, 4, 5];

    case "weekend":
      return [6, 7];

    case "all":
      return null;

    case "selected":
    default:
      return preview.weekdays.length > 0
        ? preview.weekdays
        : null;
  }
}

/**
 * Learn a tariff from a group of selected requests.
 *
 * The selected requests define the route/type. The manager defines money and
 * may choose which weekdays the rule covers.
 */
export async function createSmartTariffFromSelection(
  input: CreateSmartTariffInput,
) {
  if (!input.name.trim()) {
    throw new Error("Укажите название тарифа");
  }

  if (
    !Number.isFinite(input.firstPlacePrice) ||
    input.firstPlacePrice < 0
  ) {
    throw new Error(
      "Стоимость первого места должна быть не меньше нуля",
    );
  }

  if (
    !Number.isFinite(input.nextPlacePrice) ||
    input.nextPlacePrice < 0
  ) {
    throw new Error(
      "Стоимость последующего места должна быть не меньше нуля",
    );
  }

  const preview = await previewSmartTariffSelection(
    input.clientId,
    input.requestIds,
  );

  if (!preview.canCreateRouteRule) {
    const problems: string[] = [];

    if (!preview.sameRequestType)
      problems.push("разный тип заявки");

    if (!preview.sameFromAddress)
      problems.push("разное место забора");

    if (!preview.sameToAddress)
      problems.push("разное место доставки");

    throw new Error(
      `Из выбранных заявок нельзя создать одно правило: ${problems.join(", ")}`,
    );
  }

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const days = resolveDays(preview, input);

  const inserted = await conn
    .insert(clientTariffRules)
    .values({
      clientId: input.clientId,
      name: input.name.trim(),
      requestType: preview.commonRequestType,
      fromAddressNormalized: preview.commonFromAddress,
      toAddressNormalized: preview.commonToAddress,
      weekdays:
        days && days.length > 0
          ? days.join(",")
          : null,
      firstPlacePrice: input.firstPlacePrice.toFixed(2),
      nextPlacePrice: input.nextPlacePrice.toFixed(2),
      priority: Math.trunc(input.priority ?? 0),
      isActive: true,
      createdByManagerId:
        input.createdByManagerId ?? null,
      updatedAt: new Date(),
    })
    .returning();

  const rule = inserted[0];

  let recalculation:
    | {
        calculated: number;
        unresolved: number;
        skipped: number;
      }
    | null = null;

  if (input.applyExisting !== false) {
    const outcomes = await quoteClientRequests(input.clientId, {
      repriceAutomatic: true,
      onlyTariffRuleId: Number(rule.id),
    });

    recalculation = {
      calculated:
        outcomes.filter((o) => o.status === "calculated").length,
      unresolved:
        outcomes.filter((o) => o.status === "unresolved").length,
      skipped:
        outcomes.filter((o) => o.status === "skipped").length,
    };
  }

  return {
    rule,
    preview,
    recalculation,
  };
}

export async function listSmartTariffs(clientId: number) {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  return await conn
    .select()
    .from(clientTariffRules)
    .where(eq(clientTariffRules.clientId, clientId))
    .orderBy(
      sql`${clientTariffRules.isActive} DESC`,
      sql`${clientTariffRules.priority} DESC`,
      sql`${clientTariffRules.id} DESC`,
    );
}

export interface UpdateSmartTariffInput {
  clientId: number;
  ruleId: number;
  name: string;
  firstPlacePrice: number;
  nextPlacePrice: number;
  weekdays?: number[] | null;
  priority?: number;
  applyExisting?: boolean;
}

/**
 * Edit the commercial terms of an existing smart tariff.
 *
 * Route/type are intentionally immutable here: changing them would turn an
 * edit into a different rule. Historical requests keep their stored snapshot.
 */
export async function updateSmartTariff(
  input: UpdateSmartTariffInput,
) {
  if (!input.name.trim()) {
    throw new Error("Укажите название тарифа");
  }

  if (
    !Number.isFinite(input.firstPlacePrice) ||
    input.firstPlacePrice < 0
  ) {
    throw new Error(
      "Стоимость первого места должна быть не меньше нуля",
    );
  }

  if (
    !Number.isFinite(input.nextPlacePrice) ||
    input.nextPlacePrice < 0
  ) {
    throw new Error(
      "Стоимость последующего места должна быть не меньше нуля",
    );
  }

  const weekdays =
    input.weekdays == null
      ? null
      : Array.from(
          new Set(
            input.weekdays
              .map((day) => Math.trunc(day))
              .filter((day) => day >= 1 && day <= 7),
          ),
        ).sort((a, b) => a - b);

  if (
    input.weekdays != null &&
    (weekdays === null || weekdays.length === 0)
  ) {
    throw new Error("Выберите хотя бы один день недели");
  }

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const updated = await conn
    .update(clientTariffRules)
    .set({
      name: input.name.trim(),
      firstPlacePrice: input.firstPlacePrice.toFixed(2),
      nextPlacePrice: input.nextPlacePrice.toFixed(2),
      weekdays:
        weekdays && weekdays.length > 0
          ? weekdays.join(",")
          : null,
      priority: Math.trunc(input.priority ?? 0),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clientTariffRules.id, input.ruleId),
        eq(clientTariffRules.clientId, input.clientId),
        eq(clientTariffRules.isActive, true),
      ),
    )
    .returning();

  if (updated.length === 0) {
    throw new Error("Активный тариф не найден");
  }

  const rule = updated[0];

  let recalculation:
    | {
        calculated: number;
        unresolved: number;
        skipped: number;
      }
    | null = null;

  if (input.applyExisting !== false) {
    const outcomes = await quoteClientRequests(input.clientId, {
      repriceAutomatic: true,
      affectedTariffRuleId: Number(rule.id),
    });

    recalculation = {
      calculated:
        outcomes.filter((o) => o.status === "calculated").length,
      unresolved:
        outcomes.filter((o) => o.status === "unresolved").length,
      skipped:
        outcomes.filter((o) => o.status === "skipped").length,
    };
  }

  return {
    rule,
    recalculation,
  };
}

/**
 * Soft delete. Historical requests keep their already calculated amount.
 */
export async function disableSmartTariff(
  clientId: number,
  ruleId: number,
): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const updated = await conn
    .update(clientTariffRules)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clientTariffRules.id, ruleId),
        eq(clientTariffRules.clientId, clientId),
      ),
    )
    .returning({ id: clientTariffRules.id });

  if (updated.length === 0) {
    throw new Error("Тариф не найден");
  }
}
