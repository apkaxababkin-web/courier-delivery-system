/**
 * Client billing review: everything the "Сверка" screen and the document
 * eligibility rules need, for ALL requests of a period — not only completed ones.
 *
 * Why all statuses: a request may look unfinished only because a courier forgot to
 * press "Выполнить". The manager has to see and resolve every request of the
 * period before the period can be billed:
 *
 *   completed   → needs a price and a verification mark
 *   cancelled   → needs an explicit decision (was it really not performed?)
 *   pending / assigned / in_progress → needs an explicit decision
 *
 * Decisions live in requests."billingReviewState" (migration 0015). A decision
 * "fact performed" is NOT a second pricing mechanism: it drives the existing
 * completed workflow, so completedAt, the server quote and the normal review all
 * happen exactly once, through the code that already exists.
 */
import { and, eq, sql } from "drizzle-orm";
import { requests, type Request as DeliveryRequest } from "../../drizzle/schema";
import * as db from "../db";
import { quoteRequest } from "./requestQuote";
import {
  loadDocumentSettings,
  missingExecutorRequisites,
  type DocumentSettings,
  type RequisiteGap,
} from "./documentSettings";
import { sumMoney } from "../../shared/billing-format";

export const REVIEW_STATES = [
  "cancelled_confirmed",
  "completed_confirmed",
  "requires_clarification",
  "not_billable",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  cancelled_confirmed: "Подтверждена отмена",
  completed_confirmed: "Фактически выполнена",
  requires_clarification: "Требует уточнения",
  not_billable: "Не подлежит оплате",
};

/** UI-facing state of one request inside the review. */
export type BillingRequestState =
  | "billed"          // already on an active document
  | "unpriced"        // completed, price could not be derived and is still missing
  | "ready"           // completed with a price, waiting for the manager to verify
  | "checked"         // completed, price verified, ready for the document set
  | "decision_needed" // cancelled/unfinished: the manager has not decided yet
  | "decided_not_billable" // resolved as not performed / not chargeable
  | "decided_completed"    // resolved as performed but its completed workflow has not run yet
  | "clarification";  // manager marked it as needing clarification

const NOT_BILLABLE_STATES: ReviewState[] = ["cancelled_confirmed", "not_billable"];

export interface BillingRequestRow {
  request: DeliveryRequest;
  /** Amount taken from the request, null when missing. */
  amount: number | null;
  state: BillingRequestState;
  /** Why the amount is missing or why the request is not resolved. */
  issue: string | null;
  category: string;
  reviewState: ReviewState | null;
  reviewNote: string | null;
  /** True when this request must be resolved before the period can be billed. */
  blocking: boolean;
  statusLabel: string;
}

export interface BillingCounts {
  total: number;
  completed: number;
  unfinished: number;
  cancelled: number;
  checked: number;
  ready: number;
  unpriced: number;
  billed: number;
  decisionNeeded: number;
  clarification: number;
  notBillable: number;
}

export interface PeriodReadiness {
  ready: boolean;
  blockers: string[];
  /** Gaps in our own requisites. */
  executorGaps: RequisiteGap[];
  /** Gaps in the client card. */
  clientGaps: RequisiteGap[];
  /** Requests that must still be resolved. */
  unresolved: { requestId: number; reason: string }[];
}

