import type { Express, Request, Response } from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import * as db from '../db';
import { verifyMaxInitData } from './maxQrDecode';
import { syncTaskForRequestId } from './requestTaskSync';
import { sendNewRequestPush } from './requestCreationPush';
import { broadcastLive } from './liveEvents';
import { isExpoPushToken, sendExpoPush } from './expoPush';
import { buildNewRequestPush } from './requestPushPresentation';


// All MAX operations fail closed without a token, verified chat and current membership.
const apiRoot = 'https://platform-api.max.ru';
const rows = (result:any): any[] => Array.isArray(result) ? result : (result?.rows || []);
const sha = (value:string) => createHash('sha256').update(value).digest('hex');
const safeId = (value:any) => /^\d{1,20}$/.test(String(value ?? '')) ? String(value) : '';
const safeChatId = (value:any) => /^-?\d{1,19}$/.test(String(value ?? '')) ? String(value) : '';
const allowedText = (value:any, max:number) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const token = () => process.env.MAX_BOT_TOKEN || '';
const serverSecret = () => process.env.MAX_WEBHOOK_SECRET || '';
// Dedicated manager approval chat. Never use this chat as a client context.
const approvalChatId = '-72553902397612';
const recent = new Map<string,{n:number,expires:number}>();
function limited(key:string, cap:number) {
 const now=Date.now(); if(recent.size>15000)recent.clear();
 const old=recent.get(key); const hit=old && old.expires>now ? old : {n:0,expires:now+60000};
 hit.n++;recent.set(key,hit);return hit.n>cap;
}
async function maxApi(path:string, opts:RequestInit={}) {
 if(!token())throw new Error('MAX_BOT_TOKEN missing');
 const abort=new AbortController(); const timer=setTimeout(()=>abort.abort(),8000);
 try {
  const r=await fetch(apiRoot+path,{...opts,signal:abort.signal,headers:{Authorization:token(), 'Content-Type':'application/json', ...(opts.headers||{})}});
  const raw=await r.text();let data:any;try{data=JSON.parse(raw)}catch{data={}};
  if(!r.ok)throw new Error(`MAX API HTTP ${r.status}`);
  return data;
 }finally{clearTimeout(timer);}
}
async function send(chatId:string,text:string,buttons?:any[][]){
 const attachments=buttons?.length?[{type:'inline_keyboard',payload:{buttons}}]:[];
 return maxApi('/messages?chat_id='+encodeURIComponent(chatId),{method:'POST',body:JSON.stringify({text,attachments})});
}
function initUser(req:Request){
 const raw=String(req.get('X-Max-Init-Data')||'');
 if(!verifyMaxInitData(raw,token()))return null;
 const params=new URLSearchParams(raw);let user:any;
 try{user=JSON.parse(params.get('user')||'null')}catch{return null}
 const id=safeId(user?.user_id ?? user?.id);
 if(!id)return null;
 let signedChat='';try{const chat=JSON.parse(params.get('chat')||'null');signedChat=safeChatId(chat?.id);}catch{}
 return {id, signedChat, startParam:params.get('start_param')||''};
}
async function member(chatId:string,userId:string){
 // MAX GET chat members with explicit user_ids. A failure always denies access.
 const data=await maxApi(`/chats/${encodeURIComponent(chatId)}/members?user_ids=${encodeURIComponent(userId)}`);
 const list=Array.isArray(data?.members)?data.members:[];
 return list.some((m:any)=>safeId(m?.user_id)===userId);
}
function contextId(startParam:string){const m=/^mig_(\d{1,18})$/.exec(startParam);return m?Number(m[1]):0;}
async function context(req:Request){
 const user=initUser(req);
 if(!user){console.warn('MAX_ACCESS_DENIED SIGNATURE_OR_USER');return null;}
 const id=contextId(user.startParam);
 if(!id){console.warn('MAX_ACCESS_DENIED START_PARAM');return null;}
 const conn=await db.getDb();
 if(!conn){console.warn('MAX_ACCESS_DENIED DATABASE');return null;}
 const chat=rows(await conn.execute(sql`SELECT c.id,c.client_id,c.chat_id,c.enabled FROM max_client_chats c WHERE c.id=${id} AND c.enabled=TRUE AND c.verified_at IS NOT NULL`))[0];
 if(!chat?.chat_id){console.warn('MAX_ACCESS_DENIED BINDING');return null;}
 if(!await member(String(chat.chat_id),user.id)){
  console.warn('MAX_ACCESS_DENIED MEMBERSHIP');return null;
 }
 return {userId:user.id,chatId:String(chat.chat_id),bindingId:Number(chat.id),clientId:Number(chat.client_id)};
}
export async function verifyMaxChatAccess(req:Request){return !!(await context(req));}
function payloadValid(d:any){
 if(!d || typeof d!=='object'||Array.isArray(d))return false;
 if(!['delivery','movement','tc'].includes(d.type))return false;
 if(!Array.isArray(d.from)||d.from.length>20||!Array.isArray(d.to)||d.to.length>20)return false;
 if(![...d.from,...d.to].every((x:any)=>safeId(x)))return false;
 const manual=String(d.manualFromAddress||'').trim();
 if(manual.length>500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(manual))return false;
 if(manual && (d.from.length || d.type==='tc' && d.direction==='from'))return false;
 const hasFrom=d.from.length>0 || manual.length>=5;
 if(d.type==='delivery'){
  if(!allowedText(d.recipient,255)||!allowedText(d.street,200)||!allowedText(d.house,60)||!allowedText(d.city,100))return false;
  const digits=String(d.phone||'').replace(/\D/g,'');
  if(!(digits.length===6||/^[78]9\d{9}$/.test(digits)))return false;
  if(!hasFrom)return false;
 }else if(d.type==='movement'&&(!hasFrom||!d.to.length))return false;
 else if(d.type==='tc' && !(d.direction==='from'?d.to.length:hasFrom))return false;
 if(!Number.isSafeInteger(d.count)||d.count<1||d.count>999)return false;
 if(!['today','tomorrow','date'].includes(d.day)||!['day','before','after','range'].includes(d.timeMode))return false;
 if(d.day==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(d.date))return false;
 if(d.type==='delivery' && !['paid','due'].includes(d.payment))return false;
 if(!['timeFrom','timeTo'].every(k=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d[k]||''))))return false;
 if(d.payment==='due' && (!(Number(d.amount)>0)||Number(d.amount)>100000000))return false;
 if(d.method==='qr'&&d.payment==='due'&&(!d.qrImageBase64||typeof d.qrImageBase64!=='string'||d.qrImageBase64.length>7000000))return false;
 return true;
}
async function validatePoints(clientId:number,d:any){
 const conn=await db.getDb();if(!conn)return false;
 const points=rows(await conn.execute(sql`SELECT id FROM "clientPoints" WHERE "clientId"=${clientId}`));
 const permitted=new Set(points.map((x:any)=>String(x.id)));
 return [...d.from,...d.to].every((id:any)=>permitted.has(String(id)));
}
async function authorizedManager(conn:any, maxUserId:string):Promise<number|null>{
 if(!safeId(maxUserId))return null;
 const found=rows(await conn.execute(sql`SELECT m.id FROM max_manager_links l JOIN managers m ON m.id=l.manager_id WHERE l.max_user_id=${maxUserId} AND l.can_approve=TRUE AND l.enabled=TRUE AND m."isActive"=TRUE LIMIT 1`))[0];
 return found?.id ? Number(found.id) : null;
}
async function bodyText(d:any,clientId:number){
 const conn=await db.getDb();
 if(!conn)throw new Error('Database unavailable');
 const client=rows(await conn.execute(sql`SELECT name FROM clients WHERE id=${clientId}`))[0];
 if(!client)throw new Error('Client not found');
 const lines=[`📦 Новая заявка МИГ · ${client.name}`,`Тип: ${{delivery:'Доставка',movement:'Перемещение',tc:'Транспортная компания'}[d.type as 'delivery']||d.type}`];
 const ids=[...new Set([...(d.from||[]),...(d.to||[])].map(Number))];
 const pts=ids.length?rows(await conn.execute(sql`
  SELECT id,name,address,"contactPerson",phone FROM "clientPoints"
  WHERE "clientId"=${clientId}
  AND id IN (${sql.join(ids.map((id:number)=>sql`${id}`),sql`,`)})
 `)):[];
 const byId=new Map(pts.map((p:any)=>[String(p.id),p]));
 if(ids.some(id=>!byId.has(String(id))))throw new Error('Client point missing');
 const describe=(list:any[])=>list.map(id=>{
  const p=byId.get(String(id));
  return [p.name,p.address,p.contactPerson,p.phone].filter(Boolean).join(' · ');
 }).join('; ');
 let tcLabel='';
 if(d.type==='tc'){
  const tc=rows(await conn.execute(sql`
   SELECT name,address,"contactPerson",phone FROM "transportCompanies"
   WHERE name=${allowedText(d.tc,255)} AND "isActive"=TRUE LIMIT 1
  `))[0];
  if(!tc)throw new Error('Transport company missing');
  tcLabel=[tc.name,tc.address,tc.contactPerson,tc.phone]
   .filter(Boolean).join(' · ');
 }
 if(d.type==='tc'&&d.direction==='from')
  lines.push('Откуда (ТК): '+tcLabel);
 else if(d.from?.length)
  lines.push('Откуда: '+describe(d.from));
 if(d.manualFromAddress)lines.push('Адрес забора вручную: '+allowedText(d.manualFromAddress,500));
 if(d.type==='tc'&&d.direction==='to')
  lines.push('Куда (ТК): '+tcLabel);
 else if(d.to?.length)
  lines.push('Куда: '+describe(d.to));
 if(d.type==='delivery')lines.push('Получатель: '+allowedText(d.recipient,255),'Телефон: '+allowedText(d.phone,50),'Адрес: '+[d.city,d.area,d.street,d.house,d.unit].filter(Boolean).join(', '));
 const date=d.day==='today'?'Сегодня':d.day==='tomorrow'?'Завтра':d.date;
 const time=d.timeMode==='day'?'В течение дня'
  :d.timeMode==='before'?'До '+d.timeTo
  :d.timeMode==='after'?'После '+d.timeFrom
  :'С '+d.timeFrom+' до '+d.timeTo;
 lines.push('Дата: '+date,'Время: '+time,'Мест: '+d.count);
 if(d.comment)lines.push('Комментарий: '+allowedText(d.comment,1000));
 if(d.payment==='due')lines.push('Оплата при получении: '+d.amount+' ₽ ('+d.method+')');
 if(d.method==='qr'&&d.payment==='due')lines.push('QR оплаты: оригинальное изображение сохранено в черновике');
 return lines.join('\n');
}
/**
 * Display label for one side of a route, in the same format the manager site
 * uses: "Организация / Точка". Point names come only from the selected client
 * points — never from a contact person. With no points (manual pickup address)
 * the organisation alone is used, so nothing is invented.
 */
