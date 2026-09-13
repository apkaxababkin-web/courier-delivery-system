import type { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import * as db from '../db';
import { InputError, text, date } from './correspondenceValidation';
import { resultRows as rows, lockCorrespondenceWrites } from './correspondenceWaybills';

const ROOT='/api/manager/correspondence';
class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
function digest(x:any):string {
  const canonical=(v:any):any=>v instanceof Date?v.toISOString():Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
}
function id(v:any):number { const n=Number(v);if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(n)||n<1||n>2147483647)throw new InputError('Некорректный идентификатор');return n; }
function required(v:any,label:string,max=255){const s=text(v,max);if(!s)throw new InputError(`Укажите ${label}`);return s;}
function uuid(v:any){const s=required(v,'ключ сохранения',36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))throw new InputError('Некорректный ключ сохранения');return s.toLowerCase();}
function decimal(v:any,scale:number,max:number,positive=false):string|null {
  const s=text(v,40)?.replace(',','.');if(!s)return null;
  if(!new RegExp('^\\d+(?:\\.\\d{1,'+scale+'})?$').test(s))throw new InputError(`Число должно иметь не более ${scale} знаков после запятой`);
  const n=Number(s);if(!Number.isFinite(n)||n>max||(positive?n<=0:n<0))throw new InputError('Число вне допустимого диапазона');return n.toFixed(scale);
}
function choice(v:any,values:string[],label:string,optional=false){const s=text(v,50);if(optional&&!s)return null;if(!s||!values.includes(s))throw new InputError(`Проверьте поле «${label}»`);return s;}
function body(req:Request){if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw new InputError('Некорректные данные');return req.body;}
function keyVersion(input:any,current:any){if(typeof input.version!=='string'||input.version!==current.version)throw new HttpError(409,'Запись изменена. Обновите её перед сохранением');}
async function insert(tx:any,table:string,values:Record<string,any>){const keys=Object.keys(values);return rows(await tx.execute(sql`INSERT INTO ${sql.identifier(table)} (${sql.join(keys.map(k=>sql.identifier(k)),sql`,`)}) VALUES (${sql.join(keys.map(k=>sql`${values[k]}`),sql`,`)}) RETURNING *`))[0];}
async function update(tx:any,table:string,rowId:number,values:Record<string,any>){await tx.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.join([...Object.entries(values).map(([k,v])=>sql`${sql.identifier(k)}=${v}`),sql`"updatedAt"=now()`],sql`, `)} WHERE id=${rowId}`);}
async function audit(tx:any,manager:number,action:string,entity:string,rowId:number,before:any,after:any){await tx.execute(sql`INSERT INTO "correspondenceAuditLog" ("managerId",action,"entityType","entityId","beforeData","afterData") VALUES (${manager},${action},${entity},${rowId},${before?JSON.stringify(before):null}::jsonb,${after?JSON.stringify(after):null}::jsonb)`);}
async function active(tx:any,table:string,rowId:number,label:string){const r=rows(await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} WHERE id=${rowId} AND "isActive"=true FOR SHARE`))[0];if(!r)throw new InputError(`${label} не найден или неактивен`);return r;}
// Shipment owner. Our own organisation lives in the shared partners table for
// legacy compatibility, but it can never be the owner of a Correspondence shipment.
async function activeOwner(tx:any,ownerType:string,ownerId:number){
  if(ownerType!=='partner')return active(tx,'correspondenceClients',ownerId,'Владелец');
  const r=rows(await tx.execute(sql`SELECT * FROM "partners" WHERE id=${ownerId} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Владелец не найден или неактивен');
  if(r.isOwnCompany===true)throw new InputError('Наша организация не может быть владельцем отправления');
  return r;
}
// Handling partner: the external partner who actually carries / delivers the
// shipment. Optional and independent from the owner; our own organisation is
// never a valid handling partner.
async function activeHandlingPartner(tx:any,partnerId:number){
  const r=rows(await tx.execute(sql`SELECT * FROM "partners" WHERE id=${partnerId} AND "isActive"=true FOR SHARE`))[0];
  if(!r)throw new InputError('Партнёр обработки не найден или неактивен');
  if(r.isOwnCompany===true)throw new InputError('Наша организация не может быть партнёром обработки');
  return r;
}
// Optional handling partner: absent / null / '' means "выполняем сами".
function optionalPartnerId(v:any):number|null{
  if(v===undefined||v===null||String(v).trim()==='')return null;
  return id(v);
}
// Persisted snapshot, kilograms. Null / 0 count as "no value"; if nothing is
// known the result stays null instead of an artificial 0.
export function calculateBillableWeight(measuredWeight:any,manifestWeight:any,volumetricWeight:any):string|null{
  const known=[measuredWeight,manifestWeight,volumetricWeight]
    .map((v:any)=>Number(v))
    .filter((n:number)=>Number.isFinite(n)&&n>0);
  if(!known.length)return null;
  return Math.ceil(Math.max(...known)).toFixed(3);
}
function placeData(input:any){
  if(!Array.isArray(input)||!input.length||input.length>200)throw new InputError('Укажите от 1 до 200 мест');
  let grams=0n,volumeNumerator=0n;
  const places=input.map((p:any,i:number)=>{
    if(!p||typeof p!=='object'||Array.isArray(p))throw new InputError('Некорректное место');
    const w=decimal(p.measuredWeight,3,1000000,true);if(!w)throw new InputError(`Укажите вес места ${i+1}`);
    const dims=['lengthCm','widthCm','heightCm'].map(k=>decimal(p[k],2,10000,true));
    if(dims.some(Boolean)&&!dims.every(Boolean))throw new InputError(`Укажите все три размера места ${i+1}`);
    grams+=BigInt(w.replace('.',''));
    if(dims.every(Boolean))volumeNumerator+=dims.map(d=>BigInt(d!.replace('.',''))).reduce((a,b)=>a*b,1n);
    return {position:i+1,measuredWeight:w,lengthCm:dims[0],widthCm:dims[1],heightCm:dims[2]};
  });
  // Dimension values are hundredths of a cm; ceil to grams, then billable whole kg.
  const volumeGrams=(volumeNumerator+4999999n)/5000000n;
  if(grams>999999999999n||volumeGrams>999999999999n)throw new InputError('Суммарный вес превышает допустимый');
  return {places,measuredWeight:(Number(grams)/1000).toFixed(3),volumetricWeight:(Number(volumeGrams)/1000).toFixed(3),placesCount:places.length};
}
function intakeData(b:any){
  const ownerType=choice(b.ownerType,['client','partner'],'Владелец');
  const fields:any={ownerType,ownerId:id(b.ownerId),destinationCityId:id(b.destinationCityId),waybillNumber:required(b.waybillNumber,'номер накладной',50),waybillDate:date(b.waybillDate),
    recipientName:text(b.recipientName,255),recipientCompany:text(b.recipientCompany,255),recipientAddress:required(b.recipientAddress,'адрес получателя',5000),recipientPhone:text(b.recipientPhone,50),
    payer:choice(b.payer,['sender','recipient'],'Плательщик'),paymentMethod:text(b.paymentMethod,100),declaredValue:decimal(b.declaredValue,2,999999999999.99)};
  if(!fields.recipientName&&!fields.recipientCompany)throw new InputError('Укажите получателя или организацию');
  for(const k of ['senderName','senderCompany','senderCity','senderAddress','senderPhone','senderPostalCode','recipientPostalCode','contents','senderNotes','specialConditions'])fields[k]=text(b[k],k.endsWith('Phone')?50:5000);
  // Preserve hashes of pre-camera intake requests when this optional field was absent.
  if(Object.prototype.hasOwnProperty.call(b,'manifestWeight'))fields.manifestWeight=decimal(b.manifestWeight,3,1000000,true);
  fields.partnerId=optionalPartnerId(b.partnerId);
  const weights={...fields,...placeData(b.places)};
  weights.billableWeight=calculateBillableWeight(weights.measuredWeight,weights.manifestWeight,weights.volumetricWeight);
  return weights;
}
async function checkWaybill(tx:any,number:string,except?:number){const r=rows(await tx.execute(sql`
  SELECT 1 FROM "mails" WHERE lower(btrim("waybillNumber"))=lower(btrim(${number}))
  UNION ALL SELECT 1 FROM "correspondenceShipments" WHERE lower(btrim("waybillNumber"))=lower(btrim(${number})) AND (${except??null}::integer IS NULL OR id<>${except??null}) LIMIT 1`));if(r.length)throw new HttpError(409,'Такой номер накладной уже существует');}

export async function workflowShipments(tx:any,only?:number){
 const data=rows(await tx.execute(sql`SELECT to_jsonb(m) AS legacy,to_jsonb(s) AS current,
   c.name AS "cityName",c.region AS "cityRegion",o."handedOverAt",p.name AS "partnerName",k.name AS "courierName",
   hp.name AS "handlingPartnerName",
   mf."arrivedAt" AS "arrivalDate",COALESCE(z.parts,'[]'::jsonb) AS parts
   FROM "mails" m FULL JOIN "correspondenceShipments" s ON s."mailId"=m.id
   LEFT JOIN "correspondenceCities" c ON c.id=s."destinationCityId"
   LEFT JOIN "correspondenceManifests" o ON o.id=s."outgoingManifestId"
   LEFT JOIN "correspondenceManifests" mf ON mf.id=s."manifestId"
   LEFT JOIN partners p ON p.id=m."partnerId" LEFT JOIN partners hp ON hp.id=s."partnerId" LEFT JOIN couriers k ON k.id=m."courierId"
   LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(pl) ORDER BY pl.position) AS parts FROM "correspondenceShipmentPlaces" pl WHERE pl."shipmentId"=s.id) z ON true
   ${only===undefined?sql``:sql`WHERE s.id=${only}`} ORDER BY COALESCE(s."acceptedAt",s."createdAt",m."createdAt") DESC`));
 return data.map(r=>{
   const m=r.legacy||{},s=r.current||{},standalone=!r.legacy;
   return {...m,...s,id:r.current?'s'+s.id:'m'+m.id,correspondenceId:s.id||null,mailId:m.id||null,
     waybillNumber:s.waybillNumber||m.waybillNumber,recipientName:s.recipientCompany||s.recipientName||m.recipientName,
     recipientContact:s.recipientName,recipientPhone:s.recipientPhone||m.recipientPhone,
     sourceRecipientPhone:s.recipientPhone,sourceRecipientAddress:s.recipientAddress,deliveryAddress:s.recipientAddress||m.deliveryAddress,
     weight:s.measuredWeight||s.manifestWeight||m.weight,recipientCityNormalized:r.cityName||s.recipientCityNormalized,
     cityName:r.cityName,cityRegion:r.cityRegion,parts:r.parts,partnerName:r.partnerName,
     partnerId:s.partnerId??null,handlingPartnerName:r.handlingPartnerName??null,courierName:r.courierName,
     arrivalDate:s.acceptedAt||r.arrivalDate,handedOverAt:r.handedOverAt,
     status:r.handedOverAt&&m.status!=='delivered'?'handed_over':standalone?'received':m.status,
     version:digest({s:r.current,parts:r.parts,delivery:m.status,handedOverAt:r.handedOverAt}),standalone};
 });
}
async function getShipment(tx:any,rowId:number){await tx.execute(sql`SELECT m.id FROM mails m JOIN "correspondenceShipments" s ON s."mailId"=m.id WHERE s.id=${rowId} FOR SHARE OF m`);const r=(await workflowShipments(tx,rowId))[0];if(!r)throw new HttpError(404,'Отправление не найдено');return r;}
export async function workflowManifests(tx:any,only?:number){
 const data=rows(await tx.execute(sql`SELECT to_jsonb(m)-'sourceFileData' AS record,
   p.name AS "partnerName",c.name AS "cityName",c.region AS "cityRegion",t.name AS "carrierName",
   COALESCE((SELECT jsonb_agg(s.id ORDER BY s.id) FROM "correspondenceShipments" s WHERE
     (m.direction='outgoing' AND s."outgoingManifestId"=m.id) OR (m.direction='incoming' AND s."manifestId"=m.id)),'[]'::jsonb) AS "shipmentIds"
   FROM "correspondenceManifests" m LEFT JOIN partners p ON p.id=m."partnerId"
   LEFT JOIN "correspondenceCities" c ON c.id=m."destinationCityId"
   LEFT JOIN "transportCompanies" t ON t.id=m."carrierId"
   ${only===undefined?sql``:sql`WHERE m.id=${only}`} ORDER BY m."createdAt" DESC`));
 return data.map(r=>({...r.record,partnerName:r.partnerName,cityName:r.cityName,cityRegion:r.cityRegion,carrierName:r.carrierName,shipmentIds:r.shipmentIds,shipmentCount:r.shipmentIds.length,version:digest({record:r.record,shipmentIds:r.shipmentIds})}));
}
async function getManifest(tx:any,rowId:number){const r=(await workflowManifests(tx,rowId))[0];if(!r||r.direction!=='outgoing')throw new HttpError(404,'Исходящий манифест не найден');return r;}
async function replacePlaces(tx:any,shipmentId:number,places:any[]){await tx.execute(sql`DELETE FROM "correspondenceShipmentPlaces" WHERE "shipmentId"=${shipmentId}`);for(const p of places)await insert(tx,'correspondenceShipmentPlaces',{shipmentId,...p});}
function manifestData(b:any){
 const departureDate=date(b.departureDate),plannedArrivalDate=date(b.plannedArrivalDate);
 if(departureDate&&plannedArrivalDate&&plannedArrivalDate<departureDate)throw new InputError('Плановая дата прибытия раньше отправления');
 if(b.terminalRequired!==true&&b.terminalRequired!==false)throw new InputError('Укажите необходимость терминальной обработки');
 const terminalCost=decimal(b.terminalCost,2,999999999999.99),terminalPayer=choice(b.terminalPayer,['us','partner'],'Плательщик терминала',true);
 if(!b.terminalRequired&&(terminalCost!==null||terminalPayer!==null))throw new InputError('Уберите терминальные расходы или отметьте необходимость обработки');
 return {partnerId:id(b.partnerId),destinationCityId:id(b.destinationCityId),manifestNumber:text(b.manifestNumber,100),manifestDate:date(b.manifestDate),
   transportType:choice(b.transportType,['air','ground'],'Тип перевозки'),carrierId:b.carrierId?id(b.carrierId):null,
   transportWaybillNumber:text(b.transportWaybillNumber,100),departureDate,plannedArrivalDate,
   transportPayer:choice(b.transportPayer,['us','partner'],'Плательщик перевозки',true),transportCost:decimal(b.transportCost,2,999999999999.99),
   carrierMinBillableWeight:decimal(b.carrierMinBillableWeight,3,999999999.999,true),terminalRequired:b.terminalRequired,terminalCost,terminalPayer,comment:text(b.comment,5000)};
}
async function manifestReferences(tx:any,d:any){await active(tx,'partners',d.partnerId,'Партнёр');await active(tx,'correspondenceCities',d.destinationCityId,'Населённый пункт');if(d.carrierId)await active(tx,'transportCompanies',d.carrierId,'Перевозчик');}
function shipmentIds(b:any){if(!Array.isArray(b.shipmentIds)||!b.shipmentIds.length||b.shipmentIds.length>1000)throw new InputError('Выберите от 1 до 1000 отправлений');const ids=b.shipmentIds.map(id);if(new Set(ids).size!==ids.length)throw new InputError('Отправление указано дважды');return ids.sort((a:number,b:number)=>a-b);}
async function checkMembers(tx:any,ids:number[],cityId:number,currentManifest?:number){
 const found=rows(await tx.execute(sql`SELECT s.*,m.status AS "legacyStatus" FROM "correspondenceShipments" s LEFT JOIN mails m ON m.id=s."mailId"
   WHERE s.id IN (${sql.join(ids.map(n=>sql`${n}`),sql`,`)}) ORDER BY s.id FOR UPDATE OF s`));
 if(found.length!==ids.length)throw new InputError('Часть отправлений не найдена');
 const mailIds=found.filter(s=>s.mailId).map(s=>s.mailId);
 const lockedMails=mailIds.length?rows(await tx.execute(sql`SELECT id,status FROM mails WHERE id IN (${sql.join(mailIds.map(n=>sql`${n}`),sql`,`)}) ORDER BY id FOR SHARE`)):[];
 for(const s of found){
   if(s.mailId)s.legacyStatus=lockedMails.find(m=>Number(m.id)===Number(s.mailId))?.status;
   if(s.archivedAt||s.legacyStatus==='delivered')throw new InputError('Доставленные и архивные отправления нельзя добавить');
   if(Number(s.destinationCityId)!==cityId)throw new InputError('В одном манифесте должны быть отправления в один населённый пункт');
   if(s.outgoingManifestId&&Number(s.outgoingManifestId)!==currentManifest)throw new HttpError(409,'Отправление уже находится в другом исходящем манифесте');
   if(!Number(s.measuredWeight||s.manifestWeight))throw new InputError('У всех отправлений должен быть указан вес');
 }
 return found;
}
async function transaction(fn:(tx:any)=>Promise<any>){const conn=await db.getDb();if(!conn)throw new Error('Database not available');return conn.transaction(async(tx:any)=>{await lockCorrespondenceWrites(tx);return fn(tx)});}
function handle(fn:(req:Request,res:Response)=>Promise<any>){return async(req:Request,res:Response)=>{try{await fn(req,res)}catch(e:any){const code=e instanceof HttpError?e.status:e instanceof InputError?400:['23505','55P03','40001','40P01'].includes(e.code||e.cause?.code)?409:500;console.error('Correspondence workflow:',code,e.cause?.code||e.code||e.name);res.status(code).json({error:{message:code===500?'Сохранение не выполнено. Обновите данные и повторите.':code===409&&!(e instanceof HttpError)?'Данные изменились или заняты. Обновите список и повторите.':e.message}})}};}

export function registerCorrespondenceWorkflow(app:Express){
 app.use(ROOT,(_req,res,next)=>{if(!Number.isSafeInteger(res.locals.manager?.managerId)||res.locals.manager.managerId<=0){res.status(401).json({error:{message:'Требуется вход менеджера'}});return}res.setHeader('Cache-Control','no-store');next()});
 app.post(ROOT+'/intake',handle(async(req,res)=>{
   const b=body(req),d=intakeData(b),key=uuid(b.intakeKey),hash=digest(d),manager=res.locals.manager.managerId;
   const result=await transaction(async tx=>{
     const prior=rows(await tx.execute(sql`SELECT id,"intakePayloadHash" FROM "correspondenceShipments" WHERE "intakeKey"=${key}`))[0];
     if(prior){if(prior.intakePayloadHash!==hash)throw new HttpError(409,'Этот ключ уже использован для других данных');return {shipment:await getShipment(tx,prior.id),repeated:true};}
     const city=await active(tx,'correspondenceCities',d.destinationCityId,'Населённый пункт');await activeOwner(tx,d.ownerType,d.ownerId);if(d.partnerId!==null)await activeHandlingPartner(tx,d.partnerId);
     await checkWaybill(tx,d.waybillNumber);
     const {places,...fields}=d;
     const s=await insert(tx,'correspondenceShipments',{...fields,direction:'outgoing',recipientCityRaw:city.name,recipientCityNormalized:city.name,recipientRegion:city.region,acceptedAt:new Date(),acceptedByManagerId:manager,intakeKey:key,intakePayloadHash:hash});
     await replacePlaces(tx,s.id,places);const after=await getShipment(tx,s.id);await audit(tx,manager,'create','shipment',s.id,null,after);return {shipment:after,repeated:false};
   });res.status(result.repeated?200:201).json(result);
 }));
 app.post(ROOT+'/shipments/:id/edit',handle(async(req,res)=>{
   const b=body(req),rowId=id(req.params.id),d=intakeData(b),manager=res.locals.manager.managerId;
   const result=await transaction(async tx=>{
     const before=await getShipment(tx,rowId);keyVersion(b,before);
     if(!before.standalone||before.archivedAt)throw new InputError('Полное редактирование доступно для исходящих, внесённых на приёмке');
     if(before.outgoingManifestId)throw new InputError('Сначала исключите отправление из исходящего манифеста');
     const city=await active(tx,'correspondenceCities',d.destinationCityId,'Населённый пункт');await activeOwner(tx,d.ownerType,d.ownerId);if(d.partnerId!==null)await activeHandlingPartner(tx,d.partnerId);
     await checkWaybill(tx,d.waybillNumber,rowId);const {places,...fields}=d;
     await update(tx,'correspondenceShipments',rowId,{...fields,recipientCityRaw:city.name,recipientCityNormalized:city.name,recipientRegion:city.region});await replacePlaces(tx,rowId,places);
     const after=await getShipment(tx,rowId);await audit(tx,manager,'update','shipment',rowId,before,after);return after;
   });res.json(result);
 }));
 app.post(ROOT+'/shipments/:id/city',handle(async(req,res)=>{
   const b=body(req),rowId=id(req.params.id),cityId=id(b.destinationCityId),manager=res.locals.manager.managerId;
   res.json(await transaction(async tx=>{const before=await getShipment(tx,rowId);keyVersion(b,before);if(before.outgoingManifestId||before.archivedAt||before.status==='delivered')throw new InputError('Нельзя менять направление доставленного, архивного или включённого в манифест отправления');const city=await active(tx,'correspondenceCities',cityId,'Населённый пункт');await update(tx,'correspondenceShipments',rowId,{destinationCityId:cityId,recipientCityNormalized:city.name,recipientRegion:city.region});const after=await getShipment(tx,rowId);await audit(tx,manager,'update','shipment',rowId,before,after);return after;}));
 }));
 app.post(ROOT+'/outgoing',handle(async(req,res)=>{
   const b=body(req),d=manifestData(b),ids=shipmentIds(b),key=uuid(b.creationKey),hash=digest({d,ids}),manager=res.locals.manager.managerId;
   const result=await transaction(async tx=>{
     const prior=rows(await tx.execute(sql`SELECT id,"creationPayloadHash" FROM "correspondenceManifests" WHERE "creationKey"=${key}`))[0];
     if(prior){if(prior.creationPayloadHash!==hash)throw new HttpError(409,'Этот ключ уже использован для других данных');return {manifest:await getManifest(tx,prior.id),repeated:true};}
     await manifestReferences(tx,d);await checkMembers(tx,ids,d.destinationCityId);
     const m=await insert(tx,'correspondenceManifests',{...d,direction:'outgoing',createdByManagerId:manager,creationKey:key,creationPayloadHash:hash});
     for(const rowId of ids){const before=await getShipment(tx,rowId);await update(tx,'correspondenceShipments',rowId,{outgoingManifestId:m.id});await audit(tx,manager,'update','shipment',rowId,before,await getShipment(tx,rowId));}
     const after=await getManifest(tx,m.id);await audit(tx,manager,'create','manifest',m.id,null,after);return {manifest:after,repeated:false};
   });res.status(result.repeated?200:201).json(result);
 }));
 app.post(ROOT+'/outgoing/:id/edit',handle(async(req,res)=>{
   const b=body(req),rowId=id(req.params.id),d=manifestData(b),manager=res.locals.manager.managerId;
   res.json(await transaction(async tx=>{
     const before=await getManifest(tx,rowId);keyVersion(b,before);
     if(d.destinationCityId!==Number(before.destinationCityId)||d.partnerId!==Number(before.partnerId))throw new InputError('Город и партнёр созданного манифеста не меняются');
     if(before.handedOverAt&&(!d.carrierId||!d.transportWaybillNumber||!d.departureDate))throw new InputError('У переданного манифеста должны оставаться перевозчик, транспортная накладная и дата отправления');
     if(d.carrierId&&Number(before.carrierId)!==d.carrierId)await active(tx,'transportCompanies',d.carrierId,'Перевозчик');
     await update(tx,'correspondenceManifests',rowId,d);const after=await getManifest(tx,rowId);await audit(tx,manager,'update','manifest',rowId,before,after);return after;
   }));
 }));
 app.post(ROOT+'/outgoing/:id/members',handle(async(req,res)=>{
   const b=body(req),rowId=id(req.params.id),ids=shipmentIds(b),remove=b.remove===true,manager=res.locals.manager.managerId;
   res.json(await transaction(async tx=>{
     const before=await getManifest(tx,rowId);keyVersion(b,before);
     if(remove&&before.handedOverAt)throw new InputError('Сначала отмените отметку передачи партнёру');
     if(remove){if(ids.some(n=>!before.shipmentIds.includes(n)))throw new InputError('Отправление отсутствует в манифесте');if(ids.length===before.shipmentIds.length)throw new InputError('В манифесте должно остаться хотя бы одно отправление');}
     else await checkMembers(tx,ids,Number(before.destinationCityId),rowId);
     for(const n of ids){const old=await getShipment(tx,n);await update(tx,'correspondenceShipments',n,{outgoingManifestId:remove?null:rowId});await audit(tx,manager,'update','shipment',n,old,await getShipment(tx,n));}
     await update(tx,'correspondenceManifests',rowId,{});const after=await getManifest(tx,rowId);await audit(tx,manager,'update','manifest',rowId,before,after);return after;
   }));
 }));
 app.post(ROOT+'/outgoing/:id/handover',handle(async(req,res)=>{
   const b=body(req),rowId=id(req.params.id),manager=res.locals.manager.managerId;if(typeof b.handedOver!=='boolean')throw new InputError('Некорректная отметка передачи');
   res.json(await transaction(async tx=>{
     const before=await getManifest(tx,rowId);keyVersion(b,before);
     if(b.handedOver){if(!before.shipmentIds.length||!before.departureDate||!before.carrierId||!before.transportWaybillNumber)throw new InputError('Для передачи укажите перевозчика, транспортную накладную и дату отправления');await checkMembers(tx,before.shipmentIds,Number(before.destinationCityId),rowId);}
     await update(tx,'correspondenceManifests',rowId,{handedOverAt:b.handedOver?new Date():null,handedOverByManagerId:b.handedOver?manager:null});const after=await getManifest(tx,rowId);await audit(tx,manager,b.handedOver?'handover':'undo_handover','manifest',rowId,before,after);return after;
   }));
 }));
 app.get(ROOT+'/workflow/:kind/:id/history',handle(async(req,res)=>{
   const kind=choice(req.params.kind,['shipment','manifest'],'Вид записи'),rowId=id(req.params.id),conn=await db.getDb();if(!conn)throw new Error('Database not available');
   const items=rows(await conn.execute(sql`SELECT "managerId","occurredAt",action,"beforeData","afterData" FROM "correspondenceAuditLog" WHERE "entityType"=${kind} AND "entityId"=${rowId} ORDER BY "occurredAt" DESC,id DESC LIMIT 50`));res.json({items});
 }));
}
