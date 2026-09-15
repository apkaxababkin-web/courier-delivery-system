/**
 * End-to-end tests of the client financial cycle against a real PostgreSQL
 * database (created and dropped by tests/helpers/testDb.ts).
 *
 * Covered chain: период → сверка всех заявок → решения менеджера → проверка
 * стоимости → предпросмотр → выставление комплекта (счёт/акт/реестр) →
 * оплата → подтверждение оплаты → аннулирование, plus the regression checks for
 * duplicate billing, snapshots, manual prices and cancelled/unfinished requests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";

import {
  activeBillingMembership,
  applyReviewDecision,
  billableRows,
  buildClientBillingOverview,
  clientDocumentAddress,
  clientDocumentName,
  isResolvedForDocuments,
  loadClientPeriodRequests,
  missingClientRequisites,
  requestStatusLabel,
} from "../server/_core/billingReview";
import {
  billingDocumentsDirectory,
  documentHistory,
  getDocument,
  releaseDocumentRequests,
  issueDocumentSet,
  listDocuments,
  previewDocumentSet,
  renderPreviewFile,
  setDocumentPaid,
  voidDocument,
  attachDocumentFile,
  deleteDocumentFile,
  findDocumentFile,
} from "../server/_core/billingDocumentService";
import { loadDocumentSettings, missingExecutorRequisites, saveDocumentSettings } from "../server/_core/documentSettings";
import { applyQuoteForRequest, quoteRequest } from "../server/_core/requestQuote";
import { detectFileKind, safeFileName } from "../server/_core/billingRoutes";
import { buildDocumentSetData } from "../server/_core/billingDocumentData";
import { amountInWordsRu, formatDateRu, formatMoney } from "../shared/billing-format";
import { addClientWithCheckedRequest, close, COMPLETE_SETTINGS, PERIOD_FROM, PERIOD_TO, seed, type SeedResult } from "./helpers/billingSeed";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n", "latin1");

let current: SeedResult | null = null;

afterEach(async () => {
  if (current) {
    await close(current.db);
    current = null;
  }
});

describe("сверка периода: состояния заявок", () => {
  it("классифицирует выполненные, непроверенные, отменённые и незавершённые заявки", async () => {
    current = await seed();
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);

    expect(overview.rows).toHaveLength(5);
    const stateOf = (key: string) => overview.rows.find((r) => Number(r.request.id) === current!.byKey[key].id)!.state;

    expect(stateOf("a")).toBe("checked");
    expect(stateOf("b")).toBe("checked");
    expect(stateOf("c")).toBe("ready");
    expect(stateOf("d")).toBe("decision_needed");
    expect(stateOf("e")).toBe("decision_needed");

    expect(overview.counts).toMatchObject({
      total: 5,
      completed: 3,
      unfinished: 1,
      cancelled: 1,
      checked: 2,
      ready: 1,
      unpriced: 0,
      decisionNeeded: 2,
      billed: 0,
    });
    expect(overview.checkedAmount).toBe(1800);
    expect(overview.pricedAmount).toBe(2600);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.blockers.join(" | ")).toContain("ожидает проверки стоимости");
    expect(overview.readiness.blockers.join(" | ")).toContain("без решения");
  });

  it("считает период по completedAt, а для незавершённых — по createdAt", async () => {
    current = await seed();
    const rows = await loadClientPeriodRequests(current.clientId, "2026-08-20", "2026-08-20");
    expect(rows.map((r) => Number(r.id))).toEqual([current.byKey.d.id]);
  });

  it("не включает в периоды заявки другого клиента", async () => {
    current = await seed();
    const other = await current.db`
      INSERT INTO "clients" ("name","address") VALUES ('Другой клиент','адрес') RETURNING id`;
    await current.db`
      INSERT INTO "requests" ("createdByUserId","requestType","status","clientId","placesCount","deliveryFee","billingCheckedAt","createdAt","completedAt")
      VALUES (1,'delivery'::request_type,'completed'::request_status,${Number(other[0].id)},1,999,now(),'2026-08-17T09:00:00Z','2026-08-17T18:00:00Z')`;

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.rows).toHaveLength(5);
    expect(overview.checkedAmount).toBe(1800);
  });

  it("не придумывает стоимость, когда тариф не настроен, и показывает причину", async () => {
    current = await seed({ tariff: { deliveryFirstPlace: 0, deliveryNextPlace: 0 } });
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.c.id)!;
    expect(row.state).toBe("ready");
    expect(row.issue).toBe("Ожидает проверки стоимости");
    expect(overview.counts.unpriced).toBe(0);
  });

  it("помечает completed без стоимости как unpriced и объясняет причину", async () => {
    current = await seed({
      requests: [{ key: "x", requestType: "delivery", status: "completed", placesCount: 2, date: "2026-08-17" }],
    });
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.rows[0].state).toBe("unpriced");
    expect(overview.rows[0].issue).toBe("Стоимость ещё не рассчитана");
    expect(overview.readiness.blockers.join(" | ")).toContain("без рассчитанной стоимости");
  });

  it("объясняет отсутствие тарифной карточки отдельно", async () => {
    current = await seed({ tariff: null });
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.c.id)!;
    expect(row.state).toBe("ready"); // у c уже есть сохранённая стоимость
    const quote = await quoteRequest({ clientId: current.clientId, requestType: "delivery", placesCount: 2 });
    expect(quote.ok).toBe(false);
    if (!quote.ok) expect(quote.reason).toBe("no_tariff");
  });
});

describe("решения менеджера по отменённым и незавершённым заявкам", () => {
  it("подтверждённая отмена делает заявку неплатежной и не блокирует период", async () => {
    current = await seed();
    await applyReviewDecision(current.byKey.d.id, "confirm_cancelled", "Клиент отменил заявку");

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.d.id)!;
    expect(row.state).toBe("decided_not_billable");
    expect(row.blocking).toBe(false);
    expect(row.reviewState).toBe("cancelled_confirmed");
    expect(row.reviewNote).toBe("Клиент отменил заявку");
    expect(isResolvedForDocuments(row)).toBe(true);
    expect(overview.counts.notBillable).toBe(1);
  });

  it("отменяет блокировку только когда разобраны ВСЕ заявки периода", async () => {
    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
        { key: "d", status: "cancelled", placesCount: 1, date: "2026-08-20" },
        { key: "e", status: "pending", placesCount: 1, date: "2026-08-21" },
      ],
    });

    await applyReviewDecision(current.byKey.d.id, "confirm_cancelled", "отменена");
    let overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.blockers.join(" | ")).toContain("Отменённых или незавершённых заявок без решения: 1");

    await applyReviewDecision(current.byKey.e.id, "not_billable", "услуга не оказывалась");
    overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.readiness.ready).toBe(true);
    expect(overview.readiness.blockers).toEqual([]);
    expect(billableRows(overview).map((r) => Number(r.request.id))).toEqual([current.byKey.a.id]);
  });

  it("«требует уточнения» продолжает блокировать период и хранит комментарий", async () => {
    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
        { key: "d", status: "cancelled", placesCount: 1, date: "2026-08-20" },
      ],
    });
    await applyReviewDecision(current.byKey.d.id, "requires_clarification", "Уточнить у логиста");

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.d.id)!;
    expect(row.state).toBe("clarification");
    expect(row.blocking).toBe(true);
    expect(row.issue).toBe("Уточнить у логиста");
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.blockers.join(" | ")).toContain("требует уточнения");
  });

  it("«фактически выполнена» проходит обычный путь выполнения: дата, расчёт, проверка", async () => {
    // mark_completed stamps completedAt with "now", so this request lands in the
    // current period — the period the manager resolves it from.
    const today = new Date();
    const monthFrom = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const monthTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: monthFrom },
        { key: "e", status: "pending", requestType: "delivery", placesCount: 2, date: monthTo },
      ],
    });

    await applyReviewDecision(current.byKey.e.id, "mark_completed", "Курьер забыл закрыть заявку");

    const stored = await current.db`
      SELECT status, "completedAt", "deliveryFee", "quoteSource", "quoteCalculatedAt", "billingReviewState"
        FROM "requests" WHERE id = ${current.byKey.e.id}`;
    expect(stored[0].status).toBe("completed");
    expect(stored[0].completedAt).not.toBeNull();
    // 500 + 1 × 300 = 800, рассчитано сервером, а не менеджером вручную
    expect(Number(stored[0].deliveryFee)).toBe(800);
    expect(stored[0].quoteSource).toBe("tariff");
    expect(stored[0].billingReviewState).toBe("completed_confirmed");

    const overview = await buildClientBillingOverview(current.clientId, monthFrom, monthTo);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.e.id)!;
    // Цена уже посчитана сервером, поэтому заявка ждёт обычной проверки стоимости.
    expect(row.state).toBe("ready");
    expect(row.blocking).toBe(true);
    expect(row.amount).toBe(800);

    // После обычной проверки стоимости заявка становится пригодной для документов.
    await current.db`UPDATE "requests" SET "billingCheckedAt" = now() WHERE id = ${current.byKey.e.id}`;
    const after = await buildClientBillingOverview(current.clientId, monthFrom, monthTo);
    const fixed = after.rows.find((r) => Number(r.request.id) === current!.byKey.e.id)!;
    expect(fixed.state).toBe("checked");
    expect(after.checkedAmount).toBe(1900);
  });

  it("«фактически выполнена» без тарифа остаётся заблокированной до ручной цены", async () => {
    const today = new Date();
    const monthFrom = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const monthTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

    current = await seed({
      tariff: null,
      requests: [{ key: "e", status: "pending", requestType: "delivery", placesCount: 2, date: monthTo }],
    });
    await applyReviewDecision(current.byKey.e.id, "mark_completed", "была выполнена");

    let overview = await buildClientBillingOverview(current.clientId, monthFrom, monthTo);
    let row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.e.id)!;
    expect(row.reviewState).toBe("completed_confirmed");
    expect(row.state).toBe("unpriced");
    expect(row.issue).toBe("У клиента нет тарифной карточки");
    expect(overview.readiness.ready).toBe(false);

    // Менеджер проставляет цену вручную и проверяет её — обычный путь.
    await current.db`UPDATE "requests" SET "deliveryFee" = 950, "quoteSource" = 'manual_fee' WHERE id = ${current.byKey.e.id}`;
    overview = await buildClientBillingOverview(current.clientId, monthFrom, monthTo);
    row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.e.id)!;
    expect(row.state).toBe("ready");

    await current.db`UPDATE "requests" SET "billingCheckedAt" = now() WHERE id = ${current.byKey.e.id}`;
    overview = await buildClientBillingOverview(current.clientId, monthFrom, monthTo);
    row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.e.id)!;
    expect(row.state).toBe("checked");
    expect(overview.checkedAmount).toBe(950);
  });

  it("снятие решения возвращает заявку в «нужно решение»", async () => {
    current = await seed();
    await applyReviewDecision(current.byKey.d.id, "confirm_cancelled", "отменена");
    await applyReviewDecision(current.byKey.d.id, "reset", null);

    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows.find((r) => Number(r.request.id) === current!.byKey.d.id)!;
    expect(row.state).toBe("decision_needed");
    expect(row.reviewState).toBeNull();
    expect(row.reviewNote).toBeNull();
  });

  it("отказывается менять решение по заявке, уже включённой в счёт", async () => {
    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
      ],
    });
    await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");

    await expect(applyReviewDecision(current.byKey.a.id, "not_billable", "поздно"))
      .rejects.toThrow("уже включена в выставленный документ");
  });

  it("не даёт отметить уже выполненную заявку как выполненную повторно", async () => {
    current = await seed();
    await expect(applyReviewDecision(current.byKey.a.id, "mark_completed", null))
      .rejects.toThrow("уже выполнена");
  });

  it("сообщает о несуществующей заявке", async () => {
    current = await seed();
    await expect(applyReviewDecision(999_999, "confirm_cancelled", null)).rejects.toThrow("Заявка не найдена");
  });
});

describe("требования к реквизитам", () => {
  it("период не готов, пока не заполнены наши реквизиты", async () => {
    current = await seed();
    await current.db`UPDATE "billingSettings" SET "bankBik" = NULL, "bankAccount" = NULL`;
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.executorGaps.map((g) => g.field).sort()).toEqual(["bankAccount", "bankBik"]);
  });

  it("период не готов, пока не заполнены реквизиты клиента", async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
    ] });
    // legalAddress is empty but the working "address" is filled, so only the INN
    // is reported — the address is still printable.
    await current.db`UPDATE "clients" SET "inn" = NULL, "legalAddress" = NULL WHERE id = ${current.clientId}`;
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.clientGaps.map((g) => g.field)).toEqual(["inn"]);
  });

  it("жалуется, когда за период нет ни одной заявки", async () => {
    current = await seed({ requests: [] });
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.blockers).toEqual(["За выбранный период у клиента нет заявок"]);
  });

  it("берёт для документов юридическое имя и адрес, если они заполнены", async () => {
    current = await seed();
    const overview = await buildClientBillingOverview(current.clientId, PERIOD_FROM, PERIOD_TO);
    const row = overview.rows[0];
    expect(row.statusLabel).toBe("Выполнена");
    expect(requestStatusLabel("cancelled")).toBe("Отменена");

    const settings = await loadDocumentSettings();
    expect(missingExecutorRequisites(settings)).toEqual([]);
    expect(clientDocumentName({ id: 1, name: "Кратко", legalName: "ООО «Полное»", inn: "1", kpp: null, ogrn: null, legalAddress: null, postalAddress: null, address: "ул.", phone: null, email: null }))
      .toBe("ООО «Полное»");
    expect(clientDocumentAddress({ id: 1, name: "Кратко", legalName: null, inn: "1", kpp: null, ogrn: null, legalAddress: null, postalAddress: null, address: "ул. Адрес", phone: null, email: null }))
      .toBe("ул. Адрес");
    expect(missingClientRequisites(null)).toEqual([{ field: "clientId", label: "Клиент не найден" }]);
  });
});

describe("предпросмотр", () => {
  beforeEach(async () => {
    current = await seed({
      requests: [
        { key: "a", requestType: "delivery", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
        { key: "b", requestType: "movement", status: "completed", placesCount: 1, deliveryFee: 700, checked: true, date: "2026-08-18" },
      ],
    });
  });

  it("показывает номер, дату, период, количество и сумму, ничего не создавая", async () => {
    const preview = await previewDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-01");

    expect(preview.ready).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.number).toBe("1");
    expect(preview.documentDateIso).toBe("2026-09-01");
    expect(preview.documentDateText).toBe("01.09.2026");
    expect(preview.periodText).toBe("16.08.2026–31.08.2026");
    expect(preview.requestsCount).toBe(2);
    expect(preview.totalPlaces).toBe(4);
    expect(preview.totalAmount).toBe(1800);
    expect(preview.totalAmountText).toBe("1\u00A0800,00");
    expect(preview.amountInWords).toBe(amountInWordsRu(1800));
    expect(preview.vatRateText).toBe("Без НДС");
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0].name).toBe("Курьерские услуги за август 2026 г.");

    const documents = await current!.db`SELECT count(*)::int AS n FROM "billingDocuments"`;
    expect(documents[0].n).toBe(0);
    const settings = await current!.db`SELECT "nextDocumentNumber" FROM "billingSettings"`;
    expect(settings[0].nextDocumentNumber).toBe(1);
    expect(fs.existsSync(path.join(billingDocumentsDirectory(), "1"))).toBe(false);
  });

  it("показывает причины неготовности вместо документов", async () => {
    current = await seed({
      requests: [
        { key: "a", status: "completed", placesCount: 1, deliveryFee: 500, date: "2026-08-17" },
        { key: "d", status: "cancelled", placesCount: 1, date: "2026-08-20" },
      ],
    });
    const preview = await previewDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-01");
    expect(preview.ready).toBe(false);
    expect(preview.blockers.join(" | ")).toContain("ожидает проверки стоимости");
    expect(preview.blockers.join(" | ")).toContain("без решения");
    expect(preview.requestsCount).toBe(0);
    expect(preview.totalAmount).toBe(0);
  });

  it("отдаёт предпросмотр счёта, акта и реестра без сохранения файлов", async () => {
    const invoice = await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "invoice", "2026-09-01");
    const act = await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "act", "2026-09-01");
    const registry = await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "registry", "2026-09-01");

    expect(invoice.contentType).toBe("application/pdf");
    expect(invoice.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(act.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(registry.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(invoice.fileName).toContain("Счет_1_2026-09-01");
    expect(registry.fileName).toContain("Реестр_1_2026-09-01");

    const documents = await current!.db`SELECT count(*)::int AS n FROM "billingDocuments"`;
    expect(documents[0].n).toBe(0);
  });

  it("отказывается строить файлы, когда нет проверенных заявок", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, deliveryFee: 500, date: "2026-08-17" }],
    });
    await expect(renderPreviewFile(current.clientId, PERIOD_FROM, PERIOD_TO, "invoice"))
      .rejects.toThrow("Нет проверенных заявок");
  });

  it("показывает, что именно мешает выставить документы пустому клиенту", async () => {
    current = await seed({
      legalName: null,
      inn: null,
      legalAddress: null,
      requests: [{ key: "a", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-17" }],
    });
    await current.db`UPDATE "clients" SET name = '', address = '' WHERE id = ${current.clientId}`;
    const preview = await previewDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-01");
    expect(preview.ready).toBe(false);
    expect(preview.blockers.join(" | ")).toContain("Наименование клиента");
    expect(preview.blockers.join(" | ")).toContain("ИНН клиента");
    expect(preview.blockers.join(" | ")).toContain("Юридический адрес клиента");
    expect(preview.requestsCount).toBe(1);
  });
});

describe("выставление комплекта документов", () => {
  beforeEach(async () => {
    current = await seed({
      requests: [
        { key: "a", requestType: "delivery", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17", comments: "Срочно" },
        { key: "b", requestType: "movement", status: "completed", placesCount: 1, deliveryFee: 700, checked: true, date: "2026-08-18" },
        { key: "d", status: "cancelled", placesCount: 1, reviewState: "cancelled_confirmed", date: "2026-08-20" },
      ],
    });
  });

  it("создаёт счёт, акт и реестр из проверенных заявок и связывает их с заявками", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");

    expect(issued.number).toBe("1");
    expect(issued.documentDateText).toBe("01.09.2026");
    expect(issued.requestsCount).toBe(2);
    expect(issued.totalAmount).toBe(1800);
    expect(issued.totals.invoiceTotal).toBe(1800);
    expect(issued.totals.actTotal).toBe(1800);
    expect(issued.totals.registryTotal).toBe(1800);
    expect(issued.totals.linesTotal).toBe(1800);

    for (const file of [issued.invoiceFile, issued.actFile, issued.registryFile]) {
      const absolute = path.resolve(process.cwd(), file);
      expect(fs.existsSync(absolute)).toBe(true);
      expect(fs.statSync(absolute).size).toBeGreaterThan(1000);
    }
    expect(fs.readFileSync(path.resolve(process.cwd(), issued.invoiceFile)).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const links = await current!.db`
      SELECT "requestId", amount FROM "billingDocumentRequests" WHERE "billingDocumentId" = ${issued.id} ORDER BY "requestId"`;
    expect(links.map((l) => Number(l.requestId)).sort((x, y) => x - y))
      .toEqual([current!.byKey.a.id, current!.byKey.b.id].sort((x, y) => x - y));
    expect(links.map((l) => Number(l.amount)).sort((x, y) => x - y)).toEqual([700, 1100]);

    const settings = await current!.db`SELECT "nextDocumentNumber" FROM "billingSettings"`;
    expect(settings[0].nextDocumentNumber).toBe(2);
  });

  it("выделяет номера последовательно: №1, №2, №3 без пересечений", async () => {
    current = await seed({ requests: [] });

    // Три разных клиента, у каждого своя проверенная заявка за тот же период.
    const issued: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const clientId = await addClientWithCheckedRequest(current.db, `ООО «Счёт ${i + 1}»`, { deliveryFee: 500 });
      const document = await issueDocumentSet(clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");
      issued.push(document.number);
    }

    expect(issued).toEqual(["1", "2", "3"]);
    expect(new Set(issued).size).toBe(3);

    const settings = await current.db`SELECT "nextDocumentNumber" FROM "billingSettings"`;
    expect(settings[0].nextDocumentNumber).toBe(4);
  });

  it("префикс из настроек попадает в номер", async () => {
    await saveDocumentSettings({ documentNumberPrefix: "МИГ-" });
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    expect(issued.number).toBe("МИГ-1");
  });

  it("не даёт выставить один и тот же период дважды (защита от повторного счёта)", async () => {
    await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await expect(issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01"))
      .rejects.toThrow();

    const documents = await current!.db`SELECT count(*)::int AS n FROM "billingDocuments"`;
    expect(documents[0].n).toBe(1);

    const overview = await buildClientBillingOverview(current!.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.counts.billed).toBe(2);
    expect(overview.checkedAmount).toBe(0);
    expect(overview.readiness.ready).toBe(false);
    expect(overview.readiness.blockers.join(" | ")).toContain("Нет проверенных выполненных заявок");
  });

  it("база данных не позволяет привязать одну заявку к двум активным документам", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const other = await current!.db`
      INSERT INTO "billingDocuments" ("number","clientId","documentDate","periodFrom","periodTo","requestsCount","totalAmount","status","serviceDescription","clientNameSnapshot","clientInnSnapshot",
        "clientKppSnapshot","clientAddressSnapshot","executorNameSnapshot","executorInnSnapshot",
        "executorKppSnapshot","executorAddressSnapshot","bankNameSnapshot","bankBikSnapshot",
        "bankAccountSnapshot","bankCorrespondentAccountSnapshot","vatModeSnapshot","vatTextSnapshot","createdByManagerId")
      VALUES ('99', ${current!.clientId}, '2026-09-02', ${PERIOD_FROM}, ${PERIOD_TO}, 1, 1, 'issued', 'Тест', 'Клиент', '0000000000',
        '', 'адрес', 'ООО «МИГ»', '7701234567', '', 'адрес', 'Банк', '044525225', '40702810900000012345', '30101810400000000225', 'without_vat', 'Без НДС', ${current!.managerId}) RETURNING id`;

    await expect(current!.db`
      INSERT INTO "billingDocumentRequests" ("billingDocumentId","requestId","amount")
      VALUES (${Number(other[0].id)}, ${current!.byKey.a.id}, 1100)`)
      .rejects.toThrow();

    expect(issued.id).toBeGreaterThan(0);
  });

  it("выпускает несколько комплектов параллельно без повторных номеров", async () => {
    // Three independent clients issue a document at the same time. The number is
    // allocated with an atomic UPDATE ... RETURNING, so no two sets may share one.
    current = await seed({ requests: [] });

    // Three independent clients, each with its own verified request.
    const clients: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      clients.push(await addClientWithCheckedRequest(current.db, `ООО «Параллель ${i + 1}»`, { deliveryFee: 500 }));
    }

    const issued = await Promise.all(clients.map((clientId) =>
      issueDocumentSet(clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01")
        .then((document) => document.number)));

    expect(new Set(issued).size).toBe(3);
    expect(issued.slice().sort()).toEqual(["1", "2", "3"]);
  });

  it("снимок документа не меняется после правки реквизитов и тарифов", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");

    await saveDocumentSettings({
      executorName: 'ООО «Другое имя»',
      bankBik: "999999999",
      vatMode: "vat",
      vatRate: 20,
      vatText: "НДС 20%",
    });
    await current!.db`UPDATE "clientTariffs" SET "deliveryFirstPlace" = 9999 WHERE "clientId" = ${current!.clientId}`;

    const stored = await getDocument(issued.id);
    expect(stored).not.toBeNull();
    const raw = await current!.db`SELECT * FROM "billingDocuments" WHERE id = ${issued.id}`;
    const row = raw[0];
    expect(Number(row.totalAmount)).toBe(1800);
    expect(row.executorNameSnapshot).toBe(COMPLETE_SETTINGS.executorName);
    expect(row.bankBikSnapshot).toBe(COMPLETE_SETTINGS.bankBik);
    expect(row.vatModeSnapshot).toBe("without_vat");
    expect(row.vatRateSnapshot).toBe("0.00");
    expect(row.vatAmountSnapshot).toBeNull();
    expect(row.vatTextSnapshot).toBe("Без НДС");
    expect(row.serviceNameSnapshot).toBe("Курьерские услуги за август 2026 г.");
    expect(row.periodTextSnapshot).toBe("16.08.2026–31.08.2026");
    expect(row.clientNameSnapshot).toBe("ООО «Клиент Тест»");
    expect(row.directorNameSnapshot).toBe(COMPLETE_SETTINGS.directorName);
    expect(row.generatedAt).not.toBeNull();
    expect(row.documentDateText).toBe("01.09.2026");
  });

  it("НДС, заложенный в сумму, попадает в снимок документа", async () => {
    await saveDocumentSettings({ vatMode: "vat", vatRate: 20, vatText: "НДС 20%" });
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const raw = await current!.db`SELECT * FROM "billingDocuments" WHERE id = ${issued.id}`;
    expect(raw[0].vatModeSnapshot).toBe("vat");
    expect(Number(raw[0].vatRateSnapshot)).toBe(20);
    expect(Number(raw[0].vatAmountSnapshot)).toBe(300);
    expect(Number(raw[0].totalAmount)).toBe(1800);
  });

  it("отменённые и незавершённые заявки не попадают в документы", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const links = await current!.db`
      SELECT "requestId" FROM "billingDocumentRequests" WHERE "billingDocumentId" = ${issued.id}`;
    const linked = links.map((l) => Number(l.requestId));
    expect(linked).not.toContain(current!.byKey.d.id);
    expect(issued.requestsCount).toBe(2);
  });
});

describe("перевыставление после аннулирования", () => {
  beforeEach(async () => {
    current = await seed({
      requests: [
        { key: "a", requestType: "delivery", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
        { key: "b", requestType: "movement", status: "completed", placesCount: 1, deliveryFee: 700, checked: true, date: "2026-08-18" },
      ],
    });
  });

  it("аннулированный документ сохраняется, заявки освобождаются и попадают в новый", async () => {
    const original = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const originalAmount = original.totalAmount;

    await voidDocument(original.id, current!.managerId, "Неверная сумма");

    // Пока заявки не освобождены, повторно выставить их нельзя.
    await expect(issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01"))
      .rejects.toThrow("удерживается другими документами");

    const released = await releaseDocumentRequests(original.id, current!.managerId, "Перевыставляем корректной суммой");
    expect(released.releasedRequestIds.sort((x, y) => x - y))
      .toEqual([current!.byKey.a.id, current!.byKey.b.id].sort((x, y) => x - y));

    // Старый документ остался в истории целиком: номер, сумма, состав.
    const stored = await getDocument(original.id);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.number).toBe("1");
    expect(stored?.totalAmount).toBe(originalAmount);
    expect(stored?.requestsCount).toBe(2);
    expect(stored?.activeRequestsCount).toBe(0);
    expect(stored?.requestsReleased).toBe(true);
    const composition = await current!.db`
      SELECT "requestId", "amount", "active", "releasedAt", "releasedByManagerId", "releaseNote"
        FROM "billingDocumentRequests" WHERE "billingDocumentId" = ${original.id} ORDER BY "requestId"`;
    expect(composition).toHaveLength(2);
    expect(composition.every((row) => row.active === false)).toBe(true);
    expect(composition.every((row) => row.releasedAt !== null)).toBe(true);
    expect(composition[0].releaseNote).toBe("Перевыставляем корректной суммой");

    // Новый документ вместо аннулированного.
    const replacement = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, {
      documentDateIso: "2026-09-02",
      replacesDocumentId: original.id,
    });
    expect(replacement.number).toBe("2");
    expect(replacement.replacesDocumentId).toBe(original.id);
    expect(replacement.totalAmount).toBe(originalAmount);

    // Новая активная привязка существует, старая — нет.
    const links = await current!.db`
      SELECT "billingDocumentId", "requestId", "active"
        FROM "billingDocumentRequests" ORDER BY "billingDocumentId", "requestId"`;
    const active = links.filter((row) => row.active === true);
    expect(active).toHaveLength(2);
    expect(active.every((row) => Number(row.billingDocumentId) === replacement.id)).toBe(true);
    expect(links.filter((row) => row.active === false)).toHaveLength(2);

    // Двойное активное включение невозможно.
    const other = await current!.db`
      INSERT INTO "billingDocuments" ("number","clientId","documentDate","periodFrom","periodTo","requestsCount",
        "totalAmount","status","serviceDescription","clientNameSnapshot","clientInnSnapshot","clientKppSnapshot",
        "clientAddressSnapshot","executorNameSnapshot","executorInnSnapshot","executorKppSnapshot",
        "executorAddressSnapshot","bankNameSnapshot","bankBikSnapshot","bankAccountSnapshot",
        "bankCorrespondentAccountSnapshot","vatModeSnapshot","vatTextSnapshot","createdByManagerId")
      VALUES ('99', ${current!.clientId}, '2026-09-03', ${PERIOD_FROM}, ${PERIOD_TO}, 1, 1, 'issued', 'Тест', 'Клиент',
        '7709876543', '', 'адрес', 'ООО «МИГ»', '7701234567', '', 'адрес', 'Банк', '044525225',
        '40702810900000012345', '30101810400000000225', 'without_vat', 'Без НДС', ${current!.managerId}) RETURNING id`;
    await expect(current!.db`
      INSERT INTO "billingDocumentRequests" ("billingDocumentId","requestId","amount","active")
      VALUES (${Number(other[0].id)}, ${current!.byKey.a.id}, 1100, true)`)
      .rejects.toThrow();

    // Сверка видит заявки как выставленные, а не как свободные.
    const overview = await buildClientBillingOverview(current!.clientId, PERIOD_FROM, PERIOD_TO);
    expect(overview.counts.billed).toBe(2);
    expect(overview.readiness.ready).toBe(false);
  });

  it("освобождённая заявка снова считается невыставленной", async () => {
    const { isRequestBilled, billedRequestIdSet } = await import("../server/_core/requestQuote");
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const requestId = current!.byKey.a.id;

    expect(await isRequestBilled(requestId)).toBe(true);
    expect([...(await billedRequestIdSet([requestId, current!.byKey.b.id]))].sort()).toEqual(
      [requestId, current!.byKey.b.id].sort(),
    );

    await voidDocument(issued.id, current!.managerId, "ошибка");
    // Аннулирование само по себе ещё держит заявки.
    expect(await isRequestBilled(requestId)).toBe(true);

    await releaseDocumentRequests(issued.id, current!.managerId, "перевыставляем");
    expect(await isRequestBilled(requestId)).toBe(false);
    expect((await billedRequestIdSet([requestId, current!.byKey.b.id])).size).toBe(0);

    // После освобождения заявку можно рассчитать заново обычным путём.
    await current!.db`UPDATE "requests" SET "billingCheckedAt" = NULL WHERE id = ${requestId}`;
    const request = (await current!.db`SELECT * FROM "requests" WHERE id = ${requestId}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("calculated");
    expect(outcome.amount).toBe(1100);
  });

  it("пишет audit trail: кто аннулировал, когда, причина и какой документ заменил", async () => {
    const original = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await voidDocument(original.id, current!.managerId, "Ошибка в реквизитах");
    await releaseDocumentRequests(original.id, current!.managerId, "Готовим замену");
    const replacement = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, {
      documentDateIso: "2026-09-02",
      replacesDocumentId: original.id,
    });

    const history = await documentHistory(original.id);
    expect(history.map((entry) => entry.kind)).toEqual([
      "issued", "voided", "requests_released", "replaced_by",
    ]);
    const voided = history.find((entry) => entry.kind === "voided")!;
    expect(voided.managerId).toBe(current!.managerId);
    expect(voided.managerName).toBe("Тестовый менеджер");
    expect(voided.note).toBe("Ошибка в реквизитах");
    expect(new Date(voided.createdAt).getTime()).toBeGreaterThan(0);

    const released = history.find((entry) => entry.kind === "requests_released")!;
    expect(released.note).toBe("Готовим замену");
    expect((released.details as { releasedCount: number }).releasedCount).toBe(2);

    const replaced = history.find((entry) => entry.kind === "replaced_by")!;
    expect((replaced.details as { replacedByDocumentId: number }).replacedByDocumentId).toBe(replacement.id);
    expect((replaced.details as { replacedByNumber: string }).replacedByNumber).toBe("2");

    const replacementHistory = await documentHistory(replacement.id);
    expect(replacementHistory.map((entry) => entry.kind)).toEqual(["reissued"]);
    expect((replacementHistory[0].details as { replacesDocumentId: number }).replacesDocumentId).toBe(original.id);
  });

  it("нельзя освободить заявки действующего или оплаченного документа", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await expect(releaseDocumentRequests(issued.id, current!.managerId, null))
      .rejects.toThrow("только у аннулированного");

    await setDocumentPaid(issued.id, current!.managerId, true, null);
    await expect(releaseDocumentRequests(issued.id, current!.managerId, null))
      .rejects.toThrow("оплаченного");
  });

  it("повторное освобождение ничего не меняет", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await voidDocument(issued.id, current!.managerId, "ошибка");
    const first = await releaseDocumentRequests(issued.id, current!.managerId, "первый раз");
    const second = await releaseDocumentRequests(issued.id, current!.managerId, "второй раз");
    expect(first.releasedRequestIds).toHaveLength(2);
    expect(second.releasedRequestIds).toEqual([]);
  });

  it("показывает предпросмотру, какие заявки удерживаются старым документом", async () => {
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await voidDocument(issued.id, current!.managerId, "ошибка");

    const preview = await previewDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-02");
    expect(preview.ready).toBe(false);
    expect(preview.blockedRequestIds.sort((x, y) => x - y))
      .toEqual([current!.byKey.a.id, current!.byKey.b.id].sort((x, y) => x - y));
    expect(preview.blockingDocuments).toEqual([
      { documentId: issued.id, number: "1", status: "cancelled", documentDate: "2026-09-01" },
    ]);
    expect(preview.blockers.join(" | ")).toContain("удерживается другими документами: 2");

    await releaseDocumentRequests(issued.id, current!.managerId, "возврат");
    const after = await previewDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-02");
    expect(after.ready).toBe(true);
    expect(after.blockedRequestIds).toEqual([]);
    expect(after.blockingDocuments).toEqual([]);
  });
});

describe("реквизиты клиента: ОГРН и почтовый адрес", () => {
  it("попадают в snapshot документа и не обязательны для выставления", async () => {
    current = await seed({
      ogrn: "1157746123456",
      postalAddress: "127000, г. Москва, а/я 12",
      requests: [{ key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" }],
    });

    const issued = await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");
    const raw = await current.db`SELECT * FROM "billingDocuments" WHERE id = ${issued.id}`;
    expect(raw[0].clientOgrnSnapshot).toBe("1157746123456");
    expect(raw[0].clientPostalAddressSnapshot).toBe("127000, г. Москва, а/я 12");
    expect(raw[0].clientAddressSnapshot).toBe("127000, г. Москва, а/я 12");

    // Смена реквизитов после выставления не переписывает документ.
    await current.db`UPDATE "clients" SET "ogrn" = '9999999999999', "postalAddress" = 'другой' WHERE id = ${current.clientId}`;
    const after = await current.db`SELECT * FROM "billingDocuments" WHERE id = ${issued.id}`;
    expect(after[0].clientOgrnSnapshot).toBe("1157746123456");
    expect(after[0].clientPostalAddressSnapshot).toBe("127000, г. Москва, а/я 12");
  });

  it("выставляется и без ОГРН с почтовым адресом", async () => {
    current = await seed({
      requests: [{ key: "a", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-17" }],
    });
    const preview = await previewDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, "2026-09-01");
    expect(preview.ready).toBe(true);

    const issued = await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");
    const raw = await current.db`SELECT * FROM "billingDocuments" WHERE id = ${issued.id}`;
    expect(raw[0].clientOgrnSnapshot).toBeNull();
    expect(raw[0].clientPostalAddressSnapshot).toBe("г. Москва, ул. Клиентская, д. 7");
  });

  it("карточка клиента отдаёт ОГРН и почтовый адрес и обновляется через API", async () => {
    current = await seed({ ogrn: "1234567890123", postalAddress: "а/я 1" });
    const { loadClientRequisites } = await import("../server/_core/billingReview");
    const requisites = await loadClientRequisites(current.clientId);
    expect(requisites?.ogrn).toBe("1234567890123");
    expect(requisites?.postalAddress).toBe("а/я 1");

    await current.db`UPDATE "clients" SET "ogrn" = NULL, "postalAddress" = NULL WHERE id = ${current.clientId}`;
    const cleared = await loadClientRequisites(current.clientId);
    expect(cleared?.ogrn).toBeNull();
    expect(cleared?.postalAddress).toBeNull();
  });
});

describe("жизненный цикл документа: оплата и аннулирование", () => {
  let documentId = 0;

  beforeEach(async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-17" },
    ] });
    const issued = await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");
    documentId = issued.id;
  });

  it("отмечает оплату и сохраняет, кто и когда её подтвердил", async () => {
    await setDocumentPaid(documentId, current!.managerId, true, "Платёжное поручение №12");
    const document = await getDocument(documentId);
    expect(document?.status).toBe("paid");
    expect(document?.paidByManagerId).toBe(current!.managerId);
    expect(document?.paidAt).not.toBeNull();
    expect(document?.paymentComment).toBe("Платёжное поручение №12");

    await setDocumentPaid(documentId, current!.managerId, false, null);
    const reverted = await getDocument(documentId);
    expect(reverted?.status).toBe("issued");
    expect(reverted?.paidAt).toBeNull();
  });

  it("аннулирует документ и сохраняет причину, не удаляя запись", async () => {
    await voidDocument(documentId, current!.managerId, "Ошибка в сумме");
    const document = await getDocument(documentId);
    expect(document?.status).toBe("cancelled");
    expect(document?.voidReason).toBe("Ошибка в сумме");
    expect(document?.voidedAt).not.toBeNull();

    const stillThere = await current!.db`SELECT count(*)::int AS n FROM "billingDocuments" WHERE id = ${documentId}`;
    expect(stillThere[0].n).toBe(1);
  });

  it("не аннулирует оплаченный документ", async () => {
    await setDocumentPaid(documentId, current!.managerId, true, null);
    await expect(voidDocument(documentId, current!.managerId, "поздно")).rejects.toThrow("оплаченный");
  });

  it("не оплачивает аннулированный документ", async () => {
    await voidDocument(documentId, current!.managerId, "ошибка");
    await expect(setDocumentPaid(documentId, current!.managerId, true, null)).rejects.toThrow("аннулирован");
  });

  it("список документов показывает заявки, сумму и отметки жизненного цикла", async () => {
    const list = await listDocuments({ clientId: current!.clientId });
    expect(list).toHaveLength(1);
    expect(list[0].number).toBe("1");
    expect(list[0].requestsCount).toBe(1);
    expect(list[0].totalAmount).toBe(500);
    expect(list[0].status).toBe("issued");
    expect(list[0].clientName).toBe("Клиент «Тест»");
    expect(list[0].paymentProofs).toEqual([]);
  });
});

describe("подтверждение оплаты (файлы)", () => {
  let documentId = 0;

  beforeEach(async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-17" },
    ] });
    documentId = (await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01")).id;
  });

  it("принимает PDF, JPEG и PNG и отклоняет подделку расширения", () => {
    expect(detectFileKind(PDF_BYTES)).toEqual({ mime: "application/pdf", ext: ".pdf" });
    expect(detectFileKind(JPEG_BYTES)).toEqual({ mime: "image/jpeg", ext: ".jpg" });
    expect(detectFileKind(PNG_BYTES)).toEqual({ mime: "image/png", ext: ".png" });
    expect(detectFileKind(Buffer.from("MZ\x90\x00 это не картинка"))).toBeNull();
    expect(detectFileKind(Buffer.from("GIF89a"))).toBeNull();
    expect(detectFileKind(Buffer.alloc(0))).toBeNull();
  });

  it("очищает имя файла от путей и управляющих символов", () => {
    expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(safeFileName("счёт\u0000.pdf")).toBe("счёт.pdf");
    expect(safeFileName("")).toBe("file");
    expect(safeFileName(undefined)).toBe("file");
    expect(safeFileName("x".repeat(500))).toHaveLength(200);
  });

  it("прикрепляет подтверждение оплаты к документу и находит его", async () => {
    const storedName = "proof-1.pdf";
    const file = await attachDocumentFile({
      documentId,
      kind: "payment_proof",
      originalName: "Платёжка №12.pdf",
      storedName,
      fileUrl: path.join("uploads", "billing-documents", String(documentId), storedName),
      mimeType: "application/pdf",
      sizeBytes: PDF_BYTES.byteLength,
      managerId: current!.managerId,
    });

    const document = await getDocument(documentId);
    expect(document?.paymentProofs).toHaveLength(1);
    expect(document?.paymentProofs[0].originalName).toBe("Платёжка №12.pdf");

    const found = await findDocumentFile(file.id);
    expect(found?.billingDocumentId).toBe(documentId);
    expect(found?.storedName).toBe(storedName);
  });

  it("удаляет подтверждение оплаты и его файл", async () => {
    const absolute = path.join(billingDocumentsDirectory(), String(documentId), "proof-2.pdf");
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, PNG_BYTES);

    const file = await attachDocumentFile({
      documentId,
      kind: "payment_proof",
      originalName: "proof.png",
      storedName: "proof-2.pdf",
      fileUrl: path.join("uploads", "billing-documents", String(documentId), "proof-2.pdf"),
      mimeType: "image/png",
      sizeBytes: PNG_BYTES.byteLength,
      managerId: null,
    });

    expect(await deleteDocumentFile(file.id)).toBe(true);
    expect(await findDocumentFile(file.id)).toBeNull();
    expect(fs.existsSync(absolute)).toBe(false);

    const document = await getDocument(documentId);
    expect(document?.paymentProofs).toEqual([]);
  });

  it("не прикрепляет файл к несуществующему документу", async () => {
    await expect(attachDocumentFile({
      documentId: 987_654,
      kind: "payment_proof",
      originalName: "x.pdf",
      storedName: "x.pdf",
      fileUrl: "uploads/x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      managerId: null,
    })).rejects.toThrow("Документ не найден");
  });
});

describe("ручная стоимость", () => {
  it("пересчёт не перетирает стоимость, выставленную менеджером вручную", async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 1, deliveryFee: 1234.56, checked: false, date: "2026-08-17" },
    ] });
    await current.db`
      UPDATE "requests" SET "quoteSource" = 'manual_fee', "quoteCalculatedAt" = NULL
       WHERE id = ${current.byKey.a.id}`;

    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("manual");

    const stored = await current.db`SELECT "deliveryFee" FROM "requests" WHERE id = ${current.byKey.a.id}`;
    expect(Number(stored[0].deliveryFee)).toBe(1234.56);
  });

  it("не пересчитывает уже проверенную стоимость", async () => {
    current = await seed();
    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("checked");
  });

  it("не пересчитывает заявку, уже включённую в счёт", async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
    ] });
    await issueDocumentSet(current.clientId, PERIOD_FROM, PERIOD_TO, current.managerId, "2026-09-01");
    await current.db`UPDATE "requests" SET "billingCheckedAt" = NULL WHERE id = ${current.byKey.a.id}`;

    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("billed");
  });

  it("не рассчитывает незавершённую заявку", async () => {
    current = await seed();
    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.e.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("skipped");
    expect(outcome.preserved).toBe("not_completed");
  });

  it("рассчитывает выполненную заявку по тарифу клиента", async () => {
    current = await seed({ requests: [
      { key: "a", status: "completed", placesCount: 4, date: "2026-08-17" },
    ] });
    const request = (await current.db`SELECT * FROM "requests" WHERE id = ${current.byKey.a.id}`)[0];
    const outcome = await applyQuoteForRequest(request as never);
    expect(outcome.status).toBe("calculated");
    expect(outcome.amount).toBe(1400);

    const stored = await current.db`SELECT "deliveryFee","quoteSource","quoteCalculatedAt" FROM "requests" WHERE id = ${current.byKey.a.id}`;
    expect(Number(stored[0].deliveryFee)).toBe(1400);
    expect(stored[0].quoteSource).toBe("tariff");
    expect(stored[0].quoteCalculatedAt).not.toBeNull();
  });
});

describe("настройки документов", () => {
  it("создаёт строку настроек при первом обращении и запрещает пустой набор реквизитов", async () => {
    current = await seed({ withoutSettings: true });
    const settings = await loadDocumentSettings();
    expect(settings.vatMode).toBe("without_vat");
    expect(settings.nextDocumentNumber).toBe(1);
    expect(missingExecutorRequisites(settings).map((g) => g.field)).toContain("executorName");
  });

  it("отклоняет недопустимый режим НДС и отрицательную ставку", async () => {
    current = await seed();
    await expect(saveDocumentSettings({ vatMode: "magic" as never })).rejects.toThrow();
    await expect(saveDocumentSettings({ vatRate: -5 })).rejects.toThrow();
    await expect(saveDocumentSettings({ nextDocumentNumber: 0 })).rejects.toThrow();
  });

  it("сохраняет частичное обновление и не трогает остальные поля", async () => {
    current = await seed();
    await saveDocumentSettings({ executorShortName: 'ООО «МИГ» (кратко)' });
    const settings = await loadDocumentSettings();
    expect(settings.executorShortName).toBe('ООО «МИГ» (кратко)');
    expect(settings.executorName).toBe(COMPLETE_SETTINGS.executorName);
    expect(settings.bankBik).toBe(COMPLETE_SETTINGS.bankBik);
  });
});

describe("данные комплекта документов", () => {
  it("делает одну строку услуги на весь период и сходится по суммам", async () => {
    const overview = {
      rows: [
        { request: { id: 1, requestType: "delivery", placesCount: 3, completedAt: new Date("2026-08-17T18:00:00Z"), createdAt: new Date("2026-08-17T09:00:00Z"), senderCompany: "Склад", deliveryAddress: "Адрес", comments: "" }, amount: 1100, state: "checked" },
        { request: { id: 2, requestType: "movement", placesCount: 1, completedAt: new Date("2026-08-18T18:00:00Z"), createdAt: new Date("2026-08-18T09:00:00Z"), senderCompany: "Склад", deliveryAddress: "Адрес 2", comments: "Коммент" }, amount: 700, state: "checked" },
      ],
    };
    const data = buildDocumentSetData({
      number: "7",
      documentDateIso: "2026-09-01",
      periodFrom: PERIOD_FROM,
      periodTo: PERIOD_TO,
      settings: { ...(await loadDocumentSettings()) },
      client: { id: 1, name: "ООО «Клиент Тест»", legalName: "ООО «Клиент Тест»", inn: "7709876543", kpp: "770901001", ogrn: null, legalAddress: "г. Москва, ул. Клиентская, д. 7", postalAddress: null, address: null, phone: null, email: null },
      rows: overview.rows as never,
    });

    expect(data.registry).toHaveLength(2);
    expect(data.registry[0].position).toBe(1);
    expect(data.registry[0].dateText).toBe(formatDateRu("2026-08-17"));
    expect(data.registry[1].comment).toBe("Коммент");
    expect(data.totalAmount).toBe(1800);
    expect(data.totalPlaces).toBe(4);
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0].amount).toBe(1800);
    expect(data.amountInWords).toBe(amountInWordsRu(1800));
    expect(formatMoney(data.totalAmount)).toBe("1\u00A0800,00");
    expect(data.buyer.name).toBe("ООО «Клиент Тест»");
  });
});

describe("миграции", () => {
  it("0016 добавляет реквизиты клиента, флаг active, таблицу событий и уникальный индекс", async () => {
    current = await seed();

    const columns = await current.db`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE (table_name = 'clients' AND column_name IN ('ogrn','postalAddress'))
          OR (table_name = 'billingDocuments' AND column_name IN ('replacesDocumentId','clientPostalAddressSnapshot'))
          OR (table_name = 'billingDocumentRequests' AND column_name IN ('active','releaseNote'))
       ORDER BY table_name, column_name`;
    expect(columns.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([
      "billingDocumentRequests.active",
      "billingDocumentRequests.releaseNote",
      "billingDocuments.clientPostalAddressSnapshot",
      "billingDocuments.replacesDocumentId",
      "clients.ogrn",
      "clients.postalAddress",
    ]);

    const events = await current.db`
      SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'billingDocumentEvents'`;
    expect(events[0].n).toBe(1);

    const index = await current.db`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'billingDocumentRequests_active_request_key'`;
    expect(index).toHaveLength(1);
    expect(String(index[0].indexdef)).toContain("UNIQUE");
    expect(String(index[0].indexdef)).toContain("WHERE");
    expect(String(index[0].indexdef)).toContain("active");
  });

  it("0016 можно применять повторно (идемпотентность)", async () => {
    current = await seed();
    const { readMigration } = await import("./helpers/testDb");
    await current.db.unsafe(readMigration("0016_billing_reissue_and_client_ogrn.sql"));

    const columns = await current.db`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'clients' AND column_name IN ('ogrn','postalAddress')`;
    expect(columns[0].n).toBe(2);
  });
});

describe("изоляция тестовой базы", () => {
  it("использует отдельную одноразовую базу, а не рабочую", async () => {
    const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });
    try {
      const me = await sql`SELECT current_database() AS name`;
      expect(String(me[0].name)).toMatch(/_test$/);
    } finally {
      await sql.end();
    }
  });
});