export function maxMovementPartyLabel(
  clientName: string,
  pointNames: Array<string | null | undefined>,
): string {
  const organisation = String(clientName ?? "").trim();
  const names = pointNames
    .map((name) => String(name ?? "").trim())
    .filter(Boolean)
    .join(" / ");
  if (!organisation) return names;
  return names ? `${organisation} / ${names}` : organisation;
}

async function createActual(tx:any,d:any,clientId:number,actor:string,managerCreator:number){
 if(!Number.isSafeInteger(managerCreator)||managerCreator<1)throw new Error('Manager mapping missing');

 const clients=rows(await tx.execute(sql`
   SELECT id,name,address,"contactPerson",phone
   FROM clients WHERE id=${clientId}
 `));
 const client=clients[0];
 if(!client)throw new Error('Client not found');

 const tc=d.type==='tc'
  ?rows(await tx.execute(sql`
    SELECT id,name,address,"contactPerson",phone
    FROM "transportCompanies"
    WHERE name=${allowedText(d.tc,255)} AND "isActive"=TRUE
    LIMIT 1
   `))[0]
  :null;
 if(d.type==='tc'&&!tc)throw new Error('Transport company not found or inactive');

 const ids=[...d.from,...d.to].map(Number);
 const selected=ids.length
  ?rows(await tx.execute(sql`
    SELECT id,name,address,"contactPerson",phone
    FROM "clientPoints"
    WHERE "clientId"=${clientId}
    AND id IN (${sql.join(ids.map((id:number)=>sql`${id}`),sql`,`)})
   `))
  :[];

 const pointById=new Map(selected.map((p:any)=>[String(p.id),p]));
 if(ids.some((id:number)=>!pointById.has(String(id))))throw new Error('Client point not found');

 const first=(list:any[])=>list.length?pointById.get(String(list[0])):null;
 const from=first(d.from);
 const to=first(d.to);
 const addresses=(list:any[])=>list
  .map((id:any)=>pointById.get(String(id))?.address)
  .filter(Boolean)
  .join(' / ');

 const city=allowedText(d.city||'Улан-Удэ',100);
 const manualAddress=allowedText(d.manualFromAddress,500);
 const destination=[city,d.area,d.street,d.house,d.unit].filter(Boolean).join(', ');

 const senderAddress=d.type==='tc'&&d.direction==='from'
  ?tc.address
  :manualAddress||addresses(d.from)||client.address||null;

 const targetAddress=d.type==='delivery'
  ?destination
  :d.type==='tc'&&d.direction==='to'
   ?tc.address
   :addresses(d.to)||null;

 const businessToday=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Irkutsk',year:'numeric',month:'2-digit',day:'2-digit'
 }).format(new Date());
 const base=new Date(businessToday+'T12:00:00+08:00');
 if(!Number.isFinite(base.getTime()))throw new Error('Invalid business date');
 if(d.day==='tomorrow')base.setTime(base.getTime()+86400000);
 const day=d.day==='date'
  ?new Date(d.date+'T12:00:00+08:00')
  :base;
 if(!Number.isFinite(day.getTime()))throw new Error('Invalid scheduled date');

 const method=d.payment==='due'?d.method:'paid';

 // Same display format as the manager site ("Организация / Точка"), so a
 // movement reads identically no matter where it was created. Point names
 // come from the selected client points only - never from a contact person.
 const partyLabel=(list:any[])=>maxMovementPartyLabel(
  client.name,
  (Array.isArray(list)?list:[]).map((id:any)=>pointById.get(String(id))?.name),
 );

 const payload:any={
  createdByUserId:managerCreator,
  clientId,
  requestType:d.type==='tc'?'pickup_from_tc':d.type,
  senderName:d.type==='movement'
   ?partyLabel(d.from)
   :d.type==='tc'&&d.direction==='from'
    ?tc.name
    :partyLabel(d.from),
  senderCompany:d.type==='tc'&&d.direction==='from'?tc.name:client.name,
  senderPhone:d.type==='tc'&&d.direction==='from'
   ?tc.phone||null
   :from?.phone||client.phone||null,
  senderCity:'Улан-Удэ',
  senderAddress,
  recipientName:d.type==='movement'
   ?partyLabel(d.to)
   :d.type==='delivery'
    ?allowedText(d.recipient,255)
    :d.type==='tc'&&d.direction==='to'
     ?tc.name
     :partyLabel(d.to),
  recipientPhone:d.type==='delivery'
   ?allowedText(d.phone,50)
   :d.type==='tc'&&d.direction==='to'
    ?tc.phone||null
    :to?.phone||client.phone||null,
  recipientCompany:d.type==='delivery'
   ?null
   :d.type==='tc'&&d.direction==='to'?tc.name:client.name,
  recipientCity:city,
  recipientAddress:targetAddress,
  deliveryCity:city,
  deliveryAddress:targetAddress,
  tcName:d.type==='tc'?tc.name:null,
  tcAddress:d.type==='tc'?tc.address:null,
  placesCount:d.count,
  scheduledAt:day,
  deliveryTimeFrom:d.timeMode==='after'||d.timeMode==='range'?d.timeFrom:null,
  deliveryTimeTo:d.timeMode==='before'||d.timeMode==='range'?d.timeTo:null,
  comments:[
   d.type==='tc'&&d.direction==='to'
    ?'Направление: получатель → ТК':null,
   allowedText(d.comment,1000)||null
  ].filter(Boolean).join('\n')||null,
  paymentMethod:method,
  paymentAmount:d.payment==='due'?String(d.amount):null
 };

 return db.createRequest(payload,tx);
}
export async function announceChat(chatId:string,bindingId:number){
 const me=await maxApi('/me');const username=String(me?.username||'');
 if(!username)throw new Error('MAX bot username unavailable');
 return send(chatId,'✅ МИГ: приём заявок подключён. Нажмите кнопку, чтобы создать заявку.',[[{type:'open_app',text:'Создать заявку',web_app:username,payload:'mig_'+bindingId}]]);
}
export function registerMaxIntegrationRoutes(app:Express){
 app.post('/api/manager/clients/:clientId/max-chats/:id/connect-code',async(req,res)=>{
  try{
   const clientId=Number(req.params.clientId),id=Number(req.params.id);
   if(!Number.isSafeInteger(clientId)||!Number.isSafeInteger(id)||clientId<1||id<1)return void res.status(400).json({error:'Invalid ID'});
   const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
   const code=randomBytes(15).toString('hex');
   const updated=rows(await conn.execute(sql`UPDATE max_client_chats SET connect_code_hash=${sha(code)},connect_expires_at=now()+interval '15 minutes' WHERE id=${id} AND client_id=${clientId} AND chat_id IS NULL RETURNING id`));
   if(!updated.length)return void res.status(409).json({error:'Чат уже подключён или не найден'});
   res.json({command:'/mig '+code,expiresMinutes:15});
  }catch(e){console.error('MAX code',e);res.sendStatus(500)}
 });
 app.get('/api/manager/max/orders/:id/qr',async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return void res.sendStatus(400);
  try{const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
   const r=rows(await conn.execute(sql`SELECT qr_original,qr_mime FROM max_order_drafts WHERE id=${id}`))[0];
   if(!r?.qr_original)return void res.sendStatus(404);
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.type(r.qr_mime||'application/octet-stream').send(Buffer.from(r.qr_original));
  }catch(e){console.error('MAX QR retrieval',e);res.sendStatus(500)}
 });
 app.get('/api/max/transport-companies',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const ctx=await context(req);
   if(!ctx)return void res.status(403).json({error:'Нет доступа к чату'});
   const conn=await db.getDb();
   if(!conn)return void res.sendStatus(503);
   const companies=rows(await conn.execute(sql`
    SELECT id,name,address,"contactPerson",phone
    FROM "transportCompanies"
    WHERE "isActive"=TRUE ORDER BY name,id LIMIT 300
   `));
   res.json({companies});
  }catch(e){
   console.error('MAX transport companies',e);
   res.status(500).json({error:'Не удалось загрузить транспортные компании'});
  }
 });
 app.get('/api/max/points',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   const ctx=await context(req);if(!ctx)return void res.status(403).json({error:'Нет доступа к чату'});
   const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
   const list=rows(await conn.execute(sql`SELECT id,name,address FROM "clientPoints" WHERE "clientId"=${ctx.clientId} ORDER BY name LIMIT 300`));
   res.json({points:list,clientId:ctx.clientId});
  }catch(e){console.error('MAX points',e);res.status(403).json({error:'Проверка доступа не удалась'})}
 });
 app.post('/api/max/orders',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(limited('order:'+String(req.ip),10))return void res.sendStatus(429);
  try{
   const ctx=await context(req);if(!ctx)return void res.status(403).json({error:'Нет доступа к чату'});
   const d=req.body?.order,key=String(req.body?.idempotencyKey||'');
   if(!/^[a-zA-Z0-9_-]{16,100}$/.test(key)||!payloadValid(d)||!await validatePoints(ctx.clientId,d))return void res.status(400).json({error:'Некорректная заявка или точки клиента'});
   const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
   let qrOriginal:Buffer|null=null;let qrMime:string|null=null;
   if(d.payment==='due'&&d.method==='qr'){
    try{
     qrOriginal=Buffer.from(d.qrImageBase64,'base64');
     if(qrOriginal.length<100||qrOriginal.length>5*1024*1024)return void res.status(413).json({error:'QR-файл должен быть до 5 МБ'});
     const meta=await sharp(qrOriginal,{limitInputPixels:16000000}).metadata();
     if(!['png','jpeg','webp'].includes(meta.format||''))return void res.status(415).json({error:'Нужен PNG, JPG или WebP'});
     qrMime=meta.format==='jpeg'?'image/jpeg':'image/'+meta.format;
    }catch{return void res.status(400).json({error:'Некорректное изображение QR'});}
   }
   const orderData={...d};delete orderData.qrImageBase64;
   const created=rows(await conn.execute(sql`INSERT INTO max_order_drafts(chat_binding_id,max_user_id,request_data,idempotency_key,qr_original,qr_mime) VALUES(${ctx.bindingId},${ctx.userId},${JSON.stringify(orderData)}::jsonb,${key},${qrOriginal?sql`decode(${qrOriginal.toString('base64')},'base64')`:null},${qrMime}) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`))[0];
   if(!created){const old=rows(await conn.execute(sql`SELECT id,status FROM max_order_drafts WHERE idempotency_key=${key} AND chat_binding_id=${ctx.bindingId} AND max_user_id=${ctx.userId}`))[0];return void res.status(old?200:409).json(old||{error:'Ключ занят'});}
   const id=Number(created.id);
   try{
    const msg=await send(approvalChatId,`⏳ Новая заявка ожидает согласования\n\n${await bodyText(d,ctx.clientId)}`,[[{type:'callback',text:'✓ Принять',payload:`mig:approve:${id}`},{type:'callback',text:'✕ Отклонить',payload:`mig:reject:${id}`},{type:'callback',text:'🕒 Время',payload:`mig:time:${id}`}]]);
    const mid=String(msg?.body?.mid||msg?.message?.body?.mid||msg?.message?.mid||msg?.mid||'');
    if(!mid)throw new Error('MAX message ID missing; manual review required');
    await conn.execute(sql`UPDATE max_order_drafts SET max_message_id=${mid},updated_at=now() WHERE id=${id}`);
   }catch(e){console.error('MAX send pending',e); await conn.execute(sql`UPDATE max_order_drafts SET status='failed',updated_at=now() WHERE id=${id} AND status='pending'`); return void res.status(502).json({error:'MAX не принял сообщение. Заявка не отправлена менеджеру; обратитесь в офис.'});}
   try{
    await send(ctx.chatId,'⏳ Ваша заявка отправлена менеджеру на согласование.');
   }catch(e){
    console.error('MAX client acknowledgement failed',e);
   }

   res.status(201).json({id,status:'pending'});
  }catch(e){console.error('MAX order submit',e);res.status(503).json({error:'Не удалось отправить заявку'})}
 });
 // Webhook secret must be generated on server and configured as URL suffix in MAX webhook subscription.
 app.post('/api/max/events/:secret',async(req,res)=>{
  const received=String(req.get('X-Max-Bot-Api-Secret')||'');
  if(!serverSecret()||String(req.params.secret).length!==serverSecret().length||!timingSafeEqual(Buffer.from(req.params.secret),Buffer.from(serverSecret()))||received.length!==serverSecret().length||!timingSafeEqual(Buffer.from(received),Buffer.from(serverSecret())))return void res.sendStatus(404);
  if(limited('webhook:'+String(req.ip),120))return void res.sendStatus(429);
  const u=req.body;
  if(!u||typeof u!=='object')return void res.sendStatus(400);
  try{
   const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
   if(u.update_type==='bot_removed'){
    const chatId=safeChatId(u.chat_id);
    if(chatId)await conn.execute(sql`UPDATE max_client_chats SET enabled=FALSE,verified_at=NULL,updated_at=now() WHERE chat_id=${chatId}`);
   }
   if(u.update_type==='message_created'){
    const chatId=safeChatId(u.message?.recipient?.chat_id ?? u.message?.chat_id);
    const text=String(u.message?.body?.text||'');const match=/^\/mig\s+([a-f0-9]{30})\s*$/i.exec(text);

    if(chatId&&match){
     const me=await maxApi('/me'); const botId=safeId(me?.user_id ?? me?.id);
     if(!botId || !await member(chatId,botId))return void res.status(403).json({error:'Бот не является участником группы'});
     const hash=sha(match[1]);
     const bound=rows(await conn.execute(sql`UPDATE max_client_chats SET chat_id=${chatId},verified_at=now(),connect_code_hash=NULL,connect_expires_at=NULL,enabled=FALSE,updated_at=now() WHERE connect_code_hash=${hash} AND connect_expires_at>now() AND chat_id IS NULL RETURNING id,client_id`))[0];
     if(bound)await send(chatId,`МИГ: чат подтверждён для клиента #${bound.client_id}. Менеджер может включить приём заявок в карточке клиента.`);
    }
   }
   if(u.update_type==='message_callback'){
    const callback=u.callback;const value=String(callback?.payload||'');
    const match=/^mig:(approve|reject|time|day|before|after|range):(\d{1,18})$/.exec(value);
   const timePick=/^migt:(b|a|r|e):(\d{1,18}):(\d{2})(?::(\d{2})?)?(?::(\d{4}))?$/.exec(value);
    const manager=safeId(callback?.user?.user_id||callback?.user?.id);
    const managerId=(match||timePick)?await authorizedManager(conn,manager):null;


   // Register a time-selection keyboard for this manager and draft.
   const sendTimeKeyboard=async(draftId:number,chatId:string,text:string,buttons:any[][])=>{
    const result=await send(chatId,text,buttons);
    const mid=String(result?.body?.mid||result?.message?.body?.mid||result?.message?.mid||result?.mid||'');
    if(!mid)throw new Error('MAX time keyboard message ID missing');
    await conn.execute(sql`
     INSERT INTO max_time_selection_messages(message_id,draft_id,chat_id,created_by)
     VALUES (${mid},${draftId},${chatId},${manager})
    `);
   };

   if(timePick&&managerId){
    const [,mode,idText,hourText,minuteText,rangeStart]=timePick;
    const id=Number(idText);
    const hour=Number(hourText);
    const minute=minuteText===undefined||minuteText===''?null:Number(minuteText);
    const origin=safeChatId(u.message?.recipient?.chat_id ?? u.message?.chat_id ?? callback?.message?.recipient?.chat_id);

    if(origin===approvalChatId&&hour>=0&&hour<=23&&
       (minute===null||[0,15,30,45].includes(minute))&&
       (mode!=='e'||(
        !!rangeStart &&
        /^([01]\\d|2[0-3])[0-5]\\d$/.test(rangeStart)
       ))){
     const item=rows(await conn.execute(sql`
      SELECT id,status,max_message_id
      FROM max_order_drafts WHERE id=${id}
     `))[0];



     const keyboardMid=String(
      u.message?.body?.mid || callback?.message?.body?.mid || ''
     );
     const keyboard=keyboardMid?rows(await conn.execute(sql`
      SELECT message_id FROM max_time_selection_messages
      WHERE message_id=${keyboardMid}
        AND draft_id=${id}
        AND chat_id=${origin}
        AND created_by=${manager}
        AND expires_at>now()
      LIMIT 1
     `))[0]:null;

     if(item?.status==='pending'&&keyboard){
      const consumed=rows(await conn.execute(sql`
       DELETE FROM max_time_selection_messages
       WHERE message_id=${keyboardMid}
         AND draft_id=${id}
         AND chat_id=${origin}
         AND created_by=${manager}
         AND expires_at>now()
       RETURNING message_id
      `));
      if(!consumed.length)return void res.json({ok:true});
      if(minute===null){
       const choices=[0,15,30,45].map(m=>({
        type:'callback',
        text:String(hour).padStart(2,'0')+':'+String(m).padStart(2,'0'),
        payload:`migt:${mode}:${id}:${hourText}:${String(m).padStart(2,'0')}${rangeStart?':'+rangeStart:''}`
       }));
       await sendTimeKeyboard(id,origin,'🕒 Выберите минуты:',[choices]);
      }else{
       const chosen=hourText+':'+minuteText;

       if(mode==='r'){
        const hours=Array.from({length:24},(_,i)=>i);
        const buttons=[];
        for(let i=0;i<hours.length;i+=4){
         buttons.push(hours.slice(i,i+4).map(h=>({
          type:'callback',
          text:String(h).padStart(2,'0')+':xx',
          payload:`migt:e:${id}:${String(h).padStart(2,'0')}::${hourText}${minuteText}`
         })));
        }
        await sendTimeKeyboard(id,origin,'🕒 Начало: '+chosen+'. Выберите час окончания:',buttons);
       }else if(mode==='e'&&!rangeStart){
        await send(origin,'Не удалось определить начало периода. Выберите режим заново.');
       }else{
        const timeMode=mode==='b'?'before':mode==='a'?'after':'range';
        const start=mode==='e'
         ?rangeStart.slice(0,2)+':'+rangeStart.slice(2)
         :chosen;
        const end=chosen;

        if(mode==='e'&&start>=end){
         await send(origin,'⚠️ Окончание должно быть позже начала. Выберите период заново.');
        }else{
         const updated=rows(await conn.execute(sql`
          UPDATE max_order_drafts
          SET request_data=jsonb_set(
           jsonb_set(
            jsonb_set(request_data,'{timeMode}',to_jsonb(${timeMode}::text)),
            '{timeFrom}',to_jsonb(${mode==='a'||mode==='e'?start:'00:00'}::text)
           ),
           '{timeTo}',to_jsonb(${mode==='b'||mode==='e'?end:'23:59'}::text)
          ),updated_at=now()
          WHERE id=${id} AND status='pending'
          RETURNING id
         `));
         if(updated.length)await send(origin,'✅ Время заявки изменено: '+
          (mode==='b'?'до '+chosen:mode==='a'?'после '+chosen:'с '+start+' до '+end));
        }
       }
      }
     }
    }
   }
    if(match&&managerId){
     const id=Number(match[2]);const action=match[1];
     const item=rows(await conn.execute(sql`SELECT d.id,d.status,d.request_data,d.max_user_id,d.max_message_id,c.chat_id,c.client_id,c.enabled FROM max_order_drafts d JOIN max_client_chats c ON c.id=d.chat_binding_id WHERE d.id=${id}`))[0];
     const origin=safeChatId(u.message?.recipient?.chat_id ?? u.message?.chat_id ?? callback?.message?.recipient?.chat_id);
     const clickedMid=String(u.message?.body?.mid || callback?.message?.body?.mid || '');
     if(item?.status==='pending'&&origin===approvalChatId&&
      (['approve','reject','time'].includes(action)
       ? (!!clickedMid&&!!item.max_message_id&&String(item.max_message_id)===clickedMid)
       : !!clickedMid&&!!rows(await conn.execute(sql`
          DELETE FROM max_time_selection_messages
          WHERE message_id=${clickedMid}
            AND draft_id=${id}
            AND chat_id=${origin}
            AND created_by=${manager}
            AND expires_at>now()
          RETURNING message_id
         `)).length)){
      if(action==='time'){
    await sendTimeKeyboard(id,origin,'🕒 Выберите режим времени для заявки:',[
     [{type:'callback',text:'В течение дня',payload:`mig:day:${id}`}],
     [{type:'callback',text:'До указанного времени',payload:`mig:before:${id}`}],
     [{type:'callback',text:'После указанного времени',payload:`mig:after:${id}`}],
     [{type:'callback',text:'В период времени',payload:`mig:range:${id}`}]
    ]);
   }else if(action==='before'||action==='after'||action==='range'){
    const mode=action==='before'?'b':action==='after'?'a':'r';
    const hours=Array.from({length:16},(_,i)=>i+7);
    const buttons=[];
    for(let i=0;i<hours.length;i+=4){
     buttons.push(hours.slice(i,i+4).map(h=>({
      type:'callback',text:String(h).padStart(2,'0')+':xx',
      payload:`migt:${mode}:${id}:${String(h).padStart(2,'0')}`
     })));
    }
    await sendTimeKeyboard(id,origin,action==='range'?'🕒 Выберите час начала периода:':'🕒 Выберите час:',buttons);
   }else if(action==='day'){
    const updated=rows(await conn.execute(sql`
     UPDATE max_order_drafts
     SET request_data=jsonb_set(request_data,'{timeMode}',to_jsonb('day'::text)),
         updated_at=now()
     WHERE id=${id} AND status='pending'
     RETURNING id
    `));
    if(updated.length)await send(origin,'✅ Время заявки: в течение дня.');
   }else if(action==='reject'){
       const updated=rows(await conn.execute(sql`UPDATE max_order_drafts SET status='rejected',reviewed_by=${manager},reviewed_at=now(),updated_at=now() WHERE id=${id} AND status='pending' RETURNING id`));
       if(updated.length){
     await send(origin,`❌ Заявка отклонена менеджером.`);
     try{
      await send(String(item.chat_id),`❌ Ваша заявка отклонена менеджером.`);
     }catch(e){console.error('MAX client rejection notification failed',e)}
    }
      }else{
       let real:number|null=null;
       try {
        // The draft status, request insert and audit record commit atomically.
        // A callback replay or process crash cannot create a duplicate request.
        real=await conn.transaction(async(tx:any)=>{
         const locked=rows(await tx.execute(sql`SELECT id,status,request_data FROM max_order_drafts WHERE id=${id} FOR UPDATE`))[0];
         if(locked?.status!=='pending')return null;
         const newId=await createActual(tx,locked.request_data,Number(item.client_id),String(item.max_user_id),managerId);
         await tx.execute(sql`INSERT INTO "requestActivity"("requestId","actorType","actorId","action","note") VALUES (${newId},'manager',${managerId},'created',${'MAX draft #'+id+' approved by MAX user '+manager})`);
         await tx.execute(sql`UPDATE max_order_drafts SET status='approved',request_id=${newId},reviewed_by=${manager},reviewed_at=now(),updated_at=now() WHERE id=${id}`);
         return newId;
        });
       }catch(e){console.error('MAX atomic approve failed',e);try{await send(origin,`⚠️ Не удалось согласовать заявку. Обратитесь к менеджеру.`)}catch{} }
       if(real){
        let taskId:number|null=null;
        try{taskId=await syncTaskForRequestId(real)}
        catch(e){console.error('MAX task sync',e)}
        try {
          await sendNewRequestPush(real, taskId);
        } catch (e) {
          console.error("MAX push error", e);
        }
        broadcastLive('requests_changed',{requestId:real});
        broadcastLive('tasks_changed',{requestId:real});
        try{
         await send(origin,`✅ Заявка согласована и принята в работу.`);
         await send(String(item.chat_id),`✅ Ваша заявка согласована и принята в работу.`);
        }catch(e){console.error('MAX confirmation send failed',e)}
       }
      }
     }
    }
   }
   res.json({ok:true});
  }catch(e){console.error('MAX event',e);res.status(500).json({error:'Webhook error'})}
 });
}

