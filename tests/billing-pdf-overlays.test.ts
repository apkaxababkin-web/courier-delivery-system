/**
 * Printed documents: layout, overlays and immutable signature/stamp snapshots.
 *
 * The PDFs are generated for real (bundled fonts) and then parsed back: page count,
 * page size, the position of every text run and the placement of the overlay images
 * are read from the produced bytes. That is what catches "the text overlaps" and
 * "the block moved" regressions, which a source-level test cannot see.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { inspectPdf, linesOf, allText } from "./helpers/pdfInspector";
import { renderActPdf, renderInvoicePdf } from "../server/_core/billingPdf";
import {
  ACT_SIGNATURE_PLACEMENT,
  ACT_STAMP_PLACEMENT,
  INVOICE_SIGNATURE_PLACEMENT,
  INVOICE_STAMP_PLACEMENT,
  documentOverlays,
  fitSize,
  resolveDocumentImages,
  resolveImagePath,
  snapshotDocumentAssets,
  type DocumentOverlays,
} from "../server/_core/documentImages";
import type { DocumentSetData } from "../server/_core/billingDocumentData";

const UPLOADS = path.resolve(process.cwd(), "uploads");
// The real uploads/billing-documents tree may not be writable for the test user (it is
// created by the deployed service), so the snapshot test uses its own root.
const SNAPSHOT_ROOT = fs.mkdtempSync(path.join(UPLOADS, "test-documents-"));

/** 1×1 transparent PNG, written into the throwaway uploads tree. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// ─── PDF inspection helpers ──────────────────────────────────────────────────

// ─── Fixture ─────────────────────────────────────────────────────────────────

/** Minimal but complete invoice/act dataset (same shape the service produces). */
function dataset(): DocumentSetData {
  return {
    number: "256",
    documentDateIso: "2026-09-01",
    documentDateText: "01.09.2026",
    periodFrom: "2026-08-16",
    periodTo: "2026-08-31",
    periodText: "16.08.2026–31.08.2026",
    serviceName: "Курьерские услуги за август 2026 г.",
    seller: {
      name: "Индивидуальный предприниматель Бабкин Юрий Тимофеевич",
      shortName: null,
      inn: "030201064412",
      kpp: null,
      ogrn: "3190327000019291",
      address: "671510, Россия, Бурятия Республика, Багдарин, Баунтовский, Гагарина 20 кв 1",
      postalAddress: null,
      phone: "89503942512",
      email: null,
      bankName: 'ООО "Банк Точка"',
      bankBik: "044525104",
      bankAccount: "40802810001500359887",
      bankCorrespondentAccount: "30101810745374525104",
      directorName: "Бабкин Ю. Т.",
      directorPosition: "Директор",
      accountantName: "Бабкин Ю. Т.",
      signatureFile: null,
      stampFile: null,
      signaturePath: null,
      stampPath: null,
      stampEnabled: false,
      vatText: "Без НДС",
      vatExemptionBasis: null,
    },
    buyer: {
      name: "ООО «КУРЬЕР-75»",
      inn: "7536165529",
      kpp: "753601001",
      address: "г Чита, ул Ковыльная, д 31 стр 1, офис 1",
      legalAddress: null,
      postalAddress: null,
      ogrn: null,
      phone: null,
    },
    lines: [{ position: 1, name: "Курьерские услуги за август 2026 г.", unit: "шт", quantity: 1, price: 15145, amount: 15145 }],
    registry: [],
    requestsCount: 1,
    totalPlaces: 1,
    totalAmount: 15145,
    totalAmountText: "15 145,00",
    amountInWords: "Пятнадцать тысяч сто сорок пять рублей 00 копеек",
    vat: { rateText: "Без НДС", vatAmount: null, netAmount: null },
  };
}

function withImages(signaturePath: string | null, stampPath: string | null) {
  const data = dataset();
  data.seller.signaturePath = signaturePath;
  data.seller.stampPath = stampPath;
  data.seller.stampEnabled = Boolean(stampPath);
  return data;
}

function overlaysFor(kind: "invoice" | "act", signaturePath: string | null, stampPath: string | null): DocumentOverlays {
  return documentOverlays(kind, { signaturePath, stampPath });
}

