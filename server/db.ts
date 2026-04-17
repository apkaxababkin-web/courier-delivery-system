import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  couriers,
  tasks,
  taskStatusHistory,
  users,
  type Courier,
  type InsertCourier,
  type InsertTask,
  type InsertTaskStatusHistory,
  type InsertUser,
  type Task,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// ─── DB connection ─────────────────────────────────────────────────────────────

let _db: ReturnType<typeof drizzle> | null = null;

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

// ─── User helpers (OAuth users) ───────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
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
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Courier helpers ──────────────────────────────────────────────────────────

export async function getCourierByUsername(username: string): Promise<Courier | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(couriers).where(eq(couriers.username, username)).limit(1);
  return rows[0] ?? null;
}

export async function getCourierById(id: number): Promise<Courier | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(couriers).where(eq(couriers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCourier(data: InsertCourier): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(couriers).values(data);
  return result[0].insertId;
}

export async function updateCourier(id: number, data: Partial<InsertCourier>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(couriers).set(data).where(eq(couriers.id, id));
}

export async function getAllCouriers(): Promise<Courier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(couriers).orderBy(couriers.name);
}

export async function incrementCourierDeliveries(courierId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const courier = await getCourierById(courierId);
  if (!courier) return;
  await db.update(couriers)
    .set({ totalDeliveries: courier.totalDeliveries + 1 })
    .where(eq(couriers.id, courierId));
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

/** Task with optional courier name attached */
export type TaskWithCourier = Task & { courierName: string | null };

/** Join tasks with courier name */
async function fetchTasksWithCourier(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  whereClause?: Parameters<typeof db.select>[0] extends undefined ? undefined : unknown
): Promise<TaskWithCourier[]> {
  // Fetch tasks and couriers separately, then join in JS
  const allTasks = whereClause
    ? await (whereClause as () => Promise<Task[]>)()
    : await db.select().from(tasks).orderBy(desc(tasks.createdAt));
  const allCouriers = await db.select({ id: couriers.id, name: couriers.name }).from(couriers);
  const courierMap = new Map(allCouriers.map((c) => [c.id, c.name]));
  return allTasks.map((t) => ({
    ...t,
    courierName: t.courierId ? (courierMap.get(t.courierId) ?? null) : null,
  }));
}

export async function getAllTasksWithCourier(): Promise<TaskWithCourier[]> {
  const db = await getDb();
  if (!db) return [];
  const allTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.status, ["pending", "assigned", "in_progress"]))
    .orderBy(desc(tasks.createdAt));
  const allCouriers = await db.select({ id: couriers.id, name: couriers.name }).from(couriers);
  const courierMap = new Map(allCouriers.map((c) => [c.id, c.name]));
  return allTasks.map((t) => ({
    ...t,
    courierName: t.courierId ? (courierMap.get(t.courierId) ?? null) : null,
  }));
}

export async function getCompletedTasksWithCourier(): Promise<TaskWithCourier[]> {
  const db = await getDb();
  if (!db) return [];
  const allTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.status, ["completed", "cancelled"]))
    .orderBy(desc(tasks.updatedAt));
  const allCouriers = await db.select({ id: couriers.id, name: couriers.name }).from(couriers);
  const courierMap = new Map(allCouriers.map((c) => [c.id, c.name]));
  return allTasks.map((t) => ({
    ...t,
    courierName: t.courierId ? (courierMap.get(t.courierId) ?? null) : null,
  }));
}

export async function getTaskWithCourierById(taskId: number): Promise<TaskWithCourier | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  const task = rows[0] ?? null;
  if (!task) return null;
  let courierName: string | null = null;
  if (task.courierId) {
    const courier = await getCourierById(task.courierId);
    courierName = courier?.name ?? null;
  }
  return { ...task, courierName };
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
  await db.update(tasks).set({ status, ...extra }).where(eq(tasks.id, taskId));
}

export async function updateTaskPlaces(taskId: number, placesCount: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ placesCount }).where(eq(tasks.id, taskId));
}

export async function updateTaskTimeInterval(
  taskId: number,
  deliveryTimeFrom: string | null,
  deliveryTimeTo: string | null
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ deliveryTimeFrom, deliveryTimeTo }).where(eq(tasks.id, taskId));
}

export async function assignTaskToCourier(
  taskId: number,
  courierId: number | null,
  status: Task["status"]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ courierId, status }).where(eq(tasks.id, taskId));
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

/** Seed demo tasks without assigning to any courier (pending state) */
export async function seedDemoTasks(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const demoTasks: InsertTask[] = [
    {
      courierId: null,
      status: "pending",
      senderName: "ООО Альфа Логистика",
      senderAddress: "ул. Промышленная, 5, склад 3",
      recipientName: "Иван Петров",
      recipientPhone: "+7 (999) 123-45-67",
      deliveryAddress: "ул. Ленина, 42",
      deliveryCity: "Москва",
      recipientAddress: "ул. Ленина, 42, кв. 15",
      packageDescription: "Документы Ад4",
      packageType: "document",
      specialInstructions: "Позвонить за 10 минут до прибытия",
      estimatedMinutes: 25,
      placesCount: 1,
      deliveryTimeFrom: "10:00",
      deliveryTimeTo: "13:00",
    },
    {
      courierId: null,
      status: "pending",
      senderName: "ИП Кузнецов А.В.",
      senderAddress: "пр. Независимости, 10",
      recipientName: "Мария Сидорова",
      recipientPhone: "+7 (999) 987-65-43",
      deliveryAddress: "пр. Мира, 18",
      deliveryCity: "Москва",
      recipientAddress: "пр. Мира, 18, офис 301",
      packageDescription: "Небольшая посылка",
      packageType: "small",
      specialInstructions: null,
      estimatedMinutes: 40,
      placesCount: 3,
    },
    {
      courierId: null,
      status: "pending",
      senderName: "Магазин Хрусталь",
      senderAddress: "ул. Торговая, 3",
      recipientName: "Алексей Козлов",
      recipientPhone: "+7 (999) 555-11-22",
      deliveryAddress: "ул. Садовая, 7",
      deliveryCity: "Москва",
      recipientAddress: "ул. Садовая, 7, кв. 88",
      packageDescription: "Хрупкий груз — стекло",
      packageType: "fragile",
      specialInstructions: "Осторожно! Хрупкое",
      estimatedMinutes: 55,
      placesCount: 2,
      deliveryTimeFrom: "14:00",
      deliveryTimeTo: "18:00",
    },
  ];

  for (const task of demoTasks) {
    await db.insert(tasks).values(task);
  }
}

// Keep old function for backward compat
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
      placesCount: 1,
    },
  ];
  for (const task of demoTasks) {
    await db.insert(tasks).values(task);
  }
}
