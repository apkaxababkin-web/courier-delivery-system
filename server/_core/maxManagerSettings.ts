import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import * as db from '../db';

const rows = (r:any):any[] => Array.isArray(r) ? r : (r?.rows || []);
const validUser = (v:any) => typeof v==='string' && /^\d{1,20}$/.test(v);
const validId = (v:any) => Number.isSafeInteger(Number(v)) && Number(v)>0;

/** Manager authentication is handled by managerApiAuthGate.
 * MAX permission administration is additionally restricted to the active
 * administrator account, never merely any authenticated manager.
 */
async function requireMaxAdmin(req:any,res:any,next:any) {
  try {
    const managerId = Number(res.locals.manager?.managerId);
    if (!Number.isSafeInteger(managerId) || managerId < 1) return void res.sendStatus(403);
    const conn = await db.getDb();
    if (!conn) return void res.sendStatus(503);
    const admin = rows(await conn.execute(sql`SELECT id FROM managers WHERE id=${managerId} AND username='admin' AND "isActive"=TRUE LIMIT 1`));
    if (!admin.length) return void res.status(403).json({error:'Только администратор может управлять доступом MAX'});
    next();
  } catch (error) { console.error('MAX admin authorization',error); res.sendStatus(500); }
}
export function registerMaxManagerSettingsRoutes(app:Express) {
  app.use('/api/manager/max/managers',requireMaxAdmin);
  app.get('/api/manager/max/managers', async (_req,res)=>{
    try {
      const conn=await db.getDb(); if(!conn)return void res.sendStatus(503);
      const managers=rows(await conn.execute(sql`SELECT id,name,username FROM managers WHERE "isActive"=TRUE ORDER BY name`));
      const links=rows(await conn.execute(sql`SELECT l.max_user_id AS "maxUserId", l.manager_id AS "managerId",l.enabled,l.can_approve AS "canApprove",m.name AS "managerName" FROM max_manager_links l JOIN managers m ON m.id=l.manager_id ORDER BY l.max_user_id`));
      res.json({managers,links});
    }catch(e){console.error('MAX managers list',e);res.sendStatus(500)}
  });
  app.put('/api/manager/max/managers/:maxUserId',async(req,res)=>{
    const maxUserId=String(req.params.maxUserId);
    const managerId=Number(req.body?.managerId);
    const enabled=req.body?.enabled;
    const canApprove=req.body?.canApprove;
    if(!validUser(maxUserId)||!validId(managerId)||typeof enabled!=='boolean'||typeof canApprove!=='boolean')return void res.status(400).json({error:'Некорректные параметры'});
    try{
      const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
      const result=rows(await conn.execute(sql`INSERT INTO max_manager_links(max_user_id,manager_id,enabled,can_approve,updated_at)
        SELECT ${maxUserId},m.id,${enabled},${canApprove},now() FROM managers m WHERE m.id=${managerId} AND m."isActive"=TRUE
        ON CONFLICT(max_user_id) DO UPDATE SET manager_id=excluded.manager_id,enabled=excluded.enabled,can_approve=excluded.can_approve,updated_at=now()
        RETURNING max_user_id AS "maxUserId",manager_id AS "managerId",enabled,can_approve AS "canApprove"`));
      if(!result.length)return void res.status(404).json({error:'Активный менеджер не найден'});
      res.json(result[0]);
    }catch(e){console.error('MAX manager save',e);res.sendStatus(500)}
  });
  app.delete('/api/manager/max/managers/:maxUserId',async(req,res)=>{
    const maxUserId=String(req.params.maxUserId);
    if(!validUser(maxUserId))return void res.sendStatus(400);
    try{
      const conn=await db.getDb();if(!conn)return void res.sendStatus(503);
      await conn.execute(sql`UPDATE max_manager_links SET enabled=FALSE,can_approve=FALSE,updated_at=now() WHERE max_user_id=${maxUserId}`);
      res.json({ok:true});
    }catch(e){console.error('MAX manager revoke',e);res.sendStatus(500)}
  });
}
