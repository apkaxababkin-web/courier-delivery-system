import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  couriers,
  mails,
  requests,
  tasks,
  type InsertMail,
  type InsertRequest,
  type InsertTask,
  type Request as DeliveryRequest,
  type Task,
} from "../../drizzle/schema";
import * as db from "../db";

function trpcJson(data: unknown) {
  return { result: { data: { json: data } } };
}

function inputFrom(req: Request): Record<string, unknown> {
  const body = (req.body?.json ?? req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(body).length > 0) return body;

  const raw = req.query.input;
  if (typeof raw !== "string" || !raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeStatus(status: unknown): Task["status"] {
  if (status === "in_progress" || status === "completed" || status === "cancelled") return status;
  return "assigned";
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
    status: normalizeStatus(request.status),
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
    placesCount: request.placesCount ?? 1,
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

async function requestRows() {
  const conn = await db.getDb();
  if (!conn) return [];
  const allRequests = await conn.select().from(requests).orderBy(desc(requests.createdAt));
  const allCouriers = await conn.select({ id: couriers.id, name: couriers.name }).from(couriers);
  const courierMap = new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
  return allRequests.map((request: DeliveryRequest) => ({
    ...request,
    courierName: request.courierId ? courierMap.get(request.courierId) ?? null : null,
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
    completedAt: status === "completed" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(requests.id, requestId));
}

async function managerSnapshot() {
  const [activeTasks, completedTasks, requestList, mailList] = await Promise.all([
    db.getAllTasksWithCourier(),
    db.getCompletedTasksWithCourier(),
    requestRows(),
    db.getAllMails(),
  ]);
  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    tasks: [...activeTasks, ...completedTasks],
    requests: requestList,
    mails: mailList,
  };
}

function sendError(res: Response, error: unknown, fallback: string) {
  console.error(fallback, error);
  const message = error instanceof Error ? error.message : fallback;
  res.status(500).json({ error: { message } });
}

export function registerCompatRoutes(app: Express) {
  app.get("/api/realtime/manager", async (_req, res) => {
    try {
      res.json(await managerSnapshot());
    } catch (error) {
      sendError(res, error, "Failed to load manager realtime snapshot");
    }
  });

  app.get("/api/trpc/managerTasks.all", async (_req, res) => {
    try {
      const [active, completed] = await Promise.all([db.getAllTasksWithCourier(), db.getCompletedTasksWithCourier()]);
      res.json(trpcJson([...active, ...completed]));
    } catch (error) {
      sendError(res, error, "Failed to load manager tasks");
    }
  });

  app.post("/api/trpc/managerTasks.create", async (req, res) => {
    try {
      const input = inputFrom(req);
      const id = await db.createTask({
        status: normalizeStatus(input.status),
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
        placesCount: Number(input.placesCount || 1),
        deliveryTimeFrom: input.deliveryTimeFrom ? String(input.deliveryTimeFrom) : null,
        deliveryTimeTo: input.deliveryTimeTo ? String(input.deliveryTimeTo) : null,
        specialInstructions: input.specialInstructions ? String(input.specialInstructions) : null,
        comments: input.comments ? String(input.comments) : null,
        items: input.items ? String(input.items) : null,
      });
      res.json(trpcJson({ id, success: true }));
    } catch (error) {
      sendError(res, error, "Failed to create manager task");
    }
  });

  app.post("/api/trpc/managerTasks.updateStatus", async (req, res) => {
    try {
      const input = inputFrom(req);
      const taskId = Number(input.taskId || input.id);
      const status = normalizeStatus(input.status);
      if (!taskId) throw new Error("taskId is required");
      const task = await db.getTaskById(taskId);
      if (!task) throw new Error("Task not found");
      await db.updateTaskStatus(taskId, status, {
        completedAt: status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      });
      await updateRequestStatusFromTask(taskId, status, task.courierId);
      res.json(trpcJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to update manager task status");
    }
  });

  app.post("/api/trpc/managerTasks.assignCourier", async (req, res) => {
    try {
      const input = inputFrom(req);
      const taskId = Number(input.taskId || input.id);
      const courierId = input.courierId == null ? null : Number(input.courierId);
      if (!taskId) throw new Error("taskId is required");
      await db.assignTaskToCourier(taskId, courierId, "assigned");
      await updateRequestStatusFromTask(taskId, "assigned", courierId);
      res.json(trpcJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to assign manager task courier");
    }
  });

  app.get("/api/trpc/requests.all", async (_req, res) => {
    try {
      res.json(trpcJson(await requestRows()));
    } catch (error) {
      sendError(res, error, "Failed to load requests");
    }
  });

  app.post("/api/trpc/requests.create", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
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
        placesCount: Number(input.placesCount || 1),
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
      };
      const inserted = await conn.insert(requests).values(payload).returning();
      const request = inserted[0] as DeliveryRequest;
      const taskId = await syncTaskForRequest(request);
      res.json(trpcJson({ id: request.id, taskId, success: true }));
    } catch (error) {
      sendError(res, error, "Failed to create request");
    }
  });

  app.post("/api/trpc/requests.updateStatus", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");
      const status = (input.status as DeliveryRequest["status"]) || "pending";
      const updated = await conn.update(requests).set({
        status,
        completedAt: status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(requests.id, id)).returning();
      if (updated[0]) await syncTaskForRequest(updated[0] as DeliveryRequest);
      res.json(trpcJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to update request status");
    }
  });

  app.post("/api/trpc/requests.assignCourier", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const input = inputFrom(req);
      const id = Number(input.id);
      const courierId = input.courierId == null ? null : Number(input.courierId);
      if (!id) throw new Error("id is required");
      const updated = await conn.update(requests).set({
        courierId,
        status: courierId ? "assigned" : "pending",
        updatedAt: new Date(),
      }).where(eq(requests.id, id)).returning();
      if (updated[0]) await syncTaskForRequest(updated[0] as DeliveryRequest);
      res.json(trpcJson({ success: true }));
    } catch (error) {
      sendError(res, error, "Failed to assign request courier");
    }
  });

  app.get("/api/trpc/managerMails.all", async (req, res) => {
    try {
      const input = inputFrom(req);
      const status = input.status === "delivered" || input.status === "not_delivered" ? input.status : undefined;
      res.json(trpcJson(await db.getMailsByFilter(status, input.dateFrom as string | undefined, input.dateTo as string | undefined)));
    } catch (error) {
      sendError(res, error, "Failed to load manager mails");
    }
  });

  app.post("/api/trpc/managerMails.create", async (req, res) => {
    try {
      const input = inputFrom(req);
      const waybillNumber = String(input.waybillNumber || "").trim();
      if (!waybillNumber) throw new Error("waybillNumber is required");
      const existing = await db.getMailByWaybill(waybillNumber);
      if (existing) {
        res.json(trpcJson(existing));
        return;
      }
      const mail = await db.createMail({
        waybillNumber,
        recipientName: input.recipientName ? String(input.recipientName) : null,
        recipientPhone: String(input.recipientPhone || ""),
        deliveryAddress: String(input.deliveryAddress || "Адрес не указан"),
        status: "not_delivered",
      });
      res.json(trpcJson(mail));
    } catch (error) {
      sendError(res, error, "Failed to create mail");
    }
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
        if (!waybillNumber) {
          errors.push("waybillNumber is required");
          continue;
        }
        const existing = await db.getMailByWaybill(waybillNumber);
        if (existing) {
          skipped += 1;
          continue;
        }
        await db.createMail({
          waybillNumber,
          recipientName: item.recipientName ?? null,
          recipientPhone: String(item.recipientPhone || ""),
          deliveryAddress: String(item.deliveryAddress || "Адрес не указан"),
          status: "not_delivered",
        });
        created += 1;
      }
      res.json(trpcJson({ created, skipped, errors }));
    } catch (error) {
      sendError(res, error, "Failed to bulk create mails");
    }
  });
}
