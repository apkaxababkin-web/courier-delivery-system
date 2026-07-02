import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerCompatRoutes } from "./compatRoutes";
import { startCourierReminderScheduler } from "./courierReminderScheduler";
import { broadcastLive } from "./liveEvents";
import { syncTaskForRequestId } from "./requestTaskSync";
import { appRouter, verifyCourierToken } from "../routers";
import { createContext } from "./context";
import { mails, requests, tasks, taskStatusHistory } from "../../drizzle/schema";
import * as db from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function trpcJson(data: unknown) {
  return { result: { data: { json: data } } };
}
function trpcBatchJson(data: unknown) {
  return [trpcJson(data)];
}

function sendTrpcResponse(res: express.Response, isBatch: boolean, data: unknown) {
  res.json(isBatch ? trpcBatchJson(data) : trpcJson(data));
}

function unwrapTrpcInput(item: any): Record<string, unknown> {
  return (item?.json ?? item ?? {}) as Record<string, unknown>;
}

function inputFromBody(body: any): { input: Record<string, unknown>; isBatch: boolean } {
  const firstArrayBatchItem = body?.[0];
  if (firstArrayBatchItem) {
    return { input: unwrapTrpcInput(firstArrayBatchItem), isBatch: true };
  }

  const firstKeyedBatchItem = body?.["0"];
  if (firstKeyedBatchItem) {
    return { input: unwrapTrpcInput(firstKeyedBatchItem), isBatch: true };
  }

  return { input: unwrapTrpcInput(body), isBatch: false };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.post("/api/trpc/mails.deliver", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const { input, isBatch } = inputFromBody(req.body);
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const token = String(input.token ?? bearerToken ?? "");
      const payload = await verifyCourierToken(token);
      if (!payload) throw new Error("Invalid courier token");

      const mailId = Number(input.mailId || input.id || 0);
      const waybillNumber = String(input.waybillNumber || "").trim();
      const recipientSignature = String(input.recipientSignature || input.receivedBy || "").trim();
      const deliveredAtRaw = input.deliveredAt ? new Date(String(input.deliveredAt)) : new Date();
      const deliveredAt = Number.isNaN(deliveredAtRaw.getTime()) ? new Date() : deliveredAtRaw;

      if (!mailId && !waybillNumber) throw new Error("mailId or waybillNumber is required");
      if (!recipientSignature) throw new Error("recipientSignature is required");

      const updateData = {
        status: "delivered" as const,
        recipientSignature,
        courierId: payload.courierId,
        deliveredAt,
        updatedAt: new Date(),
      };

      const updated = mailId
        ? await conn.update(mails).set(updateData).where(eq(mails.id, mailId)).returning()
        : await conn.update(mails).set(updateData).where(eq(mails.waybillNumber, waybillNumber)).returning();

      if (!updated[0]) throw new Error("Mail not found");

      const response = { success: true, mail: updated[0] };
      broadcastLive("mails_changed", { mailId: updated[0].id });
      res.json(isBatch ? trpcBatchJson(response) : trpcJson(response));
    } catch (error) {
      console.error("Failed to deliver mail", error);
      const message = error instanceof Error ? error.message : "Failed to deliver mail";
      res.status(500).json({ error: { message } });
    }
  });

  app.post("/api/trpc/mails.undoDelivery", async (req, res) => {
    try {
      const { input, isBatch } = inputFromBody(req.body);
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const token = String(input.token ?? bearerToken ?? "");
      const payload = await verifyCourierToken(token);
      if (!payload) throw new Error("Invalid courier token");

      const mailId = Number(input.mailId || input.id || 0);
      if (!mailId) throw new Error("mailId is required");

      const mail = await db.undoMailDelivery(mailId);
      broadcastLive("mails_changed", { mailId: mail.id, undo: true });

      const response = { success: true, mail };
      res.json(isBatch ? trpcBatchJson(response) : trpcJson(response));
    } catch (error) {
      console.error("Failed to undo mail delivery", error);
      const message = error instanceof Error ? error.message : "Failed to undo mail delivery";
      res.status(500).json({ error: { message } });
    }
  });

  registerCompatRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get("/api/trpc/manager.couriers", async (_req, res) => {
    try {
      const couriers = await db.getAllCouriers();
      res.json(trpcBatchJson(couriers));
    } catch (error) {
      console.error("[manager.couriers] failed", error);
      res.status(500).json({ error: { message: "Failed to load couriers" } });
    }
  });

  app.post("/api/trpc/manager.createCourier", async (req, res) => {
    try {
      const input = req.body?.json ?? req.body ?? {};
      const name = String(input.name ?? "").trim();
      const username = String(input.username ?? "").trim();
      const password = String(input.password ?? "");
      const phone = input.phone ? String(input.phone).trim() : null;
      const vehicleType = input.vehicleType || "car";

      if (!name || !username || !password) {
        res.status(400).json({ error: { message: "name, username and password are required" } });
        return;
      }

      const existing = await db.getCourierByUsername(username);
      if (existing) {
        res.status(409).json({ error: { message: "Courier username already exists" } });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const id = await db.createCourier({
        name,
        username,
        passwordHash,
        phone,
        vehicleType,
        isActive: true,
        totalDeliveries: 0,
      });

      res.json(trpcBatchJson({ id, success: true }));
    } catch (error) {
      console.error("[manager.createCourier] failed", error);
      res.status(500).json({ error: { message: "Failed to create courier" } });
    }
  });


  app.post("/api/trpc/requests.update", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const { input, isBatch } = inputFromBody(req.body);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const allowedTextFields = [
        "senderName",
        "senderPhone",
        "senderAddress",
        "recipientName",
        "recipientPhone",
        "recipientAddress",
        "deliveryAddress",
        "deliveryCity",
        "packageDescription",
        "specialInstructions",
        "comments",
        "items",
        "callReason",
        "tcName",
        "tcAddress",
        "trackingNumber",
        "description",
        "deliveryTimeFrom",
        "deliveryTimeTo",
      ] as const;

      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      for (const field of allowedTextFields) {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
          const value = input[field];
          updateData[field] = value == null ? null : String(value);
        }
      }

      if (input.requestType) updateData.requestType = input.requestType;
      if (input.packageType) updateData.packageType = input.packageType;
      if (input.paymentMethod) updateData.paymentMethod = input.paymentMethod;

      if (Object.prototype.hasOwnProperty.call(input, "paymentAmount")) {
        updateData.paymentAmount = input.paymentAmount == null || input.paymentAmount === "" ? null : String(input.paymentAmount);
      }

      if (Object.prototype.hasOwnProperty.call(input, "placesCount")) {
        updateData.placesCount = input.placesCount == null || input.placesCount === "" ? null : Number(input.placesCount);
      }

      if (Object.prototype.hasOwnProperty.call(input, "estimatedMinutes")) {
        updateData.estimatedMinutes = input.estimatedMinutes == null || input.estimatedMinutes === "" ? null : Number(input.estimatedMinutes);
      }

      const updated = await conn.update(requests).set(updateData as any).where(eq(requests.id, id)).returning();
      if (!updated[0]) throw new Error("Request not found");

      const request = updated[0] as any;

      await syncTaskForRequestId(id);

      broadcastLive("requests_changed", { requestId: id });
      broadcastLive("tasks_changed", { requestId: id });
      sendTrpcResponse(res, isBatch, { success: true, request });
    } catch (error) {
      console.error("[requests.update] failed", error);
      const message = error instanceof Error ? error.message : "Failed to update request";
      res.status(500).json({ error: { message } });
    }
  });

  app.post("/api/trpc/requests.delete", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const { input, isBatch } = inputFromBody(req.body);
      const id = Number(input.id);
      if (!id) throw new Error("id is required");

      const marker = `[request:${id}]`;

      await conn.transaction(async (tx: any) => {
        const linkedTasks = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(sql`${tasks.comments} like ${`%${marker}%`}`);

        const taskIds = linkedTasks.map((task: { id: number }) => task.id);

        if (taskIds.length > 0) {
          await tx.delete(taskStatusHistory).where(inArray(taskStatusHistory.taskId, taskIds));
          await tx.delete(tasks).where(inArray(tasks.id, taskIds));
        }

        await tx.delete(requests).where(eq(requests.id, id));
      });

      broadcastLive("requests_changed", { requestId: id });
      broadcastLive("tasks_changed", { requestId: id });
      sendTrpcResponse(res, isBatch, { success: true });
    } catch (error) {
      console.error("[requests.delete] failed", error);
      const message = error instanceof Error ? error.message : "Failed to delete request";
      res.status(500).json({ error: { message } });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(publicPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"), (err) => {
      if (err) {
        res.status(404).json({ error: "Not found" });
      }
    });
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
    console.log(`[api] serving static files from ${publicPath}`);
    startCourierReminderScheduler();
  });
}

startServer().catch(console.error);
