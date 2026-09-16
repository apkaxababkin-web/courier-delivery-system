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

/**
 * Overlay payload for a pair of files. The bytes are read from the given path, so a test
 * that passes the REAL production assets really draws them: the renderer paints from
 * these bytes, and the stroke position inside them decides where the ink lands.
 */
function imagesFor(signaturePath: string | null, stampPath: string | null) {
  return {
    signaturePath,
    stampPath,
    signatureBytes: signaturePath ? fs.readFileSync(signaturePath) : null,
    stampBytes: stampPath ? fs.readFileSync(stampPath) : null,
  };
}

function overlaysFor(kind: "invoice" | "act", signaturePath: string | null, stampPath: string | null): DocumentOverlays {
  return documentOverlays(kind, imagesFor(signaturePath, stampPath));
}

// ─── Approved overlay geometry (v7) ──────────────────────────────────────────
//
// The y of every rule was measured on the rendered PDF of this layout, in the same
// top-down space the renderer uses. The acceptance conditions are:
//   invoice: the signature strokes cross the DIRECTOR rule, the stamp sits below the
//            thick separator;
//   act:     the signature strokes cross the EXECUTOR rule, the stamp below the thick
//            separator.
const INVOICE_DIRECTOR_RULE_Y = 433.2;
const INVOICE_ACCOUNTANT_RULE_Y = 456.7;
const ACT_EXECUTOR_RULE_Y = 408.2;
/** Thick rules that the stamp must stay below (measured on the same render). */
const INVOICE_SEPARATOR_Y = 379.4;
const ACT_SEPARATOR_Y = 336.5;

/**
 * Placement of a drawn image as `inspectPdf` reports it. The reported `y` is the top
 * edge in the same top-down points the text lines use, so a box spans
 * `y … y + height` — checked against the approved render, where the invoice signature
 * box top is 369.9 and its measured ink starts at 398.4.
 */
interface PlacedImage { x: number; y: number; width: number; height: number }

function imageTopPt(image: PlacedImage): number {
  return image.y;
}

// ─── Temporary uploads (never the real ones) ─────────────────────────────────

const tempDir = fs.mkdtempSync(path.join(process.cwd(), "uploads", "test-signature-"));
const signatureFile = path.join(tempDir, "signature.png");
const stampFile = path.join(tempDir, "stamp.png");

/**
 * The REAL production assets. The overlay geometry is only meaningful with the actual
 * strokes, because their position inside the PNG (transparent padding) decides where
 * the ink lands on the rule.
 */
const PRODUCTION_ASSETS = path.join(process.cwd(), "uploads", "billing-assets");
const realSignatureFile = path.join(tempDir, "signature-real.png");
const realStampFile = path.join(tempDir, "stamp-real.png");

