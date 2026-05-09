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

function trpcJson(data: unknown) {
  return { result: { data: { json: data } } };
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

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get("/api/trpc/manager.couriers", async (_req, res) => {
    try {
      const couriers = await db.getAllCouriers();
      res.json(trpcJson(couriers));
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

      res.json(trpcJson({ id, success: true }));
    } catch (error) {
      console.error("[manager.createCourier] failed", error);
      res.status(500).json({ error: { message: "Failed to create courier" } });
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
  });
}

startServer().catch(console.error);
