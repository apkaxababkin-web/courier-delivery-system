import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import bcrypt from "bcryptjs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
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
