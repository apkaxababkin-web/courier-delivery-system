import type { Express, Response } from "express";
import { sql } from "drizzle-orm";

import * as db from "../db";
import { broadcastLive } from "./liveEvents";
import { isExpoPushToken, sendExpoPush } from "./expoPush";

type ChatActorType = "manager" | "courier";

type ChatActor = {
  type: ChatActorType;
  id: number;
  name: string;
};

const CHAT_REACTION_EMOJIS = new Set(["✅", "❌", "⚠️", "🚀", "🎯", "💡", "📌", "📦", "⏳", "🛠️"]);

class ChatV2HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function resultRows<T = Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (Array.isArray((result as { rows?: unknown[] } | null)?.rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ChatV2HttpError(400, `${name} is invalid`);
  }
  return parsed;
}

function messageText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) throw new ChatV2HttpError(400, "Текст сообщения обязателен");
  if (text.length > 4000) throw new ChatV2HttpError(400, "Сообщение не может быть длиннее 4000 символов");
  return text;
}

function reactionEmoji(value: unknown): string {
  const emoji = String(value ?? "").trim();
  if (!CHAT_REACTION_EMOJIS.has(emoji)) {
    throw new ChatV2HttpError(400, "Недоступная реакция");
  }
  return emoji;
}

function directKey(left: Pick<ChatActor, "type" | "id">, right: Pick<ChatActor, "type" | "id">): string {
  return [`${left.type}:${left.id}`, `${right.type}:${right.id}`].sort().join("|");
}

async function actorFromResponse(res: Response): Promise<ChatActor> {
  const managerId = Number(res.locals.manager?.managerId || 0);
  if (managerId) {
    const manager = await db.getManagerById(managerId);
    if (!manager?.isActive) throw new ChatV2HttpError(403, "Аккаунт менеджера недоступен");
    return { type: "manager", id: manager.id, name: manager.name };
  }

  const courierId = Number(res.locals.courier?.courierId || 0);
  if (courierId) {
    const courier = await db.getCourierById(courierId);
    if (!courier?.isActive) throw new ChatV2HttpError(403, "Аккаунт курьера недоступен");
    return { type: "courier", id: courier.id, name: courier.name };
  }

  throw new ChatV2HttpError(401, "Требуется авторизация");
}

async function ensureGeneralMembership(conn: any, actor: ChatActor): Promise<number> {
  const conversations = resultRows<{ id: number }>(await conn.execute(sql`
    INSERT INTO "chatV2Conversations" ("kind", "title", "slug", "createdAt", "updatedAt")
    VALUES ('general', 'Общий чат', 'general', now(), now())
    ON CONFLICT ("slug") DO UPDATE SET "title" = EXCLUDED."title"
    RETURNING "id"
  `));
  const conversationId = Number(conversations[0]?.id || 0);
  if (!conversationId) throw new Error("General chat is unavailable");

  await conn.execute(sql`
    INSERT INTO "chatV2Participants" (
      "conversationId", "participantType", "participantId", "joinedAt"
    )
    VALUES (${conversationId}, ${actor.type}, ${actor.id}, now())
    ON CONFLICT ("conversationId", "participantType", "participantId") DO NOTHING
  `);

  return conversationId;
}

async function assertParticipant(conn: any, conversationId: number, actor: ChatActor): Promise<void> {
  const membership = resultRows(await conn.execute(sql`
    SELECT "id"
    FROM "chatV2Participants"
    WHERE "conversationId" = ${conversationId}
      AND "participantType" = ${actor.type}
      AND "participantId" = ${actor.id}
    LIMIT 1
  `));
  if (!membership[0]) throw new ChatV2HttpError(404, "Диалог не найден");
}

async function getTargetActor(type: ChatActorType, id: number): Promise<ChatActor> {
  if (type === "manager") {
    const manager = await db.getManagerById(id);
    if (!manager?.isActive) throw new ChatV2HttpError(404, "Менеджер не найден");
    return { type, id: manager.id, name: manager.name };
  }

  const courier = await db.getCourierById(id);
  if (!courier?.isActive) throw new ChatV2HttpError(404, "Курьер не найден");
  return { type, id: courier.id, name: courier.name };
}

