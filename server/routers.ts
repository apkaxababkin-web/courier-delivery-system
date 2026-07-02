import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { syncTaskForRequestId, updateRequestStatusFromTask } from "./_core/requestTaskSync";
import { isExpoPushToken, sendExpoPush } from "./_core/expoPush";
import { broadcastLive } from "./_core/liveEvents";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";


async function sendPushToAllCouriers(title: string, body: string, data?: Record<string, unknown>) {
  try {
    const couriers = await db.getAllCouriers();
    const targets = couriers.filter((courier) => isExpoPushToken(courier.pushToken));

    console.log("[PUSH_ALL] targets", targets.length, title);

    const results = await Promise.allSettled(
      targets.map((courier) => sendExpoPush(courier.pushToken, title, body, data)),
    );

    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) console.warn("[PUSH_ALL] failed", failed, "of", targets.length);
  } catch (error) {
    console.error("[PUSH_ALL] failed", error);
  }
}

function compactText(value: unknown, fallback = "Не указано") {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function truncatePushText(value: string, max = 90) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function getRequestTypeLabel(type: unknown) {
  if (type === "delivery") return "Доставка";
  if (type === "movement") return "Перемещение";
  if (type === "nuts") return "Орехи";
  if (type === "courier_call") return "Вызов курьера";
  if (type === "pickup_from_tc") return "ТК";
  return "Заявка";
}

function getPaymentLabel(method: unknown) {
  if (method === "paid") return "оплачено";
  if (method === "transfer") return "перевод";
  if (method === "cash") return "наличные";
  if (method === "terminal") return "терминал";
  if (method === "qr") return "QR";
  return "";
}

function getPlacesLabel(count: unknown) {
  const places = Number(count || 1);
  if (places === 1) return "1 место";
  if (places >= 2 && places <= 4) return `${places} места`;
  return `${places} мест`;
}

function buildNewRequestPush(input: {
  id: number;
  requestType?: unknown;
  deliveryAddress?: unknown;
  recipientAddress?: unknown;
  senderAddress?: unknown;
  senderName?: unknown;
  recipientName?: unknown;
  placesCount?: unknown;
  paymentMethod?: unknown;
}) {
  const title = `Новая заявка #${input.id}`;
  const senderName = compactText(input.senderName, "Отправитель");
  const fromAddress = compactText(input.senderAddress, "");
  const toAddress = compactText(input.deliveryAddress || input.recipientAddress, "Адрес не указан");

  const route = fromAddress ? `${senderName}, ${fromAddress} → ${toAddress}` : `${senderName} → ${toAddress}`;
  return {
    title,
    body: truncatePushText(route, 150),
  };
}

// ─── Manager JWT helpers ─────────────────────────────────────────────────────
const MANAGER_JWT_SECRET = new TextEncoder().encode(
  process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production"
);
const MANAGER_TOKEN_EXPIRY = "30d";
async function signManagerToken(managerId: number): Promise<string> {
  return new SignJWT({ managerId, type: "manager" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(MANAGER_TOKEN_EXPIRY)
    .sign(MANAGER_JWT_SECRET);
}
async function verifyManagerToken(token: string): Promise<{ managerId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, MANAGER_JWT_SECRET);
    if (payload.type !== "manager" || typeof payload.managerId !== "number") return null;
    return { managerId: payload.managerId as number };
  } catch {
    return null;
  }
}

// ─── Courier JWT helpers ──────────────────────────────────────────────────────
const COURIER_JWT_SECRET = new TextEncoder().encode(
  process.env.COURIER_JWT_SECRET ?? "courier-secret-key-change-in-production"
);
const COURIER_TOKEN_EXPIRY = "7d";

async function signCourierToken(courierId: number): Promise<string> {
  return new SignJWT({ courierId, type: "courier" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(COURIER_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(COURIER_JWT_SECRET);
}

export async function verifyCourierToken(token: string): Promise<{ courierId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, COURIER_JWT_SECRET);
    if (payload.type !== "courier" || typeof payload.courierId !== "number") return null;
    return { courierId: payload.courierId };
  } catch {
    return null;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ─── OAuth auth (kept for manager website integration) ─────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Manager authentication (login/password) ──────────────────────────────
  managerAuth: router({
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const manager = await db.getManagerByUsername(input.username);
        if (!manager) throw new Error("Неверный логин или пароль");
        if (!manager.isActive) throw new Error("Аккаунт менеджера деактивирован");
        const valid = await bcrypt.compare(input.password, manager.passwordHash);
        if (!valid) throw new Error("Неверный логин или пароль");
        const token = await signManagerToken(manager.id);
        return {
          token,
          manager: {
            id: manager.id,
            name: manager.name,
            username: manager.username,
            email: manager.email,
            isActive: manager.isActive,
          },
        };
      }),
    getDemoToken: publicProcedure
      .mutation(async () => {
        const managerId = await db.seedDemoManager();
        const token = await signManagerToken(managerId);
        const manager = await db.getManagerById(managerId);
        if (!manager) throw new Error("Менеджер не найден");
        return {
          token,
          manager: {
            id: manager.id,
            name: manager.name,
            username: manager.username,
            email: manager.email,
            isActive: manager.isActive,
          },
        };
      }),
  }),
  // ─── Courier authentication (login/password) ───────────────────────────────
  courierAuth: router({
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const courier = await db.getCourierByUsername(input.username);
        if (!courier) throw new Error("Неверный логин или пароль");
        if (!courier.isActive) throw new Error("Аккаунт курьера деактивирован");
        const valid = await bcrypt.compare(input.password, courier.passwordHash);
        if (!valid) throw new Error("Неверный логин или пароль");
        const token = await signCourierToken(courier.id);
        return {
          token,
          courier: {
            id: courier.id,
            name: courier.name,
            username: courier.username,
            phone: courier.phone,
            vehicleType: courier.vehicleType,
            isActive: courier.isActive,
            totalDeliveries: courier.totalDeliveries,
          },
        };
      }),

    me: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const courier = await db.getCourierById(payload.courierId);
        if (!courier) throw new Error("Курьер не найден");
        return {
          id: courier.id,
          name: courier.name,
          username: courier.username,
          phone: courier.phone,
          vehicleType: courier.vehicleType,
          isActive: courier.isActive,
          totalDeliveries: courier.totalDeliveries,
        };
      }),

    getDemoToken: publicProcedure
      .mutation(async () => {
        const courierId = await db.seedDemoCourier();
        const token = await signCourierToken(courierId);
        const courier = await db.getCourierById(courierId);
        if (!courier) throw new Error("Курьер не найден");
        return {
          token,
          courier: {
            id: courier.id,
            name: courier.name,
            username: courier.username,
            phone: courier.phone,
            vehicleType: courier.vehicleType,
            isActive: courier.isActive,
            totalDeliveries: courier.totalDeliveries,
          },
        };
      }),
  }),

  // ─── Couriers list (for picker in task card) ───────────────────────────────
  couriers: router({
    /**
     * All active couriers — used for the courier picker inside task card.
     */
    list: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        return db.getAllCouriers();
      }),

    registerPushToken: publicProcedure
      .input(z.object({ token: z.string(), pushToken: z.string() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        // Store push token for courier (best-effort, no-op if DB unavailable)
        try {
          await db.updateCourier(payload.courierId, { pushToken: input.pushToken });
        } catch { /* ignore */ }
        return { success: true };
      }),
  }),

  // ─── Tasks ────────────────────────────────────────────────────────────────────
  tasks: router({
    /**
     * Shared operations board: all active tasks for all couriers, plus dated history.
     */
    all: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const [activeTasks, completedTasks] = await Promise.all([
          db.getAllTasksWithCourier(),
          input.date ? db.getTasksByDateWithCourier(input.date) : db.getCompletedTasksWithCourier(),
        ]);
        const completedForDate = completedTasks.filter((task) => task.status === "completed" || task.status === "cancelled");
        const taskMap = new Map([...activeTasks, ...completedForDate].map((task) => [task.id, task]));

        return Array.from(taskMap.values());
      }),

    /**
     * Task history (completed/cancelled tasks)
     */
    history: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        return db.getCompletedTasksWithCourier();
      }),

    /**
     * Get single task by ID
     */
    byId: publicProcedure
      .input(z.object({
        token: z.string(),
        id: z.number(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        return db.getTaskWithCourierById(input.id);
      }),

    /**
     * Assign courier to task
     */
    assignCourier: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        courierId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");

        // If assigning a courier, set status to assigned; if removing, keep current status
        const newStatus = input.courierId ? "assigned" : task.status;

        await db.assignTaskToCourier(input.taskId, input.courierId, newStatus);
        await updateRequestStatusFromTask(input.taskId, newStatus, input.courierId);
        broadcastLive("tasks_changed", { taskId: input.taskId, courierId: input.courierId });
        broadcastLive("requests_changed", { taskId: input.taskId, courierId: input.courierId });
        return { success: true };
      }),

    /**
     * Set task status: in_progress | completed | cancelled | assigned
     * Auto-assigns current courier if task is unassigned and status is in_progress/completed
     * Clears courier if reverting from in_progress/completed back to assigned
     */
    setStatus: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        status: z.enum(["assigned", "in_progress", "completed", "cancelled"]),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        
        // Allow reverting from completed/cancelled back to assigned
        if ((task.status === "completed" || task.status === "cancelled") && input.status !== "assigned") {
          throw new Error("Завершенное задание нельзя изменить");
        }

        const extra: Record<string, unknown> = {};
        let courierId = task.courierId;

        // Auto-assign current courier if task is unassigned and status is being set to in_progress or completed
        if (!task.courierId && (input.status === "in_progress" || input.status === "completed")) {
          courierId = payload.courierId;
          extra.courierId = courierId;
        }

        // Clear courier assignment if reverting from in_progress/completed back to assigned
        if (input.status === "assigned" && task.status !== "assigned") {
          courierId = null;
          extra.courierId = null;
        }

        if (input.status === "completed") {
          extra.completedAt = new Date();
          // Increment deliveries for assigned courier
          if (courierId) {
            await db.incrementCourierDeliveries(courierId);
          }
        } else if (input.status === "assigned") {
          // Clear completed timestamp when reverting
          extra.completedAt = null;
        }

        await db.updateTaskStatus(input.taskId, input.status, extra);
        await updateRequestStatusFromTask(input.taskId, input.status, courierId);
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: input.status,
          note: input.status === "assigned"
            ? "Назначение отменено"
            : input.status === "in_progress"
            ? "Курьер выехал"
            : input.status === "completed"
            ? "Доставка выполнена"
            : "Задание отменено",
        });
        broadcastLive("tasks_changed", { taskId: input.taskId, courierId });
        broadcastLive("requests_changed", { taskId: input.taskId, courierId });
        return { success: true };
      }),

    /**
     * Update urgency thresholds for current courier
     */
    updateUrgencyThresholds: publicProcedure
      .input(z.object({
        token: z.string(),
        urgencyThresholdOrange: z.number().min(1),
        urgencyThresholdRed: z.number().min(1),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        await db.updateCourierUrgencyThresholds(
          payload.courierId,
          input.urgencyThresholdOrange,
          input.urgencyThresholdRed
        );
        return { success: true };
      }),

    /**
     * Update places count for a task
     */
    updatePlaces: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        placesCount: z.number().min(1),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");

        await db.updateTaskStatus(input.taskId, task.status, { placesCount: input.placesCount });
        return { success: true };
      }),

    /**
     * Update courier comments for a task
     */
    updateComments: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        courierComments: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");

        await db.updateTaskCourierComments(input.taskId, input.courierComments);
        return { success: true };
      }),

    /**
     * Reschedule task to a different date
     */
    rescheduleTask: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        newDate: z.date(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");

        const newDateStr = input.newDate.toISOString().split("T")[0];
        await db.updateTaskDate(input.taskId, input.newDate);
        return { success: true };
      }),

    /**
     * Seed demo data (create demo tasks)
     */
    seedDemo: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const today = new Date().toISOString().split("T")[0];
        const demoTasks = [
          {
            status: "assigned" as const,
            senderName: "ООО Основа движения",
            senderAddress: "ул. Ленина, 5, Улан-Удэ",
            senderPhone: "+7 (301) 234-5678",
            recipientName: "Иван Петров",
            recipientAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (901) 234-5678",
            deliveryTimeFrom: "09:00",
            deliveryTimeTo: "11:00",
            placesCount: 1,
            taskType: "regular" as const,
          },
          {
            status: "assigned" as const,
            senderName: "HelloKorea Café",
            senderAddress: "ул. Ленина, 15, Улан-Удэ",
            senderPhone: "+7 (301) 234-5679",
            recipientName: "Мария Сидорова",
            recipientAddress: "ул. Красная, 8, кв. 20, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (902) 345-6789",
            deliveryTimeFrom: "14:00",
            deliveryTimeTo: "16:00",
            placesCount: 2,
            taskType: "regular" as const,
          },
          {
            status: "assigned" as const,
            senderName: "Гемотест Лаборатория",
            senderAddress: "ул. Октябрьская, 1, Улан-Удэ",
            senderPhone: "+7 (301) 234-5680",
            recipientName: "Клиника №1",
            recipientAddress: "ул. Чайковского, 5, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (301) 234-5681",
            deliveryTimeFrom: "10:00",
            deliveryTimeTo: "12:00",
            placesCount: 1,
            taskType: "regular" as const,
          },
          {
            status: "assigned" as const,
            senderName: "Сбербанк Отделение",
            senderAddress: "ул. Ленина, 25, Улан-Удэ",
            senderPhone: "+7 (301) 234-5682",
            recipientName: "Офис ООО Компания",
            recipientAddress: "ул. Пролетарская, 10, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (301) 234-5683",
            deliveryTimeFrom: "15:00",
            deliveryTimeTo: "17:00",
            placesCount: 3,
            taskType: "regular" as const,
          },
          {
            status: "assigned" as const,
            senderName: "Склад Товаров",
            senderAddress: "ул. Промышленная, 1, Улан-Удэ",
            senderPhone: "+7 (301) 234-5684",
            recipientName: "Магазин Электроники",
            recipientAddress: "ул. Сухэ-Батора, 3, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (301) 234-5685",
            deliveryTimeFrom: "11:00",
            deliveryTimeTo: "13:00",
            placesCount: 5,
            taskType: "regular" as const,
          },
          {
            status: "assigned" as const,
            senderName: "Гемотест Склад",
            senderAddress: "ул. Промышленная, 5, Улан-Удэ",
            senderPhone: "+7 (301) 234-5686",
            recipientName: "Аптека Здоровье",
            recipientAddress: "ул. Ленина, 30, Улан-Удэ",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "+7 (301) 234-5687",
            deliveryTimeFrom: "12:00",
            deliveryTimeTo: "14:00",
            placesCount: 2,
            taskType: "warehouse_pickup" as const,
            items: JSON.stringify([
              { category: "Орехи 200г", quantity: 10 },
              { category: "Орехи 500г", quantity: 5 },
              { category: "Масло кедровое", quantity: 3 },
            ]),
          },
          {
            status: "assigned" as const,
            senderName: "Вызов курьера",
            senderAddress: "ул. Советская, 50, офис 100, Улан-Удэ",
            senderPhone: "+7 (903) 456-7890",
            recipientName: "Документы",
            recipientAddress: "Адрес отправки",
            deliveryAddress: "ул. Советская, 12, кв. 45, Улан-Удэ",
            recipientPhone: "",
            deliveryTimeFrom: "13:00",
            deliveryTimeTo: "14:00",
            placesCount: 1,
            taskType: "courier_call" as const,
          },
        ];

        for (const taskData of demoTasks) {
          await db.createTask(taskData);
        }

        // Seed demo mails
        const demoMails = [
          {
            waybillNumber: "5376362735",
            recipientName: "Иван Петров",
            recipientPhone: "+7 (902) 123-4567",
            deliveryAddress: "ул. Ленина, 15, кв. 10, Улан-Удэ",
            status: "not_delivered" as const,
          },
          {
            waybillNumber: "4829156473",
            recipientName: "Мария Сидорова",
            recipientPhone: "+7 (903) 234-5678",
            deliveryAddress: "ул. Советская, 25, кв. 5, Улан-Удэ",
            status: "not_delivered" as const,
          },
          {
            waybillNumber: "7264918352",
            recipientName: "Алексей Иванов",
            recipientPhone: "+7 (904) 345-6789",
            deliveryAddress: "ул. Чайковского, 8, офис 12, Улан-Удэ",
            status: "not_delivered" as const,
          },
          {
            waybillNumber: "6183475926",
            recipientName: "Ольга Кузнецова",
            recipientPhone: "+7 (905) 456-7890",
            deliveryAddress: "ул. Красная, 42, кв. 3, Улан-Удэ",
            status: "not_delivered" as const,
          },
          {
            waybillNumber: "9547382615",
            recipientName: "Дмитрий Волков",
            recipientPhone: "+7 (906) 567-8901",
            deliveryAddress: "пр. Октябрьской революции, 100, кв. 20, Улан-Удэ",
            status: "not_delivered" as const,
          },
          {
            waybillNumber: "3821647590",
            recipientName: "Елена Морозова",
            recipientPhone: "+7 (907) 678-9012",
            deliveryAddress: "ул. Смолина, 18, кв. 7, Улан-Удэ",
            status: "delivered" as const,
            recipientSignature: "Е. Морозова",
            deliveredAt: new Date(Date.now() - 3600000),
          },
          {
            waybillNumber: "5729384601",
            recipientName: "Сергей Орлов",
            recipientPhone: "+7 (908) 789-0123",
            deliveryAddress: "ул. Пролетарская, 55, кв. 12, Улан-Удэ",
            status: "delivered" as const,
            recipientSignature: "С. Орлов",
            deliveredAt: new Date(Date.now() - 7200000),
          },
        ];

        for (const mailData of demoMails) {
          await db.createMail(mailData);
        }

        return { success: true, count: demoTasks.length + demoMails.length };
      }),
  }),

  // Hemotest pickup points
  hemotest: router({
    // Manager endpoints
    points: publicProcedure
      .query(async () => {
        return await db.getAllHemotestPoints();
      }),

    create: publicProcedure
      .input(z.object({
        name: z.string(),
        address: z.string(),
        phone: z.string().optional(),
        contactPerson: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const point = await db.createHemotestPoint(input);
        await sendPushToAllCouriers("Р“РµРјРѕС‚РµСЃС‚", `РќРѕРІР°СЏ С‚РѕС‡РєР°: ${input.name}`, {
          type: "hemotest_point_created",
          pointId: point.id,
        });
        broadcastLive("hemotest_changed", { pointId: point.id });
        return point;
      }),

    createList: publicProcedure
      .input(z.object({
        date: z.string(),
        name: z.string(),
        pointIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const list = await db.createHemotestPickupList(input);
        await sendPushToAllCouriers("Гемотест", `Новый список: ${input.pointIds.length} точек`, {
          type: "hemotest_list_created",
          listId: list.id,
        });
        broadcastLive("hemotest_changed", { type: "list_created", listId: list.id });
        broadcastLive("data_changed", { type: "hemotest_list_created", listId: list.id });
        return list;
      }),

    listsForDate: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        return await db.getHemotestPickupListsForDate(input.date);
      }),

    getList: publicProcedure
      .input(z.object({ listId: z.number() }))
      .query(async ({ input }) => {
        return await db.getHemotestPickupListWithItems(input.listId);
      }),

    addPointToList: publicProcedure
      .input(z.object({
        listId: z.number(),
        pointId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.addPointToHemotestList(input.listId, input.pointId);
        broadcastLive("hemotest_changed", { type: "list_item_added", listId: input.listId, pointId: input.pointId });
        broadcastLive("data_changed", { type: "hemotest_list_item_added", listId: input.listId, pointId: input.pointId });
        return { success: true };
      }),

    pickupPoints: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.coerce.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getHemotestPickupPointsForDate(payload.courierId, input.date);
      }),

    pickedCount: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.coerce.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getHemotestPickedCount(payload.courierId, input.date);
      }),

    togglePickup: publicProcedure
      .input(z.object({
        token: z.string(),
        pointId: z.number(),
        date: z.coerce.date(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        await db.toggleHemotestPickup(payload.courierId, input.pointId, input.date);
        broadcastLive("hemotest_changed", { pointId: input.pointId, courierId: payload.courierId });
        return { success: true };
      }),
  }),

  // Sberbank pickup points
  sberbank: router({
    // Manager endpoints
    points: publicProcedure
      .query(async () => {
        return await db.getAllSberbankPoints();
      }),

    create: publicProcedure
      .input(z.object({
        name: z.string(),
        address: z.string(),
        phone: z.string().optional(),
        contactPerson: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const point = await db.createSberbankPoint(input);
        await sendPushToAllCouriers("РЎР±РµСЂР±Р°РЅРє", `РќРѕРІР°СЏ С‚РѕС‡РєР°: ${input.name}`, {
          type: "sberbank_point_created",
          pointId: point.id,
        });
        broadcastLive("sberbank_changed", { pointId: point.id });
        return point;
      }),

    scheduleForDay: publicProcedure
      .input(z.object({ dayOfWeek: z.number().min(1).max(5) }))
      .query(async ({ input }) => {
        return await db.getSberbankScheduleForDay(input.dayOfWeek);
      }),

    setScheduleForDay: publicProcedure
      .input(z.object({
        dayOfWeek: z.number().min(1).max(5),
        pointIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        await db.setSberbankScheduleForDay(input.dayOfWeek, input.pointIds);
        return { success: true };
      }),

    createList: publicProcedure
      .input(z.object({
        dayOfWeek: z.number().min(1).max(5),
        date: z.string(),
        name: z.string(),
        pointIds: z.array(z.number()),
      }))
      .mutation(async ({ input }) => {
        const list = await db.createSberbankPickupList(input);
        await sendPushToAllCouriers("Сбербанк", `Новый список: ${input.pointIds.length} точек`, {
          type: "sberbank_list_created",
          listId: list.id,
        });
        broadcastLive("sberbank_changed", { type: "list_created", listId: list.id });
        broadcastLive("data_changed", { type: "sberbank_list_created", listId: list.id });
        return list;
      }),

    listsForDate: publicProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input }) => {
        return await db.getSberbankPickupListsForDate(input.date);
      }),

    listsForDay: publicProcedure
      .input(z.object({ dayOfWeek: z.number().min(1).max(5) }))
      .query(async ({ input }) => {
        return await db.getSberbankPickupListsForDay(input.dayOfWeek);
      }),

    getList: publicProcedure
      .input(z.object({ listId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSberbankPickupListWithItems(input.listId);
      }),

    addPointToList: publicProcedure
      .input(z.object({
        listId: z.number(),
        pointId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.addPointToSberbankList(input.listId, input.pointId);
        broadcastLive("sberbank_changed", { type: "list_item_added", listId: input.listId, pointId: input.pointId });
        broadcastLive("data_changed", { type: "sberbank_list_item_added", listId: input.listId, pointId: input.pointId });
        return { success: true };
      }),

    // Courier endpoints
    pickupPoints: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.coerce.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getSberbankPickupPointsForDate(payload.courierId, input.date);
      }),

    pickedCount: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.coerce.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getSberbankPickedCount(payload.courierId, input.date);
      }),

    togglePickup: publicProcedure
      .input(z.object({
        token: z.string(),
        pointId: z.number(),
        date: z.coerce.date(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        await db.toggleSberbankPickup(payload.courierId, input.pointId, input.date);
        broadcastLive("sberbank_changed", { pointId: input.pointId, courierId: payload.courierId });
        return { success: true };
      }),
  }),

  // Mail router
  mails: router({
    all: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getAllMailsWithCourier();
      }),

    getByWaybill: publicProcedure
      .input(z.object({
        token: z.string(),
        waybillNumber: z.string(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getMailByWaybill(input.waybillNumber);
      }),

    markDelivered: publicProcedure
      .input(z.object({
        token: z.string(),
        waybillNumber: z.string(),
        recipientSignature: z.string(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        await db.updateMailDelivery(input.waybillNumber, input.recipientSignature, payload.courierId);
        broadcastLive("mails_changed", { waybillNumber: input.waybillNumber, courierId: payload.courierId });
        return { success: true };
      }),
  }),

  // ─── Manager Mail router ────────────────────────────────────────────────────
  managerMails: router({
    all: publicProcedure
      .input(z.object({
        status: z.enum(['all', 'not_delivered', 'delivered']).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return await db.getMailsByFilterWithCourier(input.status === 'all' ? undefined : input.status, input.dateFrom, input.dateTo);
      }),
    
    create: publicProcedure
      .input(z.object({
        waybillNumber: z.string().min(1),
        recipientName: z.string().optional().default(""),
        deliveryAddress: z.string().min(1),
        recipientPhone: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const id = await db.createMail(input);
        broadcastLive("mails_changed", { mailId: id });
        return { id, success: true };
      }),
  }),

  // ─── Clients router ──────────────────────────────────────────────────────────
  clients: router({
    all: publicProcedure.query(async () => {
      return await db.getAllClients();
    }),
    
    byId: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getClientById(input.id);
      }),
    
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        address: z.string().min(1),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // @ts-ignore - function exists but TypeScript cache issue
        const id = await db.createClient(input);
        return { id, success: true };
      }),
    
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        address: z.string().min(1).optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        // @ts-ignore - function exists but TypeScript cache issue
        await db.updateClient(id, data);
        return { success: true };
      }),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // @ts-ignore - function exists but TypeScript cache issue
        await db.deleteClient(input.id);
        return { success: true };
      }),
  }),

  // --- Requests (multi-type request creation) ---
  requests: router({
    create: publicProcedure
      .input(z.object({
        requestType: z.enum([
          "delivery",
          "movement",
          "nuts",
          "courier_call",
          "pickup_from_tc",
          "simple",
        ]),
        clientId: z.number().optional(),
        recipientName: z.string().optional().default(""),
        recipientPhone: z.string().optional().default(""),
        recipientAddress: z.string().optional(),
        recipientCompany: z.string().optional(),
        recipientCity: z.string().optional(),
        deliveryAddress: z.string().optional(),
        deliveryCity: z.string().optional(),
        packageDescription: z.string().optional(),
        packageType: z.enum(["document", "small", "medium", "large", "fragile"]).optional(),
        placesCount: z.number().nullable().optional(),
        senderName: z.string().optional(),
        senderCompany: z.string().optional(),
        senderCity: z.string().optional(),
        senderAddress: z.string().optional(),
        senderPhone: z.string().optional(),
        items: z.string().optional(),
        callReason: z.string().optional(),
        tcName: z.string().optional(),
        tcAddress: z.string().optional(),
        trackingNumber: z.string().optional(),
        description: z.string().optional(),
        specialInstructions: z.string().optional(),
        comments: z.string().optional(),
        paymentMethod: z.enum(["paid", "transfer", "cash", "terminal", "qr"]).optional(),
        paymentAmount: z.string().optional(),
        deliveryTimeFrom: z.string().optional(),
        deliveryTimeTo: z.string().optional(),
        estimatedMinutes: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const createdByUserId = ctx.user?.id ?? 0;
        const id = await db.createRequest({ ...input, createdByUserId });
        await syncTaskForRequestId(id);
        const push = buildNewRequestPush({ id, ...input });
        await sendPushToAllCouriers(push.title, push.body, {
          type: "new_request_available",
          requestId: id,
          requestType: input.requestType,
        });
        broadcastLive("requests_changed", { requestId: id });
        broadcastLive("tasks_changed", { requestId: id });
        return { id, success: true };
      }),

    all: publicProcedure
      .query(async () => {
        return await db.getAllRequests();
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return await db.getRequestById(input.id);
      }),

    updateStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "assigned", "in_progress", "completed", "cancelled"]),
      }))
      .mutation(async ({ input }) => {
        await db.updateRequestStatus(input.id, input.status);
        await syncTaskForRequestId(input.id);
        broadcastLive("requests_changed", { requestId: input.id });
        broadcastLive("tasks_changed", { requestId: input.id });
        return { success: true };
      }),

    assignCourier: publicProcedure
      .input(z.object({
        id: z.number(),
        courierId: z.number().nullable(),
      }))
      .mutation(async ({ input }) => {
        await db.assignRequestCourier(input.id, input.courierId);
        await syncTaskForRequestId(input.id);

        if (input.courierId) {
          try {
            const request = await db.getRequestById(input.id);
            const courier = await db.getCourierById(input.courierId);

            console.log("[PUSH] request", input.id);
            console.log("[PUSH] courier", courier?.id);
            console.log("[PUSH] token exists", !!courier?.pushToken);

            if (request && courier?.pushToken) {
              const address =
                request.deliveryAddress ||
                request.recipientAddress ||
                request.senderAddress ||
                "Адрес не указан";

              console.log("[PUSH] sending to", courier.pushToken.slice(0, 25));

              await sendExpoPush(
                courier.pushToken,
                `Назначена заявка #${request.id}`,
                truncatePushText(`${request.recipientName || "Клиент"} • ${address}`, 90),
                {
                  type: "new_request",
                  requestId: request.id,
                },
              );

              console.log("[PUSH] sent successfully");
            } else {
              console.log("[PUSH] skipped", {
                hasRequest: !!request,
                hasCourier: !!courier,
                hasToken: !!courier?.pushToken,
              });
            }
          } catch (e) {
            console.error("[PUSH] failed", e);
          }
        }

        broadcastLive("requests_changed", { requestId: input.id, courierId: input.courierId });
        broadcastLive("tasks_changed", { requestId: input.id, courierId: input.courierId });

        return { success: true };
      }),

    /**
     * Extract waybill data from PDF using LLM
     */
    extractFromPdf: publicProcedure
      .input(z.object({
        pdfBase64: z.string().min(1),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");
        const { storagePut } = await import("./storage");

        try {
          console.log("[PDF Extraction] Starting extraction process...");
          console.log("[PDF Extraction] PDF Base64 length:", input.pdfBase64.length);
          console.log("[PDF Extraction] File name:", input.fileName);
          
          // Convert base64 to buffer
          const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
          console.log("[PDF Extraction] PDF Buffer size:", pdfBuffer.length, "bytes");

          // Use LLM to extract data from PDF (send base64 directly)
          console.log("[PDF Extraction] Sending PDF to LLM for analysis...");
          console.log("[PDF Extraction] PDF Base64 length:", input.pdfBase64.length);
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a waybill/invoice document analyzer. Extract the following information from the PDF document and return ONLY a valid JSON object.

SENDER (Отправитель) - Look for sections labeled: Отправитель, Shipper, From, Sender, Отправитель адрес:
- Sender name (Фамилия отправителя, Last Name, Name)
- Sender company (Компания отправителя, Company, Organization, Компания)
- Sender phone (Телефон отправителя, Phone, Tel, Телефон)
- Sender city (Город отправителя, City, Город)
- Sender address (Адрес отправителя, Address, Адрес)

RECIPIENT (Получатель) - Look for sections labeled: Получатель, Recipient, To, Cnee, Получатель адрес:
- Recipient name (Фамилия получателя, Last Name, Name)
- Recipient company (Компания получателя, Company, Organization, Компания)
- Recipient phone (Телефон получателя, Phone, Tel, Телефон)
- Recipient city (Город получателя, City, Город)
- Recipient address (Адрес получателя, Address, Адрес)

IMPORTANT:
- If a field is not found or empty, return empty string ""
- Extract ONLY the values you can clearly see in the document
- Do not invent or assume data
- If there are multiple addresses, use the main/primary one
- Phone numbers should be in format as shown in document
- Return ONLY valid JSON, no other text

Return exactly this JSON structure:
{"senderName": "", "senderCompany": "", "senderPhone": "", "senderCity": "", "senderAddress": "", "recipientName": "", "recipientCompany": "", "recipientPhone": "", "recipientCity": "", "recipientAddress": ""}`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Please analyze this waybill/invoice document and extract all relevant delivery information. Return only the JSON object:",
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:application/pdf;base64,${input.pdfBase64}`,
                      detail: "high",
                    },
                  },
                ],
              },
            ],
          });

          // Parse the response
          console.log("[PDF Extraction] LLM response received");
          console.log("[PDF Extraction] Full response:", JSON.stringify(response, null, 2));
          console.log("[PDF Extraction] Response choices:", response.choices?.length);
          let content = response.choices[0]?.message?.content;
          console.log("[PDF Extraction] Content type:", typeof content);
          
          if (!content) {
            console.error("[PDF Extraction] ERROR: No content in response");
            console.error("[PDF Extraction] Full response:", JSON.stringify(response, null, 2));
            throw new Error("No content in LLM response");
          }
          
          // Convert array content to string if needed
          if (Array.isArray(content)) {
            console.log("[PDF Extraction] Content is an array, extracting text...");
            const textContent = content.find((c: any) => c.type === "text");
            if (textContent && (textContent as any).text) {
              content = (textContent as any).text;
              console.log("[PDF Extraction] Extracted text from array");
            } else {
              throw new Error(`Invalid LLM response format: expected string or text in array`);
            }
          }
          
          if (typeof content !== "string") {
            console.error("[PDF Extraction] ERROR: Content is not a string, it is:", typeof content);
            console.error("[PDF Extraction] Content:", JSON.stringify(content, null, 2));
            throw new Error(`Invalid LLM response format: expected string, got ${typeof content}`);
          }

          console.log("[PDF Extraction] Parsing JSON response...");
          
          // Handle markdown code blocks - LLM might wrap JSON in ```json ... ```
          let jsonString = content;
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
            console.log("[PDF Extraction] Extracted JSON from markdown block:", jsonString);
          }
          
          const extractedData = JSON.parse(jsonString);
          console.log("[PDF Extraction] ✓ Successfully extracted data:");
          console.log("[PDF Extraction] Sender:", {
            name: extractedData.senderName,
            company: extractedData.senderCompany,
            phone: extractedData.senderPhone,
            city: extractedData.senderCity,
            address: extractedData.senderAddress,
          });
          console.log("[PDF Extraction] Recipient:", {
            name: extractedData.recipientName,
            company: extractedData.recipientCompany,
            phone: extractedData.recipientPhone,
            city: extractedData.recipientCity,
            address: extractedData.recipientAddress,
          });

          console.log("[PDF Extraction] ✓ Extraction completed successfully");
          return {
            success: true,
            data: {
              senderName: extractedData.senderName || "",
              senderCompany: extractedData.senderCompany || "",
              senderPhone: extractedData.senderPhone || "",
              senderCity: extractedData.senderCity || "",
              senderAddress: extractedData.senderAddress || "",
              recipientName: extractedData.recipientName || "",
              recipientCompany: extractedData.recipientCompany || "",
              recipientPhone: extractedData.recipientPhone || "",
              recipientCity: extractedData.recipientCity || "",
              recipientAddress: extractedData.recipientAddress || "",
              deliveryAddress: extractedData.recipientAddress || "",
            },
          };
        } catch (error) {
          console.error("[PDF Extraction] ERROR during extraction:", error);
          if (error instanceof Error) {
            console.error("[PDF Extraction] Error message:", error.message);
            console.error("[PDF Extraction] Error stack:", error.stack);
          }
          throw new Error(
            `Failed to extract waybill data: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }),
  }),

  // ─── AI router ───────────────────────────────────────────────────────────────
  ai: router({
    parseRequest: publicProcedure
      .input(z.object({ text: z.string() }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import("./_core/llm");

        const systemPrompt = `Ты — ИИ-ассистент для курьерской службы. Проанализируй текст заявки и извлеки структурированные данные.
Верни ТОЛЬКО валидный JSON объект без дополнительного текста.

Структура ответа:
{
  "recipientName": "ФИО получателя",
  "recipientPhone": "телефон получателя или null",
  "deliveryAddress": "адрес доставки",
  "senderName": "имя отправителя или null",
  "senderPhone": "телефон отправителя или null",
  "senderAddress": "адрес отправителя или null",
  "packageDescription": "описание посылки или null",
  "specialInstructions": "особые инструкции или null",
  "paymentMethod": "paid | cash | transfer | terminal | qr",
  "deliveryTimeFrom": "HH:MM или null",
  "deliveryTimeTo": "HH:MM или null"
}

Правила:
- Извлеки ФИО, телефон и адрес доставки (обязательные поля)
- Если упоминается "оплачено" — paymentMethod = "paid"
- Если "наличные" — paymentMethod = "cash"
- Если "перевод" — paymentMethod = "transfer"
- Если "терминал" — paymentMethod = "terminal"
- Если "QR" — paymentMethod = "qr"
- По умолчанию paymentMethod = "paid"
- Верни ТОЛЬКО JSON, без пояснений`;

        const response = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Проанализируй текст заявки:\n\n${input.text}` },
          ],
        });

        let content = response.choices[0]?.message?.content;
        if (!content) throw new Error("Нет ответа от AI");

        if (Array.isArray(content)) {
          const textContent = content.find((c: any) => c.type === "text") as { type: "text"; text: string } | undefined;
          content = textContent?.text || "";
        }
        if (typeof content !== "string") throw new Error("Неверный формат ответа AI");

        // Strip markdown code blocks if present
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1].trim() : content.trim();

        const parsed = JSON.parse(jsonString);
        if (!parsed.recipientName || !parsed.deliveryAddress) {
          throw new Error("AI не смог извлечь обязательные поля (ФИО и адрес)");
        }
        return parsed;
      }),
  }),
});

export type AppRouter = typeof appRouter;
