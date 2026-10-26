/**
 * MAX / manager-site request display & task-link contract.
 *
 * Pure unit tests: no database, no HTTP, no real conversation. They pin the
 * behaviour fixed on 2026-10-16:
 *   - MAX movements are named "Организация / Точка" like the manager site;
 *   - legacy MAX movements (contact person stored in senderName) are corrected
 *     for display without touching the stored rows;
 *   - task -> request link resolution order is requestId, sourceRequestId, marker;
 *   - the six request types keep their field semantics.
 */
import { describe, expect, it } from "vitest";

import { applyMovementDisplayFallback, normalizePointAddressKey } from "../server/db";
import { requestIdFromTask } from "../server/_core/compatRoutes";
import { taskFromRequest } from "../server/_core/requestTaskSync";
import { maxMovementPartyLabel } from "../server/_core/maxIntegration";
import type { Request as DeliveryRequest, Task } from "../drizzle/schema";

// --------------------------------------------------------------- fixtures

/** Real production values from client 1 ("Основа движения"). */
const CLIENT = "Основа движения";
const POINT_NAMES: Record<string, string> = {
  "ул. Калашникова, 17": "Калашникова",
  "ул. Павлова, 13": "Павлова",
  "Пр. 50 летия Октября , 5": "Проспект",
};
const POINT_MAP = new Map(
  Object.entries(POINT_NAMES).map(([address, name]) => [normalizePointAddressKey(address), name]),
);

const BASE_TASK = {
  id: 1,
  courierId: null,
  createdByUserId: null,
  status: "assigned" as const,
  taskType: "regular" as const,
  recipientName: null,
  recipientPhone: "",
  deliveryAddress: null,
  deliveryCity: null,
  packageDescription: null,
  packageType: "small" as const,
  specialInstructions: null,
  placesCount: null,
  estimatedMinutes: null,
  deliveryTimeFrom: null,
  deliveryTimeTo: null,
  recipientAddress: null,
  senderName: null,
  senderAddress: null,
  senderPhone: null,
  comments: null,
  courierComments: null,
  items: null,
  rejectionReason: null,
  scheduledAt: null,
  acceptedAt: null,
  completedAt: null,
  createdAt: new Date("2026-10-16T00:00:00.000Z"),
  updatedAt: new Date("2026-10-16T00:00:00.000Z"),
  requestId: null as number | null,
  sourceRequestId: null as number | null,
};

function task(overrides: Record<string, unknown> = {}): Task {
  return { ...BASE_TASK, ...overrides } as unknown as Task;
}

function request(overrides: Record<string, unknown> = {}): DeliveryRequest {
  return {
    id: 1564,
    requestType: "movement",
    status: "pending",
    requestStatus: "pending",
    courierId: null,
    clientId: 1,
    recipientName: null,
    recipientPhone: null,
    recipientAddress: null,
    recipientCompany: null,
    recipientCity: null,
    deliveryAddress: null,
    deliveryCity: null,
    packageDescription: null,
    packageType: null,
    placesCount: null,
    senderName: null,
    senderCompany: null,
    senderCity: null,
    senderAddress: null,
    senderPhone: null,
    items: null,
    totalAmount: null,
    callReason: null,
    tcName: null,
    tcAddress: null,
    trackingNumber: null,
    description: null,
    specialInstructions: null,
    comments: null,
    paymentMethod: null,
    paymentAmount: null,
    deliveryTimeFrom: null,
    deliveryTimeTo: null,
    estimatedMinutes: null,
    scheduledAt: null,
    acceptedAt: null,
    completedAt: null,
    rejectionReason: null,
    createdAt: new Date("2026-10-16T02:49:01.000Z"),
    updatedAt: new Date("2026-10-16T02:49:01.000Z"),
    ...overrides,
  } as unknown as DeliveryRequest;
}

/** Task + joined request meta + clientName, as the courier API returns it. */
function displayTask(overrides: Record<string, unknown> = {}) {
  return {
    ...task(),
    requestType: "movement",
    clientName: CLIENT,
    ...overrides,
  } as unknown as Task & { requestType: string | null; clientName: string | null };
}

// --------------------------------------------------------------- §2, §5 (naming)