function reactionSummary(actor: ChatActor) {
  return sql`COALESCE((
    SELECT json_agg(
      json_build_object(
        'emoji', reaction_group."emoji",
        'count', reaction_group."count",
        'reactedByMe', reaction_group."reactedByMe"
      )
      ORDER BY reaction_group."emoji"
    )
    FROM (
      SELECT
        reaction."emoji",
        count(*)::int AS "count",
        bool_or(
          reaction."participantType" = ${actor.type}
          AND reaction."participantId" = ${actor.id}
        ) AS "reactedByMe"
      FROM "chatV2MessageReactions" reaction
      WHERE reaction."messageId" = message."id"
      GROUP BY reaction."emoji"
    ) reaction_group
  ), '[]'::json)`;
}

async function loadMessage(conn: any, messageId: number, actor: ChatActor) {
  const rows = resultRows(await conn.execute(sql`
    SELECT
      message."id",
      message."conversationId",
      message."senderType",
      message."senderId",
      message."senderNameSnapshot" AS "senderName",
      message."clientMessageId",
      CASE WHEN message."deletedAt" IS NULL THEN message."text" ELSE '' END AS "text",
      message."replyToMessageId",
      message."editedAt",
      message."deletedAt",
      message."createdAt",
      message."updatedAt",
      (SELECT count(*)::int FROM "chatV2MessageReceipts" receipt
        WHERE receipt."messageId" = message."id" AND receipt."deliveredAt" IS NOT NULL) AS "deliveredCount",
      (SELECT count(*)::int FROM "chatV2MessageReceipts" receipt
        WHERE receipt."messageId" = message."id" AND receipt."readAt" IS NOT NULL) AS "readCount",
      ${reactionSummary(actor)} AS "reactions"
    FROM "chatV2Messages" message
    WHERE message."id" = ${messageId}
    LIMIT 1
  `));
  return rows[0] ?? null;
}

async function sendPushForMessage(conn: any, actor: ChatActor, conversationId: number, messageId: number, text: string) {
  try {
    const rows = resultRows<{ pushToken: string | null }>(await conn.execute(sql`
      SELECT courier."pushToken"
      FROM "chatV2Participants" participant
      INNER JOIN "couriers" courier
        ON participant."participantType" = 'courier'
       AND participant."participantId" = courier."id"
      WHERE participant."conversationId" = ${conversationId}
        AND courier."isActive" = true
        AND NOT (
          participant."participantType" = ${actor.type}
          AND participant."participantId" = ${actor.id}
        )
    `));

    const body = `${actor.name}: ${text}`.slice(0, 120);
    await Promise.allSettled(
      rows
        .map((row) => row.pushToken)
        .filter((pushToken): pushToken is string => isExpoPushToken(pushToken))
        .map((pushToken) => sendExpoPush(pushToken, "Чат МИГ", body, {
          type: "chat_message_v2",
          conversationId,
          messageId,
          url: `chat?conversationId=${conversationId}`,
        })),
    );
  } catch (error) {
    console.error("[chat.v2.push] failed", error);
  }
}

function sendRouteError(res: Response, error: unknown) {
  if (error instanceof ChatV2HttpError) {
    res.status(error.status).json({ error: { message: error.message } });
    return;
  }
  console.error("[chat.v2] failed", error);
  res.status(500).json({ error: { message: "Ошибка сервера чата" } });
}

/**
 * Temporary bridge used while the released clients still post to the legacy
 * endpoint. It can be removed after both clients exclusively use Chat V2.
 */
