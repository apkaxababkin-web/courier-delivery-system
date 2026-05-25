import { asc, eq, sql } from "drizzle-orm";
import { requests, tasks, type InsertTask, type Request as DeliveryRequest, type Task } from "../../drizzle/schema";
import * as db from "../db";

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

function requestStatusFromTask(status: Task["status"]): DeliveryRequest["status"] {
  if (status === "assigned") return "pending";
  if (status === "in_progress") return "accepted" as DeliveryRequest["status"];
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export function requestMarker(id: number) {
  return `[request:${id}]`;
}

function taskFromRequest(request: DeliveryRequest): InsertTask {
  const fallbackAddress = request.deliveryAddress || request.recipientAddress || request.senderAddress || request.tcAddress || "Адрес не указан";
  const fallbackName = request.recipientName || request.recipientCompany || request.senderName || request.senderCompany || "Получатель не указан";
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

    const taskData = taskFromRequest(request);
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

  const updateData: Partial<DeliveryRequest> = {
    status: requestStatusFromTask(status),
    courierId: courierId ?? task?.courierId ?? null,
    updatedAt: new Date(),
  };

  if (status === "in_progress") updateData.acceptedAt = new Date();
  if (status === "completed") updateData.completedAt = new Date();

  await conn.update(requests).set(updateData).where(eq(requests.id, requestId));
}
