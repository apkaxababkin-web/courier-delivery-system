import type { Express, Request, Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { amountInWordsRu, formatDateRu, formatMoney, periodText, vatBreakdown } from '../../shared/billing-format';
import type { DocumentSetData } from './billingDocumentData';
import { renderInvoicePdf, renderActPdf } from './billingPdf';
import { renderRegistryXlsx } from './billingRegistryXlsx';
import { loadDocumentSettings } from './documentSettings';
import { documentOverlays, resolveDocumentImages } from './documentImages';
import { InputError, text, date } from './correspondenceValidation';
import { lockCorrespondenceWrites, resultRows as rows } from './correspondenceWaybills';

const ROOT = '/api/manager/correspondence/finance';
const DOCUMENT_ROOT = process.env.CORRESPONDENCE_DOCUMENTS_DIR || path.join(process.cwd(), 'uploads', 'correspondence-documents');

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
function id(value: unknown, label = 'идентификатор'): number { const number=Number(value);if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(number)||number<1)throw new InputError(`Некорректный ${label}`);return number; }
function body(req: Request): Record<string, any> { if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new InputError('Некорректные данные');return req.body; }
function money(value: unknown, optional = true): string | null { const raw=String(value??'').trim().replace(',','.');if(!raw){if(optional)return null;throw new InputError('Укажите сумму');}if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new InputError('Сумма должна иметь не более двух знаков после запятой');const number=Number(raw);if(!Number.isFinite(number)||number<0||number>999999999999.99)throw new InputError('Сумма вне допустимого диапазона');return number.toFixed(2); }
function partyType(value: unknown): 'client'|'partner' { if(value!=='client'&&value!=='partner')throw new InputError('Выберите тип контрагента');return value; }
function source(value: unknown): string | null { const result=text(value,30);if(result&&!['manual','tariff','calculator','discount'].includes(result))throw new InputError('Проверьте источник тарифа');return result; }
function round(value:number){return Math.round((value+Number.EPSILON)*100)/100}
function rowDate(value:any){return value?new Date(value).toISOString().slice(0,10):''}

type FinanceRow=Record<string,any>&{transportShare:number;terminalShare:number;blockingReasons:string[]};

function allocate(total: any, members: any[]): Map<number,number> {
  const cents=Math.round(Number(total||0)*100),result=new Map<number,number>();if(!cents||!members.length)return result;
  const weights=members.map(item=>Math.max(0,Number(item.billableWeight||item.measuredWeight||item.manifestWeight||0)));
  const denominator=weights.reduce((sum,value)=>sum+value,0)||members.length;
  const raw=members.map((item,index)=>({id:Number(item.id),value:cents*(denominator===members.length&&weights.every(value=>value===0)?1:weights[index])/denominator}));
  let used=0;for(const item of raw){const floor=Math.floor(item.value);used+=floor;result.set(item.id,floor)}
  raw.sort((a,b)=>(b.value-Math.floor(b.value))-(a.value-Math.floor(a.value))||a.id-b.id);
  for(let index=0;index<cents-used;index+=1)result.set(raw[index%raw.length].id,(result.get(raw[index%raw.length].id)||0)+1);
  return new Map([...result].map(([key,value])=>[key,value/100]));
}

