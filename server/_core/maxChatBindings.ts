import type { Express } from "express";
import { sql } from "drizzle-orm";
import * as db from "../db";
import { announceChat } from "./maxIntegration";

// Manager routes: the existing managerApiAuthGate must protect this namespace.
// A chat invitation link is NOT proof of chat identity or bot membership.
export function registerMaxChatBindingRoutes(app: Express) {
  app.get("/api/manager/clients/:clientId/max-chats", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const clientId = Number(req.params.clientId);
    if (!Number.isSafeInteger(clientId) || clientId < 1) return void res.status(400).json({ error: "Invalid client" });
    try {
      const conn = await db.getDb();
      if (!conn) return void res.status(503).json({ error: "Database unavailable" });
      const rows = await conn.execute(sql`SELECT id, invite_url AS "inviteUrl", chat_id AS "chatId", enabled, verified_at AS "verifiedAt", created_at AS "createdAt" FROM max_client_chats WHERE client_id = ${clientId} ORDER BY id DESC`);
      res.json(Array.isArray(rows) ? rows : rows.rows ?? []);
    } catch (error) { console.error("MAX chats list:", error); res.status(500).json({ error: "Unable to load MAX chats; check migration" }); }
  });

  app.post("/api/manager/clients/:clientId/max-chats", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const clientId = Number(req.params.clientId);
    const inviteUrl = String(req.body?.inviteUrl ?? "").trim();
    if (!Number.isSafeInteger(clientId) || clientId < 1 || inviteUrl.length > 1000 || !/^https:\/\/(?:[a-z0-9-]+\.)?max\.ru\//i.test(inviteUrl)) {
      return void res.status(400).json({ error: "Укажите корректную ссылку MAX" });
    }
    try {
      const conn = await db.getDb();
      if (!conn) return void res.status(503).json({ error: "Database unavailable" });
      const found = await conn.execute(sql`SELECT id FROM clients WHERE id = ${clientId}`);
      if (!(Array.isArray(found) ? found : found.rows ?? []).length) return void res.status(404).json({ error: "Клиент не найден" });
      // Always pending and disabled. Never trust a supplied chatId or enabled flag.
      const rows = await conn.execute(sql`INSERT INTO max_client_chats (client_id, invite_url) VALUES (${clientId}, ${inviteUrl}) RETURNING id`);
      const row = (Array.isArray(rows) ? rows : rows.rows ?? [])[0];
      res.status(201).json({ id: row.id, enabled: false, verifiedAt: null, status: "pending" });
    } catch (error) { console.error("MAX chat add:", error); res.status(500).json({ error: "Unable to add MAX chat" }); }
  });

  app.patch("/api/manager/clients/:clientId/max-chats/:id", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const clientId = Number(req.params.clientId), id = Number(req.params.id);
    if (![clientId, id].every(n => Number.isSafeInteger(n) && n > 0) || typeof req.body?.enabled !== "boolean") return void res.status(400).json({ error: "Invalid input" });
    try {
      const conn = await db.getDb();
      if (!conn) return void res.status(503).json({ error: "Database unavailable" });
      // Enabling is impossible until a trusted bot-side verification sets chat_id and verified_at.
      const rows = await conn.execute(sql`UPDATE max_client_chats SET enabled = ${req.body.enabled}, updated_at = now() WHERE id = ${id} AND client_id = ${clientId} AND (${req.body.enabled} = false OR (chat_id IS NOT NULL AND verified_at IS NOT NULL)) RETURNING id, enabled`);
      const row = (Array.isArray(rows) ? rows : rows.rows ?? [])[0];
      if (!row) return void res.status(409).json({ error: "Чат ещё не подтверждён ботом MAX или не найден" });
      if (req.body.enabled) {
        try { await announceChat(String(((r:any)=>Array.isArray(r)?r[0]?.chat_id:r.rows?.[0]?.chat_id)(await conn.execute(sql`SELECT chat_id FROM max_client_chats WHERE id=${id}`)) || ''),id); }
        catch(e) { console.error('MAX announcement failed',e); await conn.execute(sql`UPDATE max_client_chats SET enabled=FALSE,updated_at=now() WHERE id=${id} AND client_id=${clientId}`); return void res.status(502).json({error:'MAX не принял сообщение. Доступ не включён.'}); }
      }
      res.json(row);
    } catch (error) { console.error("MAX chat toggle:", error); res.status(500).json({ error: "Unable to update MAX chat" }); }
  });
}
