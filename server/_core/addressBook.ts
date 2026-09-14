import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import * as db from '../db';

/**
 * Shared Address Book — one global organisation / address / contact directory
 * for the courier manager site and «МИГ · Корреспонденция».
 *
 * It answers "у кого забрать / кому доставить". It is NOT the requester role:
 * requests.requesterType/requesterId/requesterNameSnapshot (migration 0011)
 * answer "кто заказал" and stay untouched.
 *
 * Hard invariants of this module:
 *   - it only ever reads/writes addressOrganizations, addressOrgLocations and
 *     addressOrgContacts; it never touches requests, tasks, mails,
 *     correspondenceShipments or any other existing table;
 *   - it never backfills anything from historical data;
 *   - records are retired with isActive = false; there is no physical delete;
 *   - editing the directory can never rewrite a snapshot, because nothing
 *     references these tables.
 */

const TABLE_ORGANIZATIONS = 'addressOrganizations';
const TABLE_LOCATIONS = 'addressOrgLocations';
const TABLE_CONTACTS = 'addressOrgContacts';

const MAX_TEXT = 5000;
const SEARCH_DEFAULT_LIMIT = 25;
const SEARCH_MAX_LIMIT = 100;

export class AddressBookInputError extends Error {}
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ─── Normalization ───────────────────────────────────────────────────────────
// Display values are stored exactly as typed. Normalized values are technical
// search/comparison keys only and are never shown instead of the original.

