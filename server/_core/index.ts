import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { SignJWT } from "jose";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import * as db from "../db";

const COURIER_JWT_SECRET = new TextEncoder().encode(
  process.env.COURIER_JWT_SECRET ?? "courier-secret-key-change-in-production",
);

async function signCourierRuntimeToken(courierId: number): Promise<string> {
  return new SignJWT({ courierId, type: "courier" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(COURIER_JWT_SECRET);
}

let runtimeSql: postgres.Sql | null = null;
function getRuntimeSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  if (!runtimeSql) {
    runtimeSql = postgres(process.env.DATABASE_URL, { max: 5 });
  }
  return runtimeSql;
}

function trpcJson(res: express.Response, data: unknown) {
  res.json({ result: { data: { json: data } } });
}

function normalizeRequestInput(raw: any) {
  const input = raw?.json ?? raw ?? {};
  const allowedTypes = new Set(["delivery", "movement", "nuts", "courier_call", "pickup_from_tc", "simple"]);
  const allowedStatuses = new Set(["pending", "assigned", "in_progress", "completed", "cancelled"]);
  const requestType = allowedTypes.has(input.requestType) ? input.requestType : "simple";
  const status = allowedStatuses.has(input.status) ? input.status : "pending";
  const numberOrNull = (value: unknown) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const textOrNull = (value: unknown) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  };

  return {
    createdByUserId: numberOrNull(input.createdByUserId) ?? 1,
    requestType,
    status,
    courierId: numberOrNull(input.courierId),
    clientId: numberOrNull(input.clientId),
    recipientName: textOrNull(input.recipientName),
    recipientPhone: textOrNull(input.recipientPhone),
    recipientAddress: textOrNull(input.recipientAddress),
    deliveryAddress: textOrNull(input.deliveryAddress),
    deliveryCity: textOrNull(input.deliveryCity),
    packageDescription: textOrNull(input.packageDescription),
    packageType: textOrNull(input.packageType),
    placesCount: numberOrNull(input.placesCount) ?? 1,
    senderName: textOrNull(input.senderName),
    senderCompany: textOrNull(input.senderCompany),
    senderCity: textOrNull(input.senderCity),
    senderAddress: textOrNull(input.senderAddress),
    senderPhone: textOrNull(input.senderPhone),
    recipientCompany: textOrNull(input.recipientCompany),
    recipientCity: textOrNull(input.recipientCity),
    items: typeof input.items === "string" ? input.items : input.items ? JSON.stringify(input.items) : null,
    totalAmount: numberOrNull(input.totalAmount),
    callReason: textOrNull(input.callReason),
    tcName: textOrNull(input.tcName),
    tcAddress: textOrNull(input.tcAddress),
    trackingNumber: textOrNull(input.trackingNumber),
    description: textOrNull(input.description),
    specialInstructions: textOrNull(input.specialInstructions),
    comments: textOrNull(input.comments),
    paymentMethod: textOrNull(input.paymentMethod),
    paymentAmount: numberOrNull(input.paymentAmount),
    deliveryTimeFrom: textOrNull(input.deliveryTimeFrom),
    deliveryTimeTo: textOrNull(input.deliveryTimeTo),
    estimatedMinutes: numberOrNull(input.estimatedMinutes),
  };
}

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

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
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

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Manager courier account endpoints.
  // Couriers cannot self-register: manager creates username/password here,
  // and courier web/app signs in through courierAuth.login.
  app.get("/api/manager/couriers", async (_req, res) => {
    try {
      const couriers = await db.getAllCouriers();
      res.json(
        couriers.map((courier) => ({
          id: courier.id,
          name: courier.name,
          username: courier.username,
          phone: courier.phone,
          vehicleType: courier.vehicleType,
          isActive: courier.isActive,
          totalDeliveries: courier.totalDeliveries,
          createdAt: courier.createdAt,
          updatedAt: courier.updatedAt,
        })),
      );
    } catch (error) {
      console.error("[manager/couriers] list failed", error);
      res.status(500).json({ error: "Failed to load couriers" });
    }
  });

  app.post("/api/manager/couriers", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const phone = String(req.body?.phone || "").trim() || null;
      const vehicleType = req.body?.vehicleType || "car";

      if (!name || !username || !password) {
        res.status(400).json({ error: "Name, username and password are required" });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }

      const existing = await db.getCourierByUsername(username);
      if (existing) {
        res.status(409).json({ error: "Courier username already exists" });
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
      });

      const courier = await db.getCourierById(id);
      res.status(201).json({
        id,
        name: courier?.name || name,
        username: courier?.username || username,
        phone: courier?.phone || phone,
        vehicleType: courier?.vehicleType || vehicleType,
        isActive: courier?.isActive ?? true,
        totalDeliveries: courier?.totalDeliveries ?? 0,
      });
    } catch (error) {
      console.error("[manager/couriers] create failed", error);
      res.status(500).json({ error: "Failed to create courier" });
    }
  });

  app.delete("/api/manager/couriers/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid courier id" });
        return;
      }

      await db.updateCourier(id, { isActive: false });
      res.json({ success: true });
    } catch (error) {
      console.error("[manager/couriers] deactivate failed", error);
      res.status(500).json({ error: "Failed to deactivate courier" });
    }
  });

  // Runtime-compatible fallbacks for production paths currently broken in tRPC/db helper layer.
  // They keep the same /api/trpc path and tRPC JSON response shape expected by the frontend.
  app.post("/api/trpc/courierAuth.login", async (req, res) => {
    try {
      const input = req.body?.json ?? req.body ?? {};
      const username = String(input.username || "").trim();
      const password = String(input.password || "");
      const sql = getRuntimeSql();
      const rows = await sql`SELECT * FROM "couriers" WHERE "username" = ${username} LIMIT 1`;
      const courier = rows[0];
      if (!courier || courier.isActive === false) {
        res.status(401).json({ error: { message: "Неверный логин или пароль" } });
        return;
      }
      const valid = await bcrypt.compare(password, courier.passwordHash);
      if (!valid) {
        res.status(401).json({ error: { message: "Неверный логин или пароль" } });
        return;
      }
      const token = await signCourierRuntimeToken(courier.id);
      trpcJson(res, {
        token,
        courier: {
          id: courier.id,
          name: courier.name,
          username: courier.username,
          phone: courier.phone,
          vehicleType: courier.vehicleType,
          isActive: courier.isActive,
          totalDeliveries: courier.totalDeliveries,
        },
      });
    } catch (error) {
      console.error("[fallback courierAuth.login] failed", error);
      res.status(500).json({ error: { message: "Failed to login courier" } });
    }
  });

  app.post("/api/trpc/requests.create", async (req, res) => {
    try {
      const input = normalizeRequestInput(req.body);
      const sql = getRuntimeSql();
      const result = await sql`
        INSERT INTO "requests" (
          "createdByUserId", "requestType", "status", "courierId", "clientId",
          "recipientName", "recipientPhone", "recipientAddress", "deliveryAddress", "deliveryCity",
          "packageDescription", "packageType", "placesCount",
          "senderName", "senderCompany", "senderCity", "senderAddress", "senderPhone",
          "recipientCompany", "recipientCity", "items", "totalAmount", "callReason",
          "tcName", "tcAddress", "trackingNumber", "description", "specialInstructions",
          "comments", "paymentMethod", "paymentAmount", "deliveryTimeFrom", "deliveryTimeTo",
          "estimatedMinutes", "createdAt", "updatedAt"
        ) VALUES (
          ${input.createdByUserId}, ${input.requestType}, ${input.status}, ${input.courierId}, ${input.clientId},
          ${input.recipientName}, ${input.recipientPhone}, ${input.recipientAddress}, ${input.deliveryAddress}, ${input.deliveryCity},
          ${input.packageDescription}, ${input.packageType}, ${input.placesCount},
          ${input.senderName}, ${input.senderCompany}, ${input.senderCity}, ${input.senderAddress}, ${input.senderPhone},
          ${input.recipientCompany}, ${input.recipientCity}, ${input.items}, ${input.totalAmount}, ${input.callReason},
          ${input.tcName}, ${input.tcAddress}, ${input.trackingNumber}, ${input.description}, ${input.specialInstructions},
          ${input.comments}, ${input.paymentMethod}, ${input.paymentAmount}, ${input.deliveryTimeFrom}, ${input.deliveryTimeTo},
          ${input.estimatedMinutes}, now(), now()
        )
        RETURNING "id"
      `;
      trpcJson(res, { id: result[0].id, success: true });
    } catch (error) {
      console.error("[fallback requests.create] failed", error);
      res.status(500).json({ error: { message: "Failed to create request" } });
    }
  });

  app.get("/api/trpc/requests.all", async (_req, res) => {
    try {
      const sql = getRuntimeSql();
      const rows = await sql`SELECT * FROM "requests" ORDER BY "createdAt" DESC`;
      trpcJson(res, rows);
    } catch (error) {
      console.error("[fallback requests.all] failed", error);
      res.status(500).json({ error: { message: "Failed to load requests" } });
    }
  });

  app.get("/api/trpc/requests.getById", async (req, res) => {
    try {
      const parsed = req.query.input ? JSON.parse(String(req.query.input)) : {};
      const id = Number(parsed.id);
      const sql = getRuntimeSql();
      const rows = await sql`SELECT * FROM "requests" WHERE "id" = ${id} LIMIT 1`;
      trpcJson(res, rows[0] ?? null);
    } catch (error) {
      console.error("[fallback requests.getById] failed", error);
      res.status(500).json({ error: { message: "Failed to load request" } });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Serve static files from /app/public (frontend build)
  const publicPath = path.join(process.cwd(), "public");
  app.use(express.static(publicPath));

  // SPA fallback: serve index.html for all non-API routes
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
  });
}

startServer().catch(console.error);
