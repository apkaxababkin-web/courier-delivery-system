import type { Express, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { InputError, text, date } from './correspondenceValidation';
import { lockCorrespondenceWrites, resultRows as rows } from './correspondenceWaybills';

const ROOT = '/api/manager/correspondence';

class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

function positiveId(value: unknown, label = 'идентификатор'): number {
  const number = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) {
    throw new InputError(`Некорректный ${label}`);
  }
  return number;
}

function requestBody(req: Request): Record<string, any> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new InputError('Некорректные данные');
  return req.body;
}

function shipmentIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) {
    throw new InputError('Выберите от 1 до 1000 отправлений');
  }
  const result = value.map(item => positiveId(item, 'отправления'));
  if (new Set(result).size !== result.length) throw new InputError('Отправление указано дважды');
  return result;
}

function ulanUdeDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Irkutsk', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function listSheets(conn: any) {
  const result = rows(await conn.execute(sql`
    SELECT rs."id",rs."routeDate",rs."courierId",rs."status",rs."comment",
      rs."createdByManagerId",rs."createdAt",rs."updatedAt",
      c."name" AS "courierName",c."displayColor" AS "courierColor",
      COALESCE(jsonb_agg(i."shipmentId" ORDER BY i."position")
        FILTER (WHERE i."shipmentId" IS NOT NULL),'[]'::jsonb) AS "shipmentIds",
      count(i."id")::integer AS "shipmentCount",
      count(i."id") FILTER (WHERE m."status"='delivered')::integer AS "deliveredCount"
    FROM "correspondenceRouteSheets" rs
    JOIN "couriers" c ON c."id"=rs."courierId"
    LEFT JOIN "correspondenceRouteSheetItems" i ON i."routeSheetId"=rs."id"
    LEFT JOIN "correspondenceShipments" s ON s."id"=i."shipmentId"
    LEFT JOIN "mails" m ON m."id"=s."mailId"
    GROUP BY rs."id",c."id"
    ORDER BY rs."routeDate" DESC,rs."id" DESC
    LIMIT 366
  `));
  return result.map((item: any) => ({
    ...item,
    shipmentIds: Array.isArray(item.shipmentIds) ? item.shipmentIds.map(Number) : [],
    isCurrent: String(item.routeDate).slice(0, 10) === ulanUdeDate() && item.status === 'active',
  }));
}

async function ensureMailBridge(tx: any, shipment: any): Promise<number> {
  if (shipment.mailId) return Number(shipment.mailId);

  const duplicate = rows(await tx.execute(sql`
    SELECT "id" FROM "mails"
    WHERE lower(btrim("waybillNumber"))=lower(btrim(${shipment.waybillNumber}))
    LIMIT 1 FOR UPDATE
  `))[0];
  if (duplicate) {
    const linked = rows(await tx.execute(sql`
      SELECT "id" FROM "correspondenceShipments" WHERE "mailId"=${Number(duplicate.id)} LIMIT 1
    `))[0];
    if (linked && Number(linked.id) !== Number(shipment.id)) {
      throw new HttpError(409, `Накладная ${shipment.waybillNumber} уже связана с другим отправлением`);
    }
    await tx.execute(sql`UPDATE "correspondenceShipments" SET "mailId"=${Number(duplicate.id)},"updatedAt"=now() WHERE "id"=${Number(shipment.id)}`);
    return Number(duplicate.id);
  }

  const ownerPartner = shipment.ownerType === 'partner' ? shipment.ownerId : null;
  const inserted = rows(await tx.execute(sql`
    INSERT INTO "mails" ("waybillNumber","recipientName","recipientPhone","deliveryAddress",
      "status","mailStatus","partnerId","weight")
    VALUES (${shipment.waybillNumber},${shipment.recipientCompany || shipment.recipientName || null},
      ${shipment.recipientPhone || ''},${shipment.recipientAddress || 'Адрес не указан'},
      'not_delivered','not_delivered',${shipment.partnerId || ownerPartner || null},
      ${shipment.measuredWeight || shipment.manifestWeight || null})
    RETURNING "id"
  `))[0];
  await tx.execute(sql`UPDATE "correspondenceShipments" SET "mailId"=${Number(inserted.id)},"updatedAt"=now() WHERE "id"=${Number(shipment.id)}`);
  return Number(inserted.id);
}