async function loadFinanceRows(conn:any):Promise<FinanceRow[]> {
  const base=rows(await conn.execute(sql`
    SELECT s."id" AS "shipmentId",s."waybillNumber",s."ownerType",s."ownerId",s."partnerId" AS "handlingPartnerId",
      s."billableWeight",s."measuredWeight",s."manifestWeight",s."placesCount",s."recipientName",s."recipientCompany",
      s."recipientAddress",s."recipientCityNormalized",s."outgoingManifestId",s."archivedAt",
      m."id" AS "mailId",m."status",m."deliveredAt",m."recipientSignature",
      CASE WHEN s."ownerType"='client' THEN oc."name" ELSE op."name" END AS "ownerName",
      hp."name" AS "handlingPartnerName",om."partnerId" AS "manifestPartnerId",mp."name" AS "manifestPartnerName",
      om."transportPayer",om."transportCost",om."terminalRequired",om."terminalPayer",om."terminalCost",
      ch."clientAmount",ch."partnerAmount",ch."clientRateSource",ch."partnerRateSource",
      ch."clientComment",ch."partnerComment",ch."checkedAt",ch."checkedByManagerId",ch."updatedAt" AS "chargeUpdatedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('documentId',di."documentId",'counterpartyType',di."counterpartyType",'counterpartyId',di."counterpartyId"))
        FROM "correspondenceDocumentItems" di WHERE di."shipmentId"=s."id" AND di."active"),'[]'::jsonb) AS "activeDocuments"
    FROM "correspondenceShipments" s
    JOIN "mails" m ON m."id"=s."mailId"
    LEFT JOIN "correspondenceClients" oc ON s."ownerType"='client' AND oc."id"=s."ownerId"
    LEFT JOIN "partners" op ON s."ownerType"='partner' AND op."id"=s."ownerId"
    LEFT JOIN "partners" hp ON hp."id"=s."partnerId"
    LEFT JOIN "correspondenceManifests" om ON om."id"=s."outgoingManifestId"
    LEFT JOIN "partners" mp ON mp."id"=om."partnerId"
    LEFT JOIN "correspondenceShipmentCharges" ch ON ch."shipmentId"=s."id"
    WHERE m."status"='delivered'
    ORDER BY m."deliveredAt" DESC,s."id" DESC
  `));
  const members=rows(await conn.execute(sql`
    SELECT s."id",s."outgoingManifestId",s."billableWeight",s."measuredWeight",s."manifestWeight",
      om."transportCost",om."terminalCost"
    FROM "correspondenceShipments" s JOIN "correspondenceManifests" om ON om."id"=s."outgoingManifestId"
    WHERE s."outgoingManifestId" IS NOT NULL
  `));
  const transport=new Map<number,number>(),terminal=new Map<number,number>();
  const groups=new Map<number,any[]>();for(const item of members){const key=Number(item.outgoingManifestId);groups.set(key,[...(groups.get(key)||[]),item])}
  for(const items of groups.values()){for(const [key,value] of allocate(items[0].transportCost,items))transport.set(key,value);for(const [key,value] of allocate(items[0].terminalCost,items))terminal.set(key,value)}
  return base.map((item:any)=>{
    const transportShare=transport.get(Number(item.shipmentId))||0,terminalShare=terminal.get(Number(item.shipmentId))||0,reasons:string[]=[];
    if(item.clientAmount===null)reasons.push('Не указана сумма клиенту');
    if(item.handlingPartnerId&&item.partnerAmount===null)reasons.push('Не указана сумма партнёру');
    if(item.outgoingManifestId&&item.transportCost===null)reasons.push('Не указана стоимость перевозки');
    if(item.terminalRequired===true&&item.terminalCost===null)reasons.push('Не указана терминальная обработка');
    return {...item,transportShare,terminalShare,blockingReasons:reasons};
  });
}

function partnerBalance(row:FinanceRow,partnerId:number):number{
  let result=0;
  if(row.ownerType==='partner'&&Number(row.ownerId)===partnerId){result+=Number(row.clientAmount||0);if(row.transportPayer==='us')result+=row.transportShare;if(row.terminalPayer==='us')result+=row.terminalShare}
  if(Number(row.handlingPartnerId)===partnerId){result-=Number(row.partnerAmount||0);const ownerIsSame=row.ownerType==='partner'&&Number(row.ownerId)===partnerId;if(!ownerIsSame&&row.transportPayer==='partner')result-=row.transportShare;if(!ownerIsSame&&row.terminalPayer==='partner')result-=row.terminalShare}
  return round(result);
}
function partyAmount(row:FinanceRow,type:'client'|'partner',partyId:number):number|null{
  if(type==='client')return row.ownerType==='client'&&Number(row.ownerId)===partyId?Number(row.clientAmount||0):null;
  const related=(row.ownerType==='partner'&&Number(row.ownerId)===partyId)||Number(row.handlingPartnerId)===partyId;return related?partnerBalance(row,partyId):null;
}
async function listDocuments(conn:any){return rows(await conn.execute(sql`
  SELECT d.*,CASE WHEN d."counterpartyType"='client' THEN c."name" ELSE p."name" END AS "counterpartyName",
    count(i."id")::integer AS "shipmentCount"
  FROM "correspondenceDocumentSets" d
  LEFT JOIN "correspondenceClients" c ON d."counterpartyType"='client' AND c."id"=d."counterpartyId"
  LEFT JOIN "partners" p ON d."counterpartyType"='partner' AND p."id"=d."counterpartyId"
  LEFT JOIN "correspondenceDocumentItems" i ON i."documentId"=d."id"
  GROUP BY d."id",c."id",p."id" ORDER BY d."documentDate" DESC,d."id" DESC LIMIT 1000
  `));}