/** trim + collapse inner whitespace + lowercase */
export function normalizeTextKey(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Digits only. A Russian 11-digit number starting with 8 becomes 7XXXXXXXXXX and
 * a bare 10-digit number is prefixed with 7. Anything else is left as its digits.
 * Used for search only — never as a unique key, because stored formats vary.
 */
export function normalizePhone(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

// ─── Field validation (allowlist, mirroring the existing directory module) ───

function rows(result: any): any[] {
  return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : [];
}

function textField(value: unknown, max: number, label: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new AddressBookInputError(`Некорректное поле «${label}»`);
  const result = String(value).trim();
  if (result.length > max) throw new AddressBookInputError(`Поле «${label}» длиннее ${max} символов`);
  if (result.includes('\0')) throw new AddressBookInputError(`Поле «${label}» содержит недопустимый символ`);
  return result || null;
}

function requiredField(value: unknown, max: number, label: string): string {
  const result = textField(value, max, label);
  if (!result) throw new AddressBookInputError(`Укажите ${label}`);
  return result;
}

function idField(value: unknown, label: string): number {
  if (!/^\d+$/.test(String(value))) throw new AddressBookInputError(`Некорректный идентификатор: ${label}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) throw new AddressBookInputError(`Некорректный идентификатор: ${label}`);
  return parsed;
}

function optionalIdField(value: unknown, label: string): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return idField(value, label);
}

function booleanField(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new AddressBookInputError(`Некорректный признак «${label}»`);
  return value;
}

function optionalEmailField(value: unknown): string | null {
  const result = textField(value, 320, 'Email');
  if (!result) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AddressBookInputError('Некорректный email');
  return result;
}

// ─── Version (optimistic locking), same idea as the correspondence directories ─

/**
 * Content hash used for optimistic locking. The "version" key is always excluded,
 * because detail reads attach it to the very record that is hashed here.
 */
function versionOf(record: unknown): string {
  let payload: unknown = record ?? null;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'version')) {
    const { version: _ignored, ...rest } = payload as Record<string, unknown>;
    payload = rest;
  }
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function assertVersion(body: any, current: unknown): void {
  if (body?.version !== versionOf(current)) {
    throw new HttpError(409, 'Запись уже изменена. Закройте форму, обновите данные и откройте её снова');
  }
}

// ─── Read ────────────────────────────────────────────────────────────────────

type OrgRow = {
  id: number;
  name: string;
  normalizedName: string;
  comment: string | null;
  isActive: boolean;
  createdAt: unknown;
  updatedAt: unknown;
};

function locationShape(l: any) {
  return {
    id: Number(l.id),
    organizationId: Number(l.organizationId),
    label: l.label ?? null,
    city: l.city ?? null,
    address: l.address,
    postalCode: l.postalCode ?? null,
    normalizedAddress: l.normalizedAddress,
    isActive: l.isActive !== false,
    createdAt: l.createdAt ?? null,
    updatedAt: l.updatedAt ?? null,
  };
}

function contactShape(c: any) {
  return {
    id: Number(c.id),
    organizationId: Number(c.organizationId),
    locationId: c.locationId === null || c.locationId === undefined ? null : Number(c.locationId),
    name: c.name ?? null,
    position: c.position ?? null,
    phone: c.phone ?? null,
    phoneNormalized: c.phoneNormalized ?? null,
    email: c.email ?? null,
    isActive: c.isActive !== false,
    createdAt: c.createdAt ?? null,
    updatedAt: c.updatedAt ?? null,
  };
}

function presentOrganization(org: any, locations: any[], contacts: any[]) {
  const locationItems = locations.map(locationShape);
  const contactItems = contacts.map(contactShape);

  const shape = {
    id: Number(org.id),
    name: org.name,
    normalizedName: org.normalizedName,
    comment: org.comment ?? null,
    isActive: org.isActive !== false,
    createdAt: org.createdAt ?? null,
    updatedAt: org.updatedAt ?? null,
    locationCount: locationItems.length,
    contactCount: contactItems.length,
    locations: locationItems,
    contacts: contactItems,
  };

  // Nested rows carry their own version, so a form can lock a single address or
  // contact without resubmitting the whole organisation. The organisation hash is
  // computed over the same nested forms that are returned, so a read followed by a
  // write always agrees on the version.
  return {
    ...shape,
    version: versionOf({
      ...shape,
      locations: locationItems.map((item) => ({ ...item, version: versionOf(item) })),
      contacts: contactItems.map((item) => ({ ...item, version: versionOf(item) })),
    }),
    locations: locationItems.map((item) => ({ ...item, version: versionOf(item) })),
    contacts: contactItems.map((item) => ({ ...item, version: versionOf(item) })),
  };
}

async function organizationChildren(conn: any, organizationIds: number[]) {
  if (!organizationIds.length) return { locationsByOrg: new Map<number, any[]>(), contactsByOrg: new Map<number, any[]>() };

  const list = sql.join(organizationIds.map((n) => sql`${n}`), sql`, `);
  const locations = rows(await conn.execute(sql`
    SELECT * FROM ${sql.identifier(TABLE_LOCATIONS)}
     WHERE "organizationId" IN (${list})
     ORDER BY "isActive" DESC, "city", "address", "id"`));
  const contacts = rows(await conn.execute(sql`
    SELECT * FROM ${sql.identifier(TABLE_CONTACTS)}
     WHERE "organizationId" IN (${list})
     ORDER BY "isActive" DESC, "name", "id"`));

  const locationsByOrg = new Map<number, any[]>();
  const contactsByOrg = new Map<number, any[]>();
  for (const row of locations) {
    const key = Number(row.organizationId);
    if (!locationsByOrg.has(key)) locationsByOrg.set(key, []);
    locationsByOrg.get(key)!.push(row);
  }
  for (const row of contacts) {
    const key = Number(row.organizationId);
    if (!contactsByOrg.has(key)) contactsByOrg.set(key, []);
    contactsByOrg.get(key)!.push(row);
  }
  return { locationsByOrg, contactsByOrg };
}

async function getOrganization(conn: any, id: number) {
  const org = rows(await conn.execute(sql`SELECT * FROM ${sql.identifier(TABLE_ORGANIZATIONS)} WHERE "id" = ${id} LIMIT 1`))[0];
  if (!org) throw new HttpError(404, 'Организация не найдена');
  const { locationsByOrg, contactsByOrg } = await organizationChildren(conn, [id]);
  return presentOrganization(org, locationsByOrg.get(id) || [], contactsByOrg.get(id) || []);
}

async function getLocation(conn: any, id: number) {
  const row = rows(await conn.execute(sql`SELECT * FROM ${sql.identifier(TABLE_LOCATIONS)} WHERE "id" = ${id} LIMIT 1`))[0];
  if (!row) throw new HttpError(404, 'Адрес не найден');
  return row;
}

async function getContact(conn: any, id: number) {
  const row = rows(await conn.execute(sql`SELECT * FROM ${sql.identifier(TABLE_CONTACTS)} WHERE "id" = ${id} LIMIT 1`))[0];
  if (!row) throw new HttpError(404, 'Контакт не найден');
  return row;
}

// ─── Audit ───────────────────────────────────────────────────────────────────
// Reuses the existing correspondenceAuditLog table (schema unchanged). Inactive
// records are still audited: they stay visible to administrators.

async function audit(tx: any, managerId: number | null, action: string, entity: string, entityId: number, before: unknown, after: unknown) {
  // correspondenceAuditLog.id is an identity column (migration 0013 guarantees it),
  // so the id is generated by PostgreSQL. occurredAt is still set explicitly so the
  // trail never depends on a column default. The table schema itself is unchanged.
  await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId","occurredAt","action","entityType","entityId","beforeData","afterData")
    VALUES (${managerId},now(),${action},${entity},${entityId},
      ${before ? JSON.stringify(before) : null}::jsonb,${after ? JSON.stringify(after) : null}::jsonb)`);
}

// ─── Write ───────────────────────────────────────────────────────────────────

async function lockOrganization(tx: any, id: number): Promise<OrgRow> {
  const row = rows(await tx.execute(sql`SELECT * FROM ${sql.identifier(TABLE_ORGANIZATIONS)} WHERE "id" = ${id} FOR UPDATE`))[0];
  if (!row) throw new HttpError(404, 'Организация не найдена');
  return row as OrgRow;
}

async function withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  const conn = await db.getDb();
  if (!conn) throw new Error('Database not available');
  return conn.transaction(async (tx: any) => {
    await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
    await tx.execute(sql`SET LOCAL statement_timeout='15s'`);
    return fn(tx);
  });
}

/** Location ids are validated against the owning organisation so a contact can never be attached across organisations. */
async function assertLocationBelongsToOrganization(tx: any, locationId: number, organizationId: number): Promise<void> {
  const row = rows(await tx.execute(sql`SELECT "id","organizationId" FROM ${sql.identifier(TABLE_LOCATIONS)} WHERE "id" = ${locationId} LIMIT 1`))[0];
  if (!row) throw new AddressBookInputError('Указанный адрес не найден');
  if (Number(row.organizationId) !== organizationId) throw new AddressBookInputError('Адрес относится к другой организации');
}

async function createOrganization(tx: any, managerId: number | null, body: any) {
  const name = requiredField(body?.name, 255, 'название организации');
  const values = {
    name,
    normalizedName: normalizeTextKey(name).slice(0, 255),
    comment: textField(body?.comment, MAX_TEXT, 'Комментарий'),
    isActive: body?.isActive === undefined ? true : booleanField(body.isActive, 'isActive'),
  };

  const inserted = rows(await tx.execute(sql`INSERT INTO ${sql.identifier(TABLE_ORGANIZATIONS)}
    ("name","normalizedName","comment","isActive")
    VALUES (${values.name},${values.normalizedName},${values.comment},${values.isActive})
    RETURNING *`))[0];

  const result = await getOrganization(tx, Number(inserted.id));
  await audit(tx, managerId, 'create', TABLE_ORGANIZATIONS, result.id, null, result);
  return result;
}

async function updateOrganization(tx: any, managerId: number | null, id: number, body: any) {
  const before = await getOrganization(tx, id);
  await lockOrganization(tx, id);
  assertVersion(body, before);

  const name = body?.name === undefined ? before.name : requiredField(body.name, 255, 'название организации');
  const comment = body?.comment === undefined ? before.comment : textField(body.comment, MAX_TEXT, 'Комментарий');
  const isActive = body?.isActive === undefined ? before.isActive : booleanField(body.isActive, 'isActive');

  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_ORGANIZATIONS)}
     SET "name"=${name}, "normalizedName"=${normalizeTextKey(name).slice(0, 255)},
         "comment"=${comment}, "isActive"=${isActive}, "updatedAt"=now()
   WHERE "id"=${id}`);

  const after = await getOrganization(tx, id);
  await audit(tx, managerId, 'update', TABLE_ORGANIZATIONS, id, before, after);
  return after;
}

async function createLocation(tx: any, managerId: number | null, organizationId: number, body: any) {
  await lockOrganization(tx, organizationId);

  const address = requiredField(body?.address, MAX_TEXT, 'адрес');
  const values = {
    organizationId,
    label: textField(body?.label, 255, 'Метка'),
    city: textField(body?.city, 100, 'Город'),
    address,
    postalCode: textField(body?.postalCode, 20, 'Индекс'),
    normalizedAddress: normalizeTextKey(address),
    isActive: body?.isActive === undefined ? true : booleanField(body.isActive, 'isActive'),
  };

  const inserted = rows(await tx.execute(sql`INSERT INTO ${sql.identifier(TABLE_LOCATIONS)}
    ("organizationId","label","city","address","postalCode","normalizedAddress","isActive")
    VALUES (${values.organizationId},${values.label},${values.city},${values.address},${values.postalCode},${values.normalizedAddress},${values.isActive})
    RETURNING *`))[0];

  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, 'create', TABLE_LOCATIONS, Number(inserted.id), null, after.locations.find((l) => l.id === Number(inserted.id)) ?? null);
  return after;
}

async function updateLocation(tx: any, managerId: number | null, id: number, body: any) {
  const current = await getLocation(tx, id);
  const organizationId = Number(current.organizationId);
  const before = await getOrganization(tx, organizationId);
  await tx.execute(sql`SELECT "id" FROM ${sql.identifier(TABLE_LOCATIONS)} WHERE "id"=${id} FOR UPDATE`);
  const locCurrent = before.locations.find((l) => l.id === id);
  assertVersion(body, locCurrent);

  const address = body?.address === undefined ? current.address : requiredField(body.address, MAX_TEXT, 'адрес');
  const label = body?.label === undefined ? current.label : textField(body.label, 255, 'Метка');
  const city = body?.city === undefined ? current.city : textField(body.city, 100, 'Город');
  const postalCode = body?.postalCode === undefined ? current.postalCode : textField(body.postalCode, 20, 'Индекс');
  const isActive = body?.isActive === undefined ? current.isActive !== false : booleanField(body.isActive, 'isActive');

  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_LOCATIONS)}
     SET "label"=${label}, "city"=${city}, "address"=${address}, "postalCode"=${postalCode},
         "normalizedAddress"=${normalizeTextKey(address)}, "isActive"=${isActive}, "updatedAt"=now()
   WHERE "id"=${id}`);

  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, 'update', TABLE_LOCATIONS, id, before, after);
  return after;
}

