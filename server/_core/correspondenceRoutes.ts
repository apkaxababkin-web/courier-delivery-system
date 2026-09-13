import { registerCorrespondenceCamera } from './correspondenceCamera';
import { registerCorrespondenceWorkflow, workflowShipments, workflowManifests, calculateBillableWeight } from './correspondenceWorkflow';
import { guardLegacyWaybills } from './correspondenceWaybills';
import { registerCorrespondenceDirectories } from './correspondenceDirectories';
import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import * as db from "../db";
import { broadcastLive } from "./liveEvents";
import { InputError, MAX_FILE_BYTES, text, positive, integer, date, validateSourceRows } from './correspondenceValidation';
function error(res: Response, status: number, message: string) {
  res.status(status).json({ error: { message } });
}
function rows(result: any) {
  return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : [];
}

export function registerCorrespondenceRoutes(app: Express) {
  registerCorrespondenceDirectories(app);
  registerCorrespondenceWorkflow(app);
  registerCorrespondenceCamera(app);
  // managerApiAuthGate verifies the bearer token before this module is registered.
  app.use('/api/manager/correspondence', (_req, res, next) => {
    if (!Number.isSafeInteger(res.locals.manager?.managerId) || res.locals.manager.managerId <= 0) {
      error(res, 401, 'Требуется вход менеджера'); return;
    }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.get("/api/manager/correspondence/bootstrap", async (_req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const [clients, manifests, shipments, templates] = await Promise.all([
        conn.execute(sql`SELECT * FROM "correspondenceClients" ORDER BY "name", "id"`),
        workflowManifests(conn),
        workflowShipments(conn),
        conn.execute(sql`SELECT * FROM "correspondenceManifestTemplates" ORDER BY "partnerId"`),
      ]);
      res.json({ clients: rows(clients), manifests: rows(manifests), shipments: rows(shipments), templates: rows(templates) });
    } catch (cause) {
      console.error("Failed to load correspondence data", cause);
      error(res, 500, "Не удалось загрузить данные корреспонденции");
    }
  });

  app.post("/api/manager/correspondence/manifests/import", async (req: Request, res: Response) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const partnerId = Number(req.body?.partnerId);
      const sourceRows = validateSourceRows(req.body?.rows);
      if (!Number.isInteger(partnerId) || partnerId <= 0) return error(res, 400, "Выберите партнёра");
      const arrivedAt = date(req.body.arrivedAt);
      if (!arrivedAt) throw new InputError('Укажите дату прибытия');
      const importKey = text(req.body.importKey, 80);
      if (!importKey || !/^[a-zA-Z0-9-]{16,80}$/.test(importKey)) throw new InputError('Не указан идентификатор импорта');
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
      const normalized = sourceRows.map((item: any, index: number) => ({
        line: index + 1,
        waybillNumber: text(item.waybillNumber, 50), waybillDate: date(item.waybillDate),
        senderCity: text(item.senderCity), senderName: text(item.senderName), senderCompany: text(item.senderCompany),
        senderPhone: text(item.senderPhone), senderPostalCode: text(item.senderPostalCode), senderAddress: text(item.senderAddress),
        recipientRegion: text(item.recipientRegion), recipientCityRaw: text(item.recipientCity),
        recipientName: text(item.recipientName,255), recipientCompany: text(item.recipientCompany,255),
        recipientPhone: text(item.recipientPhone,50), recipientPostalCode: text(item.recipientPostalCode), recipientAddress: text(item.recipientAddress),
        declaredValue: positive(item.declaredValue,2), manifestWeight: positive(item.manifestWeight),
        volumetricWeight: positive(item.volumetricWeight), measuredWeight: positive(item.measuredWeight),
        placesCount: integer(item.placesCount), contents: text(item.contents), senderNotes: text(item.senderNotes),
        paymentMethod: text(item.paymentMethod), payer: text(item.payer), specialConditions: text(item.specialConditions),
      }));
      const invalid = normalized.filter(item => !item.waybillNumber).map(item => item.line);
      const duplicate = normalized.map(item => item.waybillNumber?.trim().toLowerCase()).filter((value, index, all) => value && all.indexOf(value) !== index);
      if (invalid.length) return error(res, 400, `Нет номера накладной в строках: ${invalid.slice(0,20).join(", ")}`);
      if (duplicate.length) return error(res, 400, `Повторяются накладные в файле: ${[...new Set(duplicate)].slice(0,20).join(", ")}`);
      const fileName = text(req.body?.file?.name,255);
      const fileMime = text(req.body?.file?.mime,150);
      const base64 = String(req.body?.file?.base64 || "");
      if (base64.length > Math.ceil(MAX_FILE_BYTES/3)*4 || (base64 && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))) throw new InputError('Некорректный файл или файл больше 10 МБ');
      const fileData = base64 ? Buffer.from(base64, "base64") : null;
      if (fileData && fileData.length > MAX_FILE_BYTES) return error(res, 400, "Файл больше 10 МБ");
      const managerId = Number(res.locals.manager?.managerId) || null;
      const result = await conn.transaction(async (tx: any) => {
        await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
        await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
        // Serialize imports from this module. Existing unique constraints also guard legacy races.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(738491,1)`);
        const prior = rows(await tx.execute(sql`SELECT "id","importPayloadHash" FROM "correspondenceManifests" WHERE "importKey"=${importKey}`))[0];
        if (prior) {
          if (prior.importPayloadHash !== payloadHash) throw new InputError('Этот идентификатор использован для другого набора данных. Откройте загрузку заново');
          return {manifestId:prior.id,created:0,linked:0,total:normalized.length,repeated:true};
        }
        await guardLegacyWaybills(tx, normalized.map(item=>item.waybillNumber!));
        const partner = rows(await tx.execute(sql`SELECT "id" FROM "partners" WHERE "id"=${partnerId} AND "isActive"=true FOR SHARE`))[0];
        if (!partner) throw new InputError('Партнёр не найден или неактивен');
        const manifestResult = await tx.execute(sql`INSERT INTO "correspondenceManifests"
          ("direction","partnerId","manifestNumber","manifestDate","arrivedAt","sourceFileName","sourceFileMime","sourceFileSha256","sourceFileData","createdByManagerId","importKey","importPayloadHash")
          VALUES ('incoming',${partnerId},${text(req.body.manifestNumber,100)},${date(req.body.manifestDate)},
            ${arrivedAt},${fileName},${fileMime},${fileData ? crypto.createHash("sha256").update(fileData).digest("hex") : null},
            ${fileData},${managerId},${importKey},${payloadHash}) RETURNING "id"`);
        const manifestId = Number(rows(manifestResult)[0]?.id);
        let created = 0, linked = 0;
        for (const item of normalized) {
          const existingResult = await tx.execute(sql`SELECT m."id", m."partnerId",m."recipientName",m."recipientPhone",m."deliveryAddress",m."weight",cs."id" AS "correspondenceId"
            FROM "mails" m LEFT JOIN "correspondenceShipments" cs ON cs."mailId"=m."id"
            WHERE lower(btrim(m."waybillNumber"))=lower(btrim(${item.waybillNumber})) LIMIT 2 FOR UPDATE OF m`);
          if(rows(existingResult).length>1) throw new InputError(`Накладная ${item.waybillNumber}: найдено несколько старых записей`);
          const existing = rows(existingResult)[0];
          if (existing?.correspondenceId) throw new InputError(`Накладная ${item.waybillNumber} уже загружена в новую платформу`);
          if (existing) {
            if (req.body.linkExisting !== true) throw new InputError(`Накладная ${item.waybillNumber} уже существует. Подтвердите связывание в предпросмотре`);
            const conflicts = (existing.partnerId != null && Number(existing.partnerId)!==partnerId) ||
              (existing.weight != null && item.manifestWeight != null && Number(existing.weight)!==Number(item.manifestWeight)) ||
              [[existing.recipientName,item.recipientName||item.recipientCompany],[existing.recipientPhone,item.recipientPhone],
               [existing.deliveryAddress==='Адрес не указан'?'':existing.deliveryAddress,item.recipientAddress]].some(([a,b])=>a&&b&&String(a).trim()!==String(b).trim());
            if (conflicts) throw new InputError(`Накладная ${item.waybillNumber}: данные отличаются от существующей записи. Автоматическая замена отменена`);
          }
          let mailId = Number(existing?.id || 0);
          if (!mailId) {
            const mailResult = await tx.execute(sql`INSERT INTO "mails"
              ("waybillNumber","recipientName","recipientPhone","deliveryAddress","status","mailStatus","partnerId","weight")
              VALUES (${item.waybillNumber},${item.recipientName || item.recipientCompany},${item.recipientPhone || ""},
                ${item.recipientAddress || "Адрес не указан"},'not_delivered','not_delivered',${partnerId},${item.manifestWeight}) RETURNING "id"`);
            mailId = Number(rows(mailResult)[0]?.id); created += 1;
          } else {
            await tx.execute(sql`UPDATE "mails" SET "partnerId"=COALESCE("partnerId",${partnerId}),
              "weight"=COALESCE("weight",${item.manifestWeight}),
              "recipientName"=COALESCE(NULLIF("recipientName",''),${item.recipientName || item.recipientCompany}),
              "recipientPhone"=COALESCE(NULLIF("recipientPhone",''),${item.recipientPhone || ""}),
              "deliveryAddress"=CASE WHEN "deliveryAddress" IN ('','Адрес не указан') THEN COALESCE(${item.recipientAddress},"deliveryAddress") ELSE "deliveryAddress" END,
              "updatedAt"=now() WHERE "id"=${mailId}`); linked += 1;
          }
          await tx.execute(sql`INSERT INTO "correspondenceShipments"
            ("mailId","manifestId","direction","ownerType","ownerId","waybillDate","senderCity","senderName","senderCompany","senderPhone","senderPostalCode","senderAddress",
             "recipientRegion","recipientCityRaw","recipientName","recipientCompany","recipientPhone","recipientPostalCode","recipientAddress","declaredValue",
             "manifestWeight","volumetricWeight","measuredWeight","placesCount","contents","senderNotes","paymentMethod","payer","specialConditions",
             "partnerId","billableWeight")
            VALUES (${mailId},${manifestId},'incoming','partner',${partnerId},${item.waybillDate},${item.senderCity},${item.senderName},${item.senderCompany},${item.senderPhone},
             ${item.senderPostalCode},${item.senderAddress},${item.recipientRegion},${item.recipientCityRaw},${item.recipientName},${item.recipientCompany},
             ${item.recipientPhone},${item.recipientPostalCode},${item.recipientAddress},${item.declaredValue},${item.manifestWeight},${item.volumetricWeight},
             ${item.measuredWeight},${item.placesCount},${item.contents},${item.senderNotes},${item.paymentMethod},${item.payer},${item.specialConditions},
             ${partnerId},${calculateBillableWeight(item.measuredWeight,item.manifestWeight,item.volumetricWeight)})`);
        }
        const mapping = req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {};
        await tx.execute(sql`INSERT INTO "correspondenceManifestTemplates" ("partnerId","sheetName","startRow","mapping")
          VALUES (${partnerId},${text(req.body.sheetName,255)},${integer(req.body.startRow) || 2},${JSON.stringify(mapping)}::jsonb)
          ON CONFLICT ("partnerId") DO UPDATE SET "sheetName"=EXCLUDED."sheetName","startRow"=EXCLUDED."startRow",
          "mapping"=EXCLUDED."mapping","updatedAt"=now()`);
        return { manifestId, created, linked, total: normalized.length };
      });
      broadcastLive("mails_changed");
      res.json(result);
    } catch (cause) {
      console.error("Failed to import correspondence manifest", cause);
      error(res, cause instanceof InputError ? 400 : 500, cause instanceof InputError ? cause.message : 'Не удалось сохранить манифест. Изменения отменены; обновите данные перед повтором');
    }
  });
}
