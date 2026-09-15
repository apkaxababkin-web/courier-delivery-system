/**
 * Client billing document endpoints: preview files, generated downloads, payment
 * confirmations and document settings.
 *
 * Registered from compatRoutes so they inherit the existing manager auth gate for
 * /api/manager/*. Files are served through dedicated routes with a path-traversal
 * guard, mirroring the request-attachment endpoints.
 *
 * Partner settlements and mail billing are not touched here.
 */
import express, { type Express, type Request, type Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import * as db from "../db";
import { broadcastLive } from "./liveEvents";
import {
  attachDocumentFile,
  billingDocumentsDirectory,
  deleteDocumentFile,
  documentHistory,
  findDocumentFile,
  getDocument,
  releaseDocumentRequests,
  renderPreviewFile,
  resolveStoredFilePath,
  type PreviewKind,
} from "./billingDocumentService";
import { loadDocumentSettings, saveDocumentSettings, DocumentSettingsError } from "./documentSettings";

const DOCUMENT_SETTINGS_DIR = process.env.BILLING_SETTINGS_DIR || path.join(process.cwd(), "uploads", "billing-settings");

/** Accepted payment confirmation types. The extension is never trusted alone. */
const ALLOWED_PAYMENT_PROOF = [
  { mime: "application/pdf", ext: ".pdf" },
  { mime: "image/jpeg", ext: ".jpg" },
  { mime: "image/png", ext: ".png" },
] as const;

const MAX_PAYMENT_PROOF_BYTES = 15 * 1024 * 1024;

/**
 * Detect the real type from the leading bytes. A file renamed to .pdf but actually
 * containing something else is rejected.
 */
export function detectFileKind(body: Buffer): { mime: string; ext: string } | null {
  if (body.length >= 5 && body.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { mime: "application/pdf", ext: ".pdf" };
  }
  if (body.length >= 3 && body[0] === 0xFF && body[1] === 0xD8 && body[2] === 0xFF) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4E && body[3] === 0x47
    && body[4] === 0x0D && body[5] === 0x0A && body[6] === 0x1A && body[7] === 0x0A) {
    return { mime: "image/png", ext: ".png" };
  }
  return null;
}

/** Strip any path component and control characters from a user supplied name. */
export function safeFileName(raw: unknown): string {
  return String(raw ?? "file")
    .replace(/[\\/]+/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 200) || "file";
}