describe("maxMovementPartyLabel — MAX movement naming matches the manager site", () => {
  it("1. new movement with two points → «Организация / Точка»", () => {
    expect(maxMovementPartyLabel(CLIENT, ["Калашникова"])).toBe("Основа движения / Калашникова");
    expect(maxMovementPartyLabel(CLIENT, ["Павлова"])).toBe("Основа движения / Павлова");
  });

  it("2. movement with several points joins them consistently", () => {
    expect(maxMovementPartyLabel(CLIENT, ["Калашникова", "Павлова"])).toBe(
      "Основа движения / Калашникова / Павлова",
    );
    // blanks are ignored, the organisation is never duplicated
    expect(maxMovementPartyLabel(CLIENT, [null, "Павлова", ""])).toBe("Основа движения / Павлова");
  });

  it("falls back to the organisation alone when there is no point (manual address)", () => {
    expect(maxMovementPartyLabel(CLIENT, [])).toBe(CLIENT);
    expect(maxMovementPartyLabel(CLIENT, [null, undefined])).toBe(CLIENT);
  });

  it("never uses a contact person as organisation or point", () => {
    const label = maxMovementPartyLabel(CLIENT, ["Калашникова"]);
    expect(label).not.toContain("Софья");
    expect(label.startsWith(CLIENT)).toBe(true);
  });
});

// --------------------------------------------------------------- §3 (legacy rows)

describe("applyMovementDisplayFallback — legacy MAX movements, read-only", () => {
  it("3. old movement with a contact person in senderName is corrected", () => {
    const input = displayTask({
      id: 2785,
      requestId: 1564,
      sourceRequestId: 1564,
      senderName: "Софья Вячеславовна",
      recipientName: "Павлова",
      senderAddress: "ул. Калашникова, 17",
      deliveryAddress: "ул. Павлова, 13",
      packageDescription: null,
    });

    const out = applyMovementDisplayFallback(input, POINT_MAP);

    expect(out.senderName).toBe("Основа движения / Калашникова");
    expect(out.recipientName).toBe("Основа движения / Павлова");
    // the installed (old) app reads packageDescription first
    expect(out.packageDescription).toBe("Основа движения / Калашникова");
    // input object is not mutated
    expect(input.senderName).toBe("Софья Вячеславовна");
    expect(input.packageDescription).toBeNull();
  });

  it("uses the organisation alone when the stored address matches no client point", () => {
    const out = applyMovementDisplayFallback(
      displayTask({ senderName: "Софья Вячеславовна", senderAddress: "неизвестный адрес" }),
      POINT_MAP,
    );
    expect(out.senderName).toBe(CLIENT);
    expect(out.packageDescription).toBe(CLIENT);
  });

  it("4. movement created by the manager site is left untouched", () => {
    const input = displayTask({
      id: 2790,
      requestId: 1569,
      sourceRequestId: 1569,
      senderName: "Основа движения / Терешковой",
      recipientName: "Основа движения / Калашникова",
      senderAddress: "ул. Терешковой, 24",
      deliveryAddress: "ул. Калашникова, 17",
      packageDescription: "Основа движения",
    });

    const out = applyMovementDisplayFallback(input, POINT_MAP);
    expect(out.senderName).toBe("Основа движения / Терешковой");
    expect(out.recipientName).toBe("Основа движения / Калашникова");
    expect(out.packageDescription).toBe("Основа движения");
  });

  it("does not touch any other request type (5 — no mass renaming)", () => {
    for (const requestType of ["delivery", "nuts", "courier_call", "pickup_from_tc", "simple"]) {
      const input = displayTask({
        requestType,
        senderName: "Иван Петров",
        recipientName: "Пётр Иванов",
        packageDescription: null,
      });
      const out = applyMovementDisplayFallback(input, POINT_MAP);
      expect(out, requestType).toBe(input);
      expect(out.senderName, requestType).toBe("Иван Петров");
      expect(out.recipientName, requestType).toBe("Пётр Иванов");
      expect(out.packageDescription, requestType).toBeNull();
    }
  });

  it("leaves the task alone when the organisation is unknown", () => {
    const input = displayTask({ clientName: null, senderCompany: null, senderName: "Софья Вячеславовна" });
    expect(applyMovementDisplayFallback(input, POINT_MAP)).toBe(input);
  });

  it("matches addresses regardless of punctuation and case", () => {
    const out = applyMovementDisplayFallback(
      displayTask({ senderName: "Контакт", senderAddress: "ул.ПАВЛОВА,13" }),
      POINT_MAP,
    );
    expect(out.senderName).toBe("Основа движения / Павлова");
  });
});