export async function mirrorLegacyChatMessageToV2(message: {
  id: number;
  senderType: ChatActorType;
  senderId: number;
  senderName: string;
  text: string;
  createdAt?: Date | string | null;
}) {
  try {
    const conn = await db.getDb();
    if (!conn) return;

    const conversations = resultRows<{ id: number }>(await conn.execute(sql`
      SELECT "id" FROM "chatV2Conversations" WHERE "slug" = 'general' LIMIT 1
    `));
    const conversationId = Number(conversations[0]?.id || 0);
    if (!conversationId) return;

    const inserted = resultRows<{ id: number }>(await conn.execute(sql`
      INSERT INTO "chatV2Messages" (
        "conversationId", "senderType", "senderId", "senderNameSnapshot", "text",
        "legacySource", "legacySourceId", "createdAt", "updatedAt"
      )
      VALUES (
        ${conversationId}, ${message.senderType}, ${message.senderId}, ${message.senderName}, ${message.text},
        'managerChatMessages', ${message.id}, ${message.createdAt || new Date()}, ${message.createdAt || new Date()}
      )
      ON CONFLICT ("legacySource", "legacySourceId") DO NOTHING
      RETURNING "id"
    `));
    const messageId = Number(inserted[0]?.id || 0);
    if (!messageId) return;

    await conn.transaction(async (tx: any) => {
      await tx.execute(sql`
        INSERT INTO "chatV2MessageReceipts" (
          "messageId", "conversationId", "participantType", "participantId", "createdAt"
        )
        SELECT ${messageId}, ${conversationId}, participant."participantType", participant."participantId", now()
        FROM "chatV2Participants" participant
        WHERE participant."conversationId" = ${conversationId}
          AND NOT (
            participant."participantType" = ${message.senderType}
            AND participant."participantId" = ${message.senderId}
          )
        ON CONFLICT ("messageId", "participantType", "participantId") DO NOTHING
      `);
      await tx.execute(sql`
        UPDATE "chatV2Conversations"
        SET "updatedAt" = GREATEST("updatedAt", ${message.createdAt || new Date()})
        WHERE "id" = ${conversationId}
      `);
    });

    broadcastLive("chat_v2_changed");
  } catch (error: any) {
    // During a rolling deploy the application may start before migration 0002.
    // Legacy chat must continue to work in that short window.
    if (error?.code === "42P01") return;
    console.error("[chat.v2.legacy-mirror] failed", error);
  }
}