async function createContact(tx: any, managerId: number | null, organizationId: number, body: any) {
  await lockOrganization(tx, organizationId);

  const locationId = optionalIdField(body?.locationId, 'locationId');
  if (locationId !== null) await assertLocationBelongsToOrganization(tx, locationId, organizationId);

  const name = textField(body?.name, 255, 'Контакт');
  const phone = textField(body?.phone, 50, 'Телефон');
  const email = optionalEmailField(body?.email);
  if (!name && !phone && !email) throw new AddressBookInputError('Укажите хотя бы имя, телефон или email контакта');

  const values = {
    organizationId,
    locationId,
    name,
    position: textField(body?.position, 255, 'Должность'),
    phone,
    phoneNormalized: normalizePhone(phone),
    email,
    isActive: body?.isActive === undefined ? true : booleanField(body.isActive, 'isActive'),
  };

  const inserted = rows(await tx.execute(sql`INSERT INTO ${sql.identifier(TABLE_CONTACTS)}
    ("organizationId","locationId","name","position","phone","phoneNormalized","email","isActive")
    VALUES (${values.organizationId},${values.locationId},${values.name},${values.position},${values.phone},${values.phoneNormalized},${values.email},${values.isActive})
    RETURNING *`))[0];

  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, 'create', TABLE_CONTACTS, Number(inserted.id), null, after.contacts.find((c) => c.id === Number(inserted.id)) ?? null);
  return after;
}