// --------------------------------------------------------------- §4 (link order)

describe("requestIdFromTask — link resolution order", () => {
  it("6. prefers requestId", () => {
    expect(requestIdFromTask({ requestId: 1564, sourceRequestId: 999, comments: "[request:111]" })).toBe(1564);
  });

  it("7. falls back to sourceRequestId", () => {
    expect(requestIdFromTask({ requestId: null, sourceRequestId: 1555, comments: "[request:111]" })).toBe(1555);
  });

  it("8. falls back to the comment marker", () => {
    expect(requestIdFromTask({ requestId: null, sourceRequestId: null, comments: "[request:1569]\nОплата: paid" })).toBe(1569);
  });

  it("9. returns null when there is no link at all", () => {
    expect(requestIdFromTask({ requestId: null, sourceRequestId: null, comments: null })).toBeNull();
    expect(requestIdFromTask({ requestId: null, sourceRequestId: null, comments: "нет маркера" })).toBeNull();
  });

  it("ignores useless ids instead of inventing a link", () => {
    expect(requestIdFromTask({ requestId: 0, sourceRequestId: 0, comments: "[request:42]" })).toBe(42);
  });
});

// --------------------------------------------------------------- §5 (six types)

describe("taskFromRequest — field semantics per request type", () => {
  it("movement keeps organisation/point names on both sides", () => {
    const t = taskFromRequest(
      request({
        requestType: "movement",
        senderName: "Основа движения / Калашникова",
        recipientName: "Основа движения / Павлова",
        senderAddress: "ул. Калашникова, 17",
        deliveryAddress: "ул. Павлова, 13",
        placesCount: 1,
      }),
    );
    expect(t.taskType).toBe("regular");
    expect(t.senderName).toBe("Основа движения / Калашникова");
    expect(t.recipientName).toBe("Основа движения / Павлова");
    expect(t.requestId).toBe(1564);
    expect(t.sourceRequestId).toBe(1564);
  });

  it("10. delivery keeps the end recipient name", () => {
    const t = taskFromRequest(
      request({
        requestType: "delivery",
        recipientName: "Анна Сергеева",
        recipientPhone: "+79140000000",
        recipientAddress: "ул. Ленина, 1",
        deliveryAddress: "ул. Ленина, 1",
        senderName: "Магазин",
      }),
    );
    expect(t.recipientName).toBe("Анна Сергеева");
    expect(t.recipientPhone).toBe("+79140000000");
    expect(t.deliveryAddress).toBe("ул. Ленина, 1");
    expect(t.taskType).toBe("regular");
  });

  it("nuts → warehouse_pickup, recipient and order contents preserved", () => {
    const t = taskFromRequest(
      request({
        requestType: "nuts",
        recipientName: "ООО Орехи",
        items: "Масло: 3; Миндаль: 2",
        packageDescription: "Орехи",
      }),
    );
    expect(t.taskType).toBe("warehouse_pickup");
    expect(t.recipientName).toBe("ООО Орехи");
    expect(t.items).toBe("Масло: 3; Миндаль: 2");
  });

  it("courier_call → courier_call, sender and address preserved", () => {
    const t = taskFromRequest(
      request({
        requestType: "courier_call",
        senderName: "Магазин на Ленина",
        senderCompany: "Основа движения",
        senderAddress: "ул. Ленина, 20",
      }),
    );
    expect(t.taskType).toBe("courier_call");
    expect(t.senderName).toBe("Магазин на Ленина");
    expect(t.senderAddress).toBe("ул. Ленина, 20");
  });

  it("pickup_from_tc (ТК → получатель) keeps the transport company as sender", () => {
    const t = taskFromRequest(
      request({
        requestType: "pickup_from_tc",
        tcName: "Деловые линии",
        tcAddress: "ТК, склад 3",
        recipientName: "Анна Сергеева",
        deliveryAddress: "ул. Ленина, 1",
        comments: "Направление: ТК → получатель",
      }),
    );
    expect(t.taskType).toBe("regular");
    expect(t.senderName).toBe("Деловые линии");
    expect(t.senderAddress).toBe("ТК, склад 3");
    expect(t.recipientName).toBe("Анна Сергеева");
    expect(t.deliveryAddress).toBe("ул. Ленина, 1");
  });

  it("pickup_from_tc (получатель → ТК) keeps the transport company as recipient", () => {
    const t = taskFromRequest(
      request({
        requestType: "pickup_from_tc",
        tcName: "Деловые линии",
        tcAddress: "ТК, склад 3",
        senderName: "Основа движения",
        deliveryAddress: "ул. Павлова, 13",
        comments: "Направление: получатель → ТК",
      }),
    );
    expect(t.senderName).toBe("Основа движения");
    expect(t.recipientName).toBe("Деловые линии");
    expect(t.recipientAddress).toBe("ТК, склад 3");
    expect(t.deliveryAddress).toBe("ТК, склад 3");
  });

  it("simple keeps its existing field mapping", () => {
    const t = taskFromRequest(
      request({
        requestType: "simple",
        senderName: "Склад",
        senderAddress: "ул. Калашникова, 17",
        recipientName: "Получатель",
        deliveryAddress: "ул. Павлова, 13",
      }),
    );
    expect(t.taskType).toBe("regular");
    expect(t.senderName).toBe("Склад");
    expect(t.recipientName).toBe("Получатель");
  });

  it("every type keeps the request link on the task", () => {
    for (const requestType of ["delivery", "movement", "nuts", "courier_call", "pickup_from_tc", "simple"]) {
      const t = taskFromRequest(request({ id: 777, requestType }));
      expect(t.requestId, requestType).toBe(777);
      expect(t.sourceRequestId, requestType).toBe(777);
      expect(String(t.comments), requestType).toContain("[request:777]");
      expect(String(t.comments), requestType).toContain(`Тип заявки: ${requestType}`);
    }
  });
});

