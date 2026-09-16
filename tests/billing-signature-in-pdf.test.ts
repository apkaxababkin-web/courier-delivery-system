/**
 * Signature / stamp actually landing in the DOWNLOADED pdf.
 *
 * The user reported that real invoices/acts come back without the signature and the
 * stamp. This suite pins the whole data path on an isolated database and the real
 * production assets:
 *
 *   billingSettings → resolveDocumentImages → preview / issue → snapshot
 *     → buildData → PDF renderer → saved pdf → download
 *
 * The assertions read the produced PDF bytes back (page count + image placements), so a
 * regression that drops the overlays anywhere along the path fails here.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { addClientWithCheckedRequest, close, PERIOD_FROM, PERIOD_TO, seed, type SeedResult } from "./helpers/billingSeed";
import {
  issueDocumentSet,
  renderPreviewFile,
  getDocument,
} from "../server/_core/billingDocumentService";
import { saveDocumentSettings } from "../server/_core/documentSettings";
import { resolveStoredFilePath } from "../server/_core/billingDocumentService";
import { inspectPdf } from "./helpers/pdfInspector";
import { registerBillingRoutes } from "../server/_core/billingRoutes";
import { managerApiAuthGate } from "../server/_core/managerSecurity";

const REPO = process.cwd();
const ASSETS_DIR = path.join(REPO, "uploads", "billing-assets");
const SIGNATURE_PNG = path.join(ASSETS_DIR, "signature.png");
const STAMP_PNG = path.join(ASSETS_DIR, "stamp.png");
/** Settings store paths relative to the repository root. */
const SIGNATURE_SETTING = path.relative(REPO, SIGNATURE_PNG);
const STAMP_SETTING = path.relative(REPO, STAMP_PNG);

const SIGNATURE_SHA = "8371bf47645b81bb05ae00d85866c7be1cffbe6c7096d756063154566d2b4f9f";
const STAMP_SHA_FULL = "a481718e84f2d413a8af384ac12068f6c2f1fc47d0640ee1d84398ba69224a0d";

let current: SeedResult | null = null;

