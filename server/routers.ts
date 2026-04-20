import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

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
  }),

  // ─── Tasks ────────────────────────────────────────────────────────────────────
  tasks: router({
    /**
     * All tasks for a given date (visible to all couriers)
     */
    all: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date().optional(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const date = input.date ?? new Date();
        return db.getTasksByDateWithCourier(date);
      }),

    /**
     * Task history (completed/cancelled tasks)
     */
    history: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date().optional(),
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
        return await db.createHemotestPoint(input);
      }),

    pickupPoints: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getHemotestPickupPointsForDate(payload.courierId, input.date);
      }),

    pickedCount: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date(),
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
        date: z.date(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        await db.toggleHemotestPickup(payload.courierId, input.pointId, input.date);
        return { success: true };
      }),
  }),

  // Sberbank pickup points
  sberbank: router({
    pickupPoints: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date(),
      }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        return await db.getSberbankPickupPointsForDate(payload.courierId, input.date);
      }),

    pickedCount: publicProcedure
      .input(z.object({
        token: z.string(),
        date: z.date(),
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
        date: z.date(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Invalid token");
        await db.toggleSberbankPickup(payload.courierId, input.pointId, input.date);
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
        return await db.getNotDeliveredMails();
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
        return { success: true };
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
        await db.updateClient(id, data);
        return { success: true };
      }),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteClient(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
