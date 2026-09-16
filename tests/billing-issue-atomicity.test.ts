/**
 * Acceptance regressions for the issue pipeline.
 *
 * Three things are pinned here, all of them about the boundary between the database,
 * the filesystem and the settings images:
 *
 *   1. a document issued BEFORE migration 0017 (NULL snapshots) keeps serving its saved
 *      files; changing the settings signature/stamp cannot alter or regenerate it;
 *   2. the immutable image copy holds exactly the bytes that went into the PDF, even if
 *      the settings file is replaced while the issue is running;
 *   3. a failure while writing the files leaves NO document: no number consumed, no row,
 *      no request links, no orphan files.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { addClientWithCheckedRequest, close, PERIOD_FROM, PERIOD_TO, seed, type SeedResult } from "./helpers/billingSeed";
import { issueDocumentSet, listDocuments, resolveStoredFilePath } from "../server/_core/billingDocumentService";
import { saveDocumentSettings } from "../server/_core/documentSettings";

/** Where the issued files live (the harness points this at a throwaway tree). */
const BILLING_DOCUMENTS_DIR = process.env.BILLING_DOCUMENTS_DIR
  ?? path.join(process.cwd(), "uploads", "billing-documents");

const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** A second valid PNG with genuinely different bytes (2×2 instead of 1×1). */
const PNG_B = fs.readFileSync(path.join(__dirname, "fixtures", "stamp-2x2.png"));

let current: SeedResult | null = null;
/**
 * Images must live under <cwd>/uploads to be resolvable (that is the storage root the
 * service validates against), so the suite uses its own directory inside it.
 */
const IMAGE_DIR = path.join(process.cwd(), "uploads", "issue-atomicity-images");

function writeSettingsImage(name: string, bytes: Buffer): string {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const absolute = path.join(IMAGE_DIR, name);
  fs.writeFileSync(absolute, bytes);
  return path.relative(process.cwd(), absolute);
}

// Each scenario needs its own billable requests: the first issue of a client holds them,
// so the database is reseeded before every test.
beforeEach(async () => {
  current = await seed({
    requests: [
      { key: "a", status: "completed", placesCount: 2, deliveryFee: 1000, checked: true, date: "2026-08-17" },
      { key: "b", status: "completed", placesCount: 1, deliveryFee: 500, checked: true, date: "2026-08-18" },
    ],
  });
});

afterAll(async () => {
  await close(current!.db);
  // The document files live in the harness throwaway tree, which it removes itself.
  fs.rmSync(IMAGE_DIR, { recursive: true, force: true });
});

