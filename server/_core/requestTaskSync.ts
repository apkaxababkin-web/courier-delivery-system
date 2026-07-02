import { asc, eq, sql } from "drizzle-orm";
import { requests, tasks, type InsertTask, type Request as DeliveryRequest, type Task } from "../../drizzle/schema";
import * as db from "../db";

const COURIER_TIME_ZONE = "Asia/Irkutsk";

function getCourierBusinessNoon(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: COURIER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  // Store noon of the courier business day. This avoids Moscow/UTC date drift
  // while keeping the value inside the selected day for the existing task filter.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function normalizeTaskStatus(status: unknown): Task["status"] {
  if (status === "in_progress" || status === "completed" || status === "cancelled") return status;
  return "assigned";
}

export function normalizeRequestStatus(status: unknown): DeliveryRequest["status"] {
  if (status === "assigned" || status === "in_progress" || status === "completed" || status === "cancelled") return status;
  return "pending";
}

function taskTypeFromRequest(type: unknown): InsertTask["taskType"] {
  if (type === "courier_call") return "courier_call";
  if (type === "nuts") return "warehouse_pickup";
  return "regular";
}

function requestStatusFromTask(status: Task["status"], courierId?: number | null): DeliveryRequest["status"] {
  if (status === "assigned") return courierId ? "assigned" : "pending";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export function requestMarker(id: number) {
  return `[request:${id}]`;
}

function taskFromRequest(request: DeliveryRequest, client?: { name?: string | null; address?: string | null; phone?: string | null } | null): InsertTask {
  const isSimpleRequest = request.requestType === "simple";

  const pickupName =
    request.senderName ||
    request.senderCompany ||
    request.recipientName ||
    request.recipientCompany ||
    "Место забора";

  const pickupAddress =
    request.senderAddress ||
    request.deliveryAddress ||
    request.recipientAddress ||
    request.tcAddress ||
    "Адрес не указан";

  const clientName =
    client?.name ||
    request.recipientName ||
    request.recipientCompany ||
    "Клиент не указан";

  const clientAddress =
    client?.address ||
    request.deliveryAddress ||
    request.recipientAddress ||
    "";

  const fallbackAddress = isSimpleRequest
    ? pickupAddress
    : request.deliveryAddress || request.recipientAddress || request.senderAddress || request.tcAddress || "Адрес не указан";

  const fallbackName = isSimpleRequest
    ? clientName
    : request.recipientName || request.recipientCompany || request.senderName || request.senderCompany || "Получатель не указан";
  const comments = [
    requestMarker(request.id),
    request.requestType ? `Тип заявки: ${request.requestType}` : null,
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
    status: normalizeTaskStatus(request.status),
    taskType: taskTypeFromRequest(request.requestType),
    recipientName: fallbackName,
    recipientPhone: isSimpleRequest ? client?.phone || request.recipientPhone || "" : request.recipientPhone || request.senderPhone || "",
    recipientAddress: isSimpleRequest ? clientAddress || null : request.recipientAddress ?? null,
    deliveryAddress: fallbackAddress,
    deliveryCity: request.deliveryCity || request.recipientCity || request.senderCity || null,
    senderName: isSimpleRequest ? pickupName : request.senderName || request.senderCompany || request.tcName || null,
    senderAddress: isSimpleRequest ? pickupAddress : request.senderAddress || request.tcAddress || null,
    senderPhone: request.senderPhone ?? null,
    packageDescription: request.packageDescription || request.description || request.callReason || null,
    packageType: request.packageType ?? "small",
    placesCount: request.placesCount ?? 1,
    estimatedMinutes: request.estimatedMinutes ?? null,
    deliveryTimeFrom: request.deliveryTimeFrom ?? null,
    deliveryTimeTo: request.deliveryTimeTo ?? null,
    specialInstructions: request.specialInstructions ?? null,
    comments,
    items: request.items ?? null,
    scheduledAt: request.scheduledAt ?? getCourierBusinessNoon(request.createdAt ?? new Date()),
    acceptedAt: request.acceptedAt ?? null,
    completedAt: request.completedAt ?? null,
  };
}

export async function syncTaskForRequest(request: DeliveryRequest): Promise<number> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  return conn.transaction(async (tx: any) => {
    const marker = requestMarker(request.id);
    await tx.execute(sql`select pg_advisory_xact_lock(${request.id})`);

    const existingTasks = await tx
      .select()
      .from(tasks)
      .where(sql`${tasks.comments} like ${`%${marker}%`}`)
      .orderBy(asc(tasks.id));

    const client = request.clientId ? await db.getClientById(request.clientId) : null;
    const taskData = taskFromRequest(request, client);
    const existingTask = existingTasks[0];

    if (existingTask) {
      await tx.update(tasks).set({ ...taskData, updatedAt: new Date() }).where(eq(tasks.id, existingTask.id));
      return existingTask.id;
    }

    const inserted = await tx.insert(tasks).values(taskData).returning({ id: tasks.id });
    return inserted[0].id;
  });
}

export async function syncTaskForRequestId(requestId: number): Promise<number | null> {
  const request = await db.getRequestById(requestId);
  if (!request) return null;
  return syncTaskForRequest(request);
}

export async function updateRequestStatusFromTask(taskId: number, status: Task["status"], courierId?: number | null) {
  const conn = await db.getDb();
  if (!conn) return;

  const task = await db.getTaskById(taskId);
  const marker = task?.comments?.match(/\[request:(\d+)\]/)?.[1];
  if (!marker) return;

  const requestId = Number(marker);
  if (!requestId) return;

  const nextCourierId = courierId ?? task?.courierId ?? null;
  const updateData: Partial<DeliveryRequest> = {
    status: requestStatusFromTask(status, nextCourierId),
    courierId: nextCourierId,
    updatedAt: new Date(),
  };

  if (status === "in_progress") updateData.acceptedAt = new Date();
  if (status === "completed") updateData.completedAt = new Date();

  await conn.update(requests).set(updateData).where(eq(requests.id, requestId));
}