// ─── Temporary uploads (never the real ones) ─────────────────────────────────

const tempDir = fs.mkdtempSync(path.join(process.cwd(), "uploads", "test-signature-"));
const signatureFile = path.join(tempDir, "signature.png");
const stampFile = path.join(tempDir, "stamp.png");

beforeAll(() => {
  fs.writeFileSync(signatureFile, TINY_PNG);
  fs.writeFileSync(stampFile, TINY_PNG);
});

// The temp trees live under uploads/ (the resolver requires that root), so they are
// removed as soon as the suite finishes, including on failure.
afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(SNAPSHOT_ROOT, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("invoice PDF", () => {
  it("renders one A4 page without overlays", async () => {
    const inspection = inspectPdf(await renderInvoicePdf(dataset()));
    expect(inspection.pages).toBe(1);
    expect(inspection.mediaBox.width).toBeCloseTo(595.28, 1);
    expect(inspection.mediaBox.height).toBeCloseTo(841.89, 1);
    expect(inspection.images).toHaveLength(0);
  });

  it("prints the reference blocks at the reference positions", async () => {
    const inspection = inspectPdf(await renderInvoicePdf(dataset()));
    const lines = linesOf(inspection);
    const at = (needle: string) => lines.find((line) => line.text.includes(needle));

    expect(at("Счет №256 от 01.09.2026 г.")).toBeTruthy();
    expect(at("Получатель:")).toBeTruthy();
    expect(at("Плательщик:")).toBeTruthy();
    expect(at("Банк получателя")).toBeTruthy();
    expect(at("БИК")).toBeTruthy();
    expect(at("Всего к оплате:")).toBeTruthy();
    expect(at("Всего наименований 1")).toBeTruthy();
    expect(at("подпись")).toBeTruthy();

    // Title is centred and above the table on the first page.
    const title = at("Счет №256 от 01.09.2026 г.")!;
    expect(title.y).toBeGreaterThan(560);
    expect(title.y).toBeLessThan(620);

    // Nothing starts left of the frame or above/below the printable area. The x of a
    // run that continues a wrapped line is reported in pdfkit's scaled text space, so
    // only the frame start and the vertical band are asserted strictly.
    for (const run of inspection.runs) {
      expect(run.x).toBeGreaterThanOrEqual(28);
      expect(run.y).toBeGreaterThan(28);
      expect(run.y).toBeLessThan(815);
    }
  });

  it("keeps the signature caption below its rule (no text collision)", async () => {
    const inspection = inspectPdf(await renderInvoicePdf(dataset()));
    const lines = linesOf(inspection);
    const director = lines.find((line) => line.text.includes("Директор Бабкин Ю. Т."))!;
    const accountant = lines.find((line) => line.text.includes("Главный бухгалтер Бабкин Ю. Т."))!;

    // The reference layout puts the directorship line above the chief accountant.
    expect(director.y).toBeGreaterThan(accountant.y);

    // «подпись» captions sit under their own rule, never over the role line.
    const captions = lines.filter((line) => line.text.trim() === "подпись");
    expect(captions).toHaveLength(2);
    for (const caption of captions) {
      expect(caption.y).toBeLessThan(director.y);
    }
  });

  it("draws the signature overlay in its fixed box, without moving the text", async () => {
    const plain = inspectPdf(await renderInvoicePdf(dataset()));
    const withSignature = inspectPdf(
      await renderInvoicePdf(withImages(signatureFile, null), overlaysFor("invoice", signatureFile, null)),
    );

    expect(withSignature.pages).toBe(1);
    expect(withSignature.images).toHaveLength(1);

    const image = withSignature.images[0];
    // The image is centred in its fixed box and never stretched.
    expect(image.width).toBeLessThanOrEqual(INVOICE_SIGNATURE_PLACEMENT.width + 1);
    expect(image.height).toBeLessThanOrEqual(INVOICE_SIGNATURE_PLACEMENT.height + 1);
    expect(image.width).toBeCloseTo(image.height, 0);
    const boxCenter = INVOICE_SIGNATURE_PLACEMENT.x + INVOICE_SIGNATURE_PLACEMENT.width / 2;
    expect(Math.abs(image.x + image.width / 2 - boxCenter)).toBeLessThan(40);
    const boxTop = INVOICE_SIGNATURE_PLACEMENT.y + INVOICE_SIGNATURE_PLACEMENT.height;
    expect(Math.abs(image.y + image.height - boxTop)).toBeLessThan(20);

    // The overlay never reflows the document.
    expect(allText(withSignature)).toBe(allText(plain));
  });

  it("draws the stamp overlay only when the settings flag is on", async () => {
    const withStamp = inspectPdf(
      await renderInvoicePdf(withImages(null, stampFile), overlaysFor("invoice", null, stampFile)),
    );
    expect(withStamp.pages).toBe(1);
    expect(withStamp.images).toHaveLength(1);
    const image = withStamp.images[0];
    expect(image.width).toBeLessThanOrEqual(INVOICE_STAMP_PLACEMENT.width + 1);
    expect(image.height).toBeLessThanOrEqual(INVOICE_STAMP_PLACEMENT.height + 1);
    const boxCenter = INVOICE_STAMP_PLACEMENT.x + INVOICE_STAMP_PLACEMENT.width / 2;
    expect(Math.abs(image.x + image.width / 2 - boxCenter)).toBeLessThan(40);
    const boxTop = INVOICE_STAMP_PLACEMENT.y + INVOICE_STAMP_PLACEMENT.height;
    expect(Math.abs(image.y + image.height - boxTop)).toBeLessThan(25);

    // Flag off => no stamp, even though the file exists.
    const disabled = inspectPdf(
      await renderInvoicePdf(withImages(signatureFile, stampFile), {
        ...overlaysFor("invoice", signatureFile, stampFile),
        stamp: null,
        stampPath: null,
        stampEnabled: false,
      }),
    );
    expect(disabled.images).toHaveLength(1);
  });

  it("draws signature and stamp together on one page", async () => {
    const both = inspectPdf(
      await renderInvoicePdf(withImages(signatureFile, stampFile), overlaysFor("invoice", signatureFile, stampFile)),
    );
    expect(both.pages).toBe(1);
    expect(both.images).toHaveLength(2);
  });
});

describe("act PDF", () => {
  it("renders one A4 page with the reference blocks", async () => {
    const inspection = inspectPdf(await renderActPdf(dataset()));
    expect(inspection.pages).toBe(1);
    expect(inspection.mediaBox.width).toBeCloseTo(595.28, 1);

    const lines = linesOf(inspection);
    const text = lines.map((line) => line.text).join("\n");
    expect(text).toContain("Акт №256 от 01.09.2026 г.");
    expect(text).toContain("Исполнитель:");
    expect(text).toContain("Заказчик:");
    expect(text).toContain("Вышеперечисленные услуги выполнены полностью и в срок");
    expect(text).toContain("Всего :");

    const executor = lines.find((line) => line.text.includes("Исполнитель:"))!;
    const customer = lines.find((line) => line.text.includes("Заказчик:"))!;
    expect(executor.y).toBeGreaterThan(customer.y);
    expect(inspection.images).toHaveLength(0);
  });

  it("draws signature and stamp in the act placement, one page", async () => {
    const both = inspectPdf(
      await renderActPdf(withImages(signatureFile, stampFile), overlaysFor("act", signatureFile, stampFile)),
    );
    expect(both.pages).toBe(1);
    expect(both.images).toHaveLength(2);

    const [signature, stamp] = both.images.sort((a, b) => b.y - a.y);
    // The signature sits above the stamp on the «Исполнитель» side of the act.
    expect(signature.y).toBeGreaterThan(stamp.y - 1);
    expect(signature.width).toBeLessThanOrEqual(ACT_SIGNATURE_PLACEMENT.width + 1);
    expect(stamp.width).toBeLessThanOrEqual(ACT_STAMP_PLACEMENT.width + 1);
    expect(stamp.x).toBeLessThan(400);
  });

  it("act without overlays keeps the empty signature lines", async () => {
    const inspection = inspectPdf(await renderActPdf(dataset()));
    const captions = linesOf(inspection).filter((line) => line.text.trim() === "подпись");
    expect(captions).toHaveLength(2);
    expect(inspection.images).toHaveLength(0);
  });
});

describe("overlay geometry and image resolution", () => {
  it("fits an image into its box without distortion", () => {
    const wide = fitSize(420, 200, 200, 95);
    expect(wide.width).toBeLessThanOrEqual(200);
    expect(wide.height).toBeLessThanOrEqual(95);
    expect(wide.width / wide.height).toBeCloseTo(420 / 200, 3);

    const tall = fitSize(100, 400, 200, 95);
    expect(tall.height).toBeCloseTo(95, 3);
    expect(tall.width / tall.height).toBeCloseTo(100 / 400, 3);
  });

  it("refuses image paths outside the uploads tree or with traversal", () => {
    expect(resolveImagePath(null)).toBeNull();
    expect(resolveImagePath("")).toBeNull();
    expect(resolveImagePath("../../etc/passwd")).toBeNull();
    expect(resolveImagePath("/etc/passwd")).toBeNull();
    expect(resolveImagePath("uploads/does-not-exist.png")).toBeNull();
    expect(resolveImagePath(path.relative(process.cwd(), signatureFile))).toBe(signatureFile);
  });

  it("lets the document snapshot win over the current settings", () => {
    // Snapshot present => snapshot paths are used.
    const frozen = resolveDocumentImages(
      { signatureFile: path.relative(process.cwd(), signatureFile), stampFile: null, stampEnabled: true },
      { signatureFile: "uploads/other.png", stampFile: path.relative(process.cwd(), stampFile), addStampToDocuments: true },
    );
    expect(frozen.signaturePath).toBe(signatureFile);
    expect(frozen.stampPath).toBeNull();

    // Snapshot absent (document issued before migration 0017) => settings win.
    const legacy = resolveDocumentImages(
      {},
      { signatureFile: null, stampFile: path.relative(process.cwd(), stampFile), addStampToDocuments: true },
    );
    expect(legacy.signaturePath).toBeNull();
    expect(legacy.stampPath).toBe(stampFile);

    // Flag off => the stamp is not printed even when the file exists.
    const noStamp = resolveDocumentImages(
      { stampEnabled: false },
      { stampFile: path.relative(process.cwd(), stampFile), addStampToDocuments: true },
    );
    expect(noStamp.stampPath).toBeNull();
  });

  it("copies the assets into the document directory so a later replace cannot change them", () => {
    const documentId = 987654;
    const documentDirectory = path.join(SNAPSHOT_ROOT, String(documentId));
    const previousRoot = process.env.BILLING_DOCUMENTS_DIR;
    process.env.BILLING_DOCUMENTS_DIR = SNAPSHOT_ROOT;

    try {
      const frozen = snapshotDocumentAssets(documentId, { signaturePath: signatureFile, stampPath: stampFile });
      expect(frozen.signatureFile).toBeTruthy();
      expect(frozen.stampFile).toBeTruthy();

      const frozenSignature = path.resolve(process.cwd(), frozen.signatureFile!);
      const frozenStamp = path.resolve(process.cwd(), frozen.stampFile!);
      expect(fs.existsSync(frozenSignature)).toBe(true);
      expect(fs.readFileSync(frozenSignature)).toEqual(TINY_PNG);

      // Replacing the settings file must not touch the frozen copy.
      const replacement = Buffer.concat([TINY_PNG, Buffer.from([0])]);
      fs.writeFileSync(signatureFile, replacement);
      expect(fs.readFileSync(frozenSignature)).toEqual(TINY_PNG);

      // And the frozen copy still resolves for rendering.
      expect(resolveImagePath(frozen.signatureFile)).toBe(frozenSignature);
      expect(resolveImagePath(frozen.stampFile)).toBe(frozenStamp);
    } finally {
      fs.writeFileSync(signatureFile, TINY_PNG);
      fs.rmSync(documentDirectory, { recursive: true, force: true });
      if (previousRoot === undefined) delete process.env.BILLING_DOCUMENTS_DIR;
      else process.env.BILLING_DOCUMENTS_DIR = previousRoot;
    }
  });
});
