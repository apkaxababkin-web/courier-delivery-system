import type { Express } from 'express';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { InputError, text, date } from './correspondenceValidation';

const legalFields: Record<string, number> = {
  legalName:500, inn:20, kpp:20, ogrn:20, legalAddress:5000, postalAddress:5000,
  bankName:255, bik:20, bankAccount:34, correspondentAccount:34, contractNumber:100,
  signerName:255, signerPosition:255, signerAuthority:5000,
};
const specs: Record<string, {table:string; fields:Record<string,number>; profile?:string; link?:string}> = {
  clients: {table:'correspondenceClients', fields:{name:255,contactPerson:255,phone:50,email:320,comment:5000,...legalFields}},
  partners: {table:'partners',fields:{name:255,contactPerson:255,phone:50,email:320,comment:5000},profile:'correspondencePartnerProfiles',link:'partnerId'},
  carriers: {table:'transportCompanies',fields:{name:255,address:5000,contactPerson:255,phone:50,comment:5000},profile:'correspondenceCarrierProfiles',link:'carrierId'},
  cities: {table:'correspondenceCities',fields:{name:255,region:255}},
};
const resultRows = (r:any):any[] => Array.isArray(r) ? r : r?.rows || [];
const version = (r:any) => crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex');
const expose = (r:any) => ({...r,version:version(r)});
class HttpError extends Error { constructor(public status:number, message:string) { super(message); } }
function idOf(value:unknown) {
  if (!/^\d+$/.test(String(value))) throw new InputError('Некорректный идентификатор');
  const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) throw new InputError('Некорректный идентификатор');
  return n;
}
function validate(kind:string, input:any, create:boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Некорректные данные формы');
  const spec=specs[kind], base:Record<string,any>={}, profile:Record<string,any>={};
  for (const [k,max] of Object.entries(spec.fields)) if (Object.hasOwn(input,k)) base[k]=text(input[k],max);
  if (create || Object.hasOwn(base,'name')) { if (!base.name) throw new InputError('Укажите название'); }
  if (kind==='carriers' && (create || Object.hasOwn(base,'address')) && !base.address) throw new InputError('Укажите адрес перевозчика');
  if (Object.hasOwn(input,'isActive')) {
    if (typeof input.isActive!=='boolean') throw new InputError('Некорректный признак активности');
    base.isActive=input.isActive;
  }
  if (create && !Object.hasOwn(base,'isActive')) base.isActive=true;
  if (kind==='clients' && Object.hasOwn(input,'contractDate')) base.contractDate=date(input.contractDate);
  if (spec.profile) {
    const p=input.profile;
    if (p!==undefined && (!p || typeof p!=='object' || Array.isArray(p))) throw new InputError('Некорректные реквизиты');
    if (p) {
      for (const [k,max] of Object.entries({...legalFields,comment:5000})) if (Object.hasOwn(p,k)) profile[k]=text(p[k],max);
      if (Object.hasOwn(p,'contractDate')) profile.contractDate=date(p.contractDate);
    }
  }
  if (kind==='cities') {
    if (create || Object.hasOwn(base,'region')) base.region=base.region||'';
    if (Object.hasOwn(input,'aliases')) {
      if (!Array.isArray(input.aliases) || input.aliases.length>100) throw new InputError('Допустимо до 100 вариантов названия');
      base.aliases=[...new Set(input.aliases.map((a:unknown)=>text(a,255)).filter(Boolean))];
    }
  }
  return {base,profile};
}
// All identifiers below come from specs/validated field allowlists, never from request strings.
async function insert(tx:any, table:string, data:Record<string,any>) {
  const keys=Object.keys(data);
  return resultRows(await tx.execute(sql`INSERT INTO ${sql.identifier(table)} (${sql.join(keys.map(k=>sql.identifier(k)),sql`,`)})
    VALUES (${sql.join(keys.map(k=>valueSql(k,data[k])),sql`,`)}) RETURNING *`))[0];
}
function valueSql(k:string,v:any) {
  return k==='aliases' ? sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(v)}::jsonb))` : sql`${v}`;
}
async function update(tx:any,table:string,key:string,id:number,data:Record<string,any>) {
  const fields=Object.keys(data).map(k=>sql`${sql.identifier(k)}=${valueSql(k,data[k])}`);
  fields.push(sql`"updatedAt"=now()`);
  await tx.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.join(fields,sql`,`)} WHERE ${sql.identifier(key)}=${id}`);
}
async function getRows(tx:any,kind:string,id?:number) {
  const s=specs[kind];
  const profile=s.profile ? sql`to_jsonb(p)` : sql`NULL::jsonb`;
  const join=s.profile ? sql`LEFT JOIN ${sql.identifier(s.profile)} p ON p.${sql.identifier(s.link!)}=b."id"` : sql``;
  return resultRows(await tx.execute(sql`SELECT b.*, ${profile} AS profile FROM ${sql.identifier(s.table)} b ${join}
    ${id===undefined ? sql`` : sql`WHERE b."id"=${id}`} ORDER BY b."name",b."id"`));
}
export function registerCorrespondenceDirectories(app:Express) {
  const root='/api/manager/correspondence';
  // Defense in depth: never depend solely on registration order for new endpoints.
  app.use(root,(_req,res,next)=>{
    if (!Number.isSafeInteger(res.locals.manager?.managerId) || res.locals.manager.managerId<=0) {
      res.status(401).json({error:{message:'Требуется вход менеджера'}}); return;
    }
    res.setHeader('Cache-Control','no-store'); next();
  });
  const fail=(res:any,e:any)=>{
    const code=e?.code || e?.cause?.code;
    const status=e instanceof HttpError?e.status:e instanceof InputError?400:code==='23505'?409:500;
    console.error('Correspondence directory request failed', {status,code});
    res.status(status).json({error:{message:status===500?'Не удалось сохранить или загрузить справочник':code==='23505'?'Такая запись уже существует':e.message}});
  };
  app.get(root+'/directories',async (_req,res)=>{
    try {
      const conn=await db.getDb();if(!conn)throw new Error('Database unavailable');
      const data:Record<string,any>={};
      for (const k of Object.keys(specs)) data[k]=(await getRows(conn,k)).map(expose);
      res.json(data);
    }catch(e){fail(res,e)}
  });
  app.get(root+'/directories/:kind/:id/history',async(req,res)=>{
    try {
      const kind=req.params.kind;if(!Object.hasOwn(specs,kind))throw new HttpError(404,'Справочник не найден');
      const id=idOf(req.params.id),conn=await db.getDb();if(!conn)throw new Error('Database unavailable');
      const items=resultRows(await conn.execute(sql`SELECT "id","managerId","occurredAt","action","beforeData","afterData"
        FROM "correspondenceAuditLog" WHERE "entityType"=${specs[kind].table} AND "entityId"=${id}
        ORDER BY "occurredAt" DESC,"id" DESC LIMIT 50`));
      res.json({items});
    }catch(e){fail(res,e)}
  });
  for (const kind of Object.keys(specs)) {
    const save=async(req:any,res:any)=>{
      try {
        const create=req.params.id===undefined,id=create?undefined:idOf(req.params.id);
        const {base,profile}=validate(kind,req.body,create),spec=specs[kind];
        const conn=await db.getDb();if(!conn)throw new Error('Database unavailable');
        const saved=await conn.transaction(async(tx:any)=>{
          await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
          await tx.execute(sql`SET LOCAL statement_timeout='15s'`);
          let before:any=null,recordId=id;
          if (!create) {
            await tx.execute(sql`SELECT "id" FROM ${sql.identifier(spec.table)} WHERE "id"=${id} FOR UPDATE`);
            before=(await getRows(tx,kind,id))[0];if(!before)throw new HttpError(404,'Запись не найдена');
            if (req.body.version!==version(before)) throw new HttpError(409,'Запись уже изменена. Закройте форму, обновите данные и откройте её снова');
            await update(tx,spec.table,'id',id!,base);
          } else recordId=(await insert(tx,spec.table,base)).id;
          if (spec.profile && Object.keys(profile).length) {
            if (before?.profile) await update(tx,spec.profile,spec.link!,recordId!,profile);
            else await insert(tx,spec.profile,{[spec.link!]:recordId,...profile});
          }
          const after=(await getRows(tx,kind,recordId))[0];
          await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId","action","entityType","entityId","beforeData","afterData")
            VALUES (${res.locals.manager.managerId},${create?'create':'update'},${spec.table},${recordId},
              ${before?JSON.stringify(before):null}::jsonb,${JSON.stringify(after)}::jsonb)`);
          return expose(after);
        });
        res.status(create?201:200).json(saved);
      }catch(e){fail(res,e)}
    };
    app.post(root+'/'+kind,save);
    app.post(root+'/'+kind+'/:id',save);
  }
}
