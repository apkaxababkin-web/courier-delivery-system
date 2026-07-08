import express, { type Express, type Request, type Response } from "express";
import { addLiveClient, broadcastLive, removeLiveClient, sendLiveEvent } from "./liveEvents";
import { sendExpoPush } from "./expoPush";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  clientPoints,
  clientRegularClients,
  partners,
  transportCompanies,
  couriers,
  hemotestPickups,
  hemotestPickupPoints,
  hemotestPickupLists,
  hemotestListItems,
  mails,
  requests,
  sberbankPickups,
  sberbankPickupPoints,
  sberbankPickupLists,
  sberbankListItems,
  tasks,
  type InsertMail,
  type InsertRequest,
  type InsertTask,
  type Mail,
  type Request as DeliveryRequest,
  type Task,
} from "../../drizzle/schema";
import * as db from "../db";
import { verifyCourierToken } from "../routers";
import { toSafeCourier } from "./courierPublic";

const REQUEST_ATTACHMENTS_DIR = process.env.REQUEST_ATTACHMENTS_DIR || path.join(process.cwd(), "uploads", "request-attachments");
const MAX_REQUEST_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function sqlRows(result: any) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function safeAttachmentName(name: string) {
  const fallback = "file";
  const cleaned = String(name || fallback)
    .replace(/[\\/\0]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return cleaned || fallback;
}

function attachmentPublicUrl(id: number, storedName: string) {
  return `/api/request-attachments/${id}/${encodeURIComponent(storedName)}`;
}

async function ensureRequestAttachmentsTable(conn: any) {
  await conn.execute(sql`
    CREATE TABLE IF NOT EXISTS "requestAttachments" (
      "id" serial PRIMARY KEY,
      "requestId" integer NOT NULL,
      "originalName" text NOT NULL,
      "storedName" text NOT NULL,
      "fileUrl" text NOT NULL,
      "mimeType" varchar(255),
      "sizeBytes" integer NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);
}

function trpcJson(data: unknown) {
  return { result: { data: { json: data } } };
}

// tRPC httpBatchLink wraps responses in an array: [{result:{data:{json:...}}}]
function trpcBatchJson(data: unknown) {
  return [{ result: { data: { json: data } } }];
}

// Unwrap tRPC batch input format: {"0":{"json":{...}}} -> {...}
function unwrapBatchInput(obj: Record<string, unknown>): Record<string, unknown> {
  const firstKey = Object.keys(obj)[0];
  if (firstKey === "0" && obj["0"] && typeof obj["0"] === "object") {
    const inner = (obj["0"] as Record<string, unknown>).json;
    if (inner && typeof inner === "object") return inner as Record<string, unknown>;
  }
  return obj;
}

async function sendPushToAllCouriers(title: string, body: string, data?: Record<string, unknown>) {
  try {
    const allCouriers = await db.getAllCouriers();
    const targets = allCouriers.filter((courier) => courier.pushToken?.startsWith("ExponentPushToken"));

    console.log("[PUSH_ALL] targets", targets.length, title);

    await Promise.allSettled(
      targets.map((courier) =>
        sendExpoPush(courier.pushToken, title, body, data),
      ),
    );
  } catch (e) {
    console.error("[PUSH_ALL] failed", e);
  }
}

function compactText(value: unknown, fallback = "Не указано") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function truncatePushText(value: string, max = 90) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function getRequestTypeLabel(type: unknown) {
  if (type === "delivery") return "Доставка";
  if (type === "movement") return "Перемещение";
  if (type === "nuts") return "Орехи";
  if (type === "courier_call") return "Вызов курьера";
  if (type === "pickup_from_tc") return "ТК";
  return "Заявка";
}

function getPaymentLabel(method: unknown) {
  if (method === "paid") return "оплачено";
  if (method === "transfer") return "перевод";
  if (method === "cash") return "наличные";
  if (method === "terminal") return "терминал";
  if (method === "qr") return "QR";
  return "";
}

function getPlacesLabel(count: unknown) {
  const places = Number(count || 1);
  if (places === 1) return "1 место";
  if (places >= 2 && places <= 4) return `${places} места`;
  return `${places} мест`;
}

function buildNewRequestPush(input: {
  id: number;
  requestType?: unknown;
  deliveryAddress?: unknown;
  recipientAddress?: unknown;
  senderAddress?: unknown;
  senderName?: unknown;
  senderCompany?: unknown;
  recipientName?: unknown;
  recipientCompany?: unknown;
  tcName?: unknown;
  packageDescription?: unknown;
  placesCount?: unknown;
  paymentMethod?: unknown;
}) {
  const typeLabels: Record<string, string> = {
    delivery: "Доставка",
    movement: "Перемещение",
    nuts: "Орехи",
    courier_call: "Вызов курьера",
    pickup_from_tc: "Транспортная компания",
    simple: "Заявка",
  };

  const requestType = String(input.requestType || "");
  const typeLabel = typeLabels[requestType] || "Заявка";

  const name = compactText(
    input.packageDescription ||
      input.tcName ||
      input.senderCompany ||
      input.recipientCompany ||
      input.recipientName ||
      input.senderName,
    "",
  );

  const pickupPlace = compactText(
    input.senderAddress ||
      input.tcName ||
      input.deliveryAddress ||
      input.recipientAddress,
    "",
  );

  const title = name ? `${typeLabel} · ${name}` : typeLabel;

  return {
    title: truncatePushText(title, 90),
    body: truncatePushText(pickupPlace, 120),
  };
}



function inputFrom(req: Request): Record<string, unknown> {
  const body = (req.body?.json ?? req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(body).length > 0) return unwrapBatchInput(body);
  const raw = req.query.input;
  if (typeof raw !== "string" || !raw) return {};
  try { return unwrapBatchInput(JSON.parse(raw) as Record<string, unknown>); } catch { return {}; }
}

function normalizeTaskStatus(status: unknown): Task["status"] {
  if (status === "in_progress" || status === "completed" || status === "cancelled") return status;
  return "assigned";
}

function normalizeRequestStatus(status: unknown): DeliveryRequest["status"] {
  if (status === "assigned" || status === "in_progress" || status === "completed" || status === "cancelled") return status;
  return "pending";
}

function taskTypeFromRequest(type: unknown): InsertTask["taskType"] {
  if (type === "courier_call") return "courier_call";
  if (type === "nuts") return "warehouse_pickup";
  return "regular";
}

function requestStatusFromTask(status: Task["status"]): DeliveryRequest["status"] {
  if (status === "assigned") return "assigned";
  return status;
}

function requestMarker(id: number) {
  return `[request:${id}]`;
}

function requestIdFromTask(task: Pick<Task, "comments">): number | null {
  const marker = task.comments?.match(/\[request:(\d+)\]/)?.[1];
  const requestId = marker ? Number(marker) : null;
  return requestId && Number.isFinite(requestId) ? requestId : null;
}

async function tasksWithRequestType<T extends Pick<Task, "comments">>(
  taskList: T[],
): Promise<Array<T & { requestType: DeliveryRequest["requestType"] | null }>> {
  if (!taskList.length) return taskList.map((task) => ({ ...task, requestType: null }));

  const requestIds = Array.from(
    new Set(
      taskList
        .map((task) => requestIdFromTask(task))
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  if (!requestIds.length) {
    return taskList.map((task) => ({ ...task, requestType: null }));
  }

  const conn = await db.getDb();
  if (!conn) return taskList.map((task) => ({ ...task, requestType: null }));

  const requestRows = await conn
    .select({ id: requests.id, requestType: requests.requestType })
    .from(requests)
    .where(inArray(requests.id, requestIds));

  const requestTypeMap = new Map<number, DeliveryRequest["requestType"]>(
    requestRows.map((request: Pick<DeliveryRequest, "id" | "requestType">) => [request.id, request.requestType])
  );

  return taskList.map((task) => {
    const requestId = requestIdFromTask(task);
    return {
      ...task,
      requestType: requestId ? requestTypeMap.get(requestId) ?? null : null,
    };
  });
}

function taskFromRequest(request: DeliveryRequest): InsertTask {
  const fallbackAddress = request.deliveryAddress || request.recipientAddress || request.senderAddress || request.tcAddress || "Адрес не указан";
  const fallbackName = request.recipientName || request.recipientCompany || request.senderName || request.senderCompany || "Получатель не указан";
  const comments = [
    requestMarker(request.id),
    request.description,
    request.callReason,
    request.comments,
    request.specialInstructions,
    request.trackingNumber ? `Трек: ${request.trackingNumber}` : null,
    request.paymentMethod ? `Оплата: ${request.paymentMethod}` : null,
    request.paymentAmount ? `Сумма: ${request.paymentAmount}` : null,
  ].filter(Boolean).join("\n");

  return {
    courierId: request.courierId ?? null,
    requestId: request.id,
    sourceRequestId: request.id,
    status: normalizeTaskStatus(request.status),
    taskType: taskTypeFromRequest(request.requestType),
    recipientName: fallbackName,
    recipientPhone: request.recipientPhone || request.senderPhone || "",
    recipientAddress: request.recipientAddress ?? null,
    deliveryAddress: fallbackAddress,
    deliveryCity: request.deliveryCity || request.recipientCity || request.senderCity || null,
    senderName: request.senderName || request.senderCompany || request.tcName || null,
    senderAddress: request.senderAddress || request.tcAddress || null,
    senderPhone: request.senderPhone ?? null,
    packageDescription: request.packageDescription || request.description || request.callReason || null,
    packageType: request.packageType ?? "small",
    placesCount: request.placesCount ?? null,
    estimatedMinutes: request.estimatedMinutes ?? null,
    deliveryTimeFrom: request.deliveryTimeFrom ?? null,
    deliveryTimeTo: request.deliveryTimeTo ?? null,
    specialInstructions: request.specialInstructions ?? null,
    comments,
    items: request.items ?? null,
    scheduledAt: request.scheduledAt ?? null,
    acceptedAt: request.acceptedAt ?? null,
    completedAt: request.completedAt ?? null,
  };
}

async function courierNameMap() {
  const conn = await db.getDb();
  if (!conn) return new Map<number, string>();
  const allCouriers = await conn.select({ id: couriers.id, name: couriers.name }).from(couriers);
  return new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
}

async function requestRows() {
  const conn = await db.getDb();
  if (!conn) return [];
  const allRequests = await conn.select().from(requests).orderBy(desc(requests.createdAt));
  const courierMap = await courierNameMap();
  return allRequests.map((request: DeliveryRequest) => ({
    ...request,
    courierName: request.courierId ? courierMap.get(request.courierId) ?? null : null,
  }));
}

async function mailsWithCourierName(mailList: Mail[]) {
  const courierMap = await courierNameMap();
  return mailList.map((mail) => ({
    ...mail,
    courierName: mail.courierId ? courierMap.get(mail.courierId) ?? null : null,
  }));
}

async function pickupFeedbackSummary() {
  const conn = await db.getDb();
  const date = new Date().toISOString().split("T")[0];

  if (!conn) {
    return {
      date,
      hemotest: { total: 0, picked: 0, items: [] },
      sberbank: { total: 0, picked: 0, items: [] },
    };
  }

  const courierMap = await courierNameMap();

  const hemotestLists = await conn
    .select({ id: hemotestPickupLists.id })
    .from(hemotestPickupLists)
    .where(eq(hemotestPickupLists.date, date));

  const hemotestListIds = hemotestLists.map((list: { id: number }) => list.id);

  const hemotestListRows = hemotestListIds.length
    ? await conn
        .select()
        .from(hemotestListItems)
        .innerJoin(hemotestPickupPoints, eq(hemotestListItems.pointId, hemotestPickupPoints.id))
        .where(inArray(hemotestListItems.listId, hemotestListIds))
    : [];

  const hemotestPickupRows = await conn
    .select()
    .from(hemotestPickups)
    .where(eq(hemotestPickups.date, date));

  const hemotestPickupMap = new Map<number, any>(hemotestPickupRows.map((row: any) => [row.pointId, row]));
  const hemotestPointMap = new Map<number, any>();

  for (const row of hemotestListRows as Array<{ hemotestPickupPoints: any }>) {
    hemotestPointMap.set(row.hemotestPickupPoints.id, row.hemotestPickupPoints);
  }

  const hemotestItems = Array.from(hemotestPointMap.values()).map((point: any) => {
    const pickup = hemotestPickupMap.get(point.id);
    return {
      id: pickup?.id ?? point.id,
      pointId: point.id,
      pointName: point.name,
      address: point.address,
      courierId: pickup?.courierId ?? null,
      courierName: pickup?.courierId ? courierMap.get(pickup.courierId) ?? null : null,
      date,
      isPicked: pickup?.isPicked ?? false,
      pickedAt: pickup?.pickedAt ?? null,
    };
  });

  const sberbankLists = await conn
    .select({ id: sberbankPickupLists.id })
    .from(sberbankPickupLists)
    .where(eq(sberbankPickupLists.date, date));

  const sberbankListIds = sberbankLists.map((list: { id: number }) => list.id);

  const sberbankListRows = sberbankListIds.length
    ? await conn
        .select()
        .from(sberbankListItems)
        .innerJoin(sberbankPickupPoints, eq(sberbankListItems.pointId, sberbankPickupPoints.id))
        .where(inArray(sberbankListItems.listId, sberbankListIds))
    : [];

  const sberbankPickupRows = await conn
    .select()
    .from(sberbankPickups)
    .where(eq(sberbankPickups.date, date));

  const sberbankPickupMap = new Map<number, any>(sberbankPickupRows.map((row: any) => [row.pointId, row]));
  const sberbankPointMap = new Map<number, any>();

  for (const row of sberbankListRows as Array<{ sberbankPickupPoints: any }>) {
    sberbankPointMap.set(row.sberbankPickupPoints.id, row.sberbankPickupPoints);
  }

  const sberbankItems = Array.from(sberbankPointMap.values()).map((point: any) => {
    const pickup = sberbankPickupMap.get(point.id);
    return {
      id: pickup?.id ?? point.id,
      pointId: point.id,
      pointName: point.name,
      address: point.address,
      courierId: pickup?.courierId ?? null,
      courierName: pickup?.courierId ? courierMap.get(pickup.courierId) ?? null : null,
      date,
      isPicked: pickup?.isPicked ?? false,
      pickedAt: pickup?.pickedAt ?? null,
    };
  });

  return {
    date,
    hemotest: {
      total: hemotestItems.length,
      picked: hemotestItems.filter((item: { isPicked: boolean }) => item.isPicked).length,
      items: hemotestItems,
    },
    sberbank: {
      total: sberbankItems.length,
      picked: sberbankItems.filter((item: { isPicked: boolean }) => item.isPicked).length,
      items: sberbankItems,
    },
  };
}

async function hemotestReconciliationRows() {
  const conn = await db.getDb();
  if (!conn) return [];

  const courierMap = await courierNameMap();

  const rows = await conn
    .select()
    .from(hemotestPickups)
    .innerJoin(hemotestPickupPoints, eq(hemotestPickups.pointId, hemotestPickupPoints.id))
    .where(eq(hemotestPickups.isPicked, true))
    .orderBy(desc(hemotestPickups.date), desc(hemotestPickups.pickedAt));

  return rows.map((row: any) => ({
    id: row.hemotestPickups.id,
    pointId: row.hemotestPickupPoints.id,
    pointName: row.hemotestPickupPoints.name,
    address: row.hemotestPickupPoints.address,
    courierId: row.hemotestPickups.courierId ?? null,
    courierName: row.hemotestPickups.courierId ? courierMap.get(row.hemotestPickups.courierId) ?? null : null,
    date: row.hemotestPickups.date,
    isPicked: row.hemotestPickups.isPicked,
    pickedAt: row.hemotestPickups.pickedAt,
  }));
}


async function findTaskForRequest(requestId: number): Promise<Task | null> {
  const conn = await db.getDb();
  if (!conn) return null;
  const allTasks = await conn.select().from(tasks).orderBy(desc(tasks.createdAt));
  return allTasks.find((task: Task) => task.comments?.includes(requestMarker(requestId))) ?? null;
}

async function syncTaskForRequest(request: DeliveryRequest): Promise<number> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");
  const existingTask = await findTaskForRequest(request.id);
  const taskData = taskFromRequest(request);
  if (existingTask) {
    await conn.update(tasks).set({ ...taskData, updatedAt: new Date() }).where(eq(tasks.id, existingTask.id));
    return existingTask.id;
  }
  const inserted = await conn.insert(tasks).values(taskData).returning({ id: tasks.id });
  return inserted[0].id;
}

async function updateRequestStatusFromTask(taskId: number, status: Task["status"], courierId?: number | null) {
  const conn = await db.getDb();
  if (!conn) return;
  const task = await db.getTaskById(taskId);
  const marker = task?.comments?.match(/\[request:(\d+)\]/)?.[1];
  if (!marker) return;
  const requestId = Number(marker);
  if (!requestId) return;
  await conn.update(requests).set({
    status: requestStatusFromTask(status),
    courierId: courierId ?? task?.courierId ?? null,
    acceptedAt: status === "in_progress" ? new Date() : task?.acceptedAt ?? null,
    completedAt: status === "completed" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(requests.id, requestId));
}

async function managerSnapshot() {
  const [activeTasks, completedTasks, requestList, mailList, pickupFeedback] = await Promise.all([
    db.getAllTasksWithCourier(),
    db.getCompletedTasksWithCourier(),
    requestRows(),
    db.getAllMails(),
    pickupFeedbackSummary(),
  ]);
  const allTasks = await tasksWithRequestType([...activeTasks, ...completedTasks]);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    tasks: allTasks,
    requests: requestList,
    mails: await mailsWithCourierName(mailList),
    pickupFeedback,
  };
}

async function courierSnapshot(courierId: number) {
  const [courier, activeTasks, completedTasks, mailList] = await Promise.all([
    db.getCourierById(courierId),
    db.getAllTasksWithCourier(),
    db.getCompletedTasksWithCourier(),
    db.getAllMails(),
  ]);
  const allTasks = await tasksWithRequestType([...activeTasks, ...completedTasks]);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    courier,
    tasks: allTasks,
    mails: mailList,
  };
}

function sendError(res: Response, error: unknown, fallback: string) {
  console.error(fallback, error);
  const message = error instanceof Error ? error.message : fallback;
  res.status(500).json({ error: { message } });
}

async function courierIdFromReq(req: Request): Promise<number | null> {
  const input = inputFrom(req);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = String(input.token ?? req.query.token ?? bearerToken ?? "");
  if (!token) return null;
  const payload = await verifyCourierToken(token);
  return payload?.courierId ?? null;
}

export function registerCompatRoutes(app: Express) {
  app.get("/api/live", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const id = addLiveClient(res);

    sendLiveEvent(res, "connected", { clientId: id });

    const keepAlive = setInterval(() => {
      try {
        sendLiveEvent(res, "ping", { clientId: id });
      } catch {
        clearInterval(keepAlive);
        removeLiveClient(id);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeLiveClient(id);
    });
  });

  const emptyClientTariffs = {
    deliveryFirstPlace: 0,
    deliveryNextPlace: 0,
    transportCompanyFirstPlace: 0,
    transportCompanyNextPlace: 0,
    movementFirstPlace: 0,
    movementNextPlace: 0,
    otherFirstPlace: 0,
    otherNextPlace: 0,
    hemotestPointPrice: 0,
    hemotestSundayFirstPointPrice: 0,
    hemotestSundayNextPointPrice: 0,
  };

  const normalizeClientTariffs = (row: any) => ({
    deliveryFirstPlace: Number(row?.deliveryFirstPlace ?? 0),
    deliveryNextPlace: Number(row?.deliveryNextPlace ?? 0),
    transportCompanyFirstPlace: Number(row?.transportCompanyFirstPlace ?? 0),
    transportCompanyNextPlace: Number(row?.transportCompanyNextPlace ?? 0),
    movementFirstPlace: Number(row?.movementFirstPlace ?? 0),
    movementNextPlace: Number(row?.movementNextPlace ?? 0),
    otherFirstPlace: Number(row?.otherFirstPlace ?? 0),
    otherNextPlace: Number(row?.otherNextPlace ?? 0),
    hemotestPointPrice: Number(row?.hemotestPointPrice ?? 0),
    hemotestSundayFirstPointPrice: Number(row?.hemotestSundayFirstPointPrice ?? 0),
    hemotestSundayNextPointPrice: Number(row?.hemotestSundayNextPointPrice ?? 0),
  });

  const tariffNumber = (value: unknown) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : 0;
  };

  app.get("/api/manager/clients/:id/tariffs", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.id);
      if (!clientId) throw new Error("client id is required");

      const result = await conn.execute(sql`
        SELECT
          "deliveryFirstPlace",
          "deliveryNextPlace",
          "transportCompanyFirstPlace",
          "transportCompanyNextPlace",
          "movementFirstPlace",
          "movementNextPlace",
          "otherFirstPlace",
          "otherNextPlace",
          "hemotestPointPrice",
          "hemotestSundayFirstPointPrice",
          "hemotestSundayNextPointPrice"
        FROM "clientTariffs"
        WHERE "clientId" = ${clientId}
        ORDER BY id DESC
        LIMIT 1
      `) as any;

      const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
      res.json(row ? normalizeClientTariffs(row) : emptyClientTariffs);
    } catch (error) {
      sendError(res, error, "Failed to load client tariffs");
    }
  });

  app.put("/api/manager/clients/:id/tariffs", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.id);
      if (!clientId) throw new Error("client id is required");

      const body = req.body || {};
      const values = {
        deliveryFirstPlace: tariffNumber(body.deliveryFirstPlace),
        deliveryNextPlace: tariffNumber(body.deliveryNextPlace),
        transportCompanyFirstPlace: tariffNumber(body.transportCompanyFirstPlace),
        transportCompanyNextPlace: tariffNumber(body.transportCompanyNextPlace),
        movementFirstPlace: tariffNumber(body.movementFirstPlace),
        movementNextPlace: tariffNumber(body.movementNextPlace),
        otherFirstPlace: tariffNumber(body.otherFirstPlace),
        otherNextPlace: tariffNumber(body.otherNextPlace),
        hemotestPointPrice: tariffNumber(body.hemotestPointPrice ?? body.hemotest?.pointPrice),
        hemotestSundayFirstPointPrice: tariffNumber(body.hemotestSundayFirstPointPrice ?? body.hemotest?.sundayFirstPointPrice),
        hemotestSundayNextPointPrice: tariffNumber(body.hemotestSundayNextPointPrice ?? body.hemotest?.sundayNextPointPrice),
      };

      const existing = await conn.execute(sql`
        SELECT id
        FROM "clientTariffs"
        WHERE "clientId" = ${clientId}
        ORDER BY id DESC
        LIMIT 1
      `) as any;

      const existingRow = Array.isArray(existing) ? existing[0] : existing?.rows?.[0];

      if (existingRow?.id) {
        await conn.execute(sql`
          UPDATE "clientTariffs"
          SET
            "deliveryFirstPlace" = ${values.deliveryFirstPlace},
            "deliveryNextPlace" = ${values.deliveryNextPlace},
            "transportCompanyFirstPlace" = ${values.transportCompanyFirstPlace},
            "transportCompanyNextPlace" = ${values.transportCompanyNextPlace},
            "movementFirstPlace" = ${values.movementFirstPlace},
            "movementNextPlace" = ${values.movementNextPlace},
            "otherFirstPlace" = ${values.otherFirstPlace},
            "otherNextPlace" = ${values.otherNextPlace},
            "hemotestPointPrice" = ${values.hemotestPointPrice},
            "hemotestSundayFirstPointPrice" = ${values.hemotestSundayFirstPointPrice},
            "hemotestSundayNextPointPrice" = ${values.hemotestSundayNextPointPrice},
            "updatedAt" = now()
          WHERE id = ${Number(existingRow.id)}
        `);
      } else {
        await conn.execute(sql`
          INSERT INTO "clientTariffs" (
            "clientId",
            "deliveryFirstPlace",
            "deliveryNextPlace",
            "transportCompanyFirstPlace",
            "transportCompanyNextPlace",
            "movementFirstPlace",
            "movementNextPlace",
            "otherFirstPlace",
            "otherNextPlace",
            "hemotestPointPrice",
            "hemotestSundayFirstPointPrice",
            "hemotestSundayNextPointPrice",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${clientId},
            ${values.deliveryFirstPlace},
            ${values.deliveryNextPlace},
            ${values.transportCompanyFirstPlace},
            ${values.transportCompanyNextPlace},
            ${values.movementFirstPlace},
            ${values.movementNextPlace},
            ${values.otherFirstPlace},
            ${values.otherNextPlace},
            ${values.hemotestPointPrice},
            ${values.hemotestSundayFirstPointPrice},
            ${values.hemotestSundayNextPointPrice},
            now(),
            now()
          )
        `);
      }

      res.json(values);
    } catch (error) {
      sendError(res, error, "Failed to save client tariffs");
    }
  });


  app.get("/api/manager/hemotest/reconciliation", async (_req, res) => {
    try {
      res.json(await hemotestReconciliationRows());
    } catch (error) {
      sendError(res, error, "Failed to load hemotest reconciliation");
    }
  });


  app.get("/api/manager/couriers", async (_req, res) => {
    try {
      res.json((await db.getAllCouriers()).map(toSafeCourier));
    } catch (error) {
      sendError(res, error, "Failed to load manager couriers");
    }
  });

  app.post("/api/manager/couriers", async (req, res) => {
    try {
      const input = inputFrom(req);
      const name = String(input.name || "").trim();
      const username = String(input.username || "").trim().toLowerCase();
      const password = String(input.password || "");
      const phone = input.phone ? String(input.phone).trim() : null;
      const vehicleType = String(input.vehicleType || "car");

      if (!name || !username || !password) {
        res.status(400).json({ error: "Укажите имя, логин и пароль курьера" });
        return;
      }

      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.default.hash(password, 10);

      const id = await db.createCourier({
        name,
        username,
        passwordHash,
        phone,
        vehicleType: vehicleType as any,
        isActive: true,
        totalDeliveries: 0,
      } as any);

      const courier = await db.getCourierById(id);
      res.json(courier ? toSafeCourier(courier) : null);
    } catch (error) {
      sendError(res, error, "Failed to create manager courier");
    }
  });

  app.put("/api/manager/couriers/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) throw new Error("courier id is required");

      const name = String(req.body?.name || "").trim();
      const username = String(req.body?.username || "").trim().toLowerCase();
      const phone = String(req.body?.phone || "").trim();
      const vehicleType = String(req.body?.vehicleType || "car").trim();
      const isActive = req.body?.isActive === false ? false : true;

      if (!name) throw new Error("name is required");
      if (!username) throw new Error("username is required");

      await db.updateCourier(id, {
        name,
        username,
        phone: phone || null,
        vehicleType: vehicleType as any,
        isActive,
        updatedAt: new Date(),
      } as any);

      broadcastLive("couriers_changed", { courierId: id });
      broadcastLive("tasks_changed", { courierId: id });

      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to update manager courier");
    }
  });

  app.delete("/api/manager/couriers/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Некорректный ID курьера" });
        return;
      }

      await db.updateCourier(id, { isActive: false } as any);
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to deactivate manager courier");
    }
  });


  // ─── Client points and regular clients ─────────────────────────────────────

  app.get("/api/manager/clients/:clientId/points", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.clientId);
      if (!clientId) {
        res.status(400).json({ error: "Некорректный ID клиента" });
        return;
      }

      const rows = await conn
        .select()
        .from(clientPoints)
        .where(eq(clientPoints.clientId, clientId))
        .orderBy(clientPoints.sortOrder, clientPoints.id);

      res.json(rows);
    } catch (error) {
      sendError(res, error, "Failed to load client points");
    }
  });

  app.post("/api/manager/clients/:clientId/points", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.clientId);
      const input = inputFrom(req);

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!clientId || !name || !address) {
        res.status(400).json({ error: "Укажите клиента, название и адрес точки" });
        return;
      }

      const inserted = await conn
        .insert(clientPoints)
        .values({
          clientId,
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          sortOrder: Number(input.sortOrder || 0),
        })
        .returning();

      res.json(inserted[0]);
    } catch (error) {
      sendError(res, error, "Failed to create client point");
    }
  });

  app.put("/api/manager/client-points/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      const input = inputFrom(req);

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!id || !name || !address) {
        res.status(400).json({ error: "Укажите название и адрес точки" });
        return;
      }

      const updated = await conn
        .update(clientPoints)
        .set({
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          sortOrder: Number(input.sortOrder || 0),
          updatedAt: new Date(),
        })
        .where(eq(clientPoints.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error) {
      sendError(res, error, "Failed to update client point");
    }
  });

  app.delete("/api/manager/client-points/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Некорректный ID точки" });
        return;
      }

      await conn.delete(clientPoints).where(eq(clientPoints.id, id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete client point");
    }
  });

  app.get("/api/manager/clients/:clientId/regular-clients", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.clientId);
      if (!clientId) {
        res.status(400).json({ error: "Некорректный ID клиента" });
        return;
      }

      const rows = await conn
        .select()
        .from(clientRegularClients)
        .where(eq(clientRegularClients.clientId, clientId))
        .orderBy(clientRegularClients.sortOrder, clientRegularClients.id);

      res.json(rows);
    } catch (error) {
      sendError(res, error, "Failed to load regular clients");
    }
  });

  app.post("/api/manager/clients/:clientId/regular-clients", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const clientId = Number(req.params.clientId);
      const input = inputFrom(req);

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!clientId || !name || !address) {
        res.status(400).json({ error: "Укажите клиента, название и адрес" });
        return;
      }

      const inserted = await conn
        .insert(clientRegularClients)
        .values({
          clientId,
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          sortOrder: Number(input.sortOrder || 0),
        })
        .returning();

      res.json(inserted[0]);
    } catch (error) {
      sendError(res, error, "Failed to create regular client");
    }
  });

  app.put("/api/manager/regular-clients/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      const input = inputFrom(req);

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!id || !name || !address) {
        res.status(400).json({ error: "Укажите название и адрес" });
        return;
      }

      const updated = await conn
        .update(clientRegularClients)
        .set({
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          sortOrder: Number(input.sortOrder || 0),
          updatedAt: new Date(),
        })
        .where(eq(clientRegularClients.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error) {
      sendError(res, error, "Failed to update regular client");
    }
  });

  app.delete("/api/manager/regular-clients/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Некорректный ID постоянного клиента" });
        return;
      }

      await conn.delete(clientRegularClients).where(eq(clientRegularClients.id, id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete regular client");
    }
  });

  app.get("/api/realtime/manager", async (_req, res) => {
    try { res.json(await managerSnapshot()); } catch (error) { sendError(res, error, "Failed to load manager realtime snapshot"); }
  });

  app.get("/api/realtime/courier", async (req, res) => {
    try {
      const courierId = await courierIdFromReq(req);
      if (!courierId) { res.status(401).json({ ok: false, error: "Invalid courier token" }); return; }
      res.json(await courierSnapshot(courierId));
    } catch (error) { sendError(res, error, "Failed to load courier realtime snapshot"); }
  });

  app.get("/api/trpc/tasks.all", async (req, res) => {
    try {
      const courierId = await courierIdFromReq(req);
      if (!courierId) {
        res.status(401).json({ error: { message: "Invalid courier token" } });
        return;
      }

      const [active, completed] = await Promise.all([
        db.getAllTasksWithCourier(),
        db.getCompletedTasksWithCourier(),
      ]);

      res.json(trpcJson(await tasksWithRequestType([...active, ...completed])));
    } catch (error) {
      sendError(res, error, "Failed to load tasks");
    }
  });

  app.post("/api/trpc/tasks.setStatus", async (req, res) => {
    try {
      const input = inputFrom(req);
      const courierId = await courierIdFromReq(req);
      const taskId = Number(input.taskId || input.id);
      const status = normalizeTaskStatus(input.status);
      if (!taskId) throw new Error("taskId is required");
      const task = await db.getTaskById(taskId);
      if (!task) throw new Error("Task not found");
      const assignedCourierId = task.courierId ?? courierId ?? null;
      await db.updateTaskStatus(taskId, status, {
        courierId: assignedCourierId,
        acceptedAt: status === "in_progress" ? new Date() : task.acceptedAt,
        completedAt: status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      });
      await updateRequestStatusFromTask(taskId, status, assignedCourierId);
      broadcastLive("tasks_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to set task status"); }
  });

  app.get("/api/trpc/mails.notDelivered", async (_req, res) => {
    try { res.json(trpcBatchJson(await db.getNotDeliveredMails())); } catch (error) { sendError(res, error, "Failed to load not delivered mails"); }
  });

  app.post("/api/trpc/mails.deliver", async (req, res) => {
    try {
      const input = inputFrom(req);
      const courierId = await courierIdFromReq(req);
      if (!courierId) throw new Error("Invalid courier token");
      const waybillNumber = String(input.waybillNumber || "").trim();
      const recipientSignature = String(input.recipientSignature || input.receivedBy || "").trim();
      if (!waybillNumber) throw new Error("waybillNumber is required");
      if (!recipientSignature) throw new Error("recipientSignature is required");
      const mail = await db.updateMailDelivery(waybillNumber, recipientSignature, courierId);
      broadcastLive("mails_changed");
      res.json(trpcBatchJson({ success: true, mail }));
    } catch (error) { sendError(res, error, "Failed to deliver mail"); }
  });

  app.get("/api/trpc/managerTasks.all", async (_req, res) => {
    try {
      const [active, completed] = await Promise.all([db.getAllTasksWithCourier(), db.getCompletedTasksWithCourier()]);
      res.json(trpcBatchJson([...active, ...completed]));
    } catch (error) { sendError(res, error, "Failed to load manager tasks"); }
  });

  const handleTaskReschedule = async (req: any, res: any) => {
    try {
      const input = inputFrom(req);
      const taskId = Number(input.taskId || input.id || 0);
      const rawDate = input.newDate || input.date || input.targetDate || input.scheduledAt;

      if (!taskId) throw new Error("taskId is required");
      if (!rawDate) throw new Error("newDate is required");

      let newDate: Date;
      if (String(rawDate).includes("-")) {
        const [year, month, day] = String(rawDate).slice(0, 10).split("-").map(Number);
        newDate = new Date(year, month - 1, day);
      } else {
        newDate = new Date(String(rawDate));
      }

      if (Number.isNaN(newDate.getTime())) throw new Error("Invalid newDate");

      await db.updateTaskDate(taskId, newDate);
      broadcastLive("tasks_changed");
      broadcastLive("requests_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to reschedule task");
    }
  };

  app.post("/api/trpc/managerTasks.reschedule", handleTaskReschedule);
  app.post("/api/trpc/tasks.reschedule", handleTaskReschedule);
  app.post("/api/trpc/tasks.updateDate", handleTaskReschedule);
  app.post("/api/trpc/rescheduleTask", handleTaskReschedule);

  app.post("/api/trpc/managerTasks.create", async (req, res) => {
    try {
      const input = inputFrom(req);
      const id = await db.createTask({
        status: normalizeTaskStatus(input.status),
        taskType: (input.taskType as InsertTask["taskType"]) || "regular",
        courierId: typeof input.courierId === "number" ? input.courierId : null,
        recipientName: String(input.recipientName || "Получатель не указан"),
        recipientPhone: input.recipientPhone ? String(input.recipientPhone) : "",
        deliveryAddress: String(input.deliveryAddress || input.recipientAddress || "Адрес не указан"),
        deliveryCity: input.deliveryCity ? String(input.deliveryCity) : null,
        senderName: input.senderName ? String(input.senderName) : null,
        senderAddress: input.senderAddress ? String(input.senderAddress) : null,
        senderPhone: input.senderPhone ? String(input.senderPhone) : null,
        packageDescription: input.packageDescription ? String(input.packageDescription) : null,
        packageType: (input.packageType as InsertTask["packageType"]) || "small",
        placesCount: input.placesCount == null || input.placesCount === "" ? null : Number(input.placesCount),
        deliveryTimeFrom: input.deliveryTimeFrom ? String(input.deliveryTimeFrom) : null,
        deliveryTimeTo: input.deliveryTimeTo ? String(input.deliveryTimeTo) : null,
        specialInstructions: input.specialInstructions ? String(input.specialInstructions) : null,
        comments: input.comments ? String(input.comments) : null,
        items: input.items ? String(input.items) : null,
      });
      broadcastLive("tasks_changed");
      res.json(trpcBatchJson({ id, success: true }));
    } catch (error) { sendError(res, error, "Failed to create manager task"); }
  });

  app.post("/api/trpc/managerTasks.updateStatus", async (req, res) => {
    try {
      const input = inputFrom(req);
      const taskId = Number(input.taskId || input.id);
      const status = normalizeTaskStatus(input.status);
      if (!taskId) throw new Error("taskId is required");
      const task = await db.getTaskById(taskId);
      if (!task) throw new Error("Task not found");
      await db.updateTaskStatus(taskId, status, { completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() });
      await updateRequestStatusFromTask(taskId, status, task.courierId);
      broadcastLive("tasks_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to update manager task status"); }
  });

  app.post("/api/trpc/managerTasks.assignCourier", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const taskId = Number(input.taskId || input.id);
      const courierId = input.courierId == null ? null : Number(input.courierId);
      if (!taskId) throw new Error("taskId is required");

      await db.assignTaskToCourier(taskId, courierId, "assigned");

      const task = await db.getTaskById(taskId);
      const requestId = Number(task?.comments?.match(/\[request:(\d+)\]/)?.[1] || 0);

      if (requestId) {
        await conn.update(requests)
          .set({
            courierId,
            status: courierId ? "assigned" : "pending",
            updatedAt: new Date(),
          })
          .where(eq(requests.id, requestId));
      }

      broadcastLive("tasks_changed", { taskId, requestId, courierId });
      broadcastLive("requests_changed", { taskId, requestId, courierId });
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to assign manager task courier"); }
  });


  app.get("/api/manager/requests/:id/attachments", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      await ensureRequestAttachmentsTable(conn);

      const requestId = Number(req.params.id);
      if (!requestId) throw new Error("request id is required");

      const result = await conn.execute(sql`
        SELECT
          "id",
          "requestId",
          "originalName",
          "storedName",
          "fileUrl",
          "mimeType",
          "sizeBytes",
          "createdAt"
        FROM "requestAttachments"
        WHERE "requestId" = ${requestId}
        ORDER BY "createdAt" ASC, "id" ASC
      `);

      res.json(sqlRows(result));
    } catch (error) {
      sendError(res, error, "Failed to load request attachments");
    }
  });

  app.post(
    "/api/manager/requests/:id/attachments",
    express.raw({ type: "*/*", limit: "25mb" }),
    async (req, res) => {
      try {
        const conn = await db.getDb();
        if (!conn) throw new Error("Database not available");

        await ensureRequestAttachmentsTable(conn);

        const requestId = Number(req.params.id);
        if (!requestId) throw new Error("request id is required");

        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        if (body.length === 0) throw new Error("empty file");
        if (body.length > MAX_REQUEST_ATTACHMENT_BYTES) throw new Error("file is too large");

        const originalName = safeAttachmentName(
          decodeURIComponent(String(req.header("x-file-name") || "file")),
        );
        const mimeType = String(req.header("content-type") || req.header("x-file-type") || "application/octet-stream").slice(0, 255);
        const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16);
        const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        const requestDir = path.join(REQUEST_ATTACHMENTS_DIR, String(requestId));

        await fs.mkdir(requestDir, { recursive: true });
        await fs.writeFile(path.join(requestDir, storedName), body);

        const inserted = await conn.execute(sql`
          INSERT INTO "requestAttachments" (
            "requestId",
            "originalName",
            "storedName",
            "fileUrl",
            "mimeType",
            "sizeBytes"
          )
          VALUES (
            ${requestId},
            ${originalName},
            ${storedName},
            ${attachmentPublicUrl(requestId, storedName)},
            ${mimeType},
            ${body.length}
          )
          RETURNING
            "id",
            "requestId",
            "originalName",
            "storedName",
            "fileUrl",
            "mimeType",
            "sizeBytes",
            "createdAt"
        `);

        broadcastLive("requests_changed", { requestId });
        res.json(sqlRows(inserted)[0]);
      } catch (error) {
        sendError(res, error, "Failed to upload request attachment");
      }
    },
  );

  app.delete("/api/manager/request-attachments/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      await ensureRequestAttachmentsTable(conn);

      const id = Number(req.params.id);
      if (!id) throw new Error("attachment id is required");

      const existing = await conn.execute(sql`
        SELECT "id", "requestId", "storedName"
        FROM "requestAttachments"
        WHERE "id" = ${id}
        LIMIT 1
      `);
      const attachment = sqlRows(existing)[0];

      if (attachment) {
        await conn.execute(sql`DELETE FROM "requestAttachments" WHERE "id" = ${id}`);

        try {
          await fs.unlink(path.join(REQUEST_ATTACHMENTS_DIR, String(attachment.requestId), String(attachment.storedName)));
        } catch {
          // File may already be absent; DB delete is enough.
        }

        broadcastLive("requests_changed", { requestId: attachment.requestId });
      }

      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete request attachment");
    }
  });


  // ─── Partners ──────────────────────────────────────────────────────────────

  app.get("/api/manager/partners", async (_req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const rows = await conn
        .select()
        .from(partners)
        .orderBy(partners.name, partners.id);

      res.json(rows);
    } catch (error) {
      sendError(res, error, "Failed to load partners");
    }
  });

  app.post("/api/manager/partners", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const name = String(input.name || "").trim();

      if (!name) {
        res.status(400).json({ error: "Укажите название партнёра" });
        return;
      }

      const inserted = await conn
        .insert(partners)
        .values({
          name,
          email: input.email ? String(input.email).trim() : null,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          comment: input.comment ? String(input.comment).trim() : null,
          isActive: input.isActive === false ? false : true,
        })
        .returning();

      res.json(inserted[0]);
    } catch (error) {
      sendError(res, error, "Failed to create partner");
    }
  });

  app.put("/api/manager/partners/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      const input = inputFrom(req);
      const name = String(input.name || "").trim();

      if (!id || !name) {
        res.status(400).json({ error: "Укажите ID и название партнёра" });
        return;
      }

      const updated = await conn
        .update(partners)
        .set({
          name,
          email: input.email ? String(input.email).trim() : null,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          comment: input.comment ? String(input.comment).trim() : null,
          isActive: input.isActive === false ? false : true,
          updatedAt: new Date(),
        })
        .where(eq(partners.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error) {
      sendError(res, error, "Failed to update partner");
    }
  });

  app.delete("/api/manager/partners/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Некорректный ID партнёра" });
        return;
      }

      await conn.delete(partners).where(eq(partners.id, id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete partner");
    }
  });

  // ─── Transport Companies ───────────────────────────────────────────────────

  app.get("/api/manager/transport-companies", async (_req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const rows = await conn
        .select()
        .from(transportCompanies)
        .orderBy(transportCompanies.name, transportCompanies.id);

      res.json(rows);
    } catch (error) {
      sendError(res, error, "Failed to load transport companies");
    }
  });

  app.post("/api/manager/transport-companies", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!name || !address) {
        res.status(400).json({ error: "Укажите название и адрес ТК" });
        return;
      }

      const inserted = await conn
        .insert(transportCompanies)
        .values({
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          comment: input.comment ? String(input.comment).trim() : null,
          isActive: input.isActive === false ? false : true,
        })
        .returning();

      res.json(inserted[0]);
    } catch (error) {
      sendError(res, error, "Failed to create transport company");
    }
  });

  app.put("/api/manager/transport-companies/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      const input = inputFrom(req);
      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!id || !name || !address) {
        res.status(400).json({ error: "Укажите ID, название и адрес ТК" });
        return;
      }

      const updated = await conn
        .update(transportCompanies)
        .set({
          name,
          address,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          phone: input.phone ? String(input.phone).trim() : null,
          comment: input.comment ? String(input.comment).trim() : null,
          isActive: input.isActive === false ? false : true,
          updatedAt: new Date(),
        })
        .where(eq(transportCompanies.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error) {
      sendError(res, error, "Failed to update transport company");
    }
  });

  app.delete("/api/manager/transport-companies/:id", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const id = Number(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Некорректный ID ТК" });
        return;
      }

      await conn.delete(transportCompanies).where(eq(transportCompanies.id, id));
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Failed to delete transport company");
    }
  });


  app.get("/api/request-attachments/:requestId/:storedName", async (req, res) => {
    try {
      const requestId = Number(req.params.requestId);
      if (!requestId) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const storedName = safeAttachmentName(req.params.storedName);
      const filePath = path.resolve(REQUEST_ATTACHMENTS_DIR, String(requestId), storedName);
      const allowedRoot = path.resolve(REQUEST_ATTACHMENTS_DIR, String(requestId));

      if (!filePath.startsWith(allowedRoot + path.sep)) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) {
          res.status(404).json({ error: "Not found" });
        }
      });
    } catch {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.get("/api/trpc/requests.all", async (_req, res) => {
    try { res.json(trpcBatchJson(await requestRows())); } catch (error) { sendError(res, error, "Failed to load requests"); }
  });

  app.post("/api/trpc/requests.create", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const rawRequestDate = input.requestDate || input.scheduledDate || input.deliveryDate;
      const rawScheduledAt = input.scheduledAt;
      let scheduledAt: Date | null = null;

      if (rawScheduledAt) {
        const parsed = new Date(String(rawScheduledAt));
        if (!Number.isNaN(parsed.getTime())) scheduledAt = parsed;
      } else if (rawRequestDate) {
        const [year, month, day] = String(rawRequestDate).slice(0, 10).split("-").map(Number);
        if (year && month && day) scheduledAt = new Date(year, month - 1, day);
      }

      const payload: InsertRequest = {
        createdByUserId: Number(input.createdByUserId || 1),
        requestType: (input.requestType as InsertRequest["requestType"]) || "delivery",
        status: input.courierId ? "assigned" : "pending",
        courierId: typeof input.courierId === "number" ? input.courierId : null,
        clientId: typeof input.clientId === "number" ? input.clientId : null,
        recipientName: input.recipientName ? String(input.recipientName) : null,
        recipientPhone: input.recipientPhone ? String(input.recipientPhone) : null,
        recipientAddress: input.recipientAddress ? String(input.recipientAddress) : null,
        recipientCompany: input.recipientCompany ? String(input.recipientCompany) : null,
        recipientCity: input.recipientCity ? String(input.recipientCity) : null,
        deliveryAddress: input.deliveryAddress ? String(input.deliveryAddress) : null,
        deliveryCity: input.deliveryCity ? String(input.deliveryCity) : null,
        packageDescription: input.packageDescription ? String(input.packageDescription) : null,
        packageType: (input.packageType as InsertRequest["packageType"]) || "small",
        placesCount: input.placesCount == null || input.placesCount === "" ? null : Number(input.placesCount),
        senderName: input.senderName ? String(input.senderName) : null,
        senderCompany: input.senderCompany ? String(input.senderCompany) : null,
        senderCity: input.senderCity ? String(input.senderCity) : null,
        senderAddress: input.senderAddress ? String(input.senderAddress) : null,
        senderPhone: input.senderPhone ? String(input.senderPhone) : null,
        items: input.items ? String(input.items) : null,
        callReason: input.callReason ? String(input.callReason) : null,
        tcName: input.tcName ? String(input.tcName) : null,
        tcAddress: input.tcAddress ? String(input.tcAddress) : null,
        trackingNumber: input.trackingNumber ? String(input.trackingNumber) : null,
        description: input.description ? String(input.description) : null,
        specialInstructions: input.specialInstructions ? String(input.specialInstructions) : null,
        comments: input.comments ? String(input.comments) : null,
        paymentMethod: (input.paymentMethod as InsertRequest["paymentMethod"]) || null,
        paymentAmount: input.paymentAmount ? String(input.paymentAmount) : null,
        deliveryTimeFrom: input.deliveryTimeFrom ? String(input.deliveryTimeFrom) : null,
        deliveryTimeTo: input.deliveryTimeTo ? String(input.deliveryTimeTo) : null,
        estimatedMinutes: input.estimatedMinutes ? Number(input.estimatedMinutes) : null,
        scheduledAt: scheduledAt,
      };
      const inserted = await conn.insert(requests).values(payload).returning();
      const request = inserted[0] as DeliveryRequest;
      const taskId = await syncTaskForRequest(request);

      const requestForPush = await db.getRequestById(request.id);

      const push = buildNewRequestPush({
        id: request.id,
        requestType: requestForPush?.requestType || request.requestType,
        deliveryAddress: requestForPush?.deliveryAddress || request.deliveryAddress,
        recipientAddress: requestForPush?.recipientAddress || request.recipientAddress,
        senderAddress: requestForPush?.senderAddress || request.senderAddress,
        senderName: requestForPush?.senderName || request.senderName,
        senderCompany: requestForPush?.senderCompany || request.senderCompany,
        recipientName: requestForPush?.recipientName || request.recipientName,
        recipientCompany: requestForPush?.recipientCompany || request.recipientCompany,
        tcName: requestForPush?.tcName || request.tcName,
        packageDescription: requestForPush?.packageDescription || request.packageDescription,
        placesCount: requestForPush?.placesCount || request.placesCount,
        paymentMethod: requestForPush?.paymentMethod || request.paymentMethod,
      });

      await sendPushToAllCouriers(
        push.title,
        push.body,
        {
          type: "new_request_available",
          requestId: request.id,
          requestType: request.requestType,
        },
      );

      broadcastLive("requests_changed");
      broadcastLive("tasks_changed");
      res.json(trpcBatchJson({ id: request.id, taskId, success: true }));
    } catch (error) { sendError(res, error, "Failed to create request"); }
  });

  app.post("/api/trpc/requests.updateStatus", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");
      const status = normalizeRequestStatus(input.status);
      const updated = await conn.update(requests).set({ status, completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() }).where(eq(requests.id, id)).returning();
      if (updated[0]) await syncTaskForRequest(updated[0] as DeliveryRequest);
      broadcastLive("requests_changed");
      broadcastLive("tasks_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to update request status"); }
  });

  app.post("/api/trpc/requests.assignCourier", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const id = Number(input.id);
      const courierId = input.courierId == null ? null : Number(input.courierId);
      if (!id) throw new Error("id is required");
      const updated = await conn.update(requests).set({ courierId, status: courierId ? "assigned" : "pending", updatedAt: new Date() }).where(eq(requests.id, id)).returning();
      if (updated[0]) await syncTaskForRequest(updated[0] as DeliveryRequest);

      if (courierId && updated[0]) {
        try {
          const courier = await db.getCourierById(courierId);
          const request = updated[0] as DeliveryRequest;

          console.log("[PUSH] compat request", id);
          console.log("[PUSH] compat courier", courier?.id);
          console.log("[PUSH] compat token exists", !!courier?.pushToken);

          if (courier?.pushToken) {
            const address =
              request.deliveryAddress ||
              request.recipientAddress ||
              request.senderAddress ||
              "Адрес не указан";

            console.log("[PUSH] compat sending to", courier.pushToken.slice(0, 25));

            const push = buildNewRequestPush({
              id: request.id,
              requestType: request.requestType,
              deliveryAddress: request.deliveryAddress,
              recipientAddress: request.recipientAddress,
              senderAddress: request.senderAddress,
              senderName: request.senderName,
              senderCompany: request.senderCompany,
              recipientName: request.recipientName,
              recipientCompany: request.recipientCompany,
              tcName: request.tcName,
              packageDescription: request.packageDescription,
            });

            await sendExpoPush(
              courier.pushToken,
              push.title,
              push.body,
              {
                type: "new_request",
                requestId: request.id,
              },
            );

            console.log("[PUSH] compat sent successfully");
          } else {
            console.log("[PUSH] compat skipped no token");
          }
        } catch (e) {
          console.error("[PUSH] compat failed", e);
        }
      }

      // Hard-sync the linked mobile task too. The task is linked by [request:ID] in comments.
      await conn.update(tasks)
        .set({ courierId, status: "assigned", updatedAt: new Date() })
        .where(sql`${tasks.comments} like ${`%[request:${id}]%`}`);

      broadcastLive("requests_changed", { requestId: id, courierId });
      broadcastLive("tasks_changed", { requestId: id, courierId });
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to assign request courier"); }
  });


  app.post("/api/trpc/hemotest.updatePoint", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!name || !address) {
        res.status(400).json({ error: { message: "Название и адрес обязательны" } });
        return;
      }

      const updated = await conn.update(hemotestPickupPoints)
        .set({
          name,
          address,
          phone: input.phone ? String(input.phone).trim() : null,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(hemotestPickupPoints.id, id))
        .returning();

      broadcastLive("hemotest_changed", { id });
      res.json(trpcBatchJson(updated[0] || { success: true }));
    } catch (error) {
      sendError(res, error, "Failed to update hemotest point");
    }
  });


  app.post("/api/trpc/hemotest.deletePoint", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const existing = await conn
        .select()
        .from(hemotestPickupPoints)
        .where(eq(hemotestPickupPoints.id, id))
        .limit(1);

      const point = existing[0];

      await conn.delete(hemotestListItems).where(eq(hemotestListItems.pointId, id));
      await conn.delete(hemotestPickups).where(eq(hemotestPickups.pointId, id));
      await conn.delete(hemotestPickupPoints).where(eq(hemotestPickupPoints.id, id));

      if (point) {
        await conn.delete(clientPoints).where(sql`
          ${clientPoints.clientId} = 6
          AND lower(trim(coalesce(${clientPoints.name}, ''))) = lower(trim(coalesce(${point.name}, '')))
          AND lower(trim(coalesce(${clientPoints.address}, ''))) = lower(trim(coalesce(${point.address}, '')))
        `);
      }

      broadcastLive("hemotest_changed", { id });
      broadcastLive("clients_changed", { clientId: 6 });

      res.json(trpcBatchJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to delete hemotest point");
    }
  });


  app.post("/api/trpc/sberbank.deletePoint", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const existing = await conn
        .select()
        .from(sberbankPickupPoints)
        .where(eq(sberbankPickupPoints.id, id))
        .limit(1);

      const point = existing[0];

      await conn.delete(sberbankListItems).where(eq(sberbankListItems.pointId, id));
      await conn.delete(sberbankPickups).where(eq(sberbankPickups.pointId, id));
      await conn.delete(sberbankPickupPoints).where(eq(sberbankPickupPoints.id, id));

      if (point) {
        const sberbankClientRows = await conn.execute(sql`
          SELECT id
          FROM clients
          WHERE lower(name) LIKE '%сбербанк%'
          ORDER BY id
          LIMIT 1
        `) as any;

        const sberbankClient = Array.isArray(sberbankClientRows) ? sberbankClientRows[0] : sberbankClientRows?.rows?.[0];

        if (sberbankClient?.id) {
          await conn.delete(clientPoints).where(sql`
            ${clientPoints.clientId} = ${Number(sberbankClient.id)}
            AND lower(trim(coalesce(${clientPoints.name}, ''))) = lower(trim(coalesce(${point.name}, '')))
            AND lower(trim(coalesce(${clientPoints.address}, ''))) = lower(trim(coalesce(${point.address}, '')))
          `);
        }
      }

      broadcastLive("sberbank_changed", { id });
      broadcastLive("clients_changed", {});

      res.json(trpcBatchJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to delete sberbank point");
    }
  });


  app.post("/api/trpc/sberbank.updatePoint", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const name = String(input.name || "").trim();
      const address = String(input.address || "").trim();

      if (!name || !address) {
        res.status(400).json({ error: { message: "Название и адрес обязательны" } });
        return;
      }

      const updated = await conn.update(sberbankPickupPoints)
        .set({
          name,
          address,
          phone: input.phone ? String(input.phone).trim() : null,
          contactPerson: input.contactPerson ? String(input.contactPerson).trim() : null,
          updatedAt: new Date(),
        })
        .where(eq(sberbankPickupPoints.id, id))
        .returning();

      broadcastLive("sberbank_changed", { id });
      res.json(trpcBatchJson(updated[0] || { success: true }));
    } catch (error) {
      sendError(res, error, "Failed to update sberbank point");
    }
  });

  app.get("/api/trpc/managerMails.all", async (req, res) => {
    try {
      const input = inputFrom(req);
      const status = input.status === "delivered" || input.status === "not_delivered" ? input.status : undefined;
      const mailList = await db.getMailsByFilter(status, input.dateFrom as string | undefined, input.dateTo as string | undefined);
      res.json(trpcBatchJson(await mailsWithCourierName(mailList)));
    } catch (error) { sendError(res, error, "Failed to load manager mails"); }
  });

  app.post("/api/trpc/managerMails.create", async (req, res) => {
    try {
      const input = inputFrom(req);
      const waybillNumber = String(input.waybillNumber || "").trim();
      if (!waybillNumber) throw new Error("waybillNumber is required");
      const existing = await db.getMailByWaybill(waybillNumber);
      if (existing) { res.json(trpcBatchJson(existing)); return; }
      const mail = await db.createMail({ waybillNumber, recipientName: input.recipientName ? String(input.recipientName) : null, recipientPhone: String(input.recipientPhone || ""), deliveryAddress: String(input.deliveryAddress || "Адрес не указан"), status: "not_delivered" });
      broadcastLive("mails_changed");
      res.json(trpcBatchJson(mail));
    } catch (error) { sendError(res, error, "Failed to create mail"); }
  });

  app.post("/api/trpc/managerMails.delete", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");
      await conn.delete(mails).where(eq(mails.id, id));
      broadcastLive("mails_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to delete mail"); }
  });

  app.post("/api/trpc/managerMails.clear", async (_req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      await conn.delete(mails);
      broadcastLive("mails_changed");
      res.json(trpcBatchJson({ success: true }));
    } catch (error) { sendError(res, error, "Failed to clear mails"); }
  });

  app.post("/api/trpc/managerMails.bulkCreate", async (req, res) => {
    try {
      const input = inputFrom(req);
      const mailList = Array.isArray(input.mails) ? input.mails as Array<Partial<InsertMail>> : [];
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const item of mailList) {
        const waybillNumber = String(item.waybillNumber || "").trim();
        if (!waybillNumber) { errors.push("waybillNumber is required"); continue; }
        const existing = await db.getMailByWaybill(waybillNumber);
        if (existing) { skipped += 1; continue; }
        await db.createMail({ waybillNumber, recipientName: item.recipientName ?? null, recipientPhone: String(item.recipientPhone || ""), deliveryAddress: String(item.deliveryAddress || "Адрес не указан"), status: "not_delivered" });
        created += 1;
      }
      broadcastLive("mails_changed");
      res.json(trpcBatchJson({ created, skipped, errors }));
    } catch (error) { sendError(res, error, "Failed to bulk create mails"); }
  });
}