export interface BillingOverview {
  rows: BillingRequestRow[];
  counts: BillingCounts;
  /** Sum of verified requests: the amount the document set will contain. */
  checkedAmount: number;
  /** Sum of completed requests that have a price (verified + waiting). */
  pricedAmount: number;
  /** Amount of requests already on an active document. */
  billedAmount: number;
  readiness: PeriodReadiness;
  documentedRequestIds: number[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Не назначена",
  assigned: "Назначена курьеру",
  in_progress: "В работе",
  completed: "Выполнена",
  cancelled: "Отменена",
};

export function requestStatusLabel(status: string | null | undefined): string {
  return STATUS_LABELS[String(status ?? "")] ?? String(status ?? "");
}

const ISSUE_TEXT: Record<string, string> = {
  no_client: "У заявки не указан клиент",
  no_tariff: "У клиента нет тарифной карточки",
  tariff_not_configured: "В тарифе клиента не заполнена ставка для этой категории",
  no_places: "Не указано количество мест",
};

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const list = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

/** Every request of one client inside one period, whatever its status. */
export async function loadClientPeriodRequests(clientId: number, from: string, to: string): Promise<DeliveryRequest[]> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  // The period is anchored on completedAt when the request was completed,
  // otherwise on createdAt, so unfinished and cancelled requests also fall into
  // the period they were worked in.
  const rows = await conn
    .select()
    .from(requests)
    .where(and(
      eq(requests.clientId, clientId),
      sql`COALESCE(${requests.completedAt}, ${requests.createdAt}) >= ${from}::date`,
      sql`COALESCE(${requests.completedAt}, ${requests.createdAt}) < (${to}::date + interval '1 day')`,
    ))
    .orderBy(sql`COALESCE(${requests.completedAt}, ${requests.createdAt})`, requests.id);
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

export interface ClientRequisites {
  id: number;
  name: string;
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  postalAddress: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export async function loadClientRequisites(clientId: number): Promise<ClientRequisites | null> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const row = asRows(await conn.execute(sql`
    SELECT "id","name","legalName","inn","kpp","legalAddress","address"
      FROM "clients" WHERE "id" = ${clientId} LIMIT 1`))[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    legalName: row.legalName == null ? null : String(row.legalName),
    inn: row.inn == null ? null : String(row.inn),
    kpp: row.kpp == null ? null : String(row.kpp),
    ogrn: null,
    legalAddress: row.legalAddress == null ? null : String(row.legalAddress),
    postalAddress: null,
    address: row.address == null ? null : String(row.address),
    phone: null,
    email: null,
  };
}

/** Requisites a client card must have before its documents can be printed. */
export function missingClientRequisites(client: ClientRequisites | null): RequisiteGap[] {
  if (!client) return [{ field: "clientId", label: "Клиент не найден" }];
  const gaps: RequisiteGap[] = [];
  if (!client.legalName && !client.name) gaps.push({ field: "name", label: "Наименование клиента" });
  if (!client.inn) gaps.push({ field: "inn", label: "ИНН клиента" });
  if (!client.legalAddress && !client.address) gaps.push({ field: "legalAddress", label: "Юридический адрес клиента" });
  return gaps;
}

/** The address printed as the customer address, preferring the legal one. */
export function clientDocumentAddress(client: ClientRequisites): string {
  return client.legalAddress || client.address || "";
}

/** The name printed on documents, preferring the full legal name. */
export function clientDocumentName(client: ClientRequisites): string {
  return client.legalName || client.name;
}

/**
 * Full review state for one client and period.
 */
export async function buildClientBillingOverview(
  clientId: number,
  from: string,
  to: string,
): Promise<BillingOverview> {
  const periodRequests = await loadClientPeriodRequests(clientId, from, to);
  const membership = await activeBillingMembership(periodRequests.map((r) => Number(r.id)));

  const rows: BillingRequestRow[] = [];
  const unresolved: { requestId: number; reason: string }[] = [];

  for (const request of periodRequests) {
    const id = Number(request.id);
    const amountRaw = request.deliveryFee;
    const amount = amountRaw == null || amountRaw === "" ? null : Number(amountRaw);
    const hasAmount = amount !== null && Number.isFinite(amount);
    const quote = await quoteRequest(request);
    const reviewState = (request.billingReviewState ?? null) as ReviewState | null;
    const reviewNote = request.billingReviewNote ?? null;

    let state: BillingRequestState;
    let issue: string | null = null;
    let blocking = false;

    if (membership.has(id)) {
      state = "billed";
    } else if (request.status === "completed") {
      if (request.billingCheckedAt) {
        state = "checked";
      } else if (hasAmount) {
        state = "ready";
        blocking = true;
        issue = "Ожидает проверки стоимости";
      } else {
        state = "unpriced";
        blocking = true;
        issue = quote.ok ? "Стоимость ещё не рассчитана" : ISSUE_TEXT[quote.reason] ?? "Не удалось рассчитать стоимость";
      }
    } else if (reviewState && NOT_BILLABLE_STATES.includes(reviewState)) {
      state = "decided_not_billable";
    } else if (reviewState === "requires_clarification") {
      state = "clarification";
      blocking = true;
      issue = reviewNote || "Требует уточнения";
    } else if (reviewState === "completed_confirmed") {
      // Manager said it was performed; the completed workflow still has to price
      // and review it. Until then it stays blocking.
      state = hasAmount && request.billingCheckedAt ? "checked" : "decided_completed";
      blocking = state !== "checked";
      issue = state === "checked" ? null : "Отмечена как выполненная, ожидает расчёта и проверки";
    } else {
      state = "decision_needed";
      blocking = true;
      issue = request.status === "cancelled"
        ? "Отменена: нужно решение менеджера"
        : "Не завершена: нужно решение менеджера";
    }

    if (blocking) {
      unresolved.push({ requestId: id, reason: issue ?? "Требуется решение" });
    }

    rows.push({
      request,
      amount: hasAmount ? amount : null,
      state,
      issue,
      category: quote.category,
      reviewState,
      reviewNote,
      blocking,
      statusLabel: requestStatusLabel(request.status),
    });
  }

  const counts: BillingCounts = {
    total: rows.length,
    completed: rows.filter((r) => r.request.status === "completed").length,
    unfinished: rows.filter((r) => ["pending", "assigned", "in_progress"].includes(String(r.request.status))).length,
    cancelled: rows.filter((r) => r.request.status === "cancelled").length,
    checked: rows.filter((r) => r.state === "checked").length,
    ready: rows.filter((r) => r.state === "ready").length,
    unpriced: rows.filter((r) => r.state === "unpriced").length,
    billed: rows.filter((r) => r.state === "billed").length,
    decisionNeeded: rows.filter((r) => r.state === "decision_needed").length,
    clarification: rows.filter((r) => r.state === "clarification").length,
    notBillable: rows.filter((r) => r.state === "decided_not_billable").length,
  };

  const checkedAmount = sumMoney(rows.filter((r) => r.state === "checked").map((r) => r.amount));
  const pricedAmount = sumMoney(rows.filter((r) => r.state === "checked" || r.state === "ready").map((r) => r.amount));
  const billedAmount = sumMoney(rows.filter((r) => r.state === "billed").map((r) => r.amount));

  const client = await loadClientRequisites(clientId);
  const settings = await loadDocumentSettings();
  const executorGaps = missingExecutorRequisites(settings);
  const clientGaps = missingClientRequisites(client);

  const blockers: string[] = [];
  if (rows.length === 0) blockers.push("За выбранный период у клиента нет заявок");
  if (counts.checked === 0 && rows.length > 0) blockers.push("Нет проверенных выполненных заявок для документов");
  if (counts.ready > 0) blockers.push(`Заявок ожидает проверки стоимости: ${counts.ready}`);
  if (counts.unpriced > 0) blockers.push(`Заявок без рассчитанной стоимости: ${counts.unpriced}`);
  if (counts.decisionNeeded > 0) blockers.push(`Отменённых или незавершённых заявок без решения: ${counts.decisionNeeded}`);
  if (counts.clarification > 0) blockers.push(`Заявок «требует уточнения»: ${counts.clarification}`);
  if (counts.completed > 0 && counts.checked + counts.ready + counts.unpriced + counts.billed < counts.completed) {
    blockers.push("Часть выполненных заявок ещё не разобрана");
  }
  if (executorGaps.length > 0) {
    blockers.push(`Не заполнены наши реквизиты: ${executorGaps.map((g) => g.label).join(", ")}`);
  }
  if (clientGaps.length > 0) {
    blockers.push(`Не заполнены реквизиты клиента: ${clientGaps.map((g) => g.label).join(", ")}`);
  }

  return {
    rows,
    counts,
    checkedAmount,
    pricedAmount,
    billedAmount,
    readiness: {
      ready: blockers.length === 0 && counts.checked > 0,
      blockers,
      executorGaps,
      clientGaps,
      unresolved,
    },
    documentedRequestIds: [...membership.keys()],
  };
}

/** Requests of a period that a document set may contain: verified completed ones. */
export function billableRows(overview: BillingOverview): BillingRequestRow[] {
  return overview.rows.filter((row) => row.state === "checked");
}

// ─── Manager decisions ───────────────────────────────────────────────────────

export class ReviewDecisionError extends Error {}

export const REVIEW_ACTIONS = [
  "confirm_cancelled",
  "mark_completed",
  "requires_clarification",
  "not_billable",
  "reset",
] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

const ACTION_TO_STATE: Record<Exclude<ReviewAction, "reset" | "mark_completed">, ReviewState> = {
  confirm_cancelled: "cancelled_confirmed",
  requires_clarification: "requires_clarification",
  not_billable: "not_billable",
};

/** Record a manager decision about a request that is not billed as completed. */
export async function applyReviewDecision(
  requestId: number,
  action: ReviewAction,
  note: string | null,
): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  const rows = await conn.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  const request = rows[0] as DeliveryRequest | undefined;
  if (!request) throw new ReviewDecisionError("Заявка не найдена");