export function registerChatV2Routes(app: Express) {
  app.get("/api/chat/v2/contacts", async (_req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const managers = actor.type === "courier"
        ? resultRows(await conn.execute(sql`
            SELECT "id", "name", 'manager'::text AS "type"
            FROM "managers"
            WHERE "isActive" = true
            ORDER BY "name", "id"
          `))
        : [];

      const couriers = resultRows(await conn.execute(sql`
        SELECT "id", "name", 'courier'::text AS "type"
        FROM "couriers"
        WHERE "isActive" = true
          AND NOT (${actor.type} = 'courier' AND "id" = ${actor.id})
        ORDER BY "name", "id"
      `));

      res.json({ me: actor, managers, couriers });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/chat/v2/conversations", async (_req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      await ensureGeneralMembership(conn, actor);

      const conversations = resultRows(await conn.execute(sql`
        SELECT
          conversation."id",
          conversation."kind",
          CASE
            WHEN conversation."kind" = 'direct' THEN COALESCE((
              SELECT COALESCE(manager."name", courier."name")
              FROM "chatV2Participants" other
              LEFT JOIN "managers" manager
                ON other."participantType" = 'manager' AND other."participantId" = manager."id"
              LEFT JOIN "couriers" courier
                ON other."participantType" = 'courier' AND other."participantId" = courier."id"
              WHERE other."conversationId" = conversation."id"
                AND NOT (other."participantType" = ${actor.type} AND other."participantId" = ${actor.id})
              LIMIT 1
            ), conversation."title")
            ELSE conversation."title"
          END AS "title",
          conversation."slug",
          conversation."updatedAt",
          participant."lastReadMessageId",
          participant."lastReadAt",
          last_message."id" AS "lastMessageId",
          last_message."senderNameSnapshot" AS "lastMessageSenderName",
          CASE WHEN last_message."deletedAt" IS NULL THEN last_message."text" ELSE '' END AS "lastMessageText",
          last_message."createdAt" AS "lastMessageAt",
          (
            SELECT count(*)::int
            FROM "chatV2Messages" unread
            WHERE unread."conversationId" = conversation."id"
              AND unread."deletedAt" IS NULL
              AND unread."id" > COALESCE(participant."lastReadMessageId", 0)
              AND NOT (unread."senderType" = ${actor.type} AND unread."senderId" = ${actor.id})
          ) AS "unreadCount"
        FROM "chatV2Participants" participant
        INNER JOIN "chatV2Conversations" conversation ON conversation."id" = participant."conversationId"
        LEFT JOIN LATERAL (
          SELECT message.*
          FROM "chatV2Messages" message
          WHERE message."conversationId" = conversation."id"
          ORDER BY message."id" DESC
          LIMIT 1
        ) last_message ON true
        WHERE participant."participantType" = ${actor.type}
          AND participant."participantId" = ${actor.id}
        ORDER BY COALESCE(last_message."createdAt", conversation."updatedAt") DESC, conversation."id" DESC
      `));

      res.json(conversations);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/chat/v2/conversations/direct", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const targetType = String(req.body?.targetType || "") as ChatActorType;
      if (targetType !== "manager" && targetType !== "courier") {
        throw new ChatV2HttpError(400, "Неверный тип собеседника");
      }
      const targetId = positiveInteger(req.body?.targetId, "targetId");
      if (targetType === actor.type && targetId === actor.id) {
        throw new ChatV2HttpError(400, "Нельзя создать диалог с самим собой");
      }
      if (actor.type === "manager" && targetType !== "courier") {
        throw new ChatV2HttpError(403, "Менеджер может открыть личный диалог только с курьером");
      }

      const target = await getTargetActor(targetType, targetId);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      const key = directKey(actor, target);

      const conversationId = await conn.transaction(async (tx: any) => {
        const conversations = resultRows<{ id: number }>(await tx.execute(sql`
          INSERT INTO "chatV2Conversations" (
            "kind", "title", "directKey", "createdByType", "createdById", "createdAt", "updatedAt"
          )
          VALUES ('direct', 'Личный чат', ${key}, ${actor.type}, ${actor.id}, now(), now())
          ON CONFLICT ("directKey") DO UPDATE SET "directKey" = EXCLUDED."directKey"
          RETURNING "id"
        `));
        const id = Number(conversations[0]?.id || 0);
        if (!id) throw new Error("Failed to create direct conversation");

        await tx.execute(sql`
          INSERT INTO "chatV2Participants" ("conversationId", "participantType", "participantId", "joinedAt")
          VALUES
            (${id}, ${actor.type}, ${actor.id}, now()),
            (${id}, ${target.type}, ${target.id}, now())
          ON CONFLICT ("conversationId", "participantType", "participantId") DO NOTHING
        `);
        return id;
      });

      res.json({ id: conversationId, created: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get("/api/chat/v2/conversations/:conversationId/messages", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const conversationId = positiveInteger(req.params.conversationId, "conversationId");
      const before = req.query.before == null ? null : positiveInteger(req.query.before, "before");
      const rawLimit = Number(req.query.limit || 50);
      const limit = Math.min(Math.max(Number.isInteger(rawLimit) ? rawLimit : 50, 1), 100);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      await assertParticipant(conn, conversationId, actor);

      const messages = resultRows<{ id: number }>(await conn.execute(sql`
        SELECT * FROM (
          SELECT
            message."id",
            message."conversationId",
            message."senderType",
            message."senderId",
            message."senderNameSnapshot" AS "senderName",
            message."clientMessageId",
            CASE WHEN message."deletedAt" IS NULL THEN message."text" ELSE '' END AS "text",
            message."replyToMessageId",
            message."editedAt",
            message."deletedAt",
            message."createdAt",
            message."updatedAt",
            (SELECT count(*)::int FROM "chatV2MessageReceipts" receipt
              WHERE receipt."messageId" = message."id" AND receipt."deliveredAt" IS NOT NULL) AS "deliveredCount",
            (SELECT count(*)::int FROM "chatV2MessageReceipts" receipt
              WHERE receipt."messageId" = message."id" AND receipt."readAt" IS NOT NULL) AS "readCount",
            ${reactionSummary(actor)} AS "reactions"
          FROM "chatV2Messages" message
          WHERE message."conversationId" = ${conversationId}
            AND (${before}::integer IS NULL OR message."id" < ${before})
          ORDER BY message."id" DESC
          LIMIT ${limit}
        ) page
        ORDER BY page."id" ASC
      `));

      const messageIds = messages.map((message) => Number(message.id)).filter(Boolean);
      if (messageIds.length > 0) {
        await conn.execute(sql`
          UPDATE "chatV2MessageReceipts"
          SET "deliveredAt" = COALESCE("deliveredAt", now())
          WHERE "participantType" = ${actor.type}
            AND "participantId" = ${actor.id}
            AND "messageId" IN (${sql.join(messageIds.map((id) => sql`${id}`), sql`, `)})
        `);
      }

      res.json({
        messages,
        nextCursor: messages.length === limit ? messages[0]?.id ?? null : null,
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/chat/v2/conversations/:conversationId/messages", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const conversationId = positiveInteger(req.params.conversationId, "conversationId");
      const text = messageText(req.body?.text);
      const clientMessageId = String(req.body?.clientMessageId || "").trim();
      if (!/^[A-Za-z0-9:_-]{8,80}$/.test(clientMessageId)) {
        throw new ChatV2HttpError(400, "clientMessageId is invalid");
      }
      const replyToMessageId = req.body?.replyToMessageId == null
        ? null
        : positiveInteger(req.body.replyToMessageId, "replyToMessageId");
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      await assertParticipant(conn, conversationId, actor);

      if (replyToMessageId) {
        const reply = resultRows(await conn.execute(sql`
          SELECT "id" FROM "chatV2Messages"
          WHERE "id" = ${replyToMessageId} AND "conversationId" = ${conversationId}
          LIMIT 1
        `));
        if (!reply[0]) throw new ChatV2HttpError(400, "Сообщение для ответа не найдено");
      }

      const result = await conn.transaction(async (tx: any) => {
        const inserted = resultRows<{ id: number }>(await tx.execute(sql`
          INSERT INTO "chatV2Messages" (
            "conversationId", "senderType", "senderId", "senderNameSnapshot",
            "clientMessageId", "text", "replyToMessageId", "createdAt", "updatedAt"
          )
          VALUES (
            ${conversationId}, ${actor.type}, ${actor.id}, ${actor.name},
            ${clientMessageId}, ${text}, ${replyToMessageId}, now(), now()
          )
          ON CONFLICT ("senderType", "senderId", "clientMessageId") DO NOTHING
          RETURNING "id"
        `));

        let messageId = Number(inserted[0]?.id || 0);
        const isNew = messageId > 0;
        if (!messageId) {
          const existing = resultRows<{ id: number; conversationId: number }>(await tx.execute(sql`
            SELECT "id", "conversationId"
            FROM "chatV2Messages"
            WHERE "senderType" = ${actor.type}
              AND "senderId" = ${actor.id}
              AND "clientMessageId" = ${clientMessageId}
            LIMIT 1
          `));
          messageId = Number(existing[0]?.id || 0);
          if (!messageId || Number(existing[0]?.conversationId) !== conversationId) {
            throw new ChatV2HttpError(409, "Конфликт идентификатора сообщения");
          }
        }

        if (isNew) {
          await tx.execute(sql`
            INSERT INTO "chatV2MessageReceipts" (
              "messageId", "conversationId", "participantType", "participantId", "createdAt"
            )
            SELECT ${messageId}, ${conversationId}, participant."participantType", participant."participantId", now()
            FROM "chatV2Participants" participant
            WHERE participant."conversationId" = ${conversationId}
              AND NOT (
                participant."participantType" = ${actor.type}
                AND participant."participantId" = ${actor.id}
              )
            ON CONFLICT ("messageId", "participantType", "participantId") DO NOTHING
          `);
          await tx.execute(sql`
            UPDATE "chatV2Conversations" SET "updatedAt" = now() WHERE "id" = ${conversationId}
          `);
        }

        return { messageId, isNew };
      });

      const message = await loadMessage(conn, result.messageId, actor);
      if (result.isNew) {
        broadcastLive("chat_v2_changed");
        void sendPushForMessage(conn, actor, conversationId, result.messageId, text);
      }
      res.json(message);
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/chat/v2/conversations/:conversationId/read", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const conversationId = positiveInteger(req.params.conversationId, "conversationId");
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");
      await assertParticipant(conn, conversationId, actor);

      const rows = resultRows<{ id: number }>(await conn.execute(sql`
        SELECT COALESCE(max("id"), 0)::int AS "id"
        FROM "chatV2Messages"
        WHERE "conversationId" = ${conversationId}
      `));
      const lastReadMessageId = Number(rows[0]?.id || 0);

      await conn.transaction(async (tx: any) => {
        await tx.execute(sql`
          UPDATE "chatV2Participants"
          SET "lastReadMessageId" = ${lastReadMessageId}, "lastReadAt" = now()
          WHERE "conversationId" = ${conversationId}
            AND "participantType" = ${actor.type}
            AND "participantId" = ${actor.id}
        `);
        await tx.execute(sql`
          UPDATE "chatV2MessageReceipts"
          SET "deliveredAt" = COALESCE("deliveredAt", now()), "readAt" = COALESCE("readAt", now())
          WHERE "conversationId" = ${conversationId}
            AND "participantType" = ${actor.type}
            AND "participantId" = ${actor.id}
            AND "messageId" <= ${lastReadMessageId}
        `);
      });

      broadcastLive("chat_v2_read");
      res.json({ success: true, lastReadMessageId });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post("/api/chat/v2/messages/:messageId/reactions", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const messageId = positiveInteger(req.params.messageId, "messageId");
      const emoji = reactionEmoji(req.body?.emoji);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const rows = resultRows<{ conversationId: number; deletedAt: Date | null }>(await conn.execute(sql`
        SELECT "conversationId", "deletedAt"
        FROM "chatV2Messages"
        WHERE "id" = ${messageId}
        LIMIT 1
      `));
      const conversationId = Number(rows[0]?.conversationId || 0);
      if (!conversationId || rows[0]?.deletedAt) {
        throw new ChatV2HttpError(404, "Сообщение не найдено");
      }
      await assertParticipant(conn, conversationId, actor);

      await conn.transaction(async (tx: any) => {
        const removed = resultRows(await tx.execute(sql`
          DELETE FROM "chatV2MessageReactions"
          WHERE "messageId" = ${messageId}
            AND "participantType" = ${actor.type}
            AND "participantId" = ${actor.id}
            AND "emoji" = ${emoji}
          RETURNING "id"
        `));
        if (removed[0]) return;

        await tx.execute(sql`
          INSERT INTO "chatV2MessageReactions" (
            "messageId", "conversationId", "participantType", "participantId", "emoji", "createdAt"
          )
          VALUES (${messageId}, ${conversationId}, ${actor.type}, ${actor.id}, ${emoji}, now())
          ON CONFLICT ("messageId", "participantType", "participantId")
          DO UPDATE SET "emoji" = EXCLUDED."emoji", "createdAt" = now()
        `);
      });

      broadcastLive("chat_v2_changed");
      res.json(await loadMessage(conn, messageId, actor));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.patch("/api/chat/v2/messages/:messageId", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const messageId = positiveInteger(req.params.messageId, "messageId");
      const text = messageText(req.body?.text);
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const updated = resultRows(await conn.execute(sql`
        UPDATE "chatV2Messages"
        SET "text" = ${text}, "editedAt" = now(), "updatedAt" = now()
        WHERE "id" = ${messageId}
          AND "senderType" = ${actor.type}
          AND "senderId" = ${actor.id}
          AND "deletedAt" IS NULL
        RETURNING "id"
      `));
      if (!updated[0]) throw new ChatV2HttpError(404, "Сообщение не найдено");

      broadcastLive("chat_v2_changed");
      res.json(await loadMessage(conn, messageId, actor));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.delete("/api/chat/v2/messages/:messageId", async (req, res) => {
    try {
      const actor = await actorFromResponse(res);
      const messageId = positiveInteger(req.params.messageId, "messageId");
      const conn = await db.getDb();
      if (!conn) throw new Error("Database not available");

      const deleted = resultRows(await conn.execute(sql`
        UPDATE "chatV2Messages"
        SET "deletedAt" = now(), "updatedAt" = now()
        WHERE "id" = ${messageId}
          AND "senderType" = ${actor.type}
          AND "senderId" = ${actor.id}
          AND "deletedAt" IS NULL
        RETURNING "id"
      `));
      if (!deleted[0]) throw new ChatV2HttpError(404, "Сообщение не найдено");

      broadcastLive("chat_v2_changed");
      res.json({ success: true });
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}