// Follow-up notifications for courier status changes. Safe to retry on MAX errors.
let statusTimer:ReturnType<typeof setInterval>|null=null;
let statusBusy=false;
export function startMaxOrderStatusNotifier(){
 if(statusTimer)return;
 statusTimer=setInterval(async()=>{
  if(statusBusy||!token())return;
  statusBusy=true;
  try{
   const conn=await db.getDb();if(!conn)return;
   const list=rows(await conn.execute(sql`
     SELECT d.id,d.last_notified_status,r.status,c.chat_id
     FROM max_order_drafts d
     JOIN requests r ON r.id=d.request_id
     JOIN max_client_chats c ON c.id=d.chat_binding_id
     WHERE d.status='approved' AND d.request_id IS NOT NULL
       AND r.status <> 'pending'::request_status
       AND d.last_notified_status IS DISTINCT FROM r.status::text
     ORDER BY d.id LIMIT 30`));
   for(const item of list){
    const status=String(item.status);
    const title:Record<string,string>={assigned:'назначена курьеру',in_progress:'в работе',completed:'выполнена',cancelled:'отменена'};
    if(!title[status])continue;
    try{
     await send(String(item.chat_id),`📦 Заявка ${title[status]}.`);
     await conn.execute(sql`UPDATE max_order_drafts SET last_notified_status=${status},updated_at=now() WHERE id=${Number(item.id)} AND last_notified_status IS NOT DISTINCT FROM ${item.last_notified_status||null}`);
    }catch(e){console.error('MAX status notification',e)}
   }
  }catch(e){console.error('MAX status notifier',e)}finally{statusBusy=false}
 },60000);
 if (statusTimer && typeof statusTimer === 'object' && 'unref' in statusTimer) {
  (statusTimer as NodeJS.Timeout).unref();
 }
}