async function updateContact(tx: any, managerId: number | null, id: number, body: any) {
  const current = await getContact(tx, id);
  const organizationId = Number(current.organizationId);
  const before = await getOrganization(tx, organizationId);
  await tx.execute(sql`SELECT "id" FROM ${sql.identifier(TABLE_CONTACTS)} WHERE "id"=${id} FOR UPDATE`);
  assertVersion(body, before.contacts.find((c) => c.id === id));

  const locationProvided = Object.prototype.hasOwnProperty.call(body ?? {}, 'locationId');
  let locationId: number | null = current.locationId === null || current.locationId === undefined ? null : Number(current.locationId);
  if (locationProvided) {
    locationId = optionalIdField(body.locationId, 'locationId');
    if (locationId !== null) await assertLocationBelongsToOrganization(tx, locationId, organizationId);
  }

  const name = body?.name === undefined ? current.name : textField(body.name, 255, 'Контакт');
  const position = body?.position === undefined ? current.position : textField(body.position, 255, 'Должность');
  const phone = body?.phone === undefined ? current.phone : textField(body.phone, 50, 'Телефон');
  const email = body?.email === undefined ? current.email : optionalEmailField(body.email);
  const isActive = body?.isActive === undefined ? current.isActive !== false : booleanField(body.isActive, 'isActive');
  if (!name && !phone && !email) throw new AddressBookInputError('Укажите хотя бы имя, телефон или email контакта');

  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_CONTACTS)}
     SET "locationId"=${locationId}, "name"=${name}, "position"=${position}, "phone"=${phone},
         "phoneNormalized"=${normalizePhone(phone)}, "email"=${email}, "isActive"=${isActive}, "updatedAt"=now()
   WHERE "id"=${id}`);

  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, 'update', TABLE_CONTACTS, id, before, after);
  return after;
}

async function toggleOrganization(tx: any, managerId: number | null, id: number, isActive: boolean) {
  const before = await getOrganization(tx, id);
  await lockOrganization(tx, id);
  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_ORGANIZATIONS)} SET "isActive"=${isActive}, "updatedAt"=now() WHERE "id"=${id}`);
  const after = await getOrganization(tx, id);
  await audit(tx, managerId, isActive ? 'activate' : 'deactivate', TABLE_ORGANIZATIONS, id, before, after);
  return after;
}

