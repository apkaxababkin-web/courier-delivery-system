import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, gte, lte, lt, inArray, desc, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  couriers,
  tasks,
  taskStatusHistory,
  users,
  hemotestPickupPoints,
  hemotestPickups,
  hemotestPickupLists,
  hemotestListItems,
  sberbankPickupPoints,
  sberbankPickups,
  sberbankPickupLists,
  sberbankListItems,
  sberbankPickupSchedule,
  mails,
  clients,
  requests,
  type Courier,
  type InsertCourier,
  type InsertTask,
  type InsertTaskStatusHistory,
  type InsertUser,
  type Task,
  type HemotestPickupPoint,
  type HemotestPickup,
  type HemotestPickupList,
  type InsertHemotestPickupList,
  type HemotestListItem,
  type InsertHemotestListItem,
  type SberbankPickupPoint,
  type SberbankPickup,
  type SberbankPickupList,
  type InsertSberbankPickupList,
  type SberbankListItem,
  type InsertSberbankListItem,
  type SberbankPickupSchedule,
  type InsertSberbankPickupSchedule,
  type Mail,
  type InsertMail,
  type Client,
  type InsertClient,
  type Request,
  type InsertRequest,
  managers,
  type Manager,
  type InsertManager,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

// Re-export drizzle operators for use in this file
const operators = { eq, and, gte, lte, lt, inArray, desc, sql };

// ─── Mail helpers ─────────────────────────────────────────────────────────────

export async function getAllMails(): Promise<Mail[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(mails).orderBy(desc(mails.createdAt));
}

export async function getMailByWaybill(waybillNumber: string): Promise<Mail | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mails).where(eq(mails.waybillNumber, waybillNumber));
  return result[0];
}

export async function getNotDeliveredMails(): Promise<Mail[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(mails).where(eq(mails.status, "not_delivered")).orderBy(desc(mails.createdAt));
}

export async function createMail(mail: InsertMail): Promise<Mail> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mails).values(mail);
  const result = await db.select().from(mails).where(eq(mails.waybillNumber, mail.waybillNumber));
  return result[0];
}

export async function updateMailDelivery(
  waybillNumber: string,
  recipientSignature: string,
  courierId: number
): Promise<Mail> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(mails)
    .set({
      status: "delivered",
      recipientSignature,
      courierId,
      deliveredAt: new Date(),
    })
    .where(eq(mails.waybillNumber, waybillNumber));
  const result = await db.select().from(mails).where(eq(mails.waybillNumber, waybillNumber));
  return result[0];
}