async function parties(conn:any){
 const [clients,partners]=await Promise.all([
   conn.execute(sql`SELECT "id","name" FROM "correspondenceClients" WHERE "isActive" ORDER BY "name"`),
   conn.execute(sql`SELECT "id","name" FROM "partners" WHERE "isActive" AND "isOwnCompany" IS NOT TRUE ORDER BY "name"`),
 ]);return {clients:rows(clients),partners:rows(partners)};
}
function safeFileName(value:string){return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,180)}
function documentPath(stored:string){const root=path.resolve(DOCUMENT_ROOT),absolute=path.resolve(process.cwd(),stored);if(absolute!==root&&!absolute.startsWith(root+path.sep))throw new HttpError(400,'Некорректный путь документа');return absolute}

async function requisites(conn:any,type:'client'|'partner',partyId:number){
 if(type==='client'){const row=rows(await conn.execute(sql`SELECT * FROM "correspondenceClients" WHERE "id"=${partyId} AND "isActive" LIMIT 1`))[0];if(!row)throw new InputError('Клиент не найден');return row}
 const row=rows(await conn.execute(sql`SELECT p.*,pr."legalName",pr."inn",pr."kpp",pr."ogrn",pr."legalAddress",pr."postalAddress" FROM "partners" p LEFT JOIN "correspondencePartnerProfiles" pr ON pr."partnerId"=p."id" WHERE p."id"=${partyId} AND p."isActive" AND p."isOwnCompany" IS NOT TRUE LIMIT 1`))[0];if(!row)throw new InputError('Партнёр не найден');return row;
}
async function buildDocumentData(conn:any,type:'client'|'partner',partyId:number,number:string,documentDate:string,from:string,to:string,selected:{row:FinanceRow;amount:number}[]):Promise<DocumentSetData>{
 const settings=await loadDocumentSettings(),buyer=await requisites(conn,type,partyId),total=round(selected.reduce((sum,item)=>sum+item.amount,0));
 const vat=vatBreakdown(total,settings.vatMode,settings.vatRate),serviceName=type==='client'?`Услуги доставки корреспонденции за период ${formatDateRu(from)}–${formatDateRu(to)}`:`Взаиморасчёты по доставке корреспонденции за период ${formatDateRu(from)}–${formatDateRu(to)}`;
 const registry=selected.map((item,index)=>({position:index+1,dateIso:rowDate(item.row.deliveredAt),dateText:formatDateRu(rowDate(item.row.deliveredAt)),requestType:'correspondence',requestTypeLabel:'Доставка корреспонденции',from:item.row.recipientCompany||item.row.recipientName||'—',to:[item.row.recipientCityNormalized,item.row.recipientAddress].filter(Boolean).join(', ')||'—',placesCount:item.row.placesCount==null?null:Number(item.row.placesCount),amount:item.amount,comment:`Накладная ${item.row.waybillNumber}`}));
 const images=resolveDocumentImages({},settings);
 return {number,documentDateIso:documentDate,documentDateText:formatDateRu(documentDate),periodFrom:from,periodTo:to,periodText:periodText(from,to),serviceName,
  seller:{name:settings.executorName||'',shortName:settings.executorShortName,inn:settings.executorInn,kpp:settings.executorKpp,ogrn:settings.executorOgrn||settings.executorOgrnip,address:settings.executorAddress||'',postalAddress:settings.executorPostalAddress,phone:settings.executorPhone,email:settings.executorEmail,bankName:settings.bankName||'',bankBik:settings.bankBik||'',bankAccount:settings.bankAccount||'',bankCorrespondentAccount:settings.bankCorrespondentAccount||'',directorName:settings.directorName||'',directorPosition:settings.directorPosition||'Директор',accountantName:settings.accountantName,signatureFile:settings.signatureFile,stampFile:settings.stampFile,signaturePath:images.signaturePath,stampPath:images.stampPath,stampEnabled:Boolean(images.stampPath),vatText:settings.vatText||vat.rateText,vatExemptionBasis:settings.vatExemptionBasis},
  buyer:{name:buyer.legalName||buyer.name,inn:buyer.inn||null,kpp:buyer.kpp||null,address:buyer.postalAddress||buyer.legalAddress||'',legalAddress:buyer.legalAddress||null,postalAddress:buyer.postalAddress||null,ogrn:buyer.ogrn||null,phone:buyer.phone||null},
  lines:[{position:1,name:serviceName,unit:'усл.',quantity:1,price:total,amount:total}],registry,requestsCount:registry.length,totalPlaces:registry.reduce((sum,item)=>sum+Number(item.placesCount||0),0),totalAmount:total,totalAmountText:formatMoney(total),amountInWords:amountInWordsRu(total),vat};
}

