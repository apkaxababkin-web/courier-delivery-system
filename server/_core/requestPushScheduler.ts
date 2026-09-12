import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { couriers, requests, type Courier, type Request } from "../../drizzle/schema";
import * as db from "../db";
import { isExpoPushToken } from "./expoPush";

const TIMEZONE_OFFSET_HOURS = 8;
const MORNING_PUSH_HOUR = 9;
const CHECK_INTERVAL_MS = 60_000;

function localNow() {
  return new Date(Date.now() + TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000);
}

function localDayRangeUtc() {
  const local = localNow();

  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();

  const offsetMs = TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;

  return {
    startUtc: new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMs),
    endUtc: new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0) - offsetMs),
  };
}

function morningPushIsAllowed() {
  return localNow().getUTCHours() >= MORNING_PUSH_HOUR;
}

async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
) {
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
      data,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Expo push failed ${response.status}: ${text}`);
  }
}

async function sendScheduledRequestPushes() {
  if (!morningPushIsAllowed()) return;

  const conn = await db.getDb();
  if (!conn) return;

  const { startUtc, endUtc } = localDayRangeUtc();

  const rows = await conn
    .select()
    .from(requests)
    .where(
      and(
        gte(requests.scheduledAt, startUtc),
        lt(requests.scheduledAt, endUtc),
        isNull(requests.scheduledPushSentAt),
        inArray(requests.status, ["pending", "assigned", "in_progress"]),
      ),
    );

  if (!rows.length) return;

  const requestRows = rows as Request[];

  const courierRows: Courier[] = await conn
    .select()
    .from(couriers)
    .where(eq(couriers.isActive, true));

  const unassignedRequests = requestRows.filter(
    (request) => !request.courierId,
  );

  const successfulCourierIds = new Set<number>();

  for (const courier of courierRows) {
    if (!courier.pushToken || !isExpoPushToken(courier.pushToken)) {
      continue;
    }

    const assignedRequests = requestRows.filter(
      (request) => request.courierId === courier.id,
    );

    const hasRelevantRequests =
      unassignedRequests.length > 0 ||
      assignedRequests.length > 0;

    if (!hasRelevantRequests) continue;

    try {
      await sendExpoPush(
        courier.pushToken,
        "Есть заявки на сегодня",
        "Откройте приложение и проверьте список заявок",
        {
          type: "scheduled_requests_available",
          url: "/(tabs)",
        },
      );

      successfulCourierIds.add(courier.id);

      console.log(
        `[RequestPushScheduler] morning push sent to courier ${courier.id}`,
      );
    } catch (error) {
      console.warn(
        `[RequestPushScheduler] morning push failed for courier ${courier.id}`,
        error,
      );
    }
  }

  const anyCourierReceived = successfulCourierIds.size > 0;

  const sentRequestIds = requestRows
    .filter((request) => {
      if (request.courierId) {
        return successfulCourierIds.has(request.courierId);
      }

      return anyCourierReceived;
    })
    .map((request) => request.id);

  if (!sentRequestIds.length) {
    console.warn(
      "[RequestPushScheduler] no successful morning deliveries; will retry",
    );
    return;
  }

  await conn
    .update(requests)
    .set({ scheduledPushSentAt: new Date() })
    .where(inArray(requests.id, sentRequestIds));

  console.log(
    `[RequestPushScheduler] marked ${sentRequestIds.length} request(s) as notified`,
  );
}

export function startRequestPushScheduler() {
  console.log(
    `[RequestPushScheduler] enabled morning=${MORNING_PUSH_HOUR}:00 UTC+${TIMEZONE_OFFSET_HOURS}`,
  );

  sendScheduledRequestPushes().catch((error) =>
    console.warn("[RequestPushScheduler] initial tick failed", error),
  );

  setInterval(() => {
    sendScheduledRequestPushes().catch((error) =>
      console.warn("[RequestPushScheduler] tick failed", error),
    );
  }, CHECK_INTERVAL_MS);
}
