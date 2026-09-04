import { sql } from "drizzle-orm";
import * as db from "../db";

export type CourierAccessSection =
  | "tasks"
  | "hemotest"
  | "sberbank"
  | "mails"
  | "chat";

export type CourierAccessSettings = {
  courierId: number;
  allowedDaysMask: number;
  tasksAllowed: boolean;
  hemotestAllowed: boolean;
  sberbankAllowed: boolean;
  mailsAllowed: boolean;
  chatAllowed: boolean;
};

const DEFAULT_ACCESS: Omit<CourierAccessSettings, "courierId"> = {
  allowedDaysMask: 127,
  tasksAllowed: true,
  hemotestAllowed: true,
  sberbankAllowed: true,
  mailsAllowed: true,
  chatAllowed: true,
};

function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

export async function ensureCourierAccessTable() {
  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  await conn.execute(sql`
    CREATE TABLE IF NOT EXISTS "courierAccess" (
      "courierId" integer PRIMARY KEY REFERENCES "couriers"("id") ON DELETE CASCADE,
      "allowedDaysMask" integer NOT NULL DEFAULT 127,
      "tasksAllowed" boolean NOT NULL DEFAULT true,
      "hemotestAllowed" boolean NOT NULL DEFAULT true,
      "sberbankAllowed" boolean NOT NULL DEFAULT true,
      "mailsAllowed" boolean NOT NULL DEFAULT true,
      "chatAllowed" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `);

  return conn;
}

export async function getCourierAccess(
  courierId: number,
): Promise<CourierAccessSettings> {
  const conn = await ensureCourierAccessTable();

  const result = await conn.execute(sql`
    SELECT
      "courierId",
      "allowedDaysMask",
      "tasksAllowed",
      "hemotestAllowed",
      "sberbankAllowed",
      "mailsAllowed",
      "chatAllowed"
    FROM "courierAccess"
    WHERE "courierId" = ${courierId}
    LIMIT 1
  `);

  const row = rowsOf(result)[0];

  if (!row) {
    return {
      courierId,
      ...DEFAULT_ACCESS,
    };
  }

  return {
    courierId: Number(row.courierId),
    allowedDaysMask: Number(row.allowedDaysMask ?? 127),
    tasksAllowed: row.tasksAllowed !== false,
    hemotestAllowed: row.hemotestAllowed !== false,
    sberbankAllowed: row.sberbankAllowed !== false,
    mailsAllowed: row.mailsAllowed !== false,
    chatAllowed: row.chatAllowed !== false,
  };
}

export async function saveCourierAccess(
  courierId: number,
  access: Partial<Omit<CourierAccessSettings, "courierId">>,
): Promise<CourierAccessSettings> {
  const conn = await ensureCourierAccessTable();
  const current = await getCourierAccess(courierId);

  const next: CourierAccessSettings = {
    courierId,
    allowedDaysMask:
      typeof access.allowedDaysMask === "number"
        ? Math.max(0, Math.min(127, Math.trunc(access.allowedDaysMask)))
        : current.allowedDaysMask,
    tasksAllowed:
      typeof access.tasksAllowed === "boolean"
        ? access.tasksAllowed
        : current.tasksAllowed,
    hemotestAllowed:
      typeof access.hemotestAllowed === "boolean"
        ? access.hemotestAllowed
        : current.hemotestAllowed,
    sberbankAllowed:
      typeof access.sberbankAllowed === "boolean"
        ? access.sberbankAllowed
        : current.sberbankAllowed,
    mailsAllowed:
      typeof access.mailsAllowed === "boolean"
        ? access.mailsAllowed
        : current.mailsAllowed,
    chatAllowed:
      typeof access.chatAllowed === "boolean"
        ? access.chatAllowed
        : current.chatAllowed,
  };

  await conn.execute(sql`
    INSERT INTO "courierAccess" (
      "courierId",
      "allowedDaysMask",
      "tasksAllowed",
      "hemotestAllowed",
      "sberbankAllowed",
      "mailsAllowed",
      "chatAllowed",
      "updatedAt"
    )
    VALUES (
      ${courierId},
      ${next.allowedDaysMask},
      ${next.tasksAllowed},
      ${next.hemotestAllowed},
      ${next.sberbankAllowed},
      ${next.mailsAllowed},
      ${next.chatAllowed},
      now()
    )
    ON CONFLICT ("courierId")
    DO UPDATE SET
      "allowedDaysMask" = EXCLUDED."allowedDaysMask",
      "tasksAllowed" = EXCLUDED."tasksAllowed",
      "hemotestAllowed" = EXCLUDED."hemotestAllowed",
      "sberbankAllowed" = EXCLUDED."sberbankAllowed",
      "mailsAllowed" = EXCLUDED."mailsAllowed",
      "chatAllowed" = EXCLUDED."chatAllowed",
      "updatedAt" = now()
  `);

  return next;
}

function irkutskWeekdayIndex(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Irkutsk",
    weekday: "short",
  }).format(new Date());

  const indexes: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };

  return indexes[weekday] ?? 0;
}

export function isTodayAllowed(allowedDaysMask: number): boolean {
  const index = irkutskWeekdayIndex();
  return (allowedDaysMask & (1 << index)) !== 0;
}

export async function checkCourierAccess(
  courierId: number,
  section: CourierAccessSection,
): Promise<{
  allowed: boolean;
  reason?: "day" | "section";
  access: CourierAccessSettings;
}> {
  const access = await getCourierAccess(courierId);

  if (!isTodayAllowed(access.allowedDaysMask)) {
    return {
      allowed: false,
      reason: "day",
      access,
    };
  }

  const allowedBySection =
    section === "tasks"
      ? access.tasksAllowed
      : section === "hemotest"
        ? access.hemotestAllowed
        : section === "sberbank"
          ? access.sberbankAllowed
          : section === "mails"
            ? access.mailsAllowed
            : access.chatAllowed;

  if (!allowedBySection) {
    return {
      allowed: false,
      reason: "section",
      access,
    };
  }

  return {
    allowed: true,
    access,
  };
}

export async function assertCourierAccess(
  courierId: number,
  section: CourierAccessSection,
): Promise<CourierAccessSettings> {
  const result = await checkCourierAccess(courierId, section);

  if (!result.allowed) {
    if (result.reason === "day") {
      throw new Error("Нет доступа к рабочей информации в этот день");
    }

    throw new Error("Нет доступа к этому разделу");
  }

  return result.access;
}
