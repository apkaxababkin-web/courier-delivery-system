import { sql } from "drizzle-orm";
import * as db from "../db";

const rows = (result: any): any[] =>
  Array.isArray(result) ? result : result?.rows || [];

export type MaxNotificationEvent =
  | "approved"
  | "rejected"
  | "places"
  | "completed"
  | "cancelled";

export const MAX_NOTIFICATION_DELAY_MS = 300_000;

export function maxNotificationText(
  draftId: number,
  event: MaxNotificationEvent,
  places?: number,
): string {
  switch (event) {
    case "approved":
      return `✅ Заявка №${draftId} принята в работу.`;
    case "rejected":
      return `❌ Заявка №${draftId} отклонена.`;
    case "places":
      const count = Number(places);
      const lastTwo = count % 100;
      const lastOne = count % 10;
      const word =
        lastTwo >= 11 && lastTwo <= 14 ? "мест" :
        lastOne === 1 ? "место" :
        lastOne >= 2 && lastOne <= 4 ? "места" : "мест";
      return `📦 Заявка №${draftId}: курьер забрал ${count} ${word}.`;
    case "completed":
      return `✅ Заявка №${draftId} выполнена.`;
    case "cancelled":
      return `❌ Заявка №${draftId} отменена.`;
  }
}

export async function queueMaxNotification(
  draftId: number,
  event: MaxNotificationEvent,
  places?: number,
): Promise<void> {
  if (!Number.isSafeInteger(draftId) || draftId < 1) {
    throw new Error("Invalid MAX draft ID");
  }

  if (event === "places" &&
      (!Number.isSafeInteger(places) || Number(places) < 1)) {
    throw new Error("Invalid places count");
  }

  const conn = await db.getDb();
  if (!conn) throw new Error("Database unavailable");

  const message = maxNotificationText(draftId, event, places);

  await conn.execute(sql`
    INSERT INTO max_delayed_notifications
      (draft_id, event_type, message, due_at, status)
    VALUES
      (${draftId}, ${event}, ${message},
       now() + interval '5 minutes', 'pending')
    ON CONFLICT (draft_id, event_type)
      WHERE status = 'pending'
    DO UPDATE SET
      message = EXCLUDED.message,
      due_at = now() + interval '5 minutes',
      updated_at = now()
  `);
}

export async function queueMaxNotificationByRequest(
  requestId: number,
  event: MaxNotificationEvent,
  places?: number,
): Promise<void> {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database unavailable");

  const drafts = rows(await conn.execute(sql`
    SELECT id
    FROM max_order_drafts
    WHERE request_id = ${requestId}
      AND status = 'approved'
    LIMIT 1
  `));

  if (!drafts.length) return;

  await queueMaxNotification(Number(drafts[0].id), event, places);
}


let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerBusy = false;

type MaxSender = (chatId: string, message: string) => Promise<unknown>;

export async function processMaxDelayedNotifications(
  send: MaxSender,
  testConnection?: Awaited<ReturnType<typeof db.getDb>>,
): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;

    try {
      const conn = testConnection ?? await db.getDb();
      if (!conn) return;

      await conn.execute(sql`
        UPDATE max_delayed_notifications
        SET status = CASE
              WHEN EXISTS (
                SELECT 1 FROM max_delayed_notifications newer
                WHERE newer.draft_id = max_delayed_notifications.draft_id
                  AND newer.event_type = max_delayed_notifications.event_type
                  AND newer.status = 'pending'
                  AND newer.id <> max_delayed_notifications.id
              ) THEN 'cancelled'
              WHEN attempts >= 10 THEN 'failed'
              ELSE 'pending'
            END,
            due_at = now(),
            updated_at = now()
        WHERE status = 'sending'
          AND updated_at < now() - interval '5 minutes'
      `);

      const pending = rows(await conn.execute(sql`
        SELECT n.id
        FROM max_delayed_notifications n
        WHERE n.status = 'pending'
          AND n.due_at <= now()
        ORDER BY n.due_at, n.id
        LIMIT 20
      `));

      for (const item of pending) {
        const notificationId = Number(item.id);

        const claimed = rows(await conn.execute(sql`
          UPDATE max_delayed_notifications
          SET status = 'sending',
              attempts = attempts + 1,
              updated_at = now()
          WHERE id = ${notificationId}
            AND status = 'pending'
            AND due_at <= now()
          RETURNING draft_id, event_type, message
        `))[0];

        if (!claimed) continue;

        try {
          const draftId = Number(claimed.draft_id);
          const event = String(claimed.event_type);

          const current = rows(await conn.execute(sql`
            SELECT
              d.status AS draft_status,
              r.status::text AS request_status,
              r."placesCount" AS places_count,
              c.chat_id,
              c.enabled
            FROM max_order_drafts d
            JOIN max_client_chats c ON c.id = d.chat_binding_id
            LEFT JOIN requests r ON r.id = d.request_id
            WHERE d.id = ${draftId}
            LIMIT 1
          `))[0];

          let valid = Boolean(current?.enabled && current?.chat_id);

          if (event === "approved") {
            valid = valid && current.draft_status === "approved"
              && !["completed", "cancelled"].includes(current.request_status);
          } else if (event === "rejected") {
            valid = valid && current.draft_status === "rejected";
          } else if (event === "completed" || event === "cancelled") {
            valid = valid && current.draft_status === "approved"
              && current.request_status === event;
          } else if (event === "places") {
            valid = valid && current.draft_status === "approved"
              && !["cancelled"].includes(current.request_status);
          }

          if (!valid) {
            await conn.execute(sql`
              UPDATE max_delayed_notifications
              SET status = 'cancelled', updated_at = now()
              WHERE id = ${notificationId} AND status = 'sending'
            `);
            continue;
          }

          let message = String(claimed.message);

          if (event === "places") {
            const count = Number(current.places_count);
            if (!Number.isSafeInteger(count) || count < 1) {
              await conn.execute(sql`
                UPDATE max_delayed_notifications
                SET status = 'cancelled', updated_at = now()
                WHERE id = ${notificationId} AND status = 'sending'
              `);
              continue;
            }
            message = maxNotificationText(draftId, "places", count);
          }

          // Recheck the notification immediately before delivery.
          // A correction queued during processing must supersede it.
          const latest = rows(await conn.execute(sql`
            SELECT
              n.id,
              n.status,
              n.due_at,
              EXISTS (
                SELECT 1
                FROM max_delayed_notifications newer
                WHERE newer.draft_id = n.draft_id
                  AND newer.event_type = n.event_type
                  AND newer.status = 'pending'
                  AND newer.id <> n.id
              ) AS superseded
            FROM max_delayed_notifications n
            WHERE n.id = ${notificationId}
            LIMIT 1
          `))[0];

          if (!latest ||
              latest.status !== 'sending' ||
              latest.superseded) {
            await conn.execute(sql`
              UPDATE max_delayed_notifications
              SET status = 'cancelled', updated_at = now()
              WHERE id = ${notificationId} AND status = 'sending'
            `);
            continue;
          }

          await send(String(current.chat_id), message);

          await conn.execute(sql`
            UPDATE max_delayed_notifications
            SET status = 'sent',
                message = ${message},
                sent_at = now(),
                updated_at = now()
            WHERE id = ${notificationId} AND status = 'sending'
          `);
        } catch (error) {
          console.error("MAX delayed notification delivery failed", error);

          await conn.execute(sql`
            UPDATE max_delayed_notifications AS n
            SET status = CASE
                  WHEN EXISTS (
                    SELECT 1 FROM max_delayed_notifications newer
                    WHERE newer.draft_id = n.draft_id
                      AND newer.event_type = n.event_type
                      AND newer.status = 'pending'
                      AND newer.id <> n.id
                  ) THEN 'cancelled'
                  WHEN n.attempts >= 10 THEN 'failed'
                  ELSE 'pending'
                END,
                due_at = now() + interval '1 minute',
                updated_at = now()
            WHERE n.id = ${notificationId}
              AND n.status = 'sending'
          `);
        }
      }
    } catch (error) {
      console.error("MAX delayed notification worker failed", error);
    } finally {
      workerBusy = false;
    }

}