beforeEach(async () => {
  current = await seed({
    requests: [
      { key: "a", status: "completed", placesCount: 2, deliveryFee: 1000, checked: true, date: "2026-08-17" },
      { key: "b", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-18" },
    ],
  });
});

afterAll(async () => {
  if (current) await close(current.db);
});

/** Configure the settings exactly like production does. */
async function configureAssets(addStamp: boolean): Promise<void> {
  await saveDocumentSettings(
    { addStampToDocuments: addStamp },
    { signatureFile: SIGNATURE_SETTING, stampFile: STAMP_SETTING },
  );
}

describe("signature/stamp reach the rendered pdf", () => {
  it("preview invoice contains signature and stamp", async () => {
    await configureAssets(true);
    const file = await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "invoice", "2026-09-01");
    const inspection = inspectPdf(file.buffer);
    expect(inspection.pages).toBe(1);
    expect(inspection.images).toHaveLength(2);
  });

  it("preview act contains signature and stamp", async () => {
    await configureAssets(true);
    const file = await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "act", "2026-09-01");
    expect(inspectPdf(file.buffer).images).toHaveLength(2);
  });

  it("preview does not create a billingDocument and does not consume a number", async () => {
    const db = current!.db;
    await configureAssets(true);
    const before = await db`SELECT "nextDocumentNumber" FROM "billingSettings" ORDER BY "id" LIMIT 1`;
    const docsBefore = await db`SELECT count(*)::int AS c FROM "billingDocuments"`;

    await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "invoice", "2026-09-01");
    await renderPreviewFile(current!.clientId, PERIOD_FROM, PERIOD_TO, "act", "2026-09-01");

    const after = await db`SELECT "nextDocumentNumber" FROM "billingSettings" ORDER BY "id" LIMIT 1`;
    const docsAfter = await db`SELECT count(*)::int AS c FROM "billingDocuments"`;
    expect(Number(after[0].nextDocumentNumber)).toBe(Number(before[0].nextDocumentNumber));
    expect(Number(docsAfter[0].c)).toBe(Number(docsBefore[0].c));
  });

  it("issued invoice and act contain signature and stamp, saved to disk", async () => {
    const db = current!.db;
    await configureAssets(true);
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");

    // The saved files really carry both overlays.
    const invoicePath = resolveStoredFilePath(issued.invoiceFile);
    const actPath = resolveStoredFilePath(issued.actFile);
    expect(invoicePath).toBeTruthy();
    expect(actPath).toBeTruthy();
    expect(inspectPdf(fs.readFileSync(invoicePath!)).images).toHaveLength(2);
    expect(inspectPdf(fs.readFileSync(actPath!)).images).toHaveLength(2);

    // The immutable snapshots exist, hold the approved bytes and are recorded on the row.
    const row = (await db`SELECT "signatureFileSnapshot", "stampFileSnapshot", "stampEnabledSnapshot"
                            FROM "billingDocuments" WHERE "id" = ${issued.id}`)[0];
    expect(String(row.signatureFileSnapshot)).toContain(`billing-documents/${issued.id}/assets/signature.png`);
    expect(String(row.stampFileSnapshot)).toContain(`billing-documents/${issued.id}/assets/stamp.png`);
    expect(row.stampEnabledSnapshot).toBe(true);

    const crypto = await import("node:crypto");
    const sha = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
    expect(sha(fs.readFileSync(resolveStoredFilePath(String(row.signatureFileSnapshot))!))).toBe(SIGNATURE_SHA);
    expect(sha(fs.readFileSync(resolveStoredFilePath(String(row.stampFileSnapshot))!))).toBe(STAMP_SHA_FULL);
  });

  it("stamp disabled still leaves the signature only", async () => {
    const db = current!.db;
    await configureAssets(false);
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-02");
    const invoicePath = resolveStoredFilePath(issued.invoiceFile);
    expect(inspectPdf(fs.readFileSync(invoicePath!)).images).toHaveLength(1);
    const row = (await db`SELECT "stampFileSnapshot", "stampEnabledSnapshot" FROM "billingDocuments" WHERE "id" = ${issued.id}`)[0];
    expect(row.stampFileSnapshot).toBeNull();
    expect(row.stampEnabledSnapshot).toBe(false);
  });

  it("a document issued before the snapshot existed keeps its saved pdf untouched", async () => {
    const db = current!.db;
    await configureAssets(true);
    const legacy = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-03");
    // Simulate a pre-0017 document: snapshots cleared.
    await db`UPDATE "billingDocuments"
                SET "signatureFileSnapshot" = NULL, "stampFileSnapshot" = NULL, "stampEnabledSnapshot" = NULL
              WHERE "id" = ${legacy.id}`;

    const before = fs.readFileSync(resolveStoredFilePath(legacy.invoiceFile)!);
    // Change the settings afterwards: the saved file must not change and the download
    // route serves exactly that file.
    await saveDocumentSettings({ addStampToDocuments: false }, { signatureFile: null });
    const document = await getDocument(legacy.id);
    const served = resolveStoredFilePath(String(document!.invoiceFile));
    expect(served).toBeTruthy();
    expect(fs.readFileSync(served!)).toEqual(before);
  });
});

describe("download route serves the saved file, not a regenerated one", () => {
  let server: Server | null = null;
  let baseUrl = "";

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: "5mb" }));
    app.use(managerApiAuthGate);
    registerBillingRoutes(app);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server!.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) {
        resolve();
        return;
      }
      server.close(() => resolve());
    });
    server = null;
  });

  it("authenticated download returns the stored bytes with the overlay", async () => {
    await configureAssets(true);
    const issued = await issueDocumentSet(
      current!.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      current!.managerId,
      "2026-09-04",
    );

    const secret = new TextEncoder().encode(
      process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production",
    );
    const token = await new SignJWT({ managerId: current!.managerId, type: "manager" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("1h")
      .sign(secret);

    const response = await fetch(
      `${baseUrl}/api/manager/billing/documents/${issued.id}/file/invoice`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(response.status).toBe(200);

    const downloaded = Buffer.from(await response.arrayBuffer());
    const onDisk = fs.readFileSync(resolveStoredFilePath(issued.invoiceFile)!);

    expect(downloaded).toEqual(onDisk);
    expect(inspectPdf(downloaded).images).toHaveLength(2);
  });

  it("unauthenticated download is still rejected", async () => {
    await configureAssets(true);
    const issued = await issueDocumentSet(
      current!.clientId,
      PERIOD_FROM,
      PERIOD_TO,
      current!.managerId,
      "2026-09-05",
    );

    const response = await fetch(
      `${baseUrl}/api/manager/billing/documents/${issued.id}/file/invoice`,
    );

    expect(response.status).toBe(401);
  });
});
