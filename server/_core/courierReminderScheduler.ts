import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { couriers, tasks, type Courier } from "../../drizzle/schema";
import * as db from "../db";
import { isExpoPushToken } from "./expoPush";

type ReminderKind = "soft" | "final";

const DEFAULT_TIMEZONE_OFFSET_HOURS = 8; // Ulan-Ude / Irkutsk time
const REMINDER_CHECK_INTERVAL_MS = 60_000;
const SOFT_REMINDER_TIME = process.env.COURIER_SOFT_REMINDER_TIME ?? "20:00";
const FINAL_REMINDER_TIME = process.env.COURIER_FINAL_REMINDER_TIME ?? "22:00";
const TIMEZONE_OFFSET_HOURS = Number(process.env.COURIER_REMINDER_TZ_OFFSET_HOURS ?? DEFAULT_TIMEZONE_OFFSET_HOURS);

const sentReminderKeys = new Set<string>();

function localNowParts() {
  const now = new Date();
  const local = new Date(now.getTime() + TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
    year: yyyy,
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

function localDayRangeUtc(parts = localNowParts()) {
  const offsetMs = TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const startUtc = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day, 0, 0, 0, 0) - offsetMs);
  const endUtc = new Date(Date.UTC(parts.year, parts.monthIndex, parts.day + 1, 0, 0, 0, 0) - offsetMs);
  return { startUtc, endUtc };
}

async function sendExpoPush(pushToken: string, title: string, body: string, data?: Record<string, unknown>) {
  if (!isExpoPushToken(pushToken)) return;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: pushToken,
      sound: "default",
      priority: "high",
      title,
      body,
      data: data ?? {},
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Expo push failed ${response.status}: ${text}`);
  }
}

async function getUnfinishedTasksByCourier() {
  const conn = await db.getDb();
  if (!conn) return new Map<number, number>();

  const { startUtc, endUtc } = localDayRangeUtc();
  const rows = await conn
    .select({ courierId: tasks.courierId, id: tasks.id })
    .from(tasks)
    .where(
      and(
        gte(tasks.createdAt, startUtc),
        lt(tasks.createdAt, endUtc),
        inArray(tasks.status, ["assigned", "in_progress"]),
      ),
    );

  const result = new Map<number, number>();
  for (const row of rows as Array<{ courierId: number | null; id: number }>) {
    if (!row.courierId) continue;
    result.set(row.courierId, (result.get(row.courierId) ?? 0) + 1);
  }
  return result;
}

async function activeCouriersWithPushTokens(): Promise<Array<Courier & { pushToken: string }>> {
  const conn = await db.getDb();
  if (!conn) return [];

  const rows = await conn
    .select()
    .from(couriers)
    .where(eq(couriers.isActive, true));

  return (rows as Courier[]).filter((courier): courier is Courier & { pushToken: string } => Boolean(courier.pushToken));
}

async function sendEveningReminders(kind: ReminderKind) {
  const parts = localNowParts();
  const unfinishedByCourier = await getUnfinishedTasksByCourier();
  if (unfinishedByCourier.size === 0) return;

  const courierList = await activeCouriersWithPushTokens();

  for (const courier of courierList) {
    const unfinishedCount = unfinishedByCourier.get(courier.id) ?? 0;
    if (unfinishedCount <= 0) continue;

    const reminderKey = `${parts.dateKey}:${kind}:${courier.id}`;
    if (sentReminderKeys.has(reminderKey)) continue;

    const title = kind === "soft" ? "Проверьте заявки за сегодня" : "Остались незакрытые заявки";
    const body = kind === "soft"
      ? `У вас ${unfinishedCount} незакрыт. заявк. Зайдите в приложение и отметьте статус.`
      : `Напоминание: ${unfinishedCount} заявк. ещё не закрыты. Отметьте выполненные или отменённые.`;

    try {
      await sendExpoPush(courier.pushToken, title, body, { url: "", type: "unfinished_tasks_reminder", count: unfinishedCount });
      sentReminderKeys.add(reminderKey);
      console.log(`[CourierReminder] Sent ${kind} reminder to courier ${courier.id}: ${unfinishedCount}`);
    } catch (error) {
      console.warn(`[CourierReminder] Failed to send reminder to courier ${courier.id}`, error);
    }
  }
}

async function reminderTick() {
  const { time } = localNowParts();
  if (time === SOFT_REMINDER_TIME) await sendEveningReminders("soft");
  if (time === FINAL_REMINDER_TIME) await sendEveningReminders("final");
}

export function startCourierReminderScheduler() {
  if (process.env.COURIER_REMINDERS_ENABLED === "false") {
    console.log("[CourierReminder] disabled");
    return;
  }

  console.log(
    `[CourierReminder] enabled soft=${SOFT_REMINDER_TIME} final=${FINAL_REMINDER_TIME} tzOffset=${TIMEZONE_OFFSET_HOURS}`,
  );

  setInterval(() => {
    reminderTick().catch((error) => console.warn("[CourierReminder] tick failed", error));
  }, REMINDER_CHECK_INTERVAL_MS);
}
