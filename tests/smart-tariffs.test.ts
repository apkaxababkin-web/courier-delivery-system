import { describe, expect, it } from "vitest";
import {
  chooseSmartTariffRule,
  computeSmartTariff,
  normalizeTariffAddress,
  type SmartTariffRule,
} from "../server/_core/requestQuote";

function rule(
  overrides: Partial<SmartTariffRule> = {},
): SmartTariffRule {
  return {
    id: 1,
    clientId: 10,
    name: "Ключевская → Аэропорт",
    requestType: "delivery",
    fromAddressNormalized: normalizeTariffAddress("ул. Ключевская, 40"),
    toAddressNormalized: normalizeTariffAddress("Аэропорт"),
    weekdays: null,
    firstPlacePrice: 500,
    nextPlacePrice: 100,
    priority: 0,
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    clientId: 10,
    requestType: "delivery",
    placesCount: 1,
    senderAddress: "ул. Ключевская, 40",
    deliveryAddress: "Аэропорт",
    completedAt: new Date("2026-09-14T12:00:00"),
    ...overrides,
  } as any;
}

describe("smart client tariffs", () => {
  it("normalizes equivalent address punctuation and case", () => {
    expect(normalizeTariffAddress("  УЛ. Ключевская, 40  "))
      .toBe(normalizeTariffAddress("ул ключевская 40"));
  });

  it("matches an exact normalized route and request type", () => {
    const selected = chooseSmartTariffRule(
      [rule()],
      request(),
    );

    expect(selected?.id).toBe(1);
  });

  it("does not match another route", () => {
    const selected = chooseSmartTariffRule(
      [rule()],
      request({ deliveryAddress: "Железнодорожный вокзал" }),
    );

    expect(selected).toBeNull();
  });

  it("does not match another request type", () => {
    const selected = chooseSmartTariffRule(
      [rule()],
      request({ requestType: "movement" }),
    );

    expect(selected).toBeNull();
  });

  it("calculates first and subsequent places", () => {
    const result = computeSmartTariff(
      rule({
        firstPlacePrice: 500,
        nextPlacePrice: 120,
      }),
      request({ placesCount: 3 }),
    );

    expect(result).not.toBeNull();
    if (!result) throw new Error("Expected smart tariff calculation");

    expect(result.amount).toBe(740);
    expect(result.firstPlace).toBe(500);
    expect(result.nextPlace).toBe(120);
    expect(result.places).toBe(3);
  });

  it("prefers a weekday-specific rule over an all-days rule", () => {
    const allDays = rule({
      id: 1,
      name: "Все дни",
      weekdays: null,
      firstPlacePrice: 500,
    });

    const weekdays = rule({
      id: 2,
      name: "Будни",
      weekdays: "1,2,3,4,5",
      firstPlacePrice: 600,
    });

    // Monday.
    const selected = chooseSmartTariffRule(
      [allDays, weekdays],
      request({
        completedAt: new Date("2026-09-14T12:00:00"),
      }),
    );

    expect(selected?.id).toBe(2);
  });

  it("prefers a weekend-specific rule on Saturday", () => {
    const allDays = rule({
      id: 1,
      name: "Все дни",
      weekdays: null,
      firstPlacePrice: 500,
    });

    const weekend = rule({
      id: 3,
      name: "Выходные",
      weekdays: "6,7",
      firstPlacePrice: 800,
    });

    const selected = chooseSmartTariffRule(
      [allDays, weekend],
      request({
        completedAt: new Date("2026-09-19T12:00:00"),
      }),
    );

    expect(selected?.id).toBe(3);
  });

  it("does not use a weekend rule on Monday", () => {
    const weekend = rule({
      id: 3,
      weekdays: "6,7",
    });

    const selected = chooseSmartTariffRule(
      [weekend],
      request({
        completedAt: new Date("2026-09-14T12:00:00"),
      }),
    );

    expect(selected).toBeNull();
  });

  it("uses explicit priority as tie-breaker for equally specific rules", () => {
    const low = rule({
      id: 10,
      priority: 1,
      firstPlacePrice: 500,
    });

    const high = rule({
      id: 11,
      priority: 20,
      firstPlacePrice: 700,
    });

    const selected = chooseSmartTariffRule(
      [low, high],
      request(),
    );

    expect(selected?.id).toBe(11);
  });

  it("uses newest rule id when specificity and priority are equal", () => {
    const oldRule = rule({ id: 20 });
    const newRule = rule({ id: 21 });

    const selected = chooseSmartTariffRule(
      [oldRule, newRule],
      request(),
    );

    expect(selected?.id).toBe(21);
  });
});
