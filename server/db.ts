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
      // Заявка 1: Основа движения (просп. 50 лет Октября, 5) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "просп. 50 лет Октября, 5, Улан-Удэ",
      senderPhone: "+7 (301) 222-33-44",
      recipientName: "Доржи Батоева",
      recipientPhone: "+7 (914) 635-21-08",
      deliveryAddress: "ул. Балтахинова, 32",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Балтахинова, 32, кв. 14",
      packageDescription: "Ортопедическая обувь",
      packageType: "small",
      specialInstructions: "Позвонить за 15 минут до прибытия",
      comments: "Оплата наличными. Позвонить перед приездом. Не оставлять на улице.",
      estimatedMinutes: 20,
      placesCount: 1,
      deliveryTimeFrom: "10:00",
      deliveryTimeTo: "13:00",
    },
    {
      // Заявка 2: Основа движения (ул. Терешковой, 24) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "ул. Терешковой, 24, Улан-Удэ",
      senderPhone: "+7 (301) 222-33-44",
      recipientName: "Бато Номоев",
      recipientPhone: "+7 (914) 840-33-17",
      deliveryAddress: "ул. Павлова, 57",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Павлова, 57, кв. 3",
      packageDescription: "Стельки для ходьбы",
      packageType: "medium",
      specialInstructions: null,
      comments: "Хрупкий груз. Осторожно при погрузке. Требуется подпись получателя.",
      estimatedMinutes: 30,
      placesCount: 2,
      deliveryTimeFrom: "11:00",
      deliveryTimeTo: "14:00",
    },
    {
      // Заявка 3: HelloKorea (ул. Терешковой, 12) → клиент
      courierId: null,
      status: "pending",
      senderName: "HelloKorea",
      senderAddress: "ул. Терешковой, 12, Улан-Удэ",
      senderPhone: "+7 (301) 555-66-77",
      recipientName: "Аюна Цыренова",
      recipientPhone: "+7 (914) 772-55-90",
      deliveryAddress: "ул. Ключевская, 40",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Ключевская, 40, кв. 22",
      packageDescription: "Корейская косметика",
      packageType: "small",
      specialInstructions: null,
      comments: "Позвонить при прибытии. Клиент часто не слышит звонок в дверь.",
      estimatedMinutes: 25,
      placesCount: 1,
    },
    {
      // Заявка 4: HelloKorea (ул. Гагарина, 39) → клиент
      courierId: null,
      status: "pending",
      senderName: "HelloKorea",
      senderAddress: "ул. Гагарина, 39, Улан-Удэ",
      senderPhone: "+7 (301) 555-66-77",
      recipientName: "Саяна Будаева",
      recipientPhone: "+7 (914) 901-44-62",
      deliveryAddress: "ул. Смолина, 18",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Смолина, 18, кв. 7",
      packageDescription: "Корейская косметика + парфюм",
      packageType: "small",
      specialInstructions: null,
      comments: "Оплата картой. Входная дверь может быть закрыта, позвонить в домофон.",
      estimatedMinutes: 35,
      placesCount: 3,
      deliveryTimeFrom: "14:00",
      deliveryTimeTo: "18:00",
    },
    {
      // Заявка 5: Основа движения (ул. Калашникова, 17) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "ул. Калашникова, 17, Улан-Удэ",
      recipientName: "Туяна Цыденова",
      recipientPhone: "+7 (914) 558-19-33",
      deliveryAddress: "просп. Буджалаба, 28",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "просп. Буджалаба, 28, офис 115",
      packageDescription: "Ортопедические стельки",
      packageType: "medium",
      specialInstructions: "Осторожно, хрупкое",
      estimatedMinutes: 40,
      placesCount: 1,
      deliveryTimeFrom: "09:00",
      deliveryTimeTo: "12:00",
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