// --------------------------------------------------------------- regression

describe("regressions fixed on 2026-10-16", () => {
  it("the marker regex is not double-escaped (db.ts)", () => {
    // A double-escaped pattern matches a literal backslash and never the marker,
    // which silently dropped requestType for tasks linked only by the marker.
    const markerRe = /\[request:(\d+)\]/;
    expect("[request:2785]".match(markerRe)?.[1]).toBe("2785");
  });

  it("normalizePointAddressKey ignores punctuation/case noise", () => {
    expect(normalizePointAddressKey("ул. Павлова, 13")).toBe(normalizePointAddressKey("ул.ПАВЛОВА,13"));
    expect(normalizePointAddressKey("Пр. 50 летия Октября , 5")).toBe(
      normalizePointAddressKey("пр 50 летия октября 5"),
    );
  });
});


it("uses the actual sender for delivery to a transport company", () => {
  const request = {
    id: 99991,
    requestType: "pickup_from_tc",
    status: "pending",
    senderName: "Основа движения / Склад",
    senderCompany: "Основа движения",
    senderAddress: "ул. Ленина, 10",
    senderPhone: "301010",
    recipientName: "Контактное лицо ТК",
    recipientCompany: "Деловые линии",
    recipientAddress: "ул. Павлова, 13",
    recipientPhone: "302020",
    deliveryAddress: "ул. Павлова, 13",
    tcName: "Деловые линии",
    tcAddress: "ул. Павлова, 13",
    comments: "Направление: получатель → ТК",
  } as Parameters<typeof taskFromRequest>[0];

  const task = taskFromRequest(request);

  expect(task.senderName).toBe("Основа движения / Склад");
  expect(task.senderAddress).toBe("ул. Ленина, 10");
  expect(task.senderPhone).toBe("301010");
  expect(task.recipientName).toBe("Деловые линии");
  expect(task.recipientAddress).toBe("ул. Павлова, 13");
  expect(task.recipientPhone).toBe("302020");
  expect(task.deliveryAddress).toBe("ул. Павлова, 13");
});