async function toggleLocation(tx: any, managerId: number | null, id: number, isActive: boolean) {
  const current = await getLocation(tx, id);
  const organizationId = Number(current.organizationId);
  const before = await getOrganization(tx, organizationId);
  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_LOCATIONS)} SET "isActive"=${isActive}, "updatedAt"=now() WHERE "id"=${id}`);
  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, isActive ? 'activate' : 'deactivate', TABLE_LOCATIONS, id, before, after);
  return after;
}

async function toggleContact(tx: any, managerId: number | null, id: number, isActive: boolean) {
  const current = await getContact(tx, id);
  const organizationId = Number(current.organizationId);
  const before = await getOrganization(tx, organizationId);
  await tx.execute(sql`UPDATE ${sql.identifier(TABLE_CONTACTS)} SET "isActive"=${isActive}, "updatedAt"=now() WHERE "id"=${id}`);
  const after = await getOrganization(tx, organizationId);
  await audit(tx, managerId, isActive ? 'activate' : 'deactivate', TABLE_CONTACTS, id, before, after);
  return after;
}

// ─── Search ──────────────────────────────────────────────────────────────────

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Bounded search over organisation name, address, contact name and phone.
 * Only fields the caller may see are read; nothing is returned when there is no
 * query and no explicit listing limit.
 */
async function searchOrganizations(conn: any, options: { q: string; includeInactive: boolean; limit: number; offset: number }) {
  const query = normalizeTextKey(options.q);
  const digits = normalizePhone(options.q) ?? '';

  let matchFilter = sql``;
  if (query) {
    const like = `%${escapeLike(query)}%`;
    const digitLike = digits ? `%${escapeLike(digits)}%` : null;
    // Autocomplete must not resurface records that were switched off: when
    // inactive rows are excluded, addresses and contacts must be active too.
    const childScope = options.includeInactive
      ? sql``
      : sql`AND l."isActive" = true`;
    const contactScope = options.includeInactive
      ? sql``
      : sql`AND c."isActive" = true`;
    matchFilter = sql`AND (
      o."normalizedName" LIKE ${like}
      OR o."name" ILIKE ${like}
      OR EXISTS (SELECT 1 FROM ${sql.identifier(TABLE_LOCATIONS)} l
                  WHERE l."organizationId" = o."id" AND l."normalizedAddress" LIKE ${like} ${childScope})
      OR EXISTS (SELECT 1 FROM ${sql.identifier(TABLE_CONTACTS)} c
                  WHERE c."organizationId" = o."id" ${contactScope}
                    AND (c."name" ILIKE ${like}
                         ${digitLike ? sql`OR c."phoneNormalized" LIKE ${digitLike}` : sql``}))
    )`;
  }

  const scopeFilter = options.includeInactive ? sql`true` : sql`o."isActive" = true`;

  const orderBy = query
    ? sql`ORDER BY (CASE WHEN o."normalizedName" = ${query} THEN 0 WHEN o."normalizedName" LIKE ${`${escapeLike(query)}%`} THEN 1 ELSE 2 END), o."name", o."id"`
    : sql`ORDER BY o."name", o."id"`;

  const rowsPage = rows(await conn.execute(sql`SELECT o.* FROM ${sql.identifier(TABLE_ORGANIZATIONS)} o
     WHERE ${scopeFilter} ${matchFilter} ${orderBy}
     LIMIT ${options.limit} OFFSET ${options.offset}`));

  const total = Number(rows(await conn.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(TABLE_ORGANIZATIONS)} o
     WHERE ${scopeFilter} ${matchFilter}`))[0]?.n ?? 0);

  const ids = rowsPage.map((r) => Number(r.id));
  const { locationsByOrg, contactsByOrg } = await organizationChildren(conn, ids);
  const items = rowsPage.map((row) => presentOrganization(row, locationsByOrg.get(Number(row.id)) || [], contactsByOrg.get(Number(row.id)) || []));
  return { items, total };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

