/**
 * Manual price assignment from the client review screen (problem #2).
 *
 * These tests exercise the real server path used by the manager mutation —
 * `applyManualFee` from server/_core/billingReview.ts — against the isolated test
 * database, plus the shared `canSetManualFee` rule and the automatic quote
 * behaviour that must not overwrite a manual amount.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyManualFee,
  buildClientBillingOverview,
  canSetManualFee,
  manualFeeError,
  MANUAL_FEE_BILLED_ERROR,
} from "../server/_core/billingReview";
import { applyQuoteForRequest, markManualPrice } from "../server/_core/requestQuote";
import { issueDocumentSet } from "../server/_core/billingDocumentService";
import { close, PERIOD_FROM, PERIOD_TO, seed, type SeedResult } from "./helpers/billingSeed";

let current: SeedResult | null = null;

afterEach(async () => {
  if (current) {
    await close(current.db);
    current = null;
  }
});

async function requestRow(key: string) {
  const id = current!.byKey[key].id;
  const rows = await current!.db`
    SELECT id, status, "deliveryFee", "quoteSource", "billingCheckedAt", "billingReviewState",
           "completedAt", "createdAt"
      FROM "requests" WHERE id = ${id}`;
  return rows[0] as Record<string, unknown>;
}

describe("canSetManualFee: где вообще можно указать цену", () => {
  it("разрешает выполненную заявку", () => {
    expect(canSetManualFee({ status: "completed", billingReviewState: null })).toBe(true);
    expect(manualFeeError({ status: "completed", billingReviewState: null })).toBeNull();
  });

  it("разрешает отменённую/незавершённую только после решения менеджера", () => {
    for (const state of ["requires_clarification", "completed_confirmed", "not_billable", "cancelled_confirmed"]) {
      expect(canSetManualFee({ status: "cancelled", billingReviewState: state })).toBe(true);
      expect(canSetManualFee({ status: "pending", billingReviewState: state })).toBe(true);
    }
  });

  it("запрещает нетронутую отменённую/незавершённую заявку", () => {
    expect(canSetManualFee({ status: "cancelled", billingReviewState: null })).toBe(false);
    expect(canSetManualFee({ status: "pending", billingReviewState: null })).toBe(false);
    expect(canSetManualFee({ status: "in_progress", billingReviewState: null })).toBe(false);

    const message = manualFeeError({ status: "cancelled", billingReviewState: null });
    expect(message).toContain("решения по отменённой");
  });
});

describe("ручная стоимость заявки", () => {
  it("C. менеджер ставит цену → deliveryFee сохранён, quoteSource = manual_fee", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, checked: false, date: "2026-08-17" }],
    });

    await applyManualFee(current.byKey.a.id, 1234.56);

    const row = await requestRow("a");
    expect(Number(row.deliveryFee)).toBe(1234.56);
    expect(row.quoteSource).toBe("manual_fee");
    expect(row.billingCheckedAt).toBeNull();

    // Overview: заявка получила цену и перешла в состояние проверки.
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const reviewRow = overview.rows.find((r) => Number(r.request.id) === current!.byKey.a.id)!;
    expect(reviewRow.amount).toBe(1234.56);
    expect(reviewRow.state).toBe("ready");
    expect(reviewRow.issue).toBe("Ожидает проверки стоимости");
    expect(overview.pricedAmount).toBe(1234.56);
    expect(overview.readiness.blockers.join(" | ")).not.toContain("без рассчитанной стоимости");
  });

  it("D. цена 0 сохраняется и не превращается в «нет стоимости»", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, checked: false, date: "2026-08-17" }],
    });

    await applyManualFee(current.byKey.a.id, 0);

    const row = await requestRow("a");
    expect(Number(row.deliveryFee)).toBe(0);
    expect(String(row.deliveryFee)).toBe("0.00");
    expect(row.quoteSource).toBe("manual_fee");

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const reviewRow = overview.rows.find((r) => Number(r.request.id) === current!.byKey.a.id)!;
    // 0 — это цена, а не её отсутствие: заявка ждёт проверки, а не «без стоимости».
    expect(reviewRow.amount).toBe(0);
    expect(reviewRow.state).toBe("ready");
    expect(reviewRow.state).not.toBe("unpriced");
    expect(overview.counts.unpriced).toBe(0);
  });

  it("E. отрицательная стоимость отклоняется", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, checked: false, date: "2026-08-17" }],
    });

    await expect(applyManualFee(current.byKey.a.id, -1)).rejects.toThrow("не меньше нуля");
    await expect(applyManualFee(current.byKey.a.id, Number.NaN)).rejects.toThrow("не меньше нуля");

    const row = await requestRow("a");
    expect(row.deliveryFee).toBeNull();
    expect(row.quoteSource).toBeNull();
  });

  it("F. ручная цена не меняет тариф клиента", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, checked: false, date: "2026-08-17" }],
    });

    const before = (await current.db`SELECT * FROM "clientTariffs" WHERE "clientId" = ${current.clientId}`)[0];
    await applyManualFee(current.byKey.a.id, 999);
    const after = (await current.db`SELECT * FROM "clientTariffs" WHERE "clientId" = ${current.clientId}`)[0];

    expect(after.deliveryFirstPlace).toBe(before.deliveryFirstPlace);
    expect(after.deliveryNextPlace).toBe(before.deliveryNextPlace);
    expect(after.transportCompanyFirstPlace).toBe(before.transportCompanyFirstPlace);
    expect(after.otherFirstPlace).toBe(before.otherFirstPlace);
  });

  it("F2. ручная цена не пересчитывает другие заявки периода", async () => {
    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 1, checked: false, date: "2026-08-17" },
        { key: "b", status: "completed", placesCount: 2, checked: false, date: "2026-08-18" },
      ],
    });

    await applyManualFee(current.byKey.a.id, 500);

    const other = await requestRow("b");
    expect(other.deliveryFee).toBeNull();
    expect(other.quoteSource).toBeNull();
  });

  it("G. ручная цена не перетирается автоматическим тарифным расчётом", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 3, checked: false, date: "2026-08-17" }],
    });

    await applyManualFee(current.byKey.a.id, 111);

    // Повторный автоматический расчёт (тариф дал бы 1100) обязан пропустить заявку.
    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("manual");

    const row = await requestRow("a");
    expect(Number(row.deliveryFee)).toBe(111);
    expect(row.quoteSource).toBe("manual_fee");
  });

  it("G2. цена 0 тоже защищена от автопересчёта", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 2, checked: false, date: "2026-08-17" }],
    });

    await applyManualFee(current.byKey.a.id, 0);
    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);

    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("manual");
    expect(Number((await requestRow("a")).deliveryFee)).toBe(0);
  });

  it("менеджер может поставить цену после решения по отменённой заявке", async () => {
    current = await seed({
      requests: [{
        key: "d",
        status: "cancelled",
        placesCount: 1,
        date: "2026-08-20",
        reviewState: "requires_clarification",
      }],
    });

    await applyManualFee(current.byKey.d.id, 350);

    const row = await requestRow("d");
    expect(Number(row.deliveryFee)).toBe(350);
    expect(row.quoteSource).toBe("manual_fee");
    // solved decision остаётся за менеджером: цена его не переписывает
    expect(row.billingReviewState).toBe("requires_clarification");
  });

  it("цена не меняется у заявки, включённой в выставленный документ", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" }],
    });
    await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");

    await expect(applyManualFee(current.byKey.a.id, 5)).rejects.toThrow(MANUAL_FEE_BILLED_ERROR);
    expect(Number((await requestRow("a")).deliveryFee)).toBe(1100);
  });

  it("смена цены снимает отметку проверки, чтобы сумму проверили заново", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, deliveryFee: 400, checked: true, date: "2026-08-17" }],
    });

    await applyManualFee(current.byKey.a.id, 450);

    const row = await requestRow("a");
    expect(Number(row.deliveryFee)).toBe(450);
    expect(row.billingCheckedAt).toBeNull();

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.counts.checked).toBe(0);
    expect(overview.counts.ready).toBe(1);
    expect(overview.checkedAmount).toBe(0);
  });

  it("markManualPrice не трогает саму сумму, только происхождение", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, deliveryFee: 777, checked: false, date: "2026-08-17" }],
    });

    await markManualPrice(current.byKey.a.id);

    const row = await requestRow("a");
    expect(Number(row.deliveryFee)).toBe(777);
    expect(row.quoteSource).toBe("manual_fee");
  });
});

describe("overview отдаёт данные, нужные UI сверки", () => {
  it("даты и quoteSource приходят для отменённой заявки", async () => {
    current = await seed({
      requests: [{ key: "d", status: "cancelled", placesCount: 1, date: "2026-08-20" }],
    });

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.d.id)!;

    expect(row.request.createdAt).toBeTruthy();
    expect(row.request.completedAt).toBeNull();
    expect(row.request.quoteSource).toBeNull();
    expect(row.state).toBe("decision_needed");
  });
});