function handler(fn: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (cause: any) {
      const status = cause instanceof HttpError ? cause.status : cause instanceof InputError ? 400 : ['23505','55P03','40001','40P01'].includes(cause?.code || cause?.cause?.code) ? 409 : 500;
      console.error('Correspondence route sheets:', status, cause?.cause?.code || cause?.code || cause?.name);
      res.status(status).json({
        error: {
          message: status === 500 ? 'Не удалось сохранить лист развоза' : cause.message,
          ...(cause instanceof HttpError && cause.details ? { details: cause.details } : {}),
        },
      });
    }
  };
}

export function registerCorrespondenceRouteSheets(app: Express) {
  app.get(ROOT + '/route-sheets', handler(async (_req, res) => {
    const conn = await db.getDb();
    if (!conn) throw new Error('Database not available');
    res.json({ items: await listSheets(conn), today: ulanUdeDate() });
  }));

  app.post(ROOT + '/route-sheets', handler(async (req, res) => {
    const body = requestBody(req);
    const routeDate = date(body.routeDate);
    if (!routeDate) throw new InputError('Укажите дату листа развоза');
    if (routeDate !== ulanUdeDate()) throw new InputError('Лист развоза создаётся только на текущий рабочий день');
    const courierId = positiveId(body.courierId, 'курьера');
    const selectedIds = shipmentIds(body.shipmentIds);
    const comment = text(body.comment, 2000);
    const allowReassign = body.allowReassign === true;
    const managerId = Number(res.locals.manager?.managerId);
    const conn = await db.getDb();
    if (!conn) throw new Error('Database not available');

    const saved = await conn.transaction(async (tx: any) => {
      await lockCorrespondenceWrites(tx);
      await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
      const courier = rows(await tx.execute(sql`SELECT "id" FROM "couriers" WHERE "id"=${courierId} AND "isActive"=true FOR SHARE`))[0];
      if (!courier) throw new InputError('Курьер не найден или неактивен');

      const shipments = rows(await tx.execute(sql`
        SELECT s.*,m."status" AS "deliveryStatus"
        FROM "correspondenceShipments" s
        LEFT JOIN "mails" m ON m."id"=s."mailId"
        WHERE s."id" IN (${sql.join(selectedIds.map(value => sql`${value}`), sql`,`)})
        ORDER BY s."id" FOR UPDATE OF s
      `));
      if (shipments.length !== selectedIds.length) throw new InputError('Часть отправлений не найдена');
      for (const shipment of shipments) {
        if (shipment.archivedAt) throw new InputError(`Накладная ${shipment.waybillNumber}: отправление уже в архиве`);
        if (shipment.deliveryStatus === 'delivered') throw new InputError(`Накладная ${shipment.waybillNumber}: отправление уже доставлено`);
        if (shipment.outgoingManifestId) throw new InputError(`Накладная ${shipment.waybillNumber}: отправление передано партнёру`);
      }

      const conflicts = rows(await tx.execute(sql`
        SELECT i."shipmentId",rs."id" AS "routeSheetId",rs."courierId",c."name" AS "courierName"
        FROM "correspondenceRouteSheetItems" i
        JOIN "correspondenceRouteSheets" rs ON rs."id"=i."routeSheetId"
        JOIN "couriers" c ON c."id"=rs."courierId"
        WHERE rs."routeDate"=${routeDate} AND rs."status"='active'
          AND rs."courierId"<>${courierId}
          AND i."shipmentId" IN (${sql.join(selectedIds.map(value => sql`${value}`), sql`,`)})
        FOR UPDATE OF i
      `));
      if (conflicts.length && !allowReassign) {
        throw new HttpError(409, 'Часть отправлений уже назначена другому курьеру', conflicts);
      }

      let sheet = rows(await tx.execute(sql`
        SELECT * FROM "correspondenceRouteSheets"
        WHERE "routeDate"=${routeDate} AND "courierId"=${courierId}
        FOR UPDATE
      `))[0];
      if (!sheet) {
        sheet = rows(await tx.execute(sql`
          INSERT INTO "correspondenceRouteSheets"
            ("routeDate","courierId","status","comment","createdByManagerId")
          VALUES (${routeDate},${courierId},'active',${comment},${managerId}) RETURNING *
        `))[0];
      } else {
        await tx.execute(sql`UPDATE "correspondenceRouteSheets" SET "status"='active',"comment"=${comment},"updatedAt"=now() WHERE "id"=${Number(sheet.id)}`);
      }

      if (conflicts.length) {
        await tx.execute(sql`
          DELETE FROM "correspondenceRouteSheetItems" i USING "correspondenceRouteSheets" rs
          WHERE i."routeSheetId"=rs."id" AND rs."routeDate"=${routeDate}
            AND rs."courierId"<>${courierId}
            AND i."shipmentId" IN (${sql.join(selectedIds.map(value => sql`${value}`), sql`,`)})
        `);
      }
      await tx.execute(sql`DELETE FROM "correspondenceRouteSheetItems" WHERE "routeSheetId"=${Number(sheet.id)}`);
      for (let index = 0; index < shipments.length; index += 1) {
        const shipment = shipments.find((item: any) => Number(item.id) === selectedIds[index]);
        await ensureMailBridge(tx, shipment);
        await tx.execute(sql`
          INSERT INTO "correspondenceRouteSheetItems"
            ("routeSheetId","shipmentId","position","addedByManagerId")
          VALUES (${Number(sheet.id)},${selectedIds[index]},${index + 1},${managerId})
        `);
      }
      await tx.execute(sql`UPDATE "correspondenceRouteSheets" SET "updatedAt"=now() WHERE "id"=${Number(sheet.id)}`);
      await tx.execute(sql`
        INSERT INTO "correspondenceAuditLog"
          ("managerId",action,"entityType","entityId","afterData")
        VALUES (${managerId},'save','route_sheet',${Number(sheet.id)},
          ${JSON.stringify({ routeDate, courierId, shipmentIds: selectedIds, reassigned: conflicts.length })}::jsonb)
      `);
      return Number(sheet.id);
    });

    const sheets = await listSheets(conn);
    res.status(201).json({ routeSheet: sheets.find((item: any) => Number(item.id) === saved) });
  }));

  app.post(ROOT + '/route-sheets/:id/cancel', handler(async (req, res) => {
    const sheetId = positiveId(req.params.id, 'листа развоза');
    const managerId = Number(res.locals.manager?.managerId);
    const conn = await db.getDb();
    if (!conn) throw new Error('Database not available');
    await conn.transaction(async (tx: any) => {
      await lockCorrespondenceWrites(tx);
      const sheet = rows(await tx.execute(sql`SELECT * FROM "correspondenceRouteSheets" WHERE "id"=${sheetId} FOR UPDATE`))[0];
      if (!sheet) throw new HttpError(404, 'Лист развоза не найден');
      if (String(sheet.routeDate).slice(0, 10) !== ulanUdeDate()) throw new InputError('Старый лист уже не действует и не требует отмены');
      await tx.execute(sql`UPDATE "correspondenceRouteSheets" SET "status"='cancelled',"updatedAt"=now() WHERE "id"=${sheetId}`);
      await tx.execute(sql`
        INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","beforeData","afterData")
        VALUES (${managerId},'cancel','route_sheet',${sheetId},${JSON.stringify(sheet)}::jsonb,
          ${JSON.stringify({ ...sheet, status: 'cancelled' })}::jsonb)
      `);
    });
    res.json({ success: true });
  }));
}