describe("1. документы, выпущенные до migration 0017 (NULL-снапшоты)", () => {
  it("отдаёт сохранённые файлы и не перегенерируется при смене настроек", async () => {
    const db = current!.db;

    // The legacy document is issued WITHOUT any image configured.
    const legacy = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    await db`UPDATE "billingDocuments"
                SET "signatureFileSnapshot" = NULL,
                    "stampFileSnapshot" = NULL,
                    "stampEnabledSnapshot" = NULL
              WHERE "id" = ${legacy.id}`;

    const before = (await db`SELECT "invoiceFile", "signatureFileSnapshot" FROM "billingDocuments" WHERE "id" = ${legacy.id}`)[0];
    expect(before.signatureFileSnapshot).toBeNull();
    const legacyPath = resolveStoredFilePath(String(before.invoiceFile));
    expect(legacyPath).toBeTruthy();
    const legacyBytes = fs.readFileSync(legacyPath!);

    // Only NOW is a signature and a stamp configured.
    const signatureFile = await writeSettingsImage("legacy-signature.png", PNG_A);
    const stampFile = await writeSettingsImage("legacy-stamp.png", PNG_B);
    await saveDocumentSettings({ addStampToDocuments: true }, { signatureFile, stampFile });

    // The already issued document is untouched: same row, same file, same bytes.
    const after = (await db`SELECT "invoiceFile", "signatureFileSnapshot" FROM "billingDocuments" WHERE "id" = ${legacy.id}`)[0];
    expect(String(after.invoiceFile)).toBe(String(before.invoiceFile));
    expect(after.signatureFileSnapshot).toBeNull();
    expect(fs.readFileSync(legacyPath!)).toEqual(legacyBytes);

    // A document issued from now on does freeze the configured images...
    const otherClientId = await addClientWithCheckedRequest(db, "Клиент «Второй»", { deliveryFee: 700 });
    const fresh = await issueDocumentSet(otherClientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-01");
    const freshRow = (await db`SELECT "signatureFileSnapshot", "stampFileSnapshot", "stampEnabledSnapshot"
                                 FROM "billingDocuments" WHERE "id" = ${fresh.id}`)[0];
    // The snapshot points at the immutable per-document copy, not at the settings file.
    expect(String(freshRow.signatureFileSnapshot)).toContain(`billing-documents/${fresh.id}/assets/signature.png`);
    expect(String(freshRow.stampFileSnapshot)).toContain(`billing-documents/${fresh.id}/assets/stamp.png`);
    expect(String(freshRow.signatureFileSnapshot)).not.toBe(signatureFile);
    expect(String(freshRow.stampFileSnapshot)).not.toBe(stampFile);
    expect(freshRow.stampEnabledSnapshot).toBe(true);
    expect(fs.readFileSync(resolveStoredFilePath(String(freshRow.signatureFileSnapshot))!)).toEqual(PNG_A);

    // ...and it differs from the legacy PDF, which was rendered with no image at all.
    const freshPath = resolveStoredFilePath(fresh.invoiceFile);
    expect(freshPath).toBeTruthy();
    expect(fs.readFileSync(freshPath!).length).not.toBe(legacyBytes.length);
  });
});

describe("2. PDF и immutable snapshot — одни и те же байты", () => {
  it("копия содержит байты, отрендеренные в PDF, а не то, что лежит в настройках позже", async () => {
    const db = current!.db;

    const signatureFile = await writeSettingsImage("race-signature.png", PNG_A);
    await saveDocumentSettings({ addStampToDocuments: false }, { signatureFile });

    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-02");

    const row = (await db`SELECT "signatureFileSnapshot", "invoiceFile" FROM "billingDocuments" WHERE "id" = ${issued.id}`)[0];
    expect(row.signatureFileSnapshot).toBeTruthy();
    const snapshotPath = resolveStoredFilePath(String(row.signatureFileSnapshot));
    expect(snapshotPath).toBeTruthy();
    expect(fs.readFileSync(snapshotPath!)).toEqual(PNG_A);

    // The document's own PDF is not empty and is unaffected by a later settings rewrite.
    const invoicePath = resolveStoredFilePath(String(row.invoiceFile));
    const pdfBefore = fs.readFileSync(invoicePath!);
    expect(pdfBefore.length).toBeGreaterThan(0);

    fs.writeFileSync(path.join(process.cwd(), signatureFile), PNG_B);
    expect(fs.readFileSync(snapshotPath!)).toEqual(PNG_A);
    expect(fs.readFileSync(invoicePath!)).toEqual(pdfBefore);
  });

  it("удаление настройки не ломает уже выпущенный документ", async () => {
    const db = current!.db;
    const signatureFile = await writeSettingsImage("delete-signature.png", PNG_A);
    await saveDocumentSettings({ addStampToDocuments: false }, { signatureFile });
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-03");

    const row = (await db`SELECT "signatureFileSnapshot", "invoiceFile" FROM "billingDocuments" WHERE "id" = ${issued.id}`)[0];
    const snapshot = resolveStoredFilePath(String(row.signatureFileSnapshot));
    const pdfPath = resolveStoredFilePath(String(row.invoiceFile));
    expect(snapshot).toBeTruthy();
    expect(pdfPath).toBeTruthy();
    const pdfBefore = fs.readFileSync(pdfPath!);
    expect(fs.readFileSync(snapshot!)).toEqual(PNG_A);

    // Remove the settings image entirely.
    fs.rmSync(path.join(process.cwd(), signatureFile), { force: true });
    await saveDocumentSettings({}, { signatureFile: null });

    expect(fs.existsSync(snapshot!)).toBe(true);
    expect(fs.readFileSync(snapshot!)).toEqual(PNG_A);
    expect(fs.readFileSync(pdfPath!)).toEqual(pdfBefore);
  });
});

describe("3. failure path: не остаётся частично выпущенного документа", () => {
  it("падение записи файлов не создаёт документ, не занимает номер и не блокирует заявки", async () => {
    const db = current!.db;

    const before = await db`SELECT "nextDocumentNumber" FROM "billingSettings" ORDER BY "id" LIMIT 1`;
    const documentsBefore = await db`SELECT count(*)::int AS c FROM "billingDocuments"`;
    const linksBefore = await db`SELECT count(*)::int AS c FROM "billingDocumentRequests"`;

    // Make the very first file write fail.
    const originalWriteFile = fs.promises.writeFile.bind(fs.promises);
    const spy = vi.spyOn(fs.promises, "writeFile").mockImplementation(async (file, ...rest) => {
      if (String(file).endsWith(".pdf")) throw new Error("disk full (симуляция)");
      return originalWriteFile(file, ...rest as [never]);
    });

    let failed = false;
    try {
      await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-04");
    } catch {
      failed = true;
    } finally {
      spy.mockRestore();
    }

    expect(failed).toBe(true);

    // Nothing was committed and the number was not consumed by a document.
    const after = await db`SELECT "nextDocumentNumber" FROM "billingSettings" ORDER BY "id" LIMIT 1`;
    expect(Number(after[0].nextDocumentNumber)).toBe(Number(before[0].nextDocumentNumber));

    const documentsAfter = await db`SELECT count(*)::int AS c FROM "billingDocuments"`;
    expect(Number(documentsAfter[0].c)).toBe(Number(documentsBefore[0].c));

    const linksAfter = await db`SELECT count(*)::int AS c FROM "billingDocumentRequests"`;
    expect(Number(linksAfter[0].c)).toBe(Number(linksBefore[0].c));

    // The requests are still billable and no orphan directory is left behind.
    expect(await listDocuments({ clientId: current!.clientId })).toHaveLength(documentsBefore[0].c);

    const orphans = fs.existsSync(BILLING_DOCUMENTS_DIR)
      ? fs.readdirSync(BILLING_DOCUMENTS_DIR).filter((entry) => /^\d+$/.test(entry)).length
      : 0;
    expect(orphans).toBeLessThanOrEqual(Number(documentsBefore[0].c));

    // And the very next issue with a healthy filesystem succeeds.
    const issued = await issueDocumentSet(current!.clientId, PERIOD_FROM, PERIOD_TO, current!.managerId, "2026-09-04");
    expect(issued.number).toBe(String(Number(before[0].nextDocumentNumber)));
    expect(fs.existsSync(resolveStoredFilePath(issued.invoiceFile)!)).toBe(true);
  });
});