export function startMaxDelayedNotificationWorker(send: MaxSender): void {
  if (workerTimer) return;

  workerTimer = setInterval(() => {
    void processMaxDelayedNotifications(send);
  }, 10_000);

  if (typeof workerTimer === "object" && workerTimer !== null) {
    (workerTimer as NodeJS.Timeout).unref();
  }
}


// Decision messages have one durable row per recipient. Delivery is at-least-once:
// a process crash after MAX accepts a message but before the DB commit can duplicate it.
let decisionBusy = false;
let decisionTimer: ReturnType<typeof setInterval> | null = null;

export async function processMaxDecisionDeliveries(
  send: MaxSender,
  testConnection?: Awaited<ReturnType<typeof db.getDb>>,
): Promise<void> {
  if (decisionBusy) return;
  decisionBusy = true;
  try {
    const conn = testConnection ?? await db.getDb();
    if (!conn) return;
    await conn.execute(sql`
      UPDATE max_decision_deliveries
      SET status=CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
          due_at=now(),updated_at=now()
      WHERE status='sending' AND updated_at < now()-interval '5 minutes'
    `);
    const pending = rows(await conn.execute(sql`
      SELECT id FROM max_decision_deliveries
      WHERE status='pending' AND due_at <= now()
      ORDER BY due_at,id LIMIT 30
    `));
    for (const row of pending) {
      const id = Number(row.id);
      const claimed = rows(await conn.execute(sql`
        UPDATE max_decision_deliveries
        SET status='sending',attempts=attempts+1,updated_at=now()
        WHERE id=${id} AND status='pending' AND due_at<=now()
        RETURNING draft_id,event_type,chat_id,message
      `))[0];
      if (!claimed) continue;
      try {
        const draft = rows(await conn.execute(sql`
          SELECT status FROM max_order_drafts WHERE id=${Number(claimed.draft_id)}
        `))[0];
        if (draft?.status !== claimed.event_type) {
          // Unexpected status mismatch: retain audit trail, but never send a wrong decision.
          await conn.execute(sql`
            UPDATE max_decision_deliveries SET status='failed',updated_at=now()
            WHERE id=${id} AND status='sending'
          `);
          continue;
        }
        await send(String(claimed.chat_id),String(claimed.message));
        await conn.execute(sql`
          UPDATE max_decision_deliveries
          SET status='sent',sent_at=now(),updated_at=now()
          WHERE id=${id} AND status='sending'
        `);
      } catch (error) {
        console.error('MAX decision delivery failed',error);
        await conn.execute(sql`
          UPDATE max_decision_deliveries
          SET status=CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
              due_at=now()+interval '1 minute',updated_at=now()
          WHERE id=${id} AND status='sending'
        `);
      }
    }
  } catch (error) {
    console.error('MAX decision delivery worker failed',error);
  } finally {
    decisionBusy = false;
  }
}

export function startMaxDecisionDeliveryWorker(send: MaxSender): void {
  if (decisionTimer) return;
  // A first pass handles messages left by a previous process, without waiting 10 seconds.
  void processMaxDecisionDeliveries(send);
  decisionTimer = setInterval(() => void processMaxDecisionDeliveries(send),10_000);
  (decisionTimer as unknown as NodeJS.Timeout).unref();
}
