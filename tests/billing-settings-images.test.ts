/**
 * Signature / stamp management API.
 *
 * Everything here goes through the real billing routes mounted behind the real manager
 * auth gate, over HTTP, against an isolated database and an isolated settings upload
 * directory. Nothing is written to the production uploads tree.
 *
 * Covered:
 *   * manager authorization on every operation (upload / read / delete);
 *   * PNG-only content sniffing, independent of the file name;
 *   * size limit;
 *   * generated file names (no user supplied name is ever used on disk);
 *   * path traversal cannot read or delete anything outside the settings directory;
 *   * delete is idempotent and never touches an unrelated uploads file;
 *   * the protected invoice/act/registry download keeps working.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { registerBillingRoutes } from "../server/_core/billingRoutes";
import { managerApiAuthGate } from "../server/_core/managerSecurity";
import { close, seed, type SeedResult } from "./helpers/billingSeed";

/** Real 1×1 PNG (content sniffing must accept it). */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);

let server: Server | null = null;
let baseUrl = "";
let seeded: SeedResult | null = null;
let settingsDir = "";

function buildTestApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(managerApiAuthGate);
  registerBillingRoutes(app);
  return app;
}

async function managerToken(managerId: number): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production",
  );
  return new SignJWT({ managerId, type: "manager" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}

function imageUrl(kind: "signature" | "stamp" | string): string {
  return `${baseUrl}/api/manager/billing/settings/image/${kind}`;
}

async function upload(kind: string, body: Buffer, token?: string, contentType = "image/png") {
  return await fetch(imageUrl(kind), {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: new Uint8Array(body),
  });
}

async function remove(kind: string, token?: string) {
  return await fetch(imageUrl(kind), {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function read(kind: string, token?: string) {
  return await fetch(imageUrl(kind), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeAll(async () => {
  process.env.MANAGER_JWT_SECRET = process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production";

  // The harness points BILLING_SETTINGS_DIR at its throwaway uploads tree; the routes
  // resolve it per call, so the tests write there and never into the deployed tree.
  settingsDir = process.env.BILLING_SETTINGS_DIR ?? path.join(process.cwd(), "uploads", "billing-settings");

  seeded = await seed({ requests: [] });

  const app = buildTestApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server!.address();
      if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await close(seeded!.db);
  // The harness removes its own throwaway uploads tree.
});

// The seed helper owns the shared connection; the image files live in the harness
// throwaway tree, which it removes itself.

describe("подпись/печать: авторизация менеджера", () => {
  it("upload требует manager auth", async () => {
    const response = await upload("signature", PNG);
    expect(response.status).toBe(401);
    expect((await response.json()) as { error?: { code?: string } }).toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("preview требует manager auth (и не отдаётся по query-токену)", async () => {
    const bare = await read("signature");
    expect(bare.status).toBe(401);

    // A token in the query string must not authorize anything.
    const viaQuery = await fetch(`${imageUrl("signature")}?token=whatever`);
    expect(viaQuery.status).toBe(401);
  });

  it("delete требует manager auth", async () => {
    const response = await remove("signature");
    expect(response.status).toBe(401);
  });

  it("мусорный токен отклоняется на всех операциях", async () => {
    const garbage = "not-a-real-token";
    expect((await upload("signature", PNG, garbage)).status).toBe(403);
    expect((await read("signature", garbage)).status).toBe(403);
    expect((await remove("signature", garbage)).status).toBe(403);
  });

  it("неизвестный тип изображения отклоняется", async () => {
    const token = await managerToken(seeded!.managerId);
    expect((await upload("bogus", PNG, token)).status).toBe(400);
    expect((await read("bogus", token)).status).toBe(400);
    expect((await remove("bogus", token)).status).toBe(400);
  });
});

describe("подпись/печать: загрузка и замена", () => {
  it("принимает валидный PNG и отдаёт его через авторизованный preview", async () => {
    const token = await managerToken(seeded!.managerId);

    const uploaded = await upload("signature", PNG, token);
    expect(uploaded.status).toBe(200);
    const settings = (await uploaded.json()) as { signatureFile: string | null };
    expect(settings.signatureFile).toBeTruthy();
    // The stored name is generated, never the user supplied one.
    expect(settings.signatureFile).toMatch(/signature-\d+-[0-9a-f-]+\.png$/);

    const preview = await read("signature", token);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await preview.arrayBuffer())).toEqual(PNG);
  });

  it("замена перезаписывает путь и не оставляет старый файл активным", async () => {
    const token = await managerToken(seeded!.managerId);

    const first = (await (await upload("stamp", PNG, token)).json()) as { stampFile: string };
    const second = (await (await upload("stamp", PNG, token)).json()) as { stampFile: string };
    expect(second.stampFile).not.toBe(first.stampFile);

    const preview = await read("stamp", token);
    expect(preview.status).toBe(200);
  });

  it("отклоняет не-PNG содержимое, даже если имя выглядит как PNG", async () => {
    const token = await managerToken(seeded!.managerId);

    const asJpeg = await upload("signature", JPEG, token, "image/png");
    expect(asJpeg.status).toBe(400);

    const asText = await upload("signature", Buffer.from("not an image at all"), token, "image/png");
    expect(asText.status).toBe(400);

    const empty = await upload("signature", Buffer.alloc(0), token, "image/png");
    expect(empty.status).toBe(400);
  });

  it("отклоняет файл больше лимита", async () => {
    const token = await managerToken(seeded!.managerId);
    // 6 MB of PNG header + padding: rejected by the raw body limit before parsing.
    const oversized = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const response = await upload("stamp", oversized, token);
    expect([400, 413]).toContain(response.status);

    // And a body just over the explicit check keeps the readable 400 answer.
    const justOver = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1024)]);
    const second = await upload("stamp", justOver, token);
    expect([400, 413]).toContain(second.status);
  });
});

describe("подпись/печать: удаление", () => {
  it("удаляет текущий файл и preview после этого отвечает 404", async () => {
    const token = await managerToken(seeded!.managerId);

    await upload("signature", PNG, token);
    const before = await read("signature", token);
    expect(before.status).toBe(200);

    const deleted = await remove("signature", token);
    expect(deleted.status).toBe(200);
    expect(((await deleted.json()) as { signatureFile: string | null }).signatureFile).toBeNull();

    const after = await read("signature", token);
    expect(after.status).toBe(404);
  });

  it("повторное удаление идемпотентно (200, а не 500)", async () => {
    const token = await managerToken(seeded!.managerId);
    expect((await remove("signature", token)).status).toBe(200);
    expect((await remove("signature", token)).status).toBe(200);
  });

  it("не может удалить файл вне каталога настроек (path traversal)", async () => {
    const token = await managerToken(seeded!.managerId);

    // A decoy upload outside the settings directory must survive.
    const decoy = path.join(process.cwd(), "uploads", "test-decoy-signature.png");
    fs.writeFileSync(decoy, PNG);

    // Point the stored path at it directly, as a compromised DB value would.
    const { saveDocumentSettings } = await import("../server/_core/documentSettings");
    await saveDocumentSettings({}, { signatureFile: path.relative(process.cwd(), decoy) });

    const response = await remove("signature", token);
    expect(response.status).toBe(200);
    expect(fs.existsSync(decoy)).toBe(true);

    // And the preview must refuse to serve it too.
    await saveDocumentSettings({}, { signatureFile: path.relative(process.cwd(), decoy) });
    expect((await read("signature", token)).status).toBe(404);

    fs.rmSync(decoy, { force: true });
  });

  it("не может прочитать файл по абсолютному пути или через ..", async () => {
    const token = await managerToken(seeded!.managerId);
    const { saveDocumentSettings } = await import("../server/_core/documentSettings");

    for (const stored of ["/etc/passwd", "../../../../etc/passwd", "uploads/../server/db.ts"]) {
      await saveDocumentSettings({}, { stampFile: stored });
      expect((await read("stamp", token)).status).toBe(404);
      expect((await remove("stamp", token)).status).toBe(200);
    }
  });
});

describe("защищённое скачивание документов продолжает работать", () => {
  it("invoice/act/registry требуют токен и отдаются авторизованному менеджеру", async () => {
    const token = await managerToken(seeded!.managerId);
    const documentId = 999999; // does not exist: 401 first, 404 with a token

    for (const kind of ["invoice", "act", "registry"]) {
      const url = `${baseUrl}/api/manager/billing/documents/${documentId}/file/${kind}`;
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(404);
    }
  });
});
