import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

// ─── Courier helpers ──────────────────────────────────────────────────────────

import { and, desc, inArray } from "drizzle-orm";
import {
  couriers,
  tasks,
  taskStatusHistory,
  type Courier,
  type InsertCourier,
  type InsertTask,
  type InsertTaskStatusHistory,
  type Task,
} from "../drizzle/schema";

export async function getCourierByUserId(userId: number): Promise<Courier | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(couriers)
    .where(eq(couriers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCourier(data: InsertCourier): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(couriers).values(data);
  return result[0].insertId;
}

export async function getAllCouriersWithUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ courier: couriers, user: users })
    .from(couriers)
    .leftJoin(users, eq(couriers.userId, users.id));
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

export async function getActiveTasksForCourier(courierId: number): Promise<Task[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.courierId, courierId),
        inArray(tasks.status, ["assigned", "accepted", "in_progress"])
      )
    )
    .orderBy(desc(tasks.createdAt));
}

export async function getTaskHistoryForCourier(courierId: number): Promise<Task[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.courierId, courierId),
        inArray(tasks.status, ["completed", "rejected"])
      )
    )
    .orderBy(desc(tasks.updatedAt));
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(desc(tasks.createdAt));
}

export async function getTaskById(taskId: number): Promise<Task | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  return rows[0] ?? null;
}

export async function createTask(data: InsertTask): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tasks).values(data);
  return result[0].insertId;
}

export async function updateTaskStatus(
  taskId: number,
  status: Task["status"],
  extra?: Partial<InsertTask>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(tasks)
    .set({ status, ...extra })
    .where(eq(tasks.id, taskId));
}

export async function assignTaskToCourier(taskId: number, courierId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(tasks)
    .set({ courierId, status: "assigned" })
    .where(eq(tasks.id, taskId));
}

// ─── Task status history ──────────────────────────────────────────────────────

export async function addTaskStatusHistory(data: InsertTaskStatusHistory): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(taskStatusHistory).values(data);
}

export async function getTaskStatusHistory(taskId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(taskStatusHistory)
    .where(eq(taskStatusHistory.taskId, taskId))
    .orderBy(desc(taskStatusHistory.createdAt));
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

export async function seedDemoTasksForCourier(courierId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const demoTasks: InsertTask[] = [
    {
      courierId,
      status: "assigned",
      recipientName: "Иван Петров",
      recipientPhone: "+7 (999) 123-45-67",
      deliveryAddress: "ул. Ленина, 42, кв. 15",
      deliveryCity: "Москва",
      packageDescription: "Документы А4",
      packageType: "document",
      specialInstructions: "Позвонить за 10 минут до прибытия",
      estimatedMinutes: 25,
    },
    {
      courierId,
      status: "assigned",
      recipientName: "Мария Сидорова",
      recipientPhone: "+7 (999) 987-65-43",
      deliveryAddress: "пр. Мира, 18, офис 301",
      deliveryCity: "Москва",
      packageDescription: "Небольшая посылка",
      packageType: "small",
      specialInstructions: null,
      estimatedMinutes: 40,
    },
    {
      courierId,
      status: "assigned",
      recipientName: "Алексей Козлов",
      recipientPhone: "+7 (999) 555-11-22",
      deliveryAddress: "ул. Садовая, 7, кв. 88",
      deliveryCity: "Москва",
      packageDescription: "Хрупкий груз — стекло",
      packageType: "fragile",
      specialInstructions: "Осторожно! Хрупкое",
      estimatedMinutes: 55,
    },
  ];

  for (const task of demoTasks) {
    await db.insert(tasks).values(task);
  }
}
