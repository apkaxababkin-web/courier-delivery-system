import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { resultRows as rows } from './correspondenceWaybills';

// Correspondence tariffs, stage 1: services directory + tariff plans/items.
// Directories only — no shipment charging, costs, snapshots or settlements.
// Two independent directions:
//   clientTariffPlans  — money owed TO us (owner: correspondence client or partner)
//   partnerTariffPlans — money WE owe an external partner for its work
// Mounted under /api/manager/correspondence, behind the module auth gate.

const ROOT = '/api/manager/correspondence';
const PRICING_MODELS = ['fixed', 'per_kg', 'per_kg_over', 'included'];

class HttpError extends Error { constructor(public status:number, message:string){ super(message); } }
class InputError extends Error {}

function requiredText(v:any,label:string,max=255):string{
  const s=String(v??'').trim();
  if(!s)throw new InputError(`Укажите ${label}`);
  if(s.length>max)throw new InputError(`Поле «${label}» слишком длинное`);
  return s;
}
function optionalText(v:any,max=5000):string|null{
  const s=String(v??'').trim();
  if(!s)return null;
  if(s.length>max)throw new InputError('Слишком длинный текст');
  return s;
}
function optionalId(v:any):number|null{
  if(v===undefined||v===null||String(v).trim()==='')return null;
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<1||n>2147483647)throw new InputError('Некорректный идентификатор');
  return n;
}
function choice(v:any,values:string[],label:string):string{
  const s=String(v??'').trim();
  if(!values.includes(s))throw new InputError(`Проверьте поле «${label}»`);
  return s;
}
function optionalDecimal(v:any,scale:number,max:number):string|null{
  if(v===undefined||v===null||String(v).trim()==='')return null;
  const s=String(v).trim().replace(',','.');
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+scale+'})?$').test(s))throw new InputError(`Число должно иметь не более ${scale} знаков после запятой`);
  const n=Number(s);
  if(!Number.isFinite(n)||n<0||n>max)throw new InputError('Число вне допустимого диапазона');
  return n.toFixed(scale);
}
function optionalDate(v:any):string|null{
  if(v===undefined||v===null||String(v).trim()==='')return null;
  const s=String(v).trim().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new InputError('Некорректная дата');
  const t=new Date(`${s}T00:00:00Z`);
  if(!Number.isFinite(t.getTime())||t.toISOString().slice(0,10)!==s)throw new InputError('Некорректная дата');
  return s;
}
function version(value:any){ return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function body(req:Request):any{
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new InputError('Некорректные данные');
  return req.body;
}
function keyVersion(input:any,current:any){
  if(typeof input.version!=='string'||input.version!==current.version)throw new HttpError(409,'Запись изменена. Обновите её перед сохранением');
}

async function activeService(tx:any,code:string){
  const r=rows(await tx.execute(sql`SELECT * FROM "correspondenceServices" WHERE "code"=${code} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Услуга не найдена или отключена');
  return r;
}
async function activeCity(tx:any,id:number|null){
  if(id===null)return null;
  const r=rows(await tx.execute(sql`SELECT * FROM "correspondenceCities" WHERE id=${id} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Населённый пункт не найден или отключён');
  return r;
}
// Owner of a client tariff plan: a correspondence client or a partner that orders
// work from us. Our own organisation is not an external counterparty.
async function activePlanOwner(tx:any,ownerType:string,ownerId:number){
  const table=ownerType==='partner'?'partners':'correspondenceClients';
  const r=rows(await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE id=${ownerId} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Владелец тарифа не найден или неактивен');
  if(ownerType==='partner'&&r.isOwnCompany===true)throw new InputError('Наша организация не может быть владельцем тарифа');
  return r;
}
// Partner tariff plans describe what we owe an EXTERNAL partner.
async function activeExternalPartner(tx:any,partnerId:number){
  const r=rows(await tx.execute(sql`SELECT * FROM "partners" WHERE id=${partnerId} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Партнёр не найден или неактивен');
  if(r.isOwnCompany===true)throw new InputError('Наша организация не может быть внешним партнёром');
  return r;
}

async function audit(tx:any,managerId:number,action:string,entity:string,entityId:number,before:any,after:any){
  await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","beforeData","afterData")
    VALUES (${managerId},${action},${entity},${entityId},${before?JSON.stringify(before):null}::jsonb,${after?JSON.stringify(after):null}::jsonb)`);
}
async function withTransaction(fn:(tx:any)=>Promise<any>){
  const conn=await db.getDb();
  if(!conn)throw new Error('Database not available');
  return conn.transaction(fn);
}

// ─── Data access ────────────────────────────────────────────────────────────
async function listRows(tx:any,table:string,order:string){
  return rows(await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} ORDER BY ${sql.raw(order)}`));
}
async function getRow(tx:any,table:string,id:number){
  return rows(await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE id=${id}`))[0]||null;
}
async function exposeRow(tx:any,table:string,id:number,extra?:()=>Promise<any>){
  const r=await getRow(tx,table,id);
  if(!r)return null;
  return {...r,version:version(r),...(extra?await extra():{})};
}
async function listPlans(tx:any,planTable:string,itemTable:string,ownerColumn:string){
  const plans=await listRows(tx,planTable,`"createdAt" DESC,"id" DESC`);
  const items=await listRows(tx,itemTable,`"planId","priority","id"`);
  return plans.map((p:any)=>({...p,version:version(p),items:items.filter((i:any)=>Number(i.planId)===Number(p.id))}));
}

// ─── Validation of payloads ─────────────────────────────────────────────────
function planData(input:any,ownerColumn:string){
  const data:Record<string,any>={
    name:requiredText(input.name,'название плана',255),
    currency:(optionalText(input.currency,3)||'RUB').toUpperCase(),
  };
  if(ownerColumn==='ownerType'){
    data.ownerType=choice(input.ownerType,['client','partner'],'владелец');
    data.ownerId=optionalId(input.ownerId);
    if(data.ownerId===null)throw new InputError('Выберите владельца тарифа');
  }else{
    data.partnerId=optionalId(input.partnerId);
    if(data.partnerId===null)throw new InputError('Выберите партнёра');
  }
  data.validFrom=optionalDate(input.validFrom);
  data.validTo=optionalDate(input.validTo);
  if(data.validFrom&&data.validTo&&data.validTo<data.validFrom)throw new InputError('Дата окончания раньше даты начала');
  data.isActive=input.isActive===undefined?true:(input.isActive===true||input.isActive===false?input.isActive:(()=>{throw new InputError('Некорректный признак активности');})());
  return data;
}
function itemData(input:any){
  const pricingModel=choice(input.pricingModel,PRICING_MODELS,'тип расчёта');
  const data:Record<string,any>={
    serviceCode:requiredText(input.serviceCode,'услугу',20),
    cityFromId:optionalId(input.cityFromId),
    cityToId:optionalId(input.cityToId),
    weightFromKg:optionalDecimal(input.weightFromKg,3,1000000),
    weightToKg:optionalDecimal(input.weightToKg,3,1000000),
    pricingModel,
    basePrice:optionalDecimal(input.basePrice,2,999999999999.99),
    pricePerKg:optionalDecimal(input.pricePerKg,2,999999999999.99),
    vatRate:optionalDecimal(input.vatRate,2,100),
    priority:input.priority===undefined||input.priority===''?100:Number(input.priority),
    description:optionalText(input.description,5000),
    isActive:input.isActive===undefined?true:(input.isActive===true||input.isActive===false?input.isActive:(()=>{throw new InputError('Некорректный признак активности');})()),
  };
  if(!Number.isSafeInteger(data.priority)||data.priority<0||data.priority>100000)throw new InputError('Приоритет должен быть целым числом от 0');
  if(data.weightFromKg!==null&&data.weightToKg!==null&&Number(data.weightToKg)<Number(data.weightFromKg))throw new InputError('Верхняя граница веса меньше нижней');
  if(pricingModel==='fixed'&&data.basePrice===null)throw new InputError('Укажите фиксированную цену');
  if((pricingModel==='per_kg'||pricingModel==='per_kg_over')&&data.pricePerKg===null)throw new InputError('Укажите цену за килограмм');
  return data;
}
async function validateItemReferences(tx:any,data:any){
  await activeService(tx,data.serviceCode);
  await activeCity(tx,data.cityFromId);
  await activeCity(tx,data.cityToId);
}

// ─── Registration ───────────────────────────────────────────────────────────
export function registerCorrespondenceTariffs(app:Express){
  const fail=(res:Response,e:any)=>{
    const code=e?.code||e?.cause?.code;
    const status=e instanceof HttpError?e.status:e instanceof InputError?400:code==='23505'?409:code==='23503'?400:500;
    if(status===500)console.error('Correspondence tariff request failed',{code});
    res.status(status).json({error:{message:status===500?'Не удалось сохранить или загрузить тарифы':e.message}});
  };

  // ── Services + all plans in one payload (live UI bootstrap) ────────────────
  app.get(ROOT+'/tariff-directories',async(_req,res)=>{
    try{
      const conn=await db.getDb();if(!conn)throw new Error('Database not available');
      const [services,clientPlans,partnerPlans]=await Promise.all([
        listRows(conn,'correspondenceServices','"sortOrder","id"'),
        listPlans(conn,'correspondenceClientTariffPlans','correspondenceClientTariffItems','ownerType'),
        listPlans(conn,'correspondencePartnerTariffPlans','correspondencePartnerTariffItems','partnerId'),
      ]);
      res.json({services,clientPlans,partnerPlans});
    }catch(e){fail(res,e)}
  });

  // ── Services ──────────────────────────────────────────────────────────────
  app.get(ROOT+'/services',async(_req,res)=>{
    try{
      const conn=await db.getDb();if(!conn)throw new Error('Database not available');
      res.json({items:await listRows(conn,'correspondenceServices','"sortOrder","id"')});
    }catch(e){fail(res,e)}
  });

  // ── Tariff collections: list ───────────────────────────────────────────────
  app.get(ROOT+'/client-tariff-plans',async(_req,res)=>{
    try{
      const conn=await db.getDb();if(!conn)throw new Error('Database not available');
      res.json({items:await listPlans(conn,'correspondenceClientTariffPlans','correspondenceClientTariffItems','ownerType')});
    }catch(e){fail(res,e)}
  });
  app.get(ROOT+'/partner-tariff-plans',async(_req,res)=>{
    try{
      const conn=await db.getDb();if(!conn)throw new Error('Database not available');
      res.json({items:await listPlans(conn,'correspondencePartnerTariffPlans','correspondencePartnerTariffItems','partnerId')});
    }catch(e){fail(res,e)}
  });

  // ── Plans: create / update / delete ────────────────────────────────────────
  const planRoutes=[
    {path:'/client-tariff-plans',table:'correspondenceClientTariffPlans',itemTable:'correspondenceClientTariffItems',ownerColumn:'ownerType',entity:'clientTariffPlan'},
    {path:'/partner-tariff-plans',table:'correspondencePartnerTariffPlans',itemTable:'correspondencePartnerTariffItems',ownerColumn:'partnerId',entity:'partnerTariffPlan'},
  ];
  for(const r of planRoutes){
    const save=async(req:Request,res:Response)=>{
      try{
        const input=body(req),raw=req.params.id,create=raw===undefined;
        let rowId:number|null=create?null:optionalId(raw);
        const data=planData(input,r.ownerColumn);
        const managerId=res.locals.manager.managerId;
        const saved=await withTransaction(async(tx:any)=>{
          if(r.ownerColumn==='ownerType')await activePlanOwner(tx,data.ownerType,data.ownerId);
          else await activeExternalPartner(tx,data.partnerId);
          let before:any=null;
          if(create){
            const keys=Object.keys(data);
            const inserted=rows(await tx.execute(sql`INSERT INTO ${sql.identifier(r.table)}
              (${sql.join(keys.map(k=>sql.identifier(k)),sql`,`)}) VALUES (${sql.join(keys.map(k=>sql`${data[k]}`),sql`,`)}) RETURNING *`))[0];
            rowId=Number(inserted.id);
          }else{
            const current=await getRow(tx,r.table,rowId!);
            if(!current)throw new HttpError(404,'Тарифный план не найден');
            before={...current,version:version(current)};
            keyVersion(input,before);
            await tx.execute(sql`UPDATE ${sql.identifier(r.table)} SET ${sql.join([...Object.entries(data).map(([k,v])=>sql`${sql.identifier(k)}=${v}`),sql`"updatedAt"=now()`],sql`, `)} WHERE id=${rowId}`);
          }
          const after=await exposeRow(tx,r.table,rowId!);
          await audit(tx,managerId,create?'create':'update',r.entity,rowId!,before,after);
          return after;
        });
        res.status(create?201:200).json(saved);
      }catch(e){fail(res,e)}
    };
    app.post(ROOT+r.path,save);
    app.post(ROOT+r.path+'/:id',save);
    app.post(ROOT+r.path+'/:id/delete',async(req,res)=>{
      try{
        const rowId=optionalId(req.params.id);
        const managerId=res.locals.manager.managerId;
        await withTransaction(async(tx:any)=>{
          const current=await getRow(tx,r.table,rowId!);
          if(!current)throw new HttpError(404,'Тарифный план не найден');
          const before={...current,version:version(current)};
          keyVersion(body(req),before);
          await tx.execute(sql`DELETE FROM ${sql.identifier(r.table)} WHERE id=${rowId}`);
          await audit(tx,managerId,'delete',r.entity,rowId!,before,null);
        });
        res.json({success:true});
      }catch(e){fail(res,e)}
    });
  }

  // ── Items: create / update / delete ────────────────────────────────────────
  const itemRoutes=[
    {path:'/client-tariff-plans',itemTable:'correspondenceClientTariffItems',planTable:'correspondenceClientTariffPlans',entity:'clientTariffItem'},
    {path:'/partner-tariff-plans',itemTable:'correspondencePartnerTariffItems',planTable:'correspondencePartnerTariffPlans',entity:'partnerTariffItem'},
  ];
  for(const r of itemRoutes){
    const save=async(req:Request,res:Response)=>{
      try{
        const input=body(req),planId=optionalId(req.params.id),raw=req.params.itemId;
        const create=raw===undefined,itemId=create?null:optionalId(raw);
        const data=itemData(input);
        const managerId=res.locals.manager.managerId;
        const saved=await withTransaction(async(tx:any)=>{
          const plan=await getRow(tx,r.planTable,planId!);
          if(!plan)throw new HttpError(404,'Тарифный план не найден');
          await validateItemReferences(tx,data);
          let before:any=null,id:number;
          if(create){
            const keys=['planId',...Object.keys(data)];
            const values=[planId,...Object.keys(data).map(k=>data[k])];
            const inserted=rows(await tx.execute(sql`INSERT INTO ${sql.identifier(r.itemTable)}
              (${sql.join(keys.map(k=>sql.identifier(k)),sql`,`)}) VALUES (${sql.join(values.map(v=>sql`${v}`),sql`,`)}) RETURNING *`))[0];
            id=Number(inserted.id);
          }else{
            id=itemId!;
            const current=await getRow(tx,r.itemTable,id);
            if(!current||Number(current.planId)!==Number(planId))throw new HttpError(404,'Строка тарифа не найдена');
            before={...current,version:version(current)};
            keyVersion(input,before);
            await tx.execute(sql`UPDATE ${sql.identifier(r.itemTable)} SET ${sql.join([...Object.entries(data).map(([k,v])=>sql`${sql.identifier(k)}=${v}`),sql`"updatedAt"=now()`],sql`, `)} WHERE id=${id}`);
          }
          const after=await exposeRow(tx,r.itemTable,id);
          await audit(tx,managerId,create?'create':'update',r.entity,id,before,after);
          return after;
        });
        res.status(create?201:200).json(saved);
      }catch(e){fail(res,e)}
    };
    app.post(ROOT+r.path+'/:id/items',save);
    app.post(ROOT+r.path+'/:id/items/:itemId',save);
    app.post(ROOT+r.path+'/:id/items/:itemId/delete',async(req,res)=>{
      try{
        const planId=optionalId(req.params.id),itemId=optionalId(req.params.itemId);
        const managerId=res.locals.manager.managerId;
        await withTransaction(async(tx:any)=>{
          const current=await getRow(tx,r.itemTable,itemId!);
          if(!current||Number(current.planId)!==Number(planId))throw new HttpError(404,'Строка тарифа не найдена');
          const before={...current,version:version(current)};
          keyVersion(body(req),before);
          await tx.execute(sql`DELETE FROM ${sql.identifier(r.itemTable)} WHERE id=${itemId}`);
          await audit(tx,managerId,'delete',r.entity,itemId!,before,null);
        });
        res.json({success:true});
      }catch(e){fail(res,e)}
    });
  }
}