function managerIdOf(res: Response): number | null {
  const id = Number(res.locals.manager?.managerId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function managerActorName(res: Response): string {
  const name = res.locals.manager?.managerName ?? res.locals.manager?.name;
  return typeof name === "string" && name.trim() ? name.trim() : "Менеджер";
}

function safePreviewKind(value: unknown): PreviewKind | null {
  const kind = String(value ?? "");
  return kind === "invoice" || kind === "act" || kind === "registry" ? kind : null;
}

/** Generated document paths are resolved strictly inside uploads/. */
/**
 * Files are located through the billing service, which owns the storage root
 * (`BILLING_DOCUMENTS_DIR`, default `<cwd>/uploads/billing-documents`). Resolving
 * here independently would break as soon as the directory is configured
 * differently from the process directory.
 */
function resolveStoredPath(relativePath: string): string | null {
  return resolveStoredFilePath(relativePath);
}

export function registerBillingRoutes(app: Express) {
  const root = "/api/manager/billing";

  // ─── Document settings (our requisites) ──────────────────────────────────
  app.get(`${root}/settings`, async (_req, res) => {
    try {
      res.json(await loadDocumentSettings());
    } catch (error) {
      console.error("Failed to load document settings", error);
      res.status(500).json({ error: { message: "Не удалось загрузить настройки документов" } });
    }
  });

  app.put(`${root}/settings`, async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const settings = await saveDocumentSettings(body as Record<string, unknown>);
      res.json(settings);
    } catch (error) {
      const status = error instanceof DocumentSettingsError ? 400 : 500;
      if (status === 500) console.error("Failed to save document settings", error);
      res.status(status).json({ error: { message: error instanceof Error ? error.message : "Не удалось сохранить настройки" } });
    }
  });

  /** Optional signature/stamp image upload for the printed documents. */
  app.post(
    `${root}/settings/image/:kind`,
    express.raw({ type: "*/*", limit: "5mb" }),
    async (req, res) => {
      try {
        const kind = String(req.params.kind);
        if (kind !== "signature" && kind !== "stamp") {
          res.status(400).json({ error: { message: "Неизвестный тип изображения" } });
          return;
        }

        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        if (body.length === 0) {
          res.status(400).json({ error: { message: "Пустой файл" } });
          return;
        }
        if (body.length > 5 * 1024 * 1024) {
          res.status(400).json({ error: { message: "Файл больше 5 МБ" } });
          return;
        }

        const detected = detectFileKind(body);
        if (!detected || (detected.mime !== "image/png" && detected.mime !== "image/jpeg")) {
          res.status(400).json({ error: { message: "Подойдёт только PNG или JPEG" } });
          return;
        }

        await fs.mkdir(DOCUMENT_SETTINGS_DIR, { recursive: true });
        const storedName = `${kind}-${Date.now()}-${crypto.randomUUID()}${detected.ext}`;
        await fs.writeFile(path.join(DOCUMENT_SETTINGS_DIR, storedName), body);

        const relative = path.relative(process.cwd(), path.join(DOCUMENT_SETTINGS_DIR, storedName));
        const settings = await saveDocumentSettings(
          {},
          kind === "signature" ? { signatureFile: relative } : { stampFile: relative },
        );
        res.json(settings);
      } catch (error) {
        console.error("Failed to upload document image", error);
        res.status(500).json({ error: { message: "Не удалось сохранить изображение" } });
      }
    },
  );

  // ─── Preview files (nothing is persisted) ────────────────────────────────
  app.get(`${root}/documents/preview`, async (req, res) => {
    try {
      const kind = safePreviewKind(req.query.kind);
      const clientId = Number(req.query.clientId);
      const dateFrom = String(req.query.dateFrom ?? "");
      const dateTo = String(req.query.dateTo ?? "");
      const documentDate = req.query.documentDate ? String(req.query.documentDate) : undefined;

      if (!kind) return void res.status(400).json({ error: { message: "Неизвестный тип документа" } });
      if (!Number.isSafeInteger(clientId) || clientId <= 0) {
        return void res.status(400).json({ error: { message: "Выберите клиента" } });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return void res.status(400).json({ error: { message: "Укажите период" } });
      }

      const file = await renderPreviewFile(clientId, dateFrom, dateTo, kind, documentDate);
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
      res.setHeader("Cache-Control", "no-store");
      res.send(file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось построить предпросмотр";
      console.error("Failed to render preview", error);
      res.status(400).json({ error: { message } });
    }
  });

  // ─── Generated set files ─────────────────────────────────────────────────
  app.get(`${root}/documents/:id/file/:kind`, async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      const kind = String(req.params.kind);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return void res.status(400).json({ error: { message: "Некорректный документ" } });
      }

      const document = await getDocument(documentId);
      if (!document) return void res.status(404).json({ error: { message: "Документ не найден" } });

      const relative = kind === "invoice" ? document.invoiceFile
        : kind === "act" ? document.actFile
          : kind === "registry" ? document.registryFile
            : null;
      if (!relative) return void res.status(404).json({ error: { message: "Файл не сформирован" } });

      const absolute = resolveStoredPath(relative);
      if (!absolute) return void res.status(404).json({ error: { message: "Некорректный путь к файлу" } });

      const contentType = kind === "registry"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf";
      const baseName = `Документ_${document.number}_${kind}`;
      const extension = kind === "registry" ? ".xlsx" : ".pdf";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(baseName + extension)}`);
      res.sendFile(absolute, (error) => {
        if (error && !res.headersSent) res.status(404).json({ error: { message: "Файл не найден на диске" } });
      });
    } catch (error) {
      console.error("Failed to serve document file", error);
      res.status(500).json({ error: { message: "Не удалось отдать файл" } });
    }
  });

  // ─── Payment confirmation attachments ────────────────────────────────────
  app.post(
    `${root}/documents/:id/payment-proof`,
    express.raw({ type: "*/*", limit: "15mb" }),
    async (req, res) => {
      try {
        const documentId = Number(req.params.id);
        if (!Number.isSafeInteger(documentId) || documentId <= 0) {
          return void res.status(400).json({ error: { message: "Некорректный документ" } });
        }

        const document = await getDocument(documentId);
        if (!document) return void res.status(404).json({ error: { message: "Документ не найден" } });

        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        if (body.length === 0) return void res.status(400).json({ error: { message: "Пустой файл" } });
        if (body.length > MAX_PAYMENT_PROOF_BYTES) {
          return void res.status(400).json({ error: { message: "Файл больше 15 МБ" } });
        }

        const detected = detectFileKind(body);
        const allowed = detected && ALLOWED_PAYMENT_PROOF.some((item) => item.mime === detected.mime);
        if (!detected || !allowed) {
          return void res.status(400).json({ error: { message: "Допустимы только PDF, JPG или PNG" } });
        }

        const originalName = safeFileName(req.header("x-file-name") || "payment-proof");
        const storedName = `${Date.now()}-${crypto.randomUUID()}${detected.ext}`;
        const dir = path.join(billingDocumentsDirectory(), String(documentId));
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, storedName), body);

        const relative = path.relative(process.cwd(), path.join(dir, storedName));
        const file = await attachDocumentFile({
          documentId,
          kind: "payment_proof",
          originalName: originalName.toLowerCase().endsWith(detected.ext) ? originalName : `${originalName}${detected.ext}`,
          storedName,
          fileUrl: relative,
          mimeType: detected.mime,
          sizeBytes: body.length,
          managerId: managerIdOf(res),
        });

        const managerId = managerIdOf(res);
        if (managerId) {
          try {
            const manager = await db.getManagerById(managerId);
            await db.addRequestActivityEvent({
              requestId: documentId,
              actorType: "manager",
              actorId: managerId,
              actorName: manager?.name ?? managerActorName(res),
              action: "updated",
              note: `Прикреплено подтверждение оплаты к документу №${document.number}`,
              changes: { paymentProof: { originalName: file.originalName, sizeBytes: file.sizeBytes } },
            });
          } catch (activityError) {
            console.error("Failed to log payment proof activity", activityError);
          }
        }

        broadcastLive("requests_changed");
        res.json(file);
      } catch (error) {
        console.error("Failed to attach payment proof", error);
        res.status(500).json({ error: { message: "Не удалось сохранить подтверждение оплаты" } });
      }
    },
  );

  /**
   * Release the requests of an annulled document so they can be re-issued.
   * The old document and its composition stay in history untouched.
   */
  app.post(`${root}/documents/:id/release`, express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return void res.status(400).json({ error: { message: "Некорректный документ" } });
      }
      const managerId = managerIdOf(res);
      if (!managerId) return void res.status(401).json({ error: { message: "Требуется авторизация менеджера" } });

      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : null;
      const result = await releaseDocumentRequests(documentId, managerId, note || null);

      try {
        await db.addRequestActivityEvent({
          requestId: documentId,
          actorType: "manager",
          actorId: managerId,
          actorName: (await db.getManagerById(managerId))?.name ?? managerActorName(res),
          action: "updated",
          note: `Заявки освобождены для перевыставления (документ №${documentId}, заявок: ${result.releasedRequestIds.length})`,
          changes: { releasedRequestIds: result.releasedRequestIds, note: note || null },
        });
      } catch (activityError) {
        console.error("Failed to log release activity", activityError);
      }

      broadcastLive("requests_changed");
      res.json(result);
    } catch (error) {
      const status = error instanceof Error && "status" in error ? Number((error as { status?: number }).status) : 500;
      const message = error instanceof Error ? error.message : "Не удалось освободить заявки";
      if (status >= 500) console.error("Failed to release document requests", error);
      res.status(status || 500).json({ error: { message } });
    }
  });

  /** Audit trail of one document: who issued, annulled, released, replaced it. */
  app.get(`${root}/documents/:id/history`, async (req, res) => {
    try {
      const documentId = Number(req.params.id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return void res.status(400).json({ error: { message: "Некорректный документ" } });
      }
      res.json(await documentHistory(documentId));
    } catch (error) {
      console.error("Failed to load document history", error);
      res.status(500).json({ error: { message: "Не удалось загрузить историю документа" } });
    }
  });

  app.get(`/api/manager/billing-document-files/:id/:storedName`, async (req: Request, res: Response) => {
    try {
      const fileId = Number(req.params.id);
      if (!Number.isSafeInteger(fileId) || fileId <= 0) {
        return void res.status(404).json({ error: { message: "Файл не найден" } });
      }

      const file = await findDocumentFile(fileId);
      if (!file) return void res.status(404).json({ error: { message: "Файл не найден" } });

      const expectedName = safeFileName(req.params.storedName);
      if (expectedName !== file.storedName) {
        return void res.status(404).json({ error: { message: "Файл не найден" } });
      }

      const absolute = resolveStoredPath(file.fileUrl);
      if (!absolute) return void res.status(404).json({ error: { message: "Некорректный путь к файлу" } });

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
      res.sendFile(absolute, (error) => {
        if (error && !res.headersSent) res.status(404).json({ error: { message: "Файл не найден" } });
      });
    } catch (error) {
      console.error("Failed to serve billing document file", error);
      res.status(500).json({ error: { message: "Не удалось отдать файл" } });
    }
  });

  app.delete(`${root}/document-files/:id`, async (req, res) => {
    try {
      const fileId = Number(req.params.id);
      if (!Number.isSafeInteger(fileId) || fileId <= 0) {
        return void res.status(400).json({ error: { message: "Некорректный файл" } });
      }
      const removed = await deleteDocumentFile(fileId);
      if (!removed) return void res.status(404).json({ error: { message: "Файл не найден" } });
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete billing document file", error);
      res.status(500).json({ error: { message: "Не удалось удалить файл" } });
    }
  });
}
