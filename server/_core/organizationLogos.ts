import express, { type Express, type Request, type Response } from 'express';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { MAX_LOGO_BYTES, normalizeLogo } from './organizationLogoImage';

const TABLES = { client: 'clients', partner: 'partners', transport: 'transportCompanies', correspondenceClient: 'correspondenceClients' } as const;
type Kind = keyof typeof TABLES;
const root = () => path.resolve(process.env.UPLOADS_DIR || 'uploads', 'organization-logos');
const rows = (result: any): any[] => Array.isArray(result) ? result : result?.rows || [];
function target(req: Request) {
  const kind = req.params.kind as Kind, id = Number(req.params.id);
  if (!Object.hasOwn(TABLES, kind) || !/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(id) || id > 2147483647) throw Object.assign(new Error('Некорректная организация'), { status: 400 });
  return { kind, id, file: path.join(root(), `${kind}-${id}.png`) };
}
async function exists(kind: Kind, id: number) {
  const conn = await db.getDb();
  if (!conn) throw new Error('Database unavailable');
  if (!rows(await conn.execute(sql`SELECT "id" FROM ${sql.identifier(TABLES[kind])} WHERE "id"=${id}`)).length) throw Object.assign(new Error('Организация не найдена'), { status: 404 });
}
const version = (data: Buffer) => createHash('sha256').update(data).digest('hex');
let processing = 0;
function failure(res: Response, cause: any) {
  const status = cause?.status || (cause?.code === 'ENOENT' ? 404 : 500);
  if (status === 500) console.error('Organization logo:', cause);
  res.status(status).json({ error: { message: status === 500 ? 'Не удалось обработать логотип' : cause.message } });
}

export function registerOrganizationLogoRoutes(app: Express) {
  const base = '/api/manager/organization-logos';
  // Authentication happens before body parsing; defense in depth for registration.
  app.use(base, (_req, res, next) => {
    if (!Number.isSafeInteger(res.locals.manager?.managerId) || res.locals.manager.managerId < 1) { res.status(401).json({ error: { message: 'Требуется вход менеджера' } }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get(base, async (_req, res) => {
    try {
      const files = await readdir(root()).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e; });
      const logos: Record<string, string> = {};
      for (const file of files) {
        if (!/^(client|partner|transport|correspondenceClient)-[1-9]\d*\.png$/.test(file)) continue;
        try { logos[file.slice(0, -4)] = version(await readFile(path.join(root(), file))); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
      }
      res.json({ logos });
    } catch (cause) { failure(res, cause); }
  });
  app.get(`${base}/:kind/:id`, async (req, res) => {
    try {
      const { kind, id, file } = target(req); await exists(kind, id);
      const data = await readFile(file);
      // Private, revalidated browser cache: every request still passes manager authentication.
      // An unchanged image can return 304 instead of transferring PNG bytes again.
      res.setHeader('Cache-Control', 'private, no-cache');
      res.setHeader('ETag', `"${version(data)}"`);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.type('png').send(data);
    } catch (cause) { failure(res, cause); }
  });
  // Raw binary avoids base64 overhead and never trusts client filenames.
  app.put(`${base}/:kind/:id`, express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'], limit: MAX_LOGO_BYTES }), async (req, res) => {
    let temporary: string | undefined;
    let acquired = false;
    try {
      const { kind, id, file } = target(req); await exists(kind, id);
      if (processing >= 2) throw Object.assign(new Error('Сервер обрабатывает другие логотипы. Повторите сохранение'), { status: 429 });
      processing++; acquired = true;
      let image: Buffer;
      try { if (!Buffer.isBuffer(req.body)) throw new Error('Неподдерживаемый формат'); image = await normalizeLogo(req.body, req.get('Content-Type')?.split(';')[0].trim().toLowerCase() || ''); }
      catch (e) { throw Object.assign(e as Error, { status: 400 }); }
      await mkdir(root(), { recursive: true, mode: 0o750 });
      temporary = path.join(root(), `.${randomUUID()}.tmp`);
      await writeFile(temporary, image, { flag: 'wx', mode: 0o640 });
      await rename(temporary, file); temporary = undefined;
      res.json({ version: version(image) });
    } catch (cause) { failure(res, cause); }
    finally { if (acquired) processing--; if (temporary) await unlink(temporary).catch(() => {}); }
  });
  app.delete(`${base}/:kind/:id`, async (req, res) => {
    try {
      const { kind, id, file } = target(req); await exists(kind, id);
      await unlink(file).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      res.json({ success: true });
    } catch (cause) { failure(res, cause); }
  });
  app.use(base, (err: any, _req: Request, res: Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') { res.status(413).json({ error: { message: 'Файл больше 5 МБ' } }); return; }
    next(err);
  });
}
