import { afterEach, describe, expect, it } from "vitest";

import {
  getSuggestedBillingPeriod,
  issueDocumentSet,
  previewDocumentSet,
  renderPreviewFile,
  rollbackDocument,
} from "../server/_core/billingDocumentService";
import {
  addClientWithCheckedRequest,
  close,
  PERIOD_FROM,
  PERIOD_TO,
  seed,
  type SeedResult,
} from "./helpers/billingSeed";

let current: SeedResult | null = null;

afterEach(async () => {
  if (current) {
    await close(current.db);
    current = null;
  }
});

async function makeTransition2026(): Promise<void> {
  if (!current) throw new Error("seed first");

  await current.db`
    UPDATE "billingDocumentNumberSequences"
       SET "nextNumber" = 1,
           "initialized" = false,
           "updatedAt" = now()
     WHERE "year" = 2026`;
}

describe("годовая нумерация документов", () => {
  it("2026: до первого реального выпуска требует начальный номер и preview ничего не резервирует", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });
    await makeTransition2026();

    const preview = await previewDocumentSet(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      "2026-09-01",
    );

    expect(preview.ready).toBe(true);
    expect(preview.numberYear).toBe(2026);
    expect(preview.numberInitializationRequired).toBe(true);
    expect(preview.number).toBe("");

    const sequence = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(Number(sequence[0].nextNumber)).toBe(1);
    expect(sequence[0].initialized).toBe(false);

    await expect(
      issueDocumentSet(
        current.clientId,
        PERIOD_FROM,
        PERIOD_TO,
        current.managerId,
        { documentDateIso: "2026-09-01" },
      ),
    ).rejects.toThrow("укажите начальный номер");
  });

  it("2026: принимает введённый первый номер один раз и дальше увеличивает автоматически", async () => {
    current = await seed({ requests: [] });
    await makeTransition2026();

    const firstClient = await addClientWithCheckedRequest(
      current.db,
      "ООО «Первый 2026»",
      { deliveryFee: 500 },
    );

    const first = await issueDocumentSet(
      firstClient,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      {
        documentDateIso: "2026-09-01",
        firstDocumentNumber: 348,
      },
    );

    expect(first.number).toBe("348");

    const secondClient = await addClientWithCheckedRequest(
      current.db,
      "ООО «Второй 2026»",
      { deliveryFee: 500 },
    );

    const secondPreview = await previewDocumentSet(
      secondClient,
      PERIOD_FROM,
      PERIOD_TO,
      "2026-09-02",
    );

    expect(secondPreview.numberInitializationRequired).toBe(false);
    expect(secondPreview.number).toBe("349");

    const second = await issueDocumentSet(
      secondClient,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      "2026-09-02",
    );

    expect(second.number).toBe("349");

    const sequence = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(sequence[0].initialized).toBe(true);
    expect(Number(sequence[0].nextNumber)).toBe(350);
  });

  it("2026: не разрешает использовать номер, который уже был у отменённого документа", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });

    await current.db`
      INSERT INTO "billingDocuments" (
        "number",
        "clientId",
        "documentDate",
        "periodFrom",
        "periodTo",
        "requestsCount",
        "totalAmount",
        "status",
        "serviceDescription",
        "clientNameSnapshot",
        "clientInnSnapshot",
        "clientAddressSnapshot",
        "executorNameSnapshot",
        "executorInnSnapshot",
        "executorAddressSnapshot",
        "bankNameSnapshot",
        "bankBikSnapshot",
        "bankAccountSnapshot",
        "bankCorrespondentAccountSnapshot",
        "vatModeSnapshot",
        "vatTextSnapshot",
        "createdByManagerId"
      )
      VALUES (
        '1',
        ${current.clientId},
        '2026-01-10',
        '2026-01-01',
        '2026-01-09',
        1,
        1,
        'cancelled',
        'Исторический документ',
        'Клиент',
        '7700000000',
        'адрес',
        'ООО «МИГ»',
        '7701234567',
        'адрес',
        'Банк',
        '044525225',
        '40702810900000012345',
        '30101810400000000225',
        'without_vat',
        'Без НДС',
        ${current.managerId}
      )`;

    await makeTransition2026();

    await expect(
      issueDocumentSet(
        current.clientId,
        PERIOD_FROM,
        PERIOD_TO,
        current.managerId,
        {
          documentDateIso: "2026-09-01",
          firstDocumentNumber: 1,
        },
      ),
    ).rejects.toThrow("уже использовался");

    const sequence = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(Number(sequence[0].nextNumber)).toBe(1);
    expect(sequence[0].initialized).toBe(false);
  });

  it("новый календарный год автоматически начинается с №1, затем №2", async () => {
    current = await seed({ requests: [] });

    const first2027 = await addClientWithCheckedRequest(
      current.db,
      "ООО «2027-1»",
      {
        deliveryFee: 500,
        periodFrom: "2027-01-02",
        periodTo: "2027-01-02",
      },
    );

    const preview = await previewDocumentSet(
      first2027,
      "2027-01-01",
      "2027-01-31",
      "2027-01-31",
    );

    expect(preview.numberYear).toBe(2027);
    expect(preview.numberInitializationRequired).toBe(false);
    expect(preview.number).toBe("1");

    const first = await issueDocumentSet(
      first2027,
      "2027-01-01",
      "2027-01-31",
      current.managerId,
      "2027-01-31",
    );
    expect(first.number).toBe("1");

    const second2027 = await addClientWithCheckedRequest(
      current.db,
      "ООО «2027-2»",
      {
        deliveryFee: 500,
        periodFrom: "2027-01-03",
        periodTo: "2027-01-03",
      },
    );

    const second = await issueDocumentSet(
      second2027,
      "2027-01-01",
      "2027-01-31",
      current.managerId,
      "2027-01-31",
    );
    expect(second.number).toBe("2");
  });

  it("2028 снова начинает нумерацию с №1 независимо от 2027", async () => {
    current = await seed({ requests: [] });

    const client2027 = await addClientWithCheckedRequest(
      current.db,
      "ООО «Конец 2027»",
      {
        deliveryFee: 500,
        periodFrom: "2027-12-20",
        periodTo: "2027-12-20",
      },
    );

    const doc2027 = await issueDocumentSet(
      client2027,
      "2027-12-01",
      "2027-12-31",
      current.managerId,
      "2027-12-31",
    );
    expect(doc2027.number).toBe("1");

    const client2028 = await addClientWithCheckedRequest(
      current.db,
      "ООО «Начало 2028»",
      {
        deliveryFee: 500,
        periodFrom: "2028-01-02",
        periodTo: "2028-01-02",
      },
    );

    const doc2028 = await issueDocumentSet(
      client2028,
      "2028-01-01",
      "2028-01-31",
      current.managerId,
      "2028-01-31",
    );

    expect(doc2028.number).toBe("1");

    const rows = await current.db`
      SELECT "year", "nextNumber"
        FROM "billingDocumentNumberSequences"
       WHERE "year" IN (2027, 2028)
       ORDER BY "year"`;

    expect(rows.map((r) => [Number(r.year), Number(r.nextNumber)]))
      .toEqual([[2027, 2], [2028, 2]]);
  });

  it("откат документа не возвращает его номер в последовательность", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });

    const original = await issueDocumentSet(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      "2026-09-01",
    );
    expect(original.number).toBe("1");

    await rollbackDocument(
      original.id,
      current.managerId,
      "Проверка невозврата номера",
    );

    const sequence = await current.db`
      SELECT "nextNumber"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(Number(sequence[0].nextNumber)).toBe(2);

    const nextClient = await addClientWithCheckedRequest(
      current.db,
      "ООО «После отката»",
      { deliveryFee: 500 },
    );

    const next = await issueDocumentSet(
      nextClient,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      "2026-09-02",
    );

    expect(next.number).toBe("2");
  });
});

describe("автоматическое предложение следующего периода", () => {
  it("без истории клиента не предлагает период", async () => {
    current = await seed({ requests: [] });

    const suggestion = await getSuggestedBillingPeriod(current.clientId);
    expect(suggestion).toEqual({
      lastPeriodFrom: null,
      lastPeriodTo: null,
      nextDateFrom: null,
      lastDocumentNumber: null,
    });
  });

  it("после выставленного периода предлагает следующий день", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });

    await issueDocumentSet(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      "2026-09-01",
    );

    const suggestion = await getSuggestedBillingPeriod(current.clientId);

    expect(suggestion).not.toBeNull();
    expect(suggestion!.lastPeriodFrom).toBe(PERIOD_FROM);
    expect(suggestion!.lastPeriodTo).toBe(PERIOD_TO);
    expect(suggestion!.nextDateFrom).toBe("2026-09-01");
  });

  it("откаченный документ не определяет следующий период", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });

    const issued = await issueDocumentSet(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      current.managerId,
      "2026-09-01",
    );

    await rollbackDocument(
      issued.id,
      current.managerId,
      "Проверка автопериода",
    );

    const suggestion = await getSuggestedBillingPeriod(current.clientId);
    expect(suggestion).toEqual({
      lastPeriodFrom: null,
      lastPeriodTo: null,
      nextDateFrom: null,
      lastDocumentNumber: null,
    });
  });
});
describe("предпросмотр с годовой нумерацией", () => {
  it("2026: PDF preview использует введённый первый номер 348 и не резервирует его", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });
    await makeTransition2026();

    const before = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    const file = await renderPreviewFile(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      "invoice",
      "2026-09-01",
      348,
    );

    expect(file.contentType).toBe("application/pdf");
    expect(file.fileName).toContain("Счет_348_");
    expect(file.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const after = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(Number(after[0].nextNumber)).toBe(Number(before[0].nextNumber));
    expect(after[0].initialized).toBe(before[0].initialized);
    expect(Number(after[0].nextNumber)).toBe(1);
    expect(after[0].initialized).toBe(false);

    const docs = await current.db`
      SELECT count(*)::int AS c
        FROM "billingDocuments"`;

    expect(Number(docs[0].c)).toBe(0);
  });

  it("2027: первый PDF preview автоматически использует №1 и не создаёт sequence", async () => {
    current = await seed({ requests: [] });

    const client2027 = await addClientWithCheckedRequest(
      current.db,
      "ООО «PDF 2027»",
      {
        deliveryFee: 500,
        periodFrom: "2027-01-05",
        periodTo: "2027-01-05",
      },
    );

    const before = await current.db`
      SELECT count(*)::int AS c
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2027`;

    expect(Number(before[0].c)).toBe(0);

    const file = await renderPreviewFile(
      client2027,
      "2027-01-01",
      "2027-01-31",
      "invoice",
      "2027-01-31",
    );

    expect(file.contentType).toBe("application/pdf");
    expect(file.fileName).toContain("Счет_1_");
    expect(file.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const after = await current.db`
      SELECT count(*)::int AS c
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2027`;

    expect(Number(after[0].c)).toBe(0);
  });

  it("2026: Excel-сверка строится без начального номера и не инициализирует sequence", async () => {
    current = await seed({
      requests: [
        {
          key: "a",
          status: "completed",
          placesCount: 1,
          deliveryFee: 500,
          checked: true,
          date: "2026-08-17",
        },
      ],
    });
    await makeTransition2026();

    const file = await renderPreviewFile(
      current.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      "registry",
      "2026-09-01",
    );

    expect(file.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(file.fileName).toContain("Сверка_");
    expect(file.buffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const sequence = await current.db`
      SELECT "nextNumber", "initialized"
        FROM "billingDocumentNumberSequences"
       WHERE "year" = 2026`;

    expect(Number(sequence[0].nextNumber)).toBe(1);
    expect(sequence[0].initialized).toBe(false);
  });
});