function managerIdOf(res: Response): number | null {
  const id = Number(res.locals.manager?.managerId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function registerAddressBookRoutes(app: Express) {
  const root = '/api/manager/address-book';

  // Defense in depth: managerApiAuthGate already guards /api/manager/*, but this
  // module must never depend on registration order.
  app.use(root, (_req, res, next) => {
    if (managerIdOf(res) === null) {
      res.status(401).json({ error: { message: 'Требуется вход менеджера' } });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const fail = (res: Response, error: unknown) => {
    const code = (error as any)?.code || (error as any)?.cause?.code;
    const status = error instanceof HttpError
      ? error.status
      : error instanceof AddressBookInputError
        ? 400
        : code === '23505'
          ? 409
          : 500;
    if (status >= 500) console.error('Address book request failed', { status, code, detail: (error as any)?.message, column: (error as any)?.column });
    res.status(status).json({
      error: {
        message: status === 500
          ? 'Не удалось выполнить операцию со справочником'
          : code === '23505'
            ? 'Такая запись уже существует'
            : (error as Error).message,
      },
    });
  };

  const write = (handler: (req: Request, tx: any, managerId: number | null) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const result = await withTransaction((tx) => handler(req, tx, managerIdOf(res)));
      res.json(result);
    } catch (error) {
      fail(res, error);
    }
  };

  // ─── Read-only ─────────────────────────────────────────────────────────────

  // Autocomplete / listing. Defaults to active records only; includeInactive=true
  // is for the administrative UI. The limit is mandatory and capped.
  app.get(`${root}/search`, async (req, res) => {
    try {
      const conn = await db.getDb();
      if (!conn) throw new Error('Database not available');

      const q = textField(req.query.q, 255, 'Поиск') ?? '';
      const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
      const rawLimit = Number(req.query.limit ?? SEARCH_DEFAULT_LIMIT);
      const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, SEARCH_MAX_LIMIT) : SEARCH_DEFAULT_LIMIT;
      const rawOffset = Number(req.query.offset ?? 0);
      const offset = Number.isSafeInteger(rawOffset) && rawOffset > 0 ? Math.min(rawOffset, 100000) : 0;

      const { items, total } = await searchOrganizations(conn, { q, includeInactive, limit, offset });
      res.json({ items, total, limit, offset, query: q, includeInactive });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get(`${root}/organizations/:id`, async (req, res) => {
    try {
      const id = idField(req.params.id, 'organizationId');
      const conn = await db.getDb();
      if (!conn) throw new Error('Database not available');
      res.json(await getOrganization(conn, id));
    } catch (error) {
      fail(res, error);
    }
  });

  // ─── Writes ────────────────────────────────────────────────────────────────
  // No DELETE endpoint exists on purpose: retirement is isActive = false.

  app.post(`${root}/organizations`, write(async (req, tx, managerId) => createOrganization(tx, managerId, req.body)));
  app.put(`${root}/organizations/:id`, write(async (req, tx, managerId) => updateOrganization(tx, managerId, idField(req.params.id, 'organizationId'), req.body)));

  app.post(`${root}/organizations/:id/locations`, write(async (req, tx, managerId) => createLocation(tx, managerId, idField(req.params.id, 'organizationId'), req.body)));
  app.put(`${root}/locations/:id`, write(async (req, tx, managerId) => updateLocation(tx, managerId, idField(req.params.id, 'locationId'), req.body)));

  app.post(`${root}/organizations/:id/contacts`, write(async (req, tx, managerId) => createContact(tx, managerId, idField(req.params.id, 'organizationId'), req.body)));
  app.put(`${root}/contacts/:id`, write(async (req, tx, managerId) => updateContact(tx, managerId, idField(req.params.id, 'contactId'), req.body)));

  app.post(`${root}/organizations/:id/deactivate`, write(async (req, tx, managerId) => toggleOrganization(tx, managerId, idField(req.params.id, 'organizationId'), false)));
  app.post(`${root}/organizations/:id/activate`, write(async (req, tx, managerId) => toggleOrganization(tx, managerId, idField(req.params.id, 'organizationId'), true)));
  app.post(`${root}/locations/:id/deactivate`, write(async (req, tx, managerId) => toggleLocation(tx, managerId, idField(req.params.id, 'locationId'), false)));
  app.post(`${root}/locations/:id/activate`, write(async (req, tx, managerId) => toggleLocation(tx, managerId, idField(req.params.id, 'locationId'), true)));
  app.post(`${root}/contacts/:id/deactivate`, write(async (req, tx, managerId) => toggleContact(tx, managerId, idField(req.params.id, 'contactId'), false)));
  app.post(`${root}/contacts/:id/activate`, write(async (req, tx, managerId) => toggleContact(tx, managerId, idField(req.params.id, 'contactId'), true)));

  // Administrative history for an organisation, its addresses and its contacts.
  app.get(`${root}/organizations/:id/history`, async (req, res) => {
    try {
      const id = idField(req.params.id, 'organizationId');
      const conn = await db.getDb();
      if (!conn) throw new Error('Database not available');

      const items = rows(await conn.execute(sql`
        SELECT a."id", a."managerId", a."occurredAt", a."action", a."entityType", a."entityId", a."beforeData", a."afterData"
          FROM "correspondenceAuditLog" a
         WHERE (a."entityType" = ${TABLE_ORGANIZATIONS} AND a."entityId" = ${id})
            OR (a."entityType" = ${TABLE_LOCATIONS}
                AND a."entityId" IN (SELECT "id" FROM ${sql.identifier(TABLE_LOCATIONS)} WHERE "organizationId" = ${id}))
            OR (a."entityType" = ${TABLE_CONTACTS}
                AND a."entityId" IN (SELECT "id" FROM ${sql.identifier(TABLE_CONTACTS)} WHERE "organizationId" = ${id}))
         ORDER BY a."occurredAt" DESC, a."id" DESC
         LIMIT 50`));

      res.json({ items });
    } catch (error) {
      fail(res, error);
    }
  });
}
