import { afterEach, describe, expect, it } from "vitest";
import { close, seed, type SeedResult } from "./helpers/billingSeed";
import { quoteClientRequests } from "../server/_core/requestQuote";
import {
  previewSmartTariffSelection,
  updateSmartTariff,
} from "../server/_core/smartTariffs";

let current: SeedResult | null = null;

afterEach(async () => {
  if (current) {
    await close(current.db);
    current = null;
  }
});

describe("smart tariff safe repricing", () => {
  it("reprices only an eligible automatic amount and preserves manual, checked and billed requests", async () => {
    current = await seed({
      tariff: {
        deliveryFirstPlace: 500,
        deliveryNextPlace: 100,
      },
      requests: [
        {
          key: "automatic",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 600,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "manual",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 1234,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "checked",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 888,
          checked: true,
          date: "2026-09-14",
        },
        {
          key: "billed",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 999,
          checked: false,
          date: "2026-09-14",
        },
      ],
    });

    const db = current.db;

    // Make the first two rows explicit representations of their source.
    // automatic: previously calculated by tariff engine.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now()
       WHERE id = ${current.byKey.automatic.id}
    `;

    // manual: manager-entered amount must never be overwritten by safe reprice.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'manual_fee',
             "quoteCalculatedAt" = NULL
       WHERE id = ${current.byKey.manual.id}
    `;

    // checked: even though its source is automatic, manager verification freezes it.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now()
       WHERE id = ${current.byKey.checked.id}
    `;

    // billed: active document membership freezes it independently of checked state.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now()
       WHERE id = ${current.byKey.billed.id}
    `;

    const docRows = await db`
      INSERT INTO "billingDocuments" (
        "number","clientId","documentDate","periodFrom","periodTo",
        "requestsCount","totalAmount","status","serviceDescription",
        "clientNameSnapshot","clientInnSnapshot","clientKppSnapshot",
        "clientAddressSnapshot","executorNameSnapshot","executorInnSnapshot",
        "executorKppSnapshot","executorAddressSnapshot",
        "bankNameSnapshot","bankBikSnapshot","bankAccountSnapshot",
        "bankCorrespondentAccountSnapshot","vatModeSnapshot","vatTextSnapshot",
        "createdByManagerId"
      )
      VALUES (
        '9999', ${current.clientId}, '2026-09-15',
        '2026-09-01', '2026-09-30',
        1, 999, 'issued', 'Тест smart-тарифа',
        'Клиент', '7709876543', '',
        'адрес', 'ООО «МИГ»', '7701234567',
        '', 'адрес',
        'Банк', '044525225', '40702810900000012345',
        '30101810400000000225', 'without_vat', 'Без НДС',
        ${current.managerId}
      )
      RETURNING id
    `;
    const billingDocumentId = Number(docRows[0].id);

    await db`
      INSERT INTO "billingDocumentRequests"
        ("billingDocumentId","requestId","amount","active")
      VALUES
        (${billingDocumentId}, ${current.byKey.billed.id}, 999, true)
    `;

    // Add a more specific smart rule for the seeded route.
    // Base tariff = 500 + 100 = 600.
    // Smart tariff = 700 + 200 = 900.
    await db`
      INSERT INTO "clientTariffRules"
        ("clientId","name","requestType",
         "fromAddressNormalized","toAddressNormalized",
         "weekdays","firstPlacePrice","nextPlacePrice",
         "priority","isActive","createdByManagerId")
      VALUES
        (${current.clientId},
         'Тестовый smart-тариф',
         'delivery',
         'г москва ул откуда д 1',
         'г москва ул куда д 2',
         NULL,
         700,
         200,
         10,
         true,
         ${current.managerId})
    `;

    const outcomes = await quoteClientRequests(current.clientId, {
      from: "2026-09-01",
      to: "2026-09-30",
      repriceAutomatic: true,
    });

    const rows = await db`
      SELECT
        id,
        "deliveryFee",
        "quoteSource",
        "quoteCalculatedAt",
        "quoteTariffRuleId",
        "quoteTariffSnapshot",
        "billingCheckedAt"
      FROM "requests"
      WHERE id IN (
        ${current.byKey.automatic.id},
        ${current.byKey.manual.id},
        ${current.byKey.checked.id},
        ${current.byKey.billed.id}
      )
      ORDER BY id
    `;

    const byId = new Map(rows.map((row) => [Number(row.id), row]));

    const automatic = byId.get(current.byKey.automatic.id)!;
    const manual = byId.get(current.byKey.manual.id)!;
    const checked = byId.get(current.byKey.checked.id)!;
    const billed = byId.get(current.byKey.billed.id)!;

    // Eligible automatic quote changes to the smart rule.
    expect(Number(automatic.deliveryFee)).toBe(900);
    expect(automatic.quoteSource).toBe("tariff");
    expect(automatic.quoteTariffRuleId).not.toBeNull();
    expect(automatic.quoteTariffSnapshot).not.toBeNull();

    const snapshot = JSON.parse(String(automatic.quoteTariffSnapshot));
    expect(snapshot.name).toBe("Тестовый smart-тариф");
    expect(snapshot.firstPlacePrice).toBe(700);
    expect(snapshot.nextPlacePrice).toBe(200);

    // Manual amount is frozen.
    expect(Number(manual.deliveryFee)).toBe(1234);
    expect(manual.quoteSource).toBe("manual_fee");
    expect(manual.quoteTariffRuleId).toBeNull();
    expect(manual.quoteTariffSnapshot).toBeNull();

    // Manager-checked amount is frozen.
    expect(Number(checked.deliveryFee)).toBe(888);
    expect(checked.billingCheckedAt).not.toBeNull();

    // Active billing membership freezes the amount.
    expect(Number(billed.deliveryFee)).toBe(999);

    const outcomeById = new Map(
      outcomes.map((outcome) => [outcome.requestId, outcome]),
    );

    expect(outcomeById.get(current.byKey.automatic.id)?.status).toBe("calculated");
    expect(outcomeById.get(current.byKey.manual.id)?.status).toBe("skipped");
    expect(outcomeById.get(current.byKey.checked.id)?.status).toBe("skipped");
    expect(outcomeById.get(current.byKey.billed.id)?.status).toBe("skipped");
  });

  it("targeted repricing changes only requests won by the newly created smart rule", async () => {
    current = await seed({
      tariff: {
        deliveryFirstPlace: 500,
        deliveryNextPlace: 100,
      },
      requests: [
        {
          key: "matching",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 600,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "other_route",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 777,
          checked: false,
          date: "2026-09-14",
        },
      ],
    });

    const db = current.db;

    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now()
       WHERE id IN (
         ${current.byKey.matching.id},
         ${current.byKey.other_route.id}
       )
    `;

    // Move the second request to another destination. It remains an automatic
    // tariff amount, but must not be touched by a rule for the seeded route.
    await db`
      UPDATE "requests"
         SET "deliveryAddress" = 'г. Москва, ул. Совсем Другая, д. 99'
       WHERE id = ${current.byKey.other_route.id}
    `;

    const inserted = await db`
      INSERT INTO "clientTariffRules"
        ("clientId","name","requestType",
         "fromAddressNormalized","toAddressNormalized",
         "weekdays","firstPlacePrice","nextPlacePrice",
         "priority","isActive","createdByManagerId")
      VALUES
        (${current.clientId},
         'Только выбранный маршрут',
         'delivery',
         'г москва ул откуда д 1',
         'г москва ул куда д 2',
         NULL,
         700,
         200,
         10,
         true,
         ${current.managerId})
      RETURNING id
    `;

    const ruleId = Number(inserted[0].id);

    const outcomes = await quoteClientRequests(current.clientId, {
      from: "2026-09-01",
      to: "2026-09-30",
      repriceAutomatic: true,
      onlyTariffRuleId: ruleId,
    });

    const rows = await db`
      SELECT
        id,
        "deliveryFee",
        "quoteSource",
        "quoteTariffRuleId",
        "quoteTariffSnapshot"
      FROM "requests"
      WHERE id IN (
        ${current.byKey.matching.id},
        ${current.byKey.other_route.id}
      )
    `;

    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const matching = byId.get(current.byKey.matching.id)!;
    const other = byId.get(current.byKey.other_route.id)!;

    // Matching route receives the new smart tariff: 700 + 200 = 900.
    expect(Number(matching.deliveryFee)).toBe(900);
    expect(Number(matching.quoteTariffRuleId)).toBe(ruleId);
    expect(matching.quoteTariffSnapshot).not.toBeNull();

    // Unrelated automatic route is preserved byte-for-byte financially.
    expect(Number(other.deliveryFee)).toBe(777);
    expect(other.quoteSource).toBe("tariff");
    expect(other.quoteTariffRuleId).toBeNull();
    expect(other.quoteTariffSnapshot).toBeNull();

    const outcomeById = new Map(
      outcomes.map((outcome) => [outcome.requestId, outcome]),
    );

    expect(outcomeById.get(current.byKey.matching.id)?.status).toBe("calculated");
    expect(outcomeById.get(current.byKey.other_route.id)?.status).toBe("skipped");
    expect(outcomeById.get(current.byKey.other_route.id)?.preserved)
      .toBe("different_tariff_rule");
  });


  it("preview counts matching, eligible and financially protected requests", async () => {
    current = await seed({
      tariff: {
        deliveryFirstPlace: 500,
        deliveryNextPlace: 100,
      },
      requests: [
        {
          key: "selected",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 600,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "eligible",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 600,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "manual",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 1234,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "checked",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 888,
          checked: true,
          date: "2026-09-14",
        },
        {
          key: "billed",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 999,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "other_route",
          requestType: "delivery",
          status: "completed",
          placesCount: 2,
          deliveryFee: 777,
          checked: false,
          date: "2026-09-14",
        },
      ],
    });

    const db = current.db;

    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now()
       WHERE id IN (
         ${current.byKey.selected.id},
         ${current.byKey.eligible.id},
         ${current.byKey.checked.id},
         ${current.byKey.billed.id},
         ${current.byKey.other_route.id}
       )
    `;

    await db`
      UPDATE "requests"
         SET "quoteSource" = 'manual_fee',
             "quoteCalculatedAt" = NULL
       WHERE id = ${current.byKey.manual.id}
    `;

    await db`
      UPDATE "requests"
         SET "deliveryAddress" = 'г. Москва, ул. Другой Маршрут, д. 50'
       WHERE id = ${current.byKey.other_route.id}
    `;

    const docRows = await db`
      INSERT INTO "billingDocuments" (
        "number","clientId","documentDate","periodFrom","periodTo",
        "requestsCount","totalAmount","status","serviceDescription",
        "clientNameSnapshot","clientInnSnapshot","clientKppSnapshot",
        "clientAddressSnapshot","executorNameSnapshot","executorInnSnapshot",
        "executorKppSnapshot","executorAddressSnapshot",
        "bankNameSnapshot","bankBikSnapshot","bankAccountSnapshot",
        "bankCorrespondentAccountSnapshot","vatModeSnapshot","vatTextSnapshot",
        "createdByManagerId"
      )
      VALUES (
        '9998', ${current.clientId}, '2026-09-15',
        '2026-09-01', '2026-09-30',
        1, 999, 'issued', 'Тест preview smart-тарифа',
        'Клиент', '7709876543', '',
        'адрес', 'ООО «МИГ»', '7701234567',
        '', 'адрес',
        'Банк', '044525225', '40702810900000012345',
        '30101810400000000225', 'without_vat', 'Без НДС',
        ${current.managerId}
      )
      RETURNING id
    `;

    await db`
      INSERT INTO "billingDocumentRequests"
        ("billingDocumentId","requestId","amount","active")
      VALUES
        (${Number(docRows[0].id)}, ${current.byKey.billed.id}, 999, true)
    `;

    const preview = await previewSmartTariffSelection(
      current.clientId,
      [current.byKey.selected.id],
    );

    expect(preview.selectedCount).toBe(1);

    // Five requests share the exact route/type:
    // selected + eligible + manual + checked + billed.
    // The other_route request must not be counted.
    expect(preview.matchedCount).toBe(5);

    // selected and eligible are automatic and mutable.
    expect(preview.eligibleCount).toBe(2);

    // manual + checked + billed are financially protected.
    expect(preview.protectedCount).toBe(3);

    expect(preview.matchedCount)
      .toBe(preview.eligibleCount + preview.protectedCount);

    // All seeded requests use 2026-09-14, which is Monday (ISO weekday 1).
    expect(preview.eligibleByWeekday[1]).toBe(2);
    expect(preview.protectedByWeekday[1]).toBe(3);

    expect(
      Object.values(preview.eligibleByWeekday)
        .reduce((sum, count) => sum + count, 0),
    ).toBe(preview.eligibleCount);

    expect(
      Object.values(preview.protectedByWeekday)
        .reduce((sum, count) => sum + count, 0),
    ).toBe(preview.protectedCount);
  });


  it("editing a smart tariff reprices eligible automatic requests and preserves protected amounts", async () => {
    current = await seed({
      tariff: {
        deliveryFirstPlace: 500,
        deliveryNextPlace: 100,
      },
      requests: [
        {
          key: "automatic",
          requestType: "delivery",
          status: "completed",
          placesCount: 1,
          deliveryFee: 600,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "manual",
          requestType: "delivery",
          status: "completed",
          placesCount: 1,
          deliveryFee: 1234,
          checked: false,
          date: "2026-09-14",
        },
        {
          key: "checked",
          requestType: "delivery",
          status: "completed",
          placesCount: 1,
          deliveryFee: 888,
          checked: true,
          date: "2026-09-14",
        },
        {
          key: "billed",
          requestType: "delivery",
          status: "completed",
          placesCount: 1,
          deliveryFee: 999,
          checked: false,
          date: "2026-09-14",
        },
      ],
    });

    const db = current.db;

    // Same exact route for all four requests.
    await db`
      UPDATE "requests"
         SET "senderAddress" = 'Ключевая 1',
             "deliveryAddress" = 'Аэропорт'
       WHERE id IN (
         ${current.byKey.automatic.id},
         ${current.byKey.manual.id},
         ${current.byKey.checked.id},
         ${current.byKey.billed.id}
       )
    `;

    const insertedRule = await db`
      INSERT INTO "clientTariffRules" (
        "clientId",
        "name",
        "requestType",
        "fromAddressNormalized",
        "toAddressNormalized",
        "weekdays",
        "firstPlacePrice",
        "nextPlacePrice",
        "priority",
        "isActive"
      )
      VALUES (
        ${current.clientId},
        'Старый тариф',
        'delivery',
        'ключевая 1',
        'аэропорт',
        NULL,
        600.00,
        100.00,
        10,
        true
      )
      RETURNING id
    `;

    const ruleId = Number(insertedRule[0].id);

    const oldSnapshot = JSON.stringify({
      version: 1,
      ruleId,
      firstPlacePrice: 600,
      nextPlacePrice: 100,
    });

    // Automatic price may be safely recalculated.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now(),
             "quoteTariffRuleId" = ${ruleId},
             "quoteTariffSnapshot" = ${oldSnapshot}
       WHERE id = ${current.byKey.automatic.id}
    `;

    // Manual amount must never be overwritten.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'manual_fee',
             "quoteCalculatedAt" = NULL,
             "quoteTariffRuleId" = NULL,
             "quoteTariffSnapshot" = NULL
       WHERE id = ${current.byKey.manual.id}
    `;

    // Checked automatic amount is frozen.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now(),
             "quoteTariffRuleId" = ${ruleId},
             "quoteTariffSnapshot" = ${oldSnapshot}
       WHERE id = ${current.byKey.checked.id}
    `;

    // Billed automatic amount is frozen by active document membership.
    await db`
      UPDATE "requests"
         SET "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now(),
             "quoteTariffRuleId" = ${ruleId},
             "quoteTariffSnapshot" = ${oldSnapshot}
       WHERE id = ${current.byKey.billed.id}
    `;

    const documentRows = await db`
      INSERT INTO "billingDocuments" (
        "number","clientId","documentDate","periodFrom","periodTo",
        "requestsCount","totalAmount","status","serviceDescription",
        "clientNameSnapshot","clientInnSnapshot","clientKppSnapshot",
        "clientAddressSnapshot","executorNameSnapshot","executorInnSnapshot",
        "executorKppSnapshot","executorAddressSnapshot",
        "bankNameSnapshot","bankBikSnapshot","bankAccountSnapshot",
        "bankCorrespondentAccountSnapshot","vatModeSnapshot","vatTextSnapshot",
        "createdByManagerId"
      )
      VALUES (
        '900001', ${current.clientId}, '2026-09-14',
        '2026-09-14', '2026-09-14',
        1, 999, 'issued', 'Test smart tariff edit protection',
        'Клиент', '7709876543', '',
        'адрес', 'ООО «МИГ»', '7701234567',
        '', 'адрес',
        'Банк', '044525225', '40702810900000012345',
        '30101810400000000225', 'without_vat', 'Без НДС',
        ${current.managerId}
      )
      RETURNING id
    `;

    await db`
      INSERT INTO "billingDocumentRequests"
        ("billingDocumentId","requestId","amount","active")
      VALUES
        (
          ${Number(documentRows[0].id)},
          ${current.byKey.billed.id},
          999,
          true
        )
    `;

    const result = await updateSmartTariff({
      clientId: current.clientId,
      ruleId,
      name: "Новый тариф",
      firstPlacePrice: 950,
      nextPlacePrice: 150,
      weekdays: [1, 2, 3, 4, 5],
      priority: 20,
      applyExisting: true,
    });

    expect(result.rule.name).toBe("Новый тариф");
    expect(Number(result.rule.firstPlacePrice)).toBe(950);
    expect(Number(result.rule.nextPlacePrice)).toBe(150);
    expect(result.rule.weekdays).toBe("1,2,3,4,5");
    expect(result.rule.priority).toBe(20);

    const rows = await db`
      SELECT
        id,
        "deliveryFee",
        "quoteSource",
        "quoteTariffRuleId",
        "quoteTariffSnapshot"
      FROM "requests"
      WHERE id IN (
        ${current.byKey.automatic.id},
        ${current.byKey.manual.id},
        ${current.byKey.checked.id},
        ${current.byKey.billed.id}
      )
      ORDER BY id
    `;

    const byId = new Map(
      rows.map((row: any) => [Number(row.id), row]),
    );

    const automatic = byId.get(current.byKey.automatic.id);
    const manual = byId.get(current.byKey.manual.id);
    const checked = byId.get(current.byKey.checked.id);
    const billed = byId.get(current.byKey.billed.id);

    expect(Number(automatic.deliveryFee)).toBe(950);
    expect(automatic.quoteSource).toBe("tariff");
    expect(Number(automatic.quoteTariffRuleId)).toBe(ruleId);
    expect(automatic.quoteTariffSnapshot).not.toBe(oldSnapshot);

    const newSnapshot = JSON.parse(
      String(automatic.quoteTariffSnapshot),
    );

    expect(newSnapshot.ruleId).toBe(ruleId);
    expect(Number(newSnapshot.firstPlacePrice)).toBe(950);
    expect(Number(newSnapshot.nextPlacePrice)).toBe(150);

    expect(Number(manual.deliveryFee)).toBe(1234);
    expect(manual.quoteSource).toBe("manual_fee");

    expect(Number(checked.deliveryFee)).toBe(888);
    expect(checked.quoteTariffSnapshot).toBe(oldSnapshot);

    expect(Number(billed.deliveryFee)).toBe(999);
    expect(billed.quoteTariffSnapshot).toBe(oldSnapshot);

    expect(result.recalculation).not.toBeNull();
    expect(result.recalculation!.calculated).toBe(1);
  });


  it("editing tariff weekdays removes stale weekend smart price and falls back safely", async () => {
    current = await seed({
      tariff: {
        deliveryFirstPlace: 500,
        deliveryNextPlace: 100,
      },
      requests: [
        {
          key: "weekend",
          requestType: "delivery",
          status: "completed",
          placesCount: 1,
          deliveryFee: 900,
          checked: false,
          // 2026-09-13 is Sunday.
          date: "2026-09-13",
        },
      ],
    });

    const db = current.db;

    await db`
      UPDATE "requests"
         SET "senderAddress" = 'Ключевая 1',
             "deliveryAddress" = 'Аэропорт'
       WHERE id = ${current.byKey.weekend.id}
    `;

    const insertedRule = await db`
      INSERT INTO "clientTariffRules" (
        "clientId",
        "name",
        "requestType",
        "fromAddressNormalized",
        "toAddressNormalized",
        "weekdays",
        "firstPlacePrice",
        "nextPlacePrice",
        "priority",
        "isActive"
      )
      VALUES (
        ${current.clientId},
        'Все дни',
        'delivery',
        'ключевая 1',
        'аэропорт',
        NULL,
        900.00,
        100.00,
        10,
        true
      )
      RETURNING id
    `;

    const ruleId = Number(insertedRule[0].id);

    await db`
      UPDATE "requests"
         SET "deliveryFee" = 900,
             "quoteSource" = 'tariff',
             "quoteCalculatedAt" = now(),
             "quoteTariffRuleId" = ${ruleId},
             "quoteTariffSnapshot" = ${JSON.stringify({
               version: 1,
               ruleId,
               weekdays: null,
               firstPlacePrice: 900,
               nextPlacePrice: 100,
             })}
       WHERE id = ${current.byKey.weekend.id}
    `;

    const result = await updateSmartTariff({
      clientId: current.clientId,
      ruleId,
      name: "Только Пн–Пт",
      firstPlacePrice: 900,
      nextPlacePrice: 100,
      weekdays: [1, 2, 3, 4, 5],
      priority: 10,
      applyExisting: true,
    });

    const rows = await db`
      SELECT
        "deliveryFee",
        "quoteSource",
        "quoteTariffRuleId",
        "quoteTariffSnapshot"
      FROM "requests"
      WHERE id = ${current.byKey.weekend.id}
    `;

    const weekend = rows[0];

    // The old smart rule no longer applies on Sunday.
    // Existing base client tariff becomes the safe fallback.
    expect(Number(weekend.deliveryFee)).toBe(500);
    expect(weekend.quoteSource).toBe("tariff");
    expect(weekend.quoteTariffRuleId).toBeNull();
    expect(weekend.quoteTariffSnapshot).toBeNull();

    expect(result.recalculation).not.toBeNull();
    expect(result.recalculation!.calculated).toBe(1);
  });

});
