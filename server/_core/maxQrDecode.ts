import type { Express, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import multer from 'multer';

const MAX_BYTES=5*1024*1024;
const hits=new Map<string,{count:number,reset:number}>();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1},fileFilter:(_req,file,cb)=>cb(null,['image/png','image/jpeg','image/webp'].includes(file.mimetype))}).single('qr');

export function verifyMaxInitData(raw:string,token:string): boolean {
  if (!token || !raw || raw.length>16000) return false;
  const pairs=new URLSearchParams(raw);
  const seen=new Set<string>();
  for (const [key] of pairs){if(seen.has(key))return false;seen.add(key);}
  if (!seen.has('hash') || !seen.has('auth_date') || !seen.has('user'))return false;
  const received=pairs.get('hash')||'';
  if (!/^[0-9a-f]{64}$/i.test(received))return false;
  const when=Number(pairs.get('auth_date'));
  const now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(when) || when>now+60 || now-when>3600)return false;
  const content=[...pairs.entries()].filter(([k])=>k!=='hash').sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const calculated=createHmac('sha256',secret).update(content).digest();
  const actual=Buffer.from(received,'hex');
  return actual.length===calculated.length && timingSafeEqual(actual,calculated);
}

export function registerMaxQrDecodeRoutes(app:Express){
  app.post('/api/max/qr/decode',async(req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store');
    const ip=String(req.ip||req.socket.remoteAddress||'unknown');
    const now=Date.now();
    if(hits.size>10000)hits.clear();
    let record=hits.get(ip);
    if(!record||record.reset<now){record={count:0,reset:now+60000};hits.set(ip,record);}
    if(++record.count>15){res.status(429).json({ok:false,error:'Слишком много запросов. Повторите через минуту.'});return;}
    const init=String(req.get('X-Max-Init-Data')||'');
    if(!verifyMaxInitData(init,process.env.MAX_BOT_TOKEN||'')){res.status(401).json({ok:false,error:'Откройте форму из MAX заново для проверки доступа.'});return;}
    try{const {verifyMaxChatAccess}=await import('./maxIntegration');if(!await verifyMaxChatAccess(req)){res.status(403).json({ok:false,error:'Чат MAX не подключён'});return;}}catch{res.status(403).json({ok:false,error:'Проверка доступа не удалась'});return;}
    if(!req.is('multipart/form-data')){res.status(415).json({ok:false,error:'Ожидается изображение QR'});return;}
    upload(req,res,async err=>{
      if(err){res.status(413).json({ok:false,error:'Некорректный файл или размер более 5 МБ'});return;}
      if(!req.file){res.status(400).json({ok:false,error:'Прикрепите PNG, JPG или WebP'});return;}
      try{
        const image=sharp(req.file.buffer,{limitInputPixels:16000000,failOn:'error'});
        const meta=await image.metadata();
        if(!['png','jpeg','webp'].includes(meta.format||''))throw new Error('INVALID_FORMAT');
        const {data,info}=await image.resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const code=jsQR(new Uint8ClampedArray(data),info.width,info.height,{inversionAttempts:'attemptBoth'});
        if(!code?.data){res.status(422).json({ok:false,error:'На изображении не найден читаемый QR'});return;}
        if(code.data.length>4096){res.status(422).json({ok:false,error:'QR содержит слишком много данных'});return;}
        res.json({ok:true,payload:code.data});
      }catch{res.status(422).json({ok:false,error:'Не удалось обработать QR-код'});}
    });
  });
}