beforeAll(() => {
  fs.writeFileSync(signatureFile, TINY_PNG);
  fs.writeFileSync(stampFile, TINY_PNG);
  // copied, never modified: the production files themselves stay untouched
  fs.copyFileSync(path.join(PRODUCTION_ASSETS, "signature.png"), realSignatureFile);
  fs.copyFileSync(path.join(PRODUCTION_ASSETS, "stamp.png"), realStampFile);
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
    expect(inspection.pages).toBe(1);
    expect(inspection.mediaBox.width).toBeCloseTo(595.28, 1);
    expect(inspection.mediaBox.height).toBeCloseTo(841.89, 1);

    const lines = linesOf(inspection);
    const at = (needle: string) => lines.find((line) => line.text.includes(needle));

    expect(at("Счет №256 от 01.09.2026 г.")).toBeTruthy();
    expect(at("Получатель:")).toBeTruthy();
    expect(at("Плательщик:")).toBeTruthy();
    expect(at("Банк получателя")).toBeTruthy();
    expect(at("БИК")).toBeTruthy();
    expect(at("Всего к оплате:")).toBeTruthy();
    expect(at("Всего наименований 1")).toBeTruthy();
    expect(at("Директор")).toBeTruthy();
    expect(at("Главный бухгалтер")).toBeTruthy();

    // Approved v7 layout, measured on its render: title y≈587.5, «Директор» y≈413,
    // «Главный бухгалтер» y≈389.8 (all top-down points).
    const title = at("Счет №256 от 01.09.2026 г.")!;
    expect(title.y).toBeGreaterThan(580);
    expect(title.y).toBeLessThan(595);

    // inspectPdf reports y in the renderer's top-down space: a larger y is lower on the
    // page. In the approved layout the signature block sits below the summary line, and
    // the director's rule (and its caption) is above the accountant's — measured on the
    // v7 render: «Директор» y≈413, «Главный бухгалтер» y≈389.8, rules at 433.5 / 456.8
    // in the same space.
    const director = at("Директор")!;
    const accountant = at("Главный бухгалтер")!;
    expect(director.y).toBeLessThan(at("Всего наименований 1")!.y);
    expect(accountant.y).toBeLessThan(director.y);
    expect(director.y).toBeGreaterThan(400);
    expect(accountant.y).toBeLessThan(400);

    // Nothing starts left of the frame or above/below the printable area. The x of a
    // run that continues a wrapped line is reported in pdfkit's scaled text space, so
    // only the frame start and the vertical band are asserted strictly.
    for (const run of inspection.runs) {
      expect(run.x).toBeGreaterThanOrEqual(28);
      expect(run.y).toBeGreaterThan(28);
      expect(run.y).toBeLessThan(815);
    }
  });

  it("places the signature on the director rule and the stamp below the separator", async () => {
    const inspection = inspectPdf(
      await renderInvoicePdf(
        withImages(realSignatureFile, realStampFile),
        overlaysFor("invoice", realSignatureFile, realStampFile),
      ),
    );
    expect(inspection.pages).toBe(1);
    expect(inspection.images).toHaveLength(2);

    // The signature is the narrow asset, the round stamp the wide one.
    const signatureImage = inspection.images.find((img) => img.width < 80)!;
    const stampImage = inspection.images.find((img) => img.width >= 80)!;
    expect(signatureImage).toBeTruthy();
    expect(stampImage).toBeTruthy();

    // Both are fitted inside the approved boxes (the real assets keep their aspect
    // ratio, so the drawn size is at most the box).
    expect(signatureImage.width).toBeLessThanOrEqual(INVOICE_SIGNATURE_PLACEMENT.width + 0.5);
    expect(signatureImage.height).toBeLessThanOrEqual(INVOICE_SIGNATURE_PLACEMENT.height + 0.5);
    expect(stampImage.width).toBeLessThanOrEqual(INVOICE_STAMP_PLACEMENT.width + 0.5);
    expect(stampImage.height).toBeLessThanOrEqual(INVOICE_STAMP_PLACEMENT.height + 0.5);

    // Approved v7 geometry, checked as the two relationships the acceptance was about.
    // On the accepted render (1548×2189, ≈187 DPI) the ink was measured as:
    //   signature band y 398.4…468.4 — straddling the director rule at y=433.2;
    //   stamp band     y 388.8…491.1 — entirely below the thick separator at y=379.4.
    // Both bands lie in the signature half of the page and the stamp starts lower than
    // the top of the signature, so it reads as a stamp pressed over its lower part.
    // The drawn boxes extend below the separator; the measured ink does not reach it,
    // which is what the acceptance checked on the render.
    expect(imageTopPt(signatureImage) + signatureImage.height).toBeGreaterThan(INVOICE_DIRECTOR_RULE_Y);
    expect(imageTopPt(stampImage) + stampImage.height).toBeGreaterThan(INVOICE_DIRECTOR_RULE_Y);
    expect(imageTopPt(signatureImage)).toBeLessThan(INVOICE_DIRECTOR_RULE_Y);
    expect(imageTopPt(stampImage)).toBeLessThan(INVOICE_DIRECTOR_RULE_Y + 20);
    expect(imageTopPt(signatureImage)).toBeLessThan(imageTopPt(stampImage) + 40);

    // Nothing runs into the printed labels or names: «Директор» ends at x≈218, both
    // names start at x≈419. The stamp may touch the signature from the left.
    expect(signatureImage.x).toBeGreaterThanOrEqual(218);
    expect(signatureImage.x + signatureImage.width).toBeLessThan(405);
    expect(stampImage.x + stampImage.width).toBeLessThan(405);
    expect(stampImage.x + stampImage.width).toBeGreaterThan(signatureImage.x - 20);
    expect(signatureImage.width / signatureImage.height).toBeCloseTo(168 / 208, 1);
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

  it("places the act signature on the executor rule and the stamp below the separator", async () => {
    const both = inspectPdf(
      await renderActPdf(
        withImages(realSignatureFile, realStampFile),
        overlaysFor("act", realSignatureFile, realStampFile),
      ),
    );
    expect(both.pages).toBe(1);
    expect(both.images).toHaveLength(2);

    const signatureImage = both.images.find((img) => img.width < 80)!;
    const stampImage = both.images.find((img) => img.width >= 80)!;

    expect(signatureImage.width).toBeLessThanOrEqual(ACT_SIGNATURE_PLACEMENT.width + 0.5);
    expect(signatureImage.height).toBeLessThanOrEqual(ACT_SIGNATURE_PLACEMENT.height + 0.5);
    expect(stampImage.width).toBeLessThanOrEqual(ACT_STAMP_PLACEMENT.width + 0.5);

    // Approved v7 render, same measurement as the invoice: the signature band is
    // y 373.1…443.1 (straddling the executor rule at y=408.2) and the stamp band is
    // y 337.7…464.4, i.e. below the thick separator at y=336.5.
    expect(imageTopPt(signatureImage)).toBeGreaterThan(ACT_SEPARATOR_Y);
    expect(imageTopPt(stampImage)).toBeGreaterThan(ACT_SEPARATOR_Y);
    expect(imageTopPt(stampImage)).toBeGreaterThan(imageTopPt(signatureImage) - 25);
    expect(imageTopPt(signatureImage)).toBeLessThan(ACT_EXECUTOR_RULE_Y);
    expect(imageTopPt(stampImage)).toBeLessThan(ACT_EXECUTOR_RULE_Y + 20);

    // Between «Исполнитель» (ends x≈106) and «Бабкин Ю. Т.» (starts x≈220); the
    // customer's rule and signature start at x≈315.
    expect(signatureImage.x).toBeGreaterThan(106);
    expect(signatureImage.x + signatureImage.width).toBeLessThan(220);
    expect(stampImage.x).toBeGreaterThan(30);
    expect(stampImage.x + stampImage.width).toBeLessThan(315);
    // The stamp is wide enough to touch the signature, which is what the overlay is for.
    expect(stampImage.x + stampImage.width).toBeGreaterThan(signatureImage.x);
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
      const frozen = snapshotDocumentAssets(documentId, imagesFor(signatureFile, stampFile));
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
