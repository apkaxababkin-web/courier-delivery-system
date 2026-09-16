/**
 * Signature and stamp images for the printed documents.
 *
 * Storage model: the bytes live on disk under the uploads tree, the database keeps
 * only the relative path (never base64, never inside the image/container).
 *
 * Immutability: an issued document carries the paths that were current when it was
 * issued (`billingDocuments.signatureFileSnapshot` / `stampFileSnapshot` /
 * `stampEnabledSnapshot`). Replacing the PNG in settings therefore cannot change an
 * already issued PDF. Documents issued before the snapshot existed have NULL there
 * and fall back to the current settings — the historical behaviour.
 *
 * Both images are optional: with no file the documents are still rendered, just
 * with empty signature lines.
 */
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export interface DocumentImages {
  /** Absolute path of the signature PNG, or null when not configured. */
  signaturePath: string | null;
  /** Absolute path of the stamp PNG, or null when not configured. */
  stampPath: string | null;
  /**
   * The exact bytes that were read from those paths.
   *
   * The invoice/act PDF and the immutable per-document copy are both built from THESE
   * bytes, never from the path a second time. Otherwise replacing or deleting the
   * settings PNG between rendering and copying would put different pixels into the
   * PDF and into the snapshot (or make the copy fail) — see issueDocumentSet.
   */
  signatureBytes: Buffer | null;
  stampBytes: Buffer | null;
}

export interface OverlayPlacement {
  /** Where the image is drawn, in PDF points from the bottom-left of the page. */
  x: number;
  y: number;
  /** Fixed area the image is fitted into; the aspect ratio is always preserved. */
  width: number;
  height: number;
}

export interface DocumentOverlays {
  /** Placement of the signature image, or null when it must not be printed. */
  signature: OverlayPlacement | null;
  /** Placement of the stamp image, or null when it must not be printed. */
  stamp: OverlayPlacement | null;
  /** Resolved absolute path of the signature image (see DocumentImages). */
  signaturePath: string | null;
  /** Resolved absolute path of the stamp image. */
  stampPath: string | null;
  /** Bytes actually drawn — the same buffer that becomes the immutable copy. */
  signatureBytes: Buffer | null;
  stampBytes: Buffer | null;
  /** True when the stamp should be printed at all (flag on + file present). */
  stampEnabled: boolean;
}

export interface SignatureSnapshotInput {
  signatureFile?: string | null;
  stampFile?: string | null;
  addStampToDocuments?: boolean | null;
}