function handler(fn:(req:Request,res:Response)=>Promise<void>){return async(req:Request,res:Response)=>{try{await fn(req,res)}catch(cause:any){const status=cause instanceof HttpError?cause.status:cause instanceof InputError?400:['23505','55P03','40001','40P01'].includes(cause?.code||cause?.cause?.code)?409:500;console.error('Correspondence finance:',status,cause?.cause?.code||cause?.code||cause?.name);res.status(status).json({error:{message:status===500?'Финансовая операция не выполнена':cause.message}})}}}

export function registerCorrespondenceFinance(app:Express){
 app.get(ROOT+'/bootstrap',handler(async(_req,res)=>{const conn=await db.getDb();if(!conn)throw new Error('Database not available');const [financeRows,documents,partyData]=await Promise.all([loadFinanceRows(conn),listDocuments(conn),parties(conn)]);res.json({rows:financeRows,documents,...partyData})}));

 app.post(ROOT+'/shipments/:id/charge',handler(async(req,res)=>{const shipmentId=id(req.params.id,'отправления'),b=body(req),clientAmount=money(b.clientAmount),partnerAmount=money(b.partnerAmount),clientRateSource=source(b.clientRateSource),partnerRateSource=source(b.partnerRateSource),checked=b.checked===true,managerId=Number(res.locals.manager?.managerId),conn=await db.getDb();if(!conn)throw new Error('Database not available');
  await conn.transaction(async(tx:any)=>{await lockCorrespondenceWrites(tx);const current=(await loadFinanceRows(tx)).find(row=>Number(row.shipmentId)===shipmentId);if(!current)throw new HttpError(404,'Доставленное отправление не найдено');if(current.activeDocuments?.length)throw new HttpError(409,'Отправление уже включено в действующий комплект документов');if(checked){const reasons=[...(current.blockingReasons||[])].filter(reason=>!reason.startsWith('Не указана сумма'));if(clientAmount===null)reasons.push('Не указана сумма клиенту');if(current.handlingPartnerId&&partnerAmount===null)reasons.push('Не указана сумма партнёру');if(reasons.length)throw new InputError(reasons.join('. '));}
   await tx.execute(sql`INSERT INTO "correspondenceShipmentCharges" ("shipmentId","clientAmount","partnerAmount","clientRateSource","partnerRateSource","clientComment","partnerComment","checkedAt","checkedByManagerId") VALUES (${shipmentId},${clientAmount},${partnerAmount},${clientRateSource},${partnerRateSource},${text(b.clientComment,2000)},${text(b.partnerComment,2000)},${checked?new Date():null},${checked?managerId:null}) ON CONFLICT ("shipmentId") DO UPDATE SET "clientAmount"=EXCLUDED."clientAmount","partnerAmount"=EXCLUDED."partnerAmount","clientRateSource"=EXCLUDED."clientRateSource","partnerRateSource"=EXCLUDED."partnerRateSource","clientComment"=EXCLUDED."clientComment","partnerComment"=EXCLUDED."partnerComment","checkedAt"=EXCLUDED."checkedAt","checkedByManagerId"=EXCLUDED."checkedByManagerId","updatedAt"=now()`);
   await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","afterData") VALUES (${managerId},'reconcile','shipment',${shipmentId},${JSON.stringify({clientAmount,partnerAmount,clientRateSource,partnerRateSource,checked})}::jsonb)`);
  });res.json({success:true});
 }));

 app.post(ROOT+'/documents/issue',handler(async(req,res)=>{const b=body(req),type=partyType(b.counterpartyType),partyId=id(b.counterpartyId,'контрагента'),from=date(b.periodFrom),to=date(b.periodTo),documentDate=date(b.documentDate),replaceDocumentId=b.replaceDocumentId?id(b.replaceDocumentId,'заменяемого документа'):null;if(!from||!to||!documentDate)throw new InputError('Укажите период и дату документов');if(from>to)throw new InputError('Начало периода позже окончания');const managerId=Number(res.locals.manager?.managerId),conn=await db.getDb();if(!conn)throw new Error('Database not available');let directory:string|null=null;
  try{const result=await conn.transaction(async(tx:any)=>{await lockCorrespondenceWrites(tx);const all=await loadFinanceRows(tx);const relevant=all.filter(row=>{const delivered=rowDate(row.deliveredAt),amount=partyAmount(row,type,partyId);return amount!==null&&delivered>=from&&delivered<=to});if(!relevant.length)throw new InputError('Нет доставленных отправлений за выбранный период');const blocked=relevant.filter(row=>!row.checkedAt||row.blockingReasons.length);if(blocked.length)throw new InputError(`Сначала завершите сверку: ${blocked.slice(0,5).map(row=>row.waybillNumber).join(', ')}`);const already=relevant.filter(row=>(row.activeDocuments||[]).some((doc:any)=>doc.counterpartyType===type&&Number(doc.counterpartyId)===partyId&&Number(doc.documentId)!==replaceDocumentId));if(already.length)throw new HttpError(409,'Часть отправлений уже включена в действующие документы');
    let documentNumber:string,revision=1,replaced:any=null;const year=Number(documentDate.slice(0,4));if(replaceDocumentId){replaced=rows(await tx.execute(sql`SELECT * FROM "correspondenceDocumentSets" WHERE "id"=${replaceDocumentId} FOR UPDATE`))[0];if(!replaced||replaced.status==='void')throw new InputError('Заменяемый комплект не найден');if(replaced.counterpartyType!==type||Number(replaced.counterpartyId)!==partyId)throw new InputError('Контрагент замены не совпадает');documentNumber=String(replaced.documentNumber);revision=Number(replaced.revision)+1;await tx.execute(sql`UPDATE "correspondenceDocumentSets" SET "status"='void',"updatedAt"=now() WHERE "id"=${replaceDocumentId}`);await tx.execute(sql`UPDATE "correspondenceDocumentItems" SET "active"=false WHERE "documentId"=${replaceDocumentId}`);}else{const counter=rows(await tx.execute(sql`INSERT INTO "correspondenceDocumentCounters" ("counterpartyType","year","lastNumber") VALUES (${type},${year},1) ON CONFLICT ("counterpartyType","year") DO UPDATE SET "lastNumber"="correspondenceDocumentCounters"."lastNumber"+1,"updatedAt"=now() RETURNING "lastNumber"`))[0];documentNumber=String(counter.lastNumber)}
    const raw=relevant.map(row=>({row,raw:Number(partyAmount(row,type,partyId)||0)})),net=round(raw.reduce((sum,item)=>sum+item.raw,0));if(net===0)throw new InputError('Итог взаиморасчёта равен нулю');const direction=net>0?'counterparty_to_us':'us_to_counterparty',selected=raw.map(item=>({row:item.row,amount:round(item.raw*(net>0?1:-1))})),numberText=revision>1?`${documentNumber} (ред. ${revision})`:documentNumber,data=await buildDocumentData(tx,type,partyId,numberText,documentDate,from,to,selected),snapshot={counterpartyType:type,counterpartyId:partyId,direction,periodFrom:from,periodTo:to,rows:selected.map(item=>({shipmentId:item.row.shipmentId,waybillNumber:item.row.waybillNumber,amount:item.amount,transportShare:item.row.transportShare,terminalShare:item.row.terminalShare,clientAmount:item.row.clientAmount,partnerAmount:item.row.partnerAmount}))};
    const created=rows(await tx.execute(sql`INSERT INTO "correspondenceDocumentSets" ("counterpartyType","counterpartyId","documentNumber","documentYear","revision","documentDate","periodFrom","periodTo","settlementDirection","status","totalAmount","snapshot","createdByManagerId") VALUES (${type},${partyId},${documentNumber},${year},${revision},${documentDate},${from},${to},${direction},'issued',${Math.abs(net).toFixed(2)},${JSON.stringify(snapshot)}::jsonb,${managerId}) RETURNING "id"`))[0],documentId=Number(created.id);directory=path.join(DOCUMENT_ROOT,String(documentId));await fs.mkdir(directory,{recursive:true});const settings=await loadDocumentSettings(),images=resolveDocumentImages({},settings);let invoiceFile:string|null=null,actFile:string|null=null;const registryName=`registry-${safeFileName(documentNumber)}-r${revision}.xlsx`,registry=await renderRegistryXlsx(data);await fs.writeFile(path.join(directory,registryName),registry);if(direction==='counterparty_to_us'){const [invoice,act]=await Promise.all([renderInvoicePdf(data,documentOverlays('invoice',images)),renderActPdf(data,documentOverlays('act',images))]);const invoiceName=`invoice-${safeFileName(documentNumber)}-r${revision}.pdf`,actName=`act-${safeFileName(documentNumber)}-r${revision}.pdf`;await fs.writeFile(path.join(directory,invoiceName),invoice);await fs.writeFile(path.join(directory,actName),act);invoiceFile=path.relative(process.cwd(),path.join(directory,invoiceName));actFile=path.relative(process.cwd(),path.join(directory,actName));}const registryFile=path.relative(process.cwd(),path.join(directory,registryName));await tx.execute(sql`UPDATE "correspondenceDocumentSets" SET "invoiceFile"=${invoiceFile},"actFile"=${actFile},"registryFile"=${registryFile},"updatedAt"=now() WHERE "id"=${documentId}`);for(const item of selected)await tx.execute(sql`INSERT INTO "correspondenceDocumentItems" ("documentId","shipmentId","counterpartyType","counterpartyId","amount","snapshot") VALUES (${documentId},${Number(item.row.shipmentId)},${type},${partyId},${item.amount.toFixed(2)},${JSON.stringify(snapshot.rows.find((row:any)=>Number(row.shipmentId)===Number(item.row.shipmentId)))}::jsonb)`);if(replaced)await tx.execute(sql`UPDATE "correspondenceShipments" s SET "archivedAt"=NULL,"updatedAt"=now() FROM "correspondenceDocumentItems" i WHERE i."documentId"=${replaceDocumentId} AND i."shipmentId"=s."id"`);return documentId;});res.status(201).json({documentId:result});}catch(cause){if(directory)await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});throw cause}
 }));

 app.get(ROOT+'/documents/:id/:kind',handler(async(req,res)=>{const documentId=id(req.params.id,'документа'),kind=String(req.params.kind),column=kind==='invoice'?'invoiceFile':kind==='act'?'actFile':kind==='registry'?'registryFile':null;if(!column)throw new InputError('Неизвестный файл');const conn=await db.getDb();if(!conn)throw new Error('Database not available');const record=rows(await conn.execute(sql`SELECT ${sql.identifier(column)} AS file,"documentNumber","revision" FROM "correspondenceDocumentSets" WHERE "id"=${documentId}`))[0];if(!record?.file)throw new HttpError(404,'Файл не сформирован');const absolute=documentPath(String(record.file));await fs.access(absolute);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',kind==='registry'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(`${kind}-${record.documentNumber}-r${record.revision}.${kind==='registry'?'xlsx':'pdf'}`)}`);res.sendFile(absolute)}));

 app.post(ROOT+'/documents/:id/payment',handler(async(req,res)=>{const documentId=id(req.params.id,'документа'),b=body(req);if(typeof b.paid!=='boolean')throw new InputError('Некорректная отметка оплаты');const managerId=Number(res.locals.manager?.managerId),conn=await db.getDb();if(!conn)throw new Error('Database not available');await conn.transaction(async(tx:any)=>{await lockCorrespondenceWrites(tx);const doc=rows(await tx.execute(sql`SELECT * FROM "correspondenceDocumentSets" WHERE "id"=${documentId} FOR UPDATE`))[0];if(!doc||doc.status==='void')throw new InputError('Действующий комплект не найден');await tx.execute(sql`UPDATE "correspondenceDocumentSets" SET "status"=${b.paid?'paid':'issued'},"paidAt"=${b.paid?new Date():null},"paymentComment"=${text(b.comment,2000)},"updatedAt"=now() WHERE "id"=${documentId}`);if(b.paid)await tx.execute(sql`UPDATE "correspondenceShipments" s SET "archivedAt"=now(),"updatedAt"=now() FROM "correspondenceDocumentItems" i WHERE i."documentId"=${documentId} AND i."active" AND i."shipmentId"=s."id" AND s."ownerType"=${doc.counterpartyType} AND s."ownerId"=${Number(doc.counterpartyId)}`);else await tx.execute(sql`UPDATE "correspondenceShipments" s SET "archivedAt"=NULL,"updatedAt"=now() FROM "correspondenceDocumentItems" i WHERE i."documentId"=${documentId} AND i."active" AND i."shipmentId"=s."id" AND s."ownerType"=${doc.counterpartyType} AND s."ownerId"=${Number(doc.counterpartyId)}`);await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","afterData") VALUES (${managerId},${b.paid?'payment_set':'payment_cleared'},'document',${documentId},${JSON.stringify({paid:b.paid,comment:text(b.comment,2000)})}::jsonb)`)});res.json({success:true})}));

 app.post(ROOT+'/documents/:id/void',handler(async(req,res)=>{const documentId=id(req.params.id,'документа'),managerId=Number(res.locals.manager?.managerId),conn=await db.getDb();if(!conn)throw new Error('Database not available');await conn.transaction(async(tx:any)=>{await lockCorrespondenceWrites(tx);const doc=rows(await tx.execute(sql`SELECT * FROM "correspondenceDocumentSets" WHERE "id"=${documentId} FOR UPDATE`))[0];if(!doc||doc.status==='void')throw new InputError('Действующий комплект не найден');await tx.execute(sql`UPDATE "correspondenceDocumentSets" SET "status"='void',"updatedAt"=now() WHERE "id"=${documentId}`);await tx.execute(sql`UPDATE "correspondenceDocumentItems" SET "active"=false WHERE "documentId"=${documentId}`);await tx.execute(sql`UPDATE "correspondenceShipments" s SET "archivedAt"=NULL,"updatedAt"=now() FROM "correspondenceDocumentItems" i WHERE i."documentId"=${documentId} AND i."shipmentId"=s."id"`);await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","afterData") VALUES (${managerId},'void','document',${documentId},${JSON.stringify({note:text(body(req).comment,2000)})}::jsonb)`)});res.json({success:true})}));
}