export async function bulkCreateMails(mailList: InsertMail[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(mails).values(mailList);
}

export async function getMailsByFilter(
  status?: 'not_delivered' | 'delivered',
  dateFrom?: string,
  dateTo?: string
): Promise<Mail[]> {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  
  if (status) {
    conditions.push(eq(mails.status, status));
  }
  
  if (dateFrom) {
    conditions.push(gte(mails.createdAt, new Date(dateFrom)));
  }
  
  if (dateTo) {
    conditions.push(lte(mails.createdAt, new Date(dateTo)));
  }
  
  if (conditions.length > 0) {
    return await db.select().from(mails).where(and(...conditions)).orderBy(desc(mails.createdAt));
  }
  
  return await db.select().from(mails).orderBy(desc(mails.createdAt));
}

// ─── DB connection ─────────────────────────────────────────────────────────────

let _pool: mysql.Pool | null = null;
let _db: any = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (!_pool) {
        _pool = mysql.createPool(process.env.DATABASE_URL);
      }
      _db = drizzle(_pool);
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
  const courierMap = new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
  return allTasks.map((t: Task) => ({
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
    .where(inArray(tasks.status, ["assigned", "in_progress"]))
    .orderBy(desc(tasks.createdAt));
  const allCouriers = await db.select({ id: couriers.id, name: couriers.name }).from(couriers);
  const courierMap = new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
  return allTasks.map((t: Task) => ({
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
  const courierMap = new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
  return allTasks.map((t: Task) => ({
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
  const courierMap = new Map(allCouriers.map((c: { id: number; name: string }) => [c.id, c.name]));
  return allTasks.map((t: Task) => ({
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

export async function updateTaskDate(taskId: number, newDate: Date): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(tasks).set({ createdAt: newDate }).where(eq(tasks.id, taskId));
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

/** Seed demo tasks without assigning to any courier (assigned state) */
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
      status: "assigned",
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
      status: "assigned",
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
      status: "assigned",
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
      status: "assigned",
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
      status: "assigned",
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
      status: "assigned",
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
      status: "assigned",
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

// ─── Hemotest Pickup Points ────────────────────────────────────────────────────

export type HemotestPickupWithStatus = HemotestPickupPoint & { isPicked: boolean; pickedAt: Date | null };

export async function getHemotestPickupPointsForDate(
  courierId: number,
  targetDate: Date
): Promise<HemotestPickupWithStatus[]> {
  const db = await getDb();
  if (!db) return [];

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Get all pickup points
  const points = await db.select().from(hemotestPickupPoints).orderBy(hemotestPickupPoints.name);
  
  // Get pickups for this courier and date
  const pickups = await db
    .select()
    .from(hemotestPickups)
    .where(and(
      eq(hemotestPickups.courierId, courierId),
      eq(hemotestPickups.date, dateStr)
    ));
  
  const pickupMap = new Map<number, HemotestPickup>(pickups.map((p: HemotestPickup) => [p.pointId, p]));
  
  // Get courier name
  const courierData = await db.select().from(couriers).where(eq(couriers.id, courierId)).limit(1);
  const courierName = courierData[0]?.name ?? "Unknown";
  
  // Combine and sort: unpicked first, then picked
  const result = points.map((point: HemotestPickupPoint) => {
    const pickup: HemotestPickup | undefined = pickupMap.get(point.id);
    return {
      ...point,
      isPicked: pickup?.isPicked ?? false,
      pickedAt: pickup?.pickedAt ?? null,
      courierName: pickup?.isPicked ? courierName : undefined,
    };
  });
  
  // Sort: unpicked first (false), then picked (true)
  return result.sort((a: HemotestPickupWithStatus, b: HemotestPickupWithStatus) => (a.isPicked ? 1 : 0) - (b.isPicked ? 1 : 0));
}

export async function toggleHemotestPickup(
  courierId: number,
  pointId: number,
  targetDate: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Check if pickup record exists
  const existing = await db
    .select()
    .from(hemotestPickups)
    .where(and(
      eq(hemotestPickups.courierId, courierId),
      eq(hemotestPickups.pointId, pointId),
      eq(hemotestPickups.date, dateStr)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Toggle the status
    const pickup = existing[0];
    await db
      .update(hemotestPickups)
      .set({
        isPicked: !pickup.isPicked,
        pickedAt: !pickup.isPicked ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(hemotestPickups.id, pickup.id));
  } else {
    // Create new pickup record as picked
    await db.insert(hemotestPickups).values({
      courierId,
      pointId,
      date: dateStr,
      isPicked: true,
      pickedAt: new Date(),
    });
  }
}

export async function getHemotestPickedCount(courierId: number, targetDate: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const result = await db
    .select({ count: sql`COUNT(*)` })
    .from(hemotestPickups)
    .where(and(
      eq(hemotestPickups.courierId, courierId),
      eq(hemotestPickups.date, dateStr),
      eq(hemotestPickups.isPicked, true)
    ));
  
  return result[0]?.count as number ?? 0;
}

// ─── Sberbank Pickup Points ────────────────────────────────────────────────────

export type SberbankPickupWithStatus = SberbankPickupPoint & { isPicked: boolean; pickedAt: Date | null };

export async function getSberbankPickupPointsForDate(
  courierId: number,
  targetDate: Date
): Promise<SberbankPickupWithStatus[]> {
  const db = await getDb();
  if (!db) return [];

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Get all pickup points
  const points = await db.select().from(sberbankPickupPoints).orderBy(sberbankPickupPoints.name);
  
  // Get pickups for this courier and date
  const pickups = await db
    .select()
    .from(sberbankPickups)
    .where(and(
      eq(sberbankPickups.courierId, courierId),
      eq(sberbankPickups.date, dateStr)
    ));
  
  const pickupMap = new Map<number, SberbankPickup>(pickups.map((p: SberbankPickup) => [p.pointId, p]));
  
  // Get courier name
  const courierData = await db.select().from(couriers).where(eq(couriers.id, courierId)).limit(1);
  const courierName = courierData[0]?.name ?? "Unknown";
  
  // Combine and sort: unpicked first, then picked
  const result = points.map((point: SberbankPickupPoint) => {
    const pickup: SberbankPickup | undefined = pickupMap.get(point.id);
    return {
      ...point,
      isPicked: pickup?.isPicked ?? false,
      pickedAt: pickup?.pickedAt ?? null,
      courierName: pickup?.isPicked ? courierName : undefined,
    };
  });
  
  // Sort: unpicked first (false), then picked (true)
  return result.sort((a: SberbankPickupWithStatus, b: SberbankPickupWithStatus) => (a.isPicked ? 1 : 0) - (b.isPicked ? 1 : 0));
}

export async function toggleSberbankPickup(
  courierId: number,
  pointId: number,
  targetDate: Date
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Check if pickup record exists
  const existing = await db
    .select()
    .from(sberbankPickups)
    .where(and(
      eq(sberbankPickups.courierId, courierId),
      eq(sberbankPickups.pointId, pointId),
      eq(sberbankPickups.date, dateStr)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    // Toggle the status
    const pickup = existing[0];
    await db
      .update(sberbankPickups)
      .set({
        isPicked: !pickup.isPicked,
        pickedAt: !pickup.isPicked ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(sberbankPickups.id, pickup.id));
  } else {
    // Create new pickup record as picked
    await db.insert(sberbankPickups).values({
      courierId,
      pointId,
      date: dateStr,
      isPicked: true,
      pickedAt: new Date(),
    });
  }
}

export async function getSberbankPickedCount(courierId: number, targetDate: Date): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const result = await db
    .select({ count: sql`COUNT(*)` })
    .from(sberbankPickups)
    .where(and(
      eq(sberbankPickups.courierId, courierId),
      eq(sberbankPickups.date, dateStr),
      eq(sberbankPickups.isPicked, true)
    ));
  
  return result[0]?.count as number ?? 0;
}

// ─── Pickup Points Demo Data ───────────────────────────────────────────────────

/** Seed demo Hemotest pickup points */
export async function seedDemoHemotestPoints(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Delete all existing points and their pickups
  await db.delete(hemotestPickupPoints);
  await db.delete(hemotestPickups);

  const demoPoints = [
    { name: "Гемотест на ул. Ленина", address: "ул. Ленина, 15" },
    { name: "Гемотест на ул. Смолина", address: "ул. Смолина, 18" },
    { name: "Гемотест на просп. Буджалаба", address: "просп. Буджалаба, 28" },
    { name: "Гемотест на ул. Балтахинова", address: "ул. Балтахинова, 32" },
    { name: "Гемотест на ул. Октябрьская", address: "ул. Октябрьская, 45" },
    { name: "Гемотест на ул. Ключевская", address: "ул. Ключевская, 67" },
    { name: "Гемотест на ул. Павлова", address: "ул. Павлова, 89" },
    { name: "Гемотест на ул. Гагарина", address: "ул. Гагарина, 12" },
  ];

  for (const point of demoPoints) {
    await db.insert(hemotestPickupPoints).values(point);
  }
}

/** Seed demo Sberbank pickup points */
export async function seedDemoSberbankPoints(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Delete all existing points and their pickups
  await db.delete(sberbankPickupPoints);
  await db.delete(sberbankPickups);

  const demoPoints = [
    { name: "Сбербанк на ул. Октябрьская", address: "ул. Октябрьская, 8" },
    { name: "Сбербанк на ул. Ключевская", address: "ул. Ключевская, 40" },
    { name: "Сбербанк на ул. Павлова", address: "ул. Павлова, 57" },
    { name: "Сбербанк на ул. Гагарина", address: "ул. Гагарина, 39" },
    { name: "Сбербанк на ул. Красного Урала", address: "ул. Красного Урала, 23" },
    { name: "Сбербанк на ул. Амурская", address: "ул. Амурская, 34" },
    { name: "Сбербанк на ул. Профсоюзная", address: "ул. Профсоюзная, 56" },
    { name: "Сбербанк на ул. Советская", address: "ул. Советская, 78" },
  ];

  for (const point of demoPoints) {
    await db.insert(sberbankPickupPoints).values(point);
  }
}


// ─── Client helpers ──────────────────────────────────────────────────────────

export async function getAllClients(): Promise<Client[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clients).orderBy(desc(clients.createdAt));
}

export async function getClientById(id: number): Promise<Client | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result[0] || null;
}

export async function createClient(data: InsertClient): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const result = await db.insert(clients).values(data);
  return result[0].insertId;
}

export async function updateClient(id: number, data: Partial<InsertClient>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  await db.delete(clients).where(eq(clients.id, id));
}


// ─── Sberbank Schedule Management ─────────────────────────────────────────────

/**
 * Get all points scheduled for a specific day of week
 * @param dayOfWeek 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
 */
export async function getSberbankScheduleForDay(dayOfWeek: number): Promise<SberbankPickupPoint[]> {
  const db = await getDb();
  if (!db) return [];

  // Get point IDs for this day
  const scheduleEntries = await db
    .select({ pointId: sberbankPickupSchedule.pointId })
    .from(sberbankPickupSchedule)
    .where(eq(sberbankPickupSchedule.dayOfWeek, dayOfWeek));

  if (scheduleEntries.length === 0) return [];

  const pointIds = scheduleEntries.map((e: SberbankPickupSchedule) => e.pointId);

  // Get actual point data
  return await db
    .select()
    .from(sberbankPickupPoints)
    .where(inArray(sberbankPickupPoints.id, pointIds))
    .orderBy(sberbankPickupPoints.name);
}

/**
 * Set points for a specific day of week (replaces existing schedule)
 */
export async function setSberbankScheduleForDay(dayOfWeek: number, pointIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete existing schedule for this day
  await db
    .delete(sberbankPickupSchedule)
    .where(eq(sberbankPickupSchedule.dayOfWeek, dayOfWeek));

  // Insert new schedule entries
  if (pointIds.length > 0) {
    await db.insert(sberbankPickupSchedule).values(
      pointIds.map(pointId => ({
        dayOfWeek,
        pointId,
      }))
    );
  }
}

/**
 * Add a single point to a day's schedule
 */
export async function addPointToSberbankSchedule(dayOfWeek: number, pointId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if already exists
  const existing = await db
    .select()
    .from(sberbankPickupSchedule)
    .where(and(
      eq(sberbankPickupSchedule.dayOfWeek, dayOfWeek),
      eq(sberbankPickupSchedule.pointId, pointId)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(sberbankPickupSchedule).values({
      dayOfWeek,
      pointId,
    });
  }
}

/**
 * Remove a single point from a day's schedule
 */
export async function removePointFromSberbankSchedule(dayOfWeek: number, pointId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(sberbankPickupSchedule)
    .where(and(
      eq(sberbankPickupSchedule.dayOfWeek, dayOfWeek),
      eq(sberbankPickupSchedule.pointId, pointId)
    ));
}

// ─── Hemotest and Sberbank Point Management ───────────────────────────────────

/**
 * Create a new Hemotest pickup point
 */
export async function createHemotestPoint(data: {
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
}): Promise<HemotestPickupPoint> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(hemotestPickupPoints).values(data);
  const id = result[0]?.insertId;
  if (!id) throw new Error("Failed to create point");

  const point = await db
    .select()
    .from(hemotestPickupPoints)
    .where(eq(hemotestPickupPoints.id, id))
    .limit(1);

  return point[0]!;
}

/**
 * Get all Hemotest pickup points
 */
export async function getAllHemotestPoints(): Promise<HemotestPickupPoint[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(hemotestPickupPoints).orderBy(hemotestPickupPoints.name);
}

/**
 * Create a new Sberbank pickup point
 */
export async function createSberbankPoint(data: {
  name: string;
  address: string;
  phone?: string;
  contactPerson?: string;
}): Promise<SberbankPickupPoint> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(sberbankPickupPoints).values(data);
  const id = result[0]?.insertId;
  if (!id) throw new Error("Failed to create point");

  const point = await db
    .select()
    .from(sberbankPickupPoints)
    .where(eq(sberbankPickupPoints.id, id))
    .limit(1);

  return point[0]!;
}

/**
 * Get all Sberbank pickup points
 */
export async function getAllSberbankPoints(): Promise<SberbankPickupPoint[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(sberbankPickupPoints).orderBy(sberbankPickupPoints.name);
}


// ─── Hemotest Pickup Lists ───────────────────────────────────────────────────

/**
 * Create a new Hemotest pickup list
 */
export async function createHemotestPickupList(data: {
  date: string;
  name: string;
  pointIds: number[];
}): Promise<HemotestPickupList> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(hemotestPickupLists).values({
    date: data.date,
    name: data.name,
    status: "active",
  });

  const listId = result[0]?.insertId;
  if (!listId) throw new Error("Failed to create list");

  // Add items to the list (with deduplication)
  if (data.pointIds.length > 0) {
    const uniquePointIds = [...new Set(data.pointIds)];
    await db.insert(hemotestListItems).values(
      uniquePointIds.map(pointId => ({
        listId,
        pointId,
      }))
    );
  }

  const list = await db
    .select()
    .from(hemotestPickupLists)
    .where(eq(hemotestPickupLists.id, listId))
    .limit(1);

  return list[0]!;
}

/**
 * Get all Hemotest pickup lists for a date
 */
export async function getHemotestPickupListsForDate(date: string): Promise<HemotestPickupList[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(hemotestPickupLists)
    .where(eq(hemotestPickupLists.date, date))
    .orderBy(desc(hemotestPickupLists.createdAt));
}

/**
 * Get a Hemotest pickup list with its items
 */
export async function getHemotestPickupListWithItems(listId: number): Promise<{
  list: HemotestPickupList;
  items: HemotestPickupPoint[];
} | null> {
  const db = await getDb();
  if (!db) return null;

  const list = await db
    .select()
    .from(hemotestPickupLists)
    .where(eq(hemotestPickupLists.id, listId))
    .limit(1);

  if (!list[0]) return null;

  const items = await db
    .select()
    .from(hemotestListItems)
    .innerJoin(hemotestPickupPoints, eq(hemotestListItems.pointId, hemotestPickupPoints.id))
    .where(eq(hemotestListItems.listId, listId));

  return {
    list: list[0],
    items: items.map((i: { hemotestListItems: HemotestListItem; hemotestPickupPoints: HemotestPickupPoint }) => i.hemotestPickupPoints),
  };
}

/**
 * Add a point to an existing Hemotest pickup list (with deduplication)
 */
export async function addPointToHemotestList(listId: number, pointId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if point already exists in the list
  const existing = await db
    .select()
    .from(hemotestListItems)
    .where(and(
      eq(hemotestListItems.listId, listId),
      eq(hemotestListItems.pointId, pointId)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(hemotestListItems).values({
      listId,
      pointId,
    });
  }
}

// ─── Sberbank Pickup Lists ───────────────────────────────────────────────────

/**
 * Create a new Sberbank pickup list
 */
export async function createSberbankPickupList(data: {
  dayOfWeek: number;
  name: string;
  pointIds: number[];
}): Promise<SberbankPickupList> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(sberbankPickupLists).values({
    dayOfWeek: data.dayOfWeek,
    name: data.name,
    status: "active",
  });

  const listId = result[0]?.insertId;
  if (!listId) throw new Error("Failed to create list");

  // Add items to the list (with deduplication)
  if (data.pointIds.length > 0) {
    const uniquePointIds = [...new Set(data.pointIds)];
    await db.insert(sberbankListItems).values(
      uniquePointIds.map(pointId => ({
        listId,
        pointId,
      }))
    );
  }

  const list = await db
    .select()
    .from(sberbankPickupLists)
    .where(eq(sberbankPickupLists.id, listId))
    .limit(1);

  return list[0]!;
}

/**
 * Get all Sberbank pickup lists for a day of week
 */
export async function getSberbankPickupListsForDay(dayOfWeek: number): Promise<SberbankPickupList[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(sberbankPickupLists)
    .where(eq(sberbankPickupLists.dayOfWeek, dayOfWeek))
    .orderBy(desc(sberbankPickupLists.createdAt));
}

/**
 * Get a Sberbank pickup list with its items
 */
export async function getSberbankPickupListWithItems(listId: number): Promise<{
  list: SberbankPickupList;
  items: SberbankPickupPoint[];
} | null> {
  const db = await getDb();
  if (!db) return null;

  const list = await db
    .select()
    .from(sberbankPickupLists)
    .where(eq(sberbankPickupLists.id, listId))
    .limit(1);

  if (!list[0]) return null;

  const items = await db
    .select()
    .from(sberbankListItems)
    .innerJoin(sberbankPickupPoints, eq(sberbankListItems.pointId, sberbankPickupPoints.id))
    .where(eq(sberbankListItems.listId, listId));

  return {
    list: list[0],
    items: items.map((i: { sberbankListItems: SberbankListItem; sberbankPickupPoints: SberbankPickupPoint }) => i.sberbankPickupPoints),
  };
}

/**
 * Add a point to an existing Sberbank pickup list (with deduplication)
 */
export async function addPointToSberbankList(listId: number, pointId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if point already exists in the list
  const existing = await db
    .select()
    .from(sberbankListItems)
    .where(and(
      eq(sberbankListItems.listId, listId),
      eq(sberbankListItems.pointId, pointId)
    ))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(sberbankListItems).values({
      listId,
      pointId,
    });
  }
}


// ─── Request management (multi-type requests) ─────────────────────────────────

/**
 * Create a new request of any type
 */
export async function createRequest(data: InsertRequest): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(requests).values({
    ...data,
    createdByUserId: data.createdByUserId || 1, // Default to admin user
    status: "pending",
  });
  return result[0].insertId as number;
}

/**
 * Get all requests
 */
export async function getAllRequests(): Promise<Request[]> {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(requests).orderBy(desc(requests.createdAt));
}

/**
 * Get request by ID
 */
export async function getRequestById(id: number): Promise<Request | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Update request status
 */
export async function updateRequestStatus(id: number, status: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(requests).set({ status: status as any }).where(eq(requests.id, id));
}

/**
 * Assign courier to request
 */
export async function assignRequestCourier(id: number, courierId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(requests)
    .set({ courierId, status: "assigned" as any })
    .where(eq(requests.id, id));
}

// ─── Manager helpers ──────────────────────────────────────────────────────────

export async function getManagerByUsername(username: string): Promise<Manager | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(managers).where(eq(managers.username, username)).limit(1);
  return result[0] || null;
}

export async function getManagerById(id: number): Promise<Manager | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(managers).where(eq(managers.id, id)).limit(1);
  return result[0] || null;
}

export async function seedDemoManager(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("База данных недоступна");
  const existing = await getManagerByUsername("manager");
  if (existing) return existing.id;
  const passwordHash = await bcrypt.hash("manager123", 10);
  const result = await db.insert(managers).values({
    name: "Демо Менеджер",
    username: "manager",
    email: "manager@courier.local",
    passwordHash,
    phone: "+7 (999) 111-11-11",
    isActive: true,
  });
  return result[0].insertId as number;
}

// ─── Client helpers ────────────────────────────────────────────────────────────