export interface DocumentSignatureSnapshot {
  signatureFile?: string | null;
  stampFile?: string | null;
  stampEnabled?: boolean | null;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function placement(
  prefix: string,
  fallback: OverlayPlacement,
): OverlayPlacement {
  return {
    x: readNumber(`${prefix}_X`, fallback.x),
    y: readNumber(`${prefix}_Y`, fallback.y),
    width: readNumber(`${prefix}_WIDTH`, fallback.width),
    height: readNumber(`${prefix}_HEIGHT`, fallback.height),
  };
}

/**
 * Placement derived from the reference documents (Счет №256 / Акт №256).
 *
 * Invoice: the stamp is centred under the two signature lines, its top edge
 * slightly overlapping the first line, exactly like the reference. The signature
 * area is the free space between the lines.
 *
 * Act: the stamp sits in front of the «Исполнитель» side, the signature line
 * crosses it; the signature area is therefore slightly above that line.
 *
 * Overridable per environment (SIGNATURE_INVOICE_X/Y/WIDTH/HEIGHT and
 * STAMP_ACT_*) so the placement can be tuned per organisation without touching
 * layout code.
 */
// The role and the ФИО are printed to the right of SIGNATURE_X2/2, so the overlay is
// kept in the free left half of the signature area and never covers the name.
export const INVOICE_SIGNATURE_PLACEMENT: OverlayPlacement = placement("SIGNATURE_INVOICE", {
  x: 58,
  y: 402,
  width: 132,
  height: 40,
});

export const INVOICE_STAMP_PLACEMENT: OverlayPlacement = placement("STAMP_INVOICE", {
  x: 96,
  y: 381,
  width: 152,
  height: 72,
});

export const ACT_SIGNATURE_PLACEMENT: OverlayPlacement = placement("SIGNATURE_ACT", {
  x: 66,
  y: 436,
  width: 132,
  height: 40,
});

export const ACT_STAMP_PLACEMENT: OverlayPlacement = placement("STAMP_ACT", {
  x: 100,
  y: 389,
  width: 152,
  height: 72,
});

/** Absolute path of the immutable asset copy of one issued document. */
export function documentAssetPath(documentId: number, kind: "signature" | "stamp"): string {
  // Same base directory as the issued documents themselves (BILLING_DOCUMENTS_DIR
  // defaults to <cwd>/uploads/billing-documents).
  const documentsRoot = process.env.BILLING_DOCUMENTS_DIR || path.join(process.cwd(), "uploads", "billing-documents");
  return path.join(documentsRoot, String(documentId), "assets", `${kind}.png`);
}

/**
 * Immutable per-document copy of the signature/stamp.
 *
 * A snapshot that keeps pointing at the *settings* file would not be immutable:
 * replacing that PNG would silently change every already issued document. The bytes
 * that were RENDERED into the PDF are therefore written next to the document itself,
 * and the snapshot points there:
 *
 *   uploads/billing-documents/<documentId>/assets/signature.png
 *   uploads/billing-documents/<documentId>/assets/stamp.png
 *
 * Writing the same buffer is what makes the PDF and its immutable copy the same image
 * even if the settings file is replaced or deleted in the meantime.
 *
 * Throws when the copy cannot be written, so the caller can fail the whole issue
 * instead of leaving a half-issued document behind.
 */
export function snapshotDocumentAssets(
  documentId: number,
  images: DocumentImages,
): { signatureFile: string | null; stampFile: string | null } {
  const write = (bytes: Buffer | null, kind: "signature" | "stamp"): string | null => {
    if (!bytes) return null;
    const target = documentAssetPath(documentId, kind);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return path.relative(process.cwd(), target);
  };

  return {
    signatureFile: write(images.signatureBytes, "signature"),
    stampFile: write(images.stampBytes, "stamp"),
  };
}

/** Resolve one stored image path, refusing anything outside the uploads tree. */
export function resolveImagePath(storedPath: string | null | undefined): string | null {
  const relative = str(storedPath);
  if (!relative) return null;

  const normalized = path.normalize(relative);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;

  const absolute = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  if (absolute !== uploadsRoot && !absolute.startsWith(uploadsRoot + path.sep)) return null;
  if (!existsSync(absolute)) return null;

  return absolute;
}

/**
 * Images to print for one document, with their bytes already in memory.
 *
 * The document snapshot wins; NULL means "document issued before the snapshot
 * existed", so the current settings are used. The stamp is only returned when the
 * flag is on for this document AND the file actually resolves.
 *
 * Reading the bytes here guarantees that a later change of the settings file cannot
 * affect either the rendered PDF or the immutable copy taken from the same buffer.
 */
export function resolveDocumentImages(
  snapshot: DocumentSignatureSnapshot,
  settings: SignatureSnapshotInput,
): DocumentImages {
  const signatureSource = snapshot.signatureFile === undefined ? settings.signatureFile : snapshot.signatureFile;
  const stampSource = snapshot.stampFile === undefined ? settings.stampFile : snapshot.stampFile;
  const stampEnabled =
    snapshot.stampEnabled === undefined || snapshot.stampEnabled === null
      ? Boolean(settings.addStampToDocuments)
      : snapshot.stampEnabled === true;

  const signaturePath = resolveImagePath(signatureSource);
  const stampPath = stampEnabled ? resolveImagePath(stampSource) : null;

  return {
    signaturePath,
    stampPath,
    signatureBytes: readBytes(signaturePath),
    stampBytes: readBytes(stampPath),
  };
}

/** Read an image once, so render and snapshot share exactly the same pixels. */
function readBytes(filePath: string | null): Buffer | null {
  if (!filePath) return null;
  try {
    return readFileSync(filePath);
  } catch (error) {
    console.error("[billing] failed to read document image", { filePath, error });
    return null;
  }
}

/** Overlay placements for one document kind, with the images already resolved. */
export function documentOverlays(
  kind: "invoice" | "act",
  images: DocumentImages,
): DocumentOverlays {
  return {
    signature: images.signatureBytes ? (kind === "invoice" ? INVOICE_SIGNATURE_PLACEMENT : ACT_SIGNATURE_PLACEMENT) : null,
    stamp: images.stampBytes ? (kind === "invoice" ? INVOICE_STAMP_PLACEMENT : ACT_STAMP_PLACEMENT) : null,
    signaturePath: images.signatureBytes ? images.signaturePath : null,
    stampPath: images.stampBytes ? images.stampPath : null,
    signatureBytes: images.signatureBytes,
    stampBytes: images.stampBytes,
    stampEnabled: Boolean(images.stampBytes),
  };
}

/**
 * Fit an image into a fixed box without distortion (contain). The returned size is
 * never larger than the box; the caller draws at the box centre.
 */
export function fitSize(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
): { width: number; height: number } {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return { width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}
