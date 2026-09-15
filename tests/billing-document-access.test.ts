/**
 * Document download authorization (problem #3).
 *
 * The invoice / act / registry endpoints stay manager-protected. These tests mount
 * the real billing routes behind the real manager auth gate in an Express app and
 * talk HTTP to it, so both halves of the contract are pinned:
 *
 *   H. without a token -> 401 UNAUTHORIZED (documents are NOT public);
 *   I. authenticated invoice -> PDF;
 *   J. authenticated act -> PDF;
 *   K. authenticated registry -> XLSX.
 *
 * The files come from an isolated throwaway database and the bundled fonts; no
 * production document is touched.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { SignJWT } from "jose";
import { close, PERIOD_FROM, PERIOD_TO, seed, type SeedResult } from "./helpers/billingSeed";
import { issueDocumentSet } from "../server/_core/billingDocumentService";
import { registerBillingRoutes } from "../server/_core/billingRoutes";
import { managerApiAuthGate } from "../server/_core/managerSecurity";

let server: Server | null = null;
let baseUrl = "";
let current: SeedResult | null = null;
let issuedDocumentId = 0;

function buildTestApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  // The real gate: /api/manager/* requires a manager bearer token.
  app.use(managerApiAuthGate);
  registerBillingRoutes(app);
  return app;
}

async function startTestServer(): Promise<void> {
  const app = buildTestApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (address && typeof address === "object") {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
}

/** A real manager token for the seeded manager (same secret/issuer as the server). */
async function managerToken(managerId: number): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production",
  );
  return new SignJWT({ managerId, type: "manager" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}

function fileUrl(kind: "invoice" | "act" | "registry"): string {
  return `${baseUrl}/api/manager/billing/documents/${issuedDocumentId}/file/${kind}`;
}

async function get(url: string, token?: string) {
  return await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeAll(async () => {
  process.env.MANAGER_JWT_SECRET = process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production";

  current = await seed({
    requests: [
      { key: "a", status: "completed", placesCount: 3, deliveryFee: 1100, checked: true, date: "2026-08-17" },
    ],
  });

  // A real issued set: this writes files into the throwaway test directory only.
  const issued = await issueDocumentSet(
    current.clientId,
    PERIOD_FROM,
    PERIOD_TO,
    current.managerId,
    "2026-09-01",
  );
  issuedDocumentId = issued.id;

  await startTestServer();
});

afterEach(() => {
  // every test gets a fresh connection; the server stays up for the suite
});

describe("скачивание счёта/акта/реестра: авторизация", () => {
  it("H. без токена файлы недоступны (401 UNAUTHORIZED)", async () => {
    for (const kind of ["invoice", "act", "registry"] as const) {
      const response = await get(fileUrl(kind));
      expect(response.status).toBe(401);

      const payload = (await response.json()) as { error?: { code?: string; message?: string } };
      expect(payload.error?.code).toBe("UNAUTHORIZED");
    }
  });

  it("H2. с мусорным токеном — 403, файл не отдаётся", async () => {
    const response = await get(fileUrl("invoice"), "not-a-real-token");
    expect(response.status).toBe(403);
    expect((await response.json()) as { error?: { code?: string } }).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("I. авторизованный менеджер получает PDF счёта", async () => {
    const token = await managerToken(current!.managerId);
    const response = await get(fileUrl("invoice"), token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("J. авторизованный менеджер получает PDF акта", async () => {
    const token = await managerToken(current!.managerId);
    const response = await get(fileUrl("act"), token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("K. авторизованный менеджер получает реестр XLSX", async () => {
    const token = await managerToken(current!.managerId);
    const response = await get(fileUrl("registry"), token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");

    // XLSX is a zip container.
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition.toLowerCase()).toContain("utf-8");
  });

  it("подделанный токен другого типа не проходит", async () => {
    const secret = new TextEncoder().encode(
      process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production",
    );
    const courierStyleToken = await new SignJWT({ managerId: current!.managerId, type: "courier" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    const response = await get(fileUrl("invoice"), courierStyleToken);
    expect(response.status).toBe(403);
  });
});

afterEach(() => {
  // nothing to clean between tests
});

// Close the http server and the throwaway database once the suite is done.
process.on("beforeExit", () => {
  server?.close();
});

export async function teardownSuite(): Promise<void> {
  server?.close();
  server = null;
  if (current) {
    await close(current.db);
    current = null;
  }
}
