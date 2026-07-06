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
import { sendExpoPush } from "./expoPush";
import { startCourierReminderScheduler } from "./courierReminderScheduler";
import { appRouter, verifyCourierToken } from "../routers";
import { managerApiAuthGate } from "./managerSecurity";
import { toSafeCourier } from "./courierPublic";
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


function truncatePushText(value: string, max = 120) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function sendManagerChatPushToCouriers(message: {
  id?: number | null;
  senderName?: string | null;
  senderRole?: string | null;
  text?: string | null;
}) {
  try {
    const allCouriers = await db.getAllCouriers();
    const senderName = String(message.senderName || "Менеджер").trim() || "Менеджер";
    const senderRole = String(message.senderRole || "manager").trim();

    const targets = allCouriers.filter((courier) => {
      const token = courier.pushToken || "";
      const hasExpoToken = token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken");
      const isSenderCourier = senderRole === "courier" && courier.name === senderName;
      return hasExpoToken && !isSenderCourier;
    });
    const body = truncatePushText(`${senderName}: ${String(message.text || "").trim()}`, 120);

    console.log("[PUSH_CHAT] targets", targets.length, "message", message.id);

    await Promise.allSettled(
      targets.map((courier) =>
        sendExpoPush(courier.pushToken, "Чат МИГ", body, {
          type: "chat_message",
          messageId: message.id,
          senderRole: message.senderRole || "manager",
        }),
      ),
    );
  } catch (error) {
    console.error("[PUSH_CHAT] failed", error);
  }
}

async function ensureManagerChatTable(conn: any) {
  await conn.execute(sql`
    CREATE TABLE IF NOT EXISTS "managerChatMessages" (
      "id" serial PRIMARY KEY,
      "senderName" varchar(255) NOT NULL,
      "senderRole" varchar(40) NOT NULL DEFAULT 'manager',
      "text" text NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL
    )
  `);
}

function normalizeSqlRows(result: any) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const allowedOrigins = new Set([
    "https://couriermig.ru",
    "https://www.couriermig.ru",
    "https://courier.couriermig.ru",
    ...configuredOrigins,
  ]);

  app.use((req, res, next) => {
    const origin = req.headers.origin?.replace(/\/$/, "");
    const isDevOrigin =
      process.env.NODE_ENV !== "production" &&
      Boolean(origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    const isAllowedOrigin = !origin || allowedOrigins.has(origin) || isDevOrigin;

    res.vary("Origin");

    if (origin && isAllowedOrigin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization",
      );
    }

    if (req.method === "OPTIONS") {
      if (!isAllowedOrigin) {
        res.status(403).json({ error: { code: "CORS_FORBIDDEN", message: "Origin is not allowed" } });
        return;
      }
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.use(managerApiAuthGate);

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
      res.json(isBatch ? trpcBatchJson(response) : trpcJson(response));
    } catch (error) {
      console.error("Failed to deliver mail", error);
      const message = error instanceof Error ? error.message : "Failed to deliver mail";
      res.status(500).json({ error: { message } });
    }
  });

  
function normalizeChatTimestamp(value: unknown) {
  if (!value) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const hasTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed);
    const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed);

    if (hasTime && !hasTimezone) {
      return `${trimmed.replace(" ", "T")}Z`;
    }

    return trimmed;
  }

  return value;
}

function normalizeChatMessageRow(row: Record<string, unknown>) {
  return {
    ...row,
    createdAt: normalizeChatTimestamp(row.createdAt),
  };
}

  registerCompatRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });


  app.get("/api/manager/chat/messages", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      await ensureManagerChatTable(conn);

      const rawLimit = Number(req.query.limit || 80);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 80, 1), 200);

      const result = await conn.execute(sql`
        SELECT "id", "senderName", "senderRole", "text", "createdAt"
        FROM "managerChatMessages"
        ORDER BY "id" DESC
        LIMIT ${limit}
      `);

      res.json(normalizeSqlRows(result).reverse().map(normalizeChatMessageRow));
    } catch (error) {
      console.error("[manager.chat.messages] failed", error);
      const message = error instanceof Error ? error.message : "Failed to load chat messages";
      res.status(500).json({ error: { message } });
    }
  });

  app.post("/api/manager/chat/messages", async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      await ensureManagerChatTable(conn);

      const text = String(req.body?.text || "").trim();
      const senderName = String(req.body?.senderName || "Менеджер").trim().slice(0, 255) || "Менеджер";
      const senderRole = String(req.body?.senderRole || "manager").trim().slice(0, 40) || "manager";

      if (!text) {
        res.status(400).json({ error: { message: "Message text is required" } });
        return;
      }

      const result = await conn.execute(sql`
        INSERT INTO "managerChatMessages" ("senderName", "senderRole", "text")
        VALUES (${senderName}, ${senderRole}, ${text})
        RETURNING "id", "senderName", "senderRole", "text", "createdAt"
      `);

      const rawMessage = normalizeSqlRows(result)[0] || { success: true };
      const message = normalizeChatMessageRow(rawMessage);
      void sendManagerChatPushToCouriers(rawMessage);
      res.json(message);
    } catch (error) {
      console.error("[manager.chat.send] failed", error);
      const message = error instanceof Error ? error.message : "Failed to send chat message";
      res.status(500).json({ error: { message } });
    }
  });


  app.get("/api/trpc/manager.couriers", async (_req, res) => {
    try {
      const couriers = await db.getAllCouriers();
      res.json(trpcBatchJson(couriers.map(toSafeCourier)));
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
      const marker = `[request:${id}]`;

      await conn.update(tasks)
        .set({
          recipientName: String(request.recipientName || request.senderName || "Получатель не указан"),
          recipientPhone: String(request.recipientPhone || request.senderPhone || ""),
          deliveryAddress: String(request.deliveryAddress || request.recipientAddress || request.senderAddress || request.tcAddress || "Адрес не указан"),
          senderName: request.senderName || request.senderCompany || request.tcName || null,
          senderAddress: request.senderAddress || request.tcAddress || null,
          senderPhone: request.senderPhone || null,
          packageDescription: request.packageDescription || request.description || request.callReason || null,
          placesCount: request.placesCount ?? null,
          deliveryTimeFrom: request.deliveryTimeFrom || null,
          deliveryTimeTo: request.deliveryTimeTo || null,
          specialInstructions: request.specialInstructions || null,
          comments: [marker, request.description, request.callReason, request.comments, request.specialInstructions].filter(Boolean).join("\\n"),
          items: request.items || null,
          updatedAt: new Date(),
        })
        .where(sql`${tasks.comments} like ${`%${marker}%`}`);

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

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: "API route not found",
    });
  });

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