  const membership = await activeBillingMembership([requestId]);
  if (membership.has(requestId)) {
    throw new ReviewDecisionError("Заявка уже включена в выставленный документ");
  }

  if (action === "mark_completed") {
    if (request.status === "completed") {
      throw new ReviewDecisionError("Заявка уже выполнена");
    }
    // Deliberately do NOT duplicate the completion logic here: hand the request to
    // the existing workflow so completedAt, the quote and the review mark all run
    // through the single supported path.
    await db.updateRequestStatus(requestId, "completed");
    await conn
      .update(requests)
      .set({ billingReviewState: "completed_confirmed", billingReviewNote: note, updatedAt: new Date() })
      .where(eq(requests.id, requestId));
    return;
  }

  if (action === "reset") {
    await conn
      .update(requests)
      .set({ billingReviewState: null, billingReviewNote: null, updatedAt: new Date() })
      .where(eq(requests.id, requestId));
    return;
  }

  await conn
    .update(requests)
    .set({ billingReviewState: ACTION_TO_STATE[action], billingReviewNote: note, updatedAt: new Date() })
    .where(eq(requests.id, requestId));
}

/** True when the request is resolved and may take part in a document set. */
export function isResolvedForDocuments(row: BillingRequestRow): boolean {
  return row.state === "checked" || row.state === "decided_not_billable" || row.state === "billed";
}

export type { DocumentSettings };
