import { and, desc, eq, inArray, gte, lt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcryptjs";
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

export async function getTasksByDateWithCourier(targetDate: Date): Promise<TaskWithCourier[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Get start and end of the day (in UTC)
  const startOfDay = new Date(targetDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  
  const allTasks = await db
    .select()
    .from(tasks)
    .where(and(
      gte(tasks.createdAt, startOfDay),
      lte(tasks.createdAt, endOfDay)
    ))
    .orderBy(desc(tasks.createdAt));
  
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

export async function updateTaskCourierComments(taskId: number, courierComments: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ courierComments }).where(eq(tasks.id, taskId));
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

  // Delete all tasks created today (for demo reset)
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
  
  await db.delete(tasks).where(
    and(
      gte(tasks.createdAt, today),
      lt(tasks.createdAt, tomorrow)
    )
  );

  // Get today's date to calculate task number
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const taskNumberOffset = parseInt(todayStr.replace(/-/g, '')) % 1000; // Use date to vary numbering

  const demoTasks: InsertTask[] = [
    {
      // Заявка 1: Основа движения (просп. 50 лет Октября, 5) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "просп. 50 лет Октября, 5, Улан-Удэ",
      senderPhone: "+7 (914) 111-22-33",
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
      taskType: "regular",
    },
    {
      // Заявка 2:       // Заявка 4: Основа движения (ул. Чайковского, 33) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "ул. Терешковой, 24, Улан-Удэ",
      senderPhone: "+7 (914) 111-22-33",
      recipientName: "Бато Номоев",
      recipientPhone: "+7 (914) 840-33-17",
      deliveryAddress: "ул. Павлова, 57",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Павлова, 57, кв. 3",
      packageDescription: "Стельки для ходьбы",
      packageType: "medium",
      specialInstructions: null,
      comments: "Позвонить за 10 минут. Входить через боковой вход.",
      estimatedMinutes: 30,
      placesCount: 2,
      deliveryTimeFrom: "11:00",
      deliveryTimeTo: "14:00",
      taskType: "regular",
    },
    {
      // Заявка 3: HelloKorea (ул. Терешковой, 12) → клиент
      courierId: null,
      status: "pending",
      senderName: "HelloKorea",
      senderAddress: "ул. Терешковой, 12, Улан-Удэ",
      senderPhone: "+7 (914) 333-44-55",
      recipientName: "Аюна Цыренова",
      recipientPhone: "+7 (914) 772-55-90",
      deliveryAddress: "ул. Ключевская, 40",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Ключевская, 40, кв. 22",
      packageDescription: "Корейская косметика",
      packageType: "small",
      specialInstructions: null,
      comments: "Хрупкий груз. Обращаться осторожно.",
      estimatedMinutes: 25,
      placesCount: 1,
      taskType: "regular",
    },
    {
      // Заявка 4: HelloKorea (ул. Гагарина, 39) → клиент
      courierId: null,
      status: "pending",
      senderName: "HelloKorea",
      senderAddress: "ул. Гагарина, 39, Улан-Удэ",
      senderPhone: "+7 (914) 333-44-55",
      recipientName: "Саяна Будаева",
      recipientPhone: "+7 (914) 901-44-62",
      deliveryAddress: "ул. Смолина, 18",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Смолина, 18, кв. 7",
      packageDescription: "Корейская косметика + парфюм",
      packageType: "small",
      specialInstructions: null,
      comments: "Оплата картой. Требуется подпись получателя.",
      estimatedMinutes: 35,
      placesCount: 3,
      deliveryTimeFrom: "14:00",
      deliveryTimeTo: "18:00",
      taskType: "regular",
    },
    {
      // Заявка 3:      // Заявка 5: Основа движения (ул. Калашникова, 17) → клиент
      courierId: null,
      status: "pending",
      senderName: "Основа движения",
      senderAddress: "ул. Калашникова, 17, Улан-Удэ",
      senderPhone: "+7 (914) 111-22-33",
      recipientName: "Туяна Цыденова",
      recipientPhone: "+7 (914) 558-19-33",
      deliveryAddress: "просп. Буджалаба, 28",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "просп. Буджалаба, 28, офис 115",
      packageDescription: "Ортопедические стельки",
      packageType: "medium",
      specialInstructions: "Осторожно, хрупкое",
      comments: "Доставить в офис. Спросить Туяну. Осторожно с упаковкой!",
      estimatedMinutes: 40,
      placesCount: 1,
      deliveryTimeFrom: "09:00",
      deliveryTimeTo: "12:00",
      taskType: "regular",
    },
    {
      // Заявка 6: Warehouse Pickup - Доставка кедровых орехов со склада
      courierId: null,
      status: "pending",
      taskType: "warehouse_pickup",
      senderName: "Склад Кедровых Орехов",
      senderAddress: "ул. Промышленная, 5, Улан-Удэ",
      items: JSON.stringify([{ category: "Орехи", name: "Орехи 200г", quantity: 5 }, { category: "Орехи", name: "Орехи 500г", quantity: 3 }, { category: "Масло кедровое", name: "Масло кедровое", quantity: 2 }]),
      senderPhone: "+7 (914) 555-66-77",
      recipientName: "Магазин 'Вкусная жизнь'",
      recipientPhone: "+7 (914) 777-88-99",
      deliveryAddress: "ул. Ленина, 15",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Ленина, 15, магазин",
      packageDescription: "Коробки с кедровыми орехами (0.5кг - 36шт, 1кг - 18шт)",
      packageType: "large",
      specialInstructions: "Хрупкий груз. Хранить в прохладном месте.",
      comments: "Доставить в магазин. Требуется подпись. Осторожно с упаковкой!",
      estimatedMinutes: 45,
      placesCount: 5,
      deliveryTimeFrom: "08:00",
      deliveryTimeTo: "10:00",
    },
    {
      // Заявка 7: Courier Call - Вызов курьера для сбора писем
      courierId: null,
      status: "pending",
      taskType: "courier_call",
      senderName: "ООО 'Экспресс Логистика'",
      senderAddress: "ул. Советская, 42, офис 301, Улан-Удэ",
      senderPhone: "+7 (914) 222-33-44",
      recipientName: "Почтовый центр 'Доставка+'",
      recipientPhone: "+7 (914) 444-55-66",
      deliveryAddress: "ул. Октябрьская, 8",
      deliveryCity: "Улан-Удэ",
      recipientAddress: "ул. Октябрьская, 8, приемная",
      packageDescription: "Сбор писем и посылок для отправки в другие города",
      packageType: "document",
      specialInstructions: "Собрать все письма и посылки в офисе. Требуется подпись отправителя.",
      comments: "Вызов курьера. Время прибытия согласовать с менеджером. Письма готовы к отправке.",
      estimatedMinutes: 20,
      placesCount: 1,
      deliveryTimeFrom: "15:00",
      deliveryTimeTo: "16:00",
      items: JSON.stringify([{ category: "Письма и посылки", name: "Письма и посылки", quantity: 15 }]),
    }  ];

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
      taskType: "regular",
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

/** Seed demo courier account for testing */
export async function seedDemoCourier(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if demo courier already exists
  const existing = await db.select().from(couriers).where(eq(couriers.username, "demo")).limit(1);
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Create demo courier with password "demo123"
  const hashedPassword = await bcrypt.hash("demo123", 10);
  const result = await db.insert(couriers).values({
    username: "demo",
    passwordHash: hashedPassword,
    name: "Демо Курьер",
    phone: "+7 (999) 000-00-00",
    vehicleType: "car",
    isActive: true,
    totalDeliveries: 0,
  });
  
  return result[0].insertId;
}

export async function updateCourierUrgencyThresholds(
  courierId: number,
  urgencyThresholdOrange: number,
  urgencyThresholdRed: number
): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot update courier urgency thresholds: database not available"); return; }

  try {
    await db.update(couriers)
      .set({
        urgencyThresholdOrange,
        urgencyThresholdRed,
        updatedAt: new Date(),
      })
      .where(eq(couriers.id, courierId));
  } catch (error) {
    console.error("[Database] Error updating courier urgency thresholds:", error);
    throw error;
  }
}
