import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { sendBulkPushNotifications, notifyNewTask } from "./_core/push-service";

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

// ─── Manager JWT helpers ──────────────────────────────────────────────────────

const MANAGER_JWT_SECRET = new TextEncoder().encode(
  process.env.MANAGER_JWT_SECRET ?? "manager-secret-key-change-in-production"
);
const MANAGER_TOKEN_EXPIRY = "7d";

async function signManagerToken(managerId: number): Promise<string> {
  return new SignJWT({ managerId, type: "manager" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(MANAGER_TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(MANAGER_JWT_SECRET);
}

export async function verifyManagerToken(token: string): Promise<{ managerId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, MANAGER_JWT_SECRET);
    if (payload.type !== "manager" || typeof payload.managerId !== "number") return null;
    return { managerId: payload.managerId };
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

  // ─── Manager authentication (login/password) ──────────────────────────────
  managerAuth: router({
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log("[managerAuth.login] Attempting login for:", input.username);
          const manager = await db.getManagerByUsername(input.username);
          if (!manager) throw new Error("Неверный логин или пароль");
          if (!manager.isActive) throw new Error("Аккаунт менеджера деактивирован");
          const valid = await bcrypt.compare(input.password, manager.passwordHash);
          if (!valid) throw new Error("Неверный логин или пароль");
          const token = await signManagerToken(manager.id);
          console.log("[managerAuth.login] Login successful for:", input.username);
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
        } catch (error) {
          console.error("[managerAuth.login] Error:", error);
          throw error;
        }
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
        const all = await db.getAllCouriers();
        return all
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name, username: c.username }));
      }),

    /**
     * Register Expo push token for a courier
     */
    registerPushToken: publicProcedure
      .input(z.object({ token: z.string(), pushToken: z.string() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        await db.updateCourierPushToken(payload.courierId, input.pushToken);
        return { success: true };
      }),
  }),

  // ─── Tasks ─────────────────────────────────────────────────────────────────
  tasks: router({
    /**
     * ALL tasks for a specific date — visible to every logged-in courier.
     * Filters by createdAt date (ignores time).
     */
    all: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getTasksByDateWithCourier(targetDate);
      }),

    /**
     * History: all tasks for a specific past date.
     * Filters by createdAt date (ignores time).
     */
    history: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getTasksByDateWithCourier(targetDate);
      }),

    byId: publicProcedure
      .input(z.object({ token: z.string(), id: z.number() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        return db.getTaskWithCourierById(input.id);
      }),

    /**
     * Assign a courier to a task (any courier can assign any courier).
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
        if (task.status === "completed" || task.status === "cancelled") {
          throw new Error("Нельзя изменить завершённое задание");
        }

        const newStatus = input.courierId ? "assigned" : "pending";
        await db.assignTaskToCourier(input.taskId, input.courierId, newStatus);
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: newStatus,
          changedByUserId: null,
          note: input.courierId
            ? `Назначен курьер #${input.courierId}`
            : "Курьер снят с задания",
        });
        return { success: true };
      }),

    /**
     * Set task status: in_progress | completed | cancelled
     */
    setStatus: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        status: z.enum(["pending", "assigned", "in_progress", "completed", "cancelled"]),
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
        if (input.status === "completed") {
          extra.completedAt = new Date();
          // Increment deliveries for assigned courier
          if (task.courierId) {
            await db.incrementCourierDeliveries(task.courierId);
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
        
        // Send push notification about status change
        if (task.courierId) {
          try {
            const pushToken = await db.getCourierPushToken(task.courierId);
            if (pushToken) {
              await notifyTaskStatusChange(pushToken, input.taskId, input.status);
            }
          } catch (error) {
            console.warn("[Push] Failed to send status change notification:", error);
          }
        }
        
        return { success: true };
      }),

    /**
     * Update places count for a task.
     */
    updatePlaces: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        placesCount: z.number().int().min(1).max(999),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        if (task.status === "completed" || task.status === "cancelled") {
          throw new Error("Нельзя изменить завершённое задание");
        }

        await db.updateTaskPlaces(input.taskId, input.placesCount);
        return { success: true };
      }),

    /**
     * Update delivery time interval for a task.
     */
    updateTimeInterval: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        deliveryTimeFrom: z.string().nullable(),
        deliveryTimeTo: z.string().nullable(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        if (task.status === "completed" || task.status === "cancelled") {
          throw new Error("Нельзя изменить завершённое задание");
        }

        await db.updateTaskTimeInterval(input.taskId, input.deliveryTimeFrom, input.deliveryTimeTo);
        return { success: true };
      }),

    updateComments: publicProcedure
      .input(z.object({
        token: z.string(),
        taskId: z.number(),
        courierComments: z.string().min(1).max(1000),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        if (task.status === "completed" || task.status === "cancelled") {
          throw new Error("Нельзя изменить завершённое задание");
        }

        await db.updateTaskCourierComments(input.taskId, input.courierComments);
        return { success: true };
      }),

    updateUrgencyThresholds: publicProcedure
      .input(z.object({
        token: z.string(),
        urgencyThresholdOrange: z.number().min(1).max(1440),
        urgencyThresholdRed: z.number().min(1).max(1440),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        if (input.urgencyThresholdRed >= input.urgencyThresholdOrange) {
          throw new Error("Красный порог должен быть меньше оранжевого");
        }
        await db.updateCourierUrgencyThresholds(
          payload.courierId,
          input.urgencyThresholdOrange,
          input.urgencyThresholdRed
        );
        return { success: true };
      }),

    seedDemoCourier: publicProcedure
      .mutation(async () => {
        const courierId = await db.seedDemoCourier();
        return { courierId, username: "demo", password: "demo123" };
      }),

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
        if (task.status === "completed" || task.status === "cancelled") {
          throw new Error("Нельзя перенести завершённое задание");
        }

        const newCreatedAt = new Date(input.newDate);
        newCreatedAt.setHours(task.createdAt.getHours(), task.createdAt.getMinutes(), task.createdAt.getSeconds());
        
        await db.updateTaskDate(input.taskId, newCreatedAt);
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: task.status,
          changedByUserId: null,
          note: `Задание перенесено на ${newCreatedAt.toLocaleDateString("ru-RU")}`,
        });
        return { success: true };
      }),

    seedDemo: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        await db.seedDemoTasks();
        await db.seedDemoHemotestPoints();
        await db.seedDemoSberbankPoints();
        return { success: true };
      }),
  }),

  // ─── Hemotest Pickup Points ────────────────────────────────────────────────
  hemotest: router({
    pickupPoints: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getHemotestPickupPointsForDate(payload.courierId, targetDate);
      }),

    togglePickup: publicProcedure
      .input(z.object({
        token: z.string(),
        pointId: z.number(),
        date: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        await db.toggleHemotestPickup(payload.courierId, input.pointId, targetDate);
        return { success: true };
      }),

    pickedCount: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getHemotestPickedCount(payload.courierId, targetDate);
      }),
  }),

  // ─── Sberbank Pickup Points ────────────────────────────────────────────────
  sberbank: router({
    pickupPoints: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getSberbankPickupPointsForDate(payload.courierId, targetDate);
      }),

    togglePickup: publicProcedure
      .input(z.object({
        token: z.string(),
        pointId: z.number(),
        date: z.date().optional(),
      }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        await db.toggleSberbankPickup(payload.courierId, input.pointId, targetDate);
        return { success: true };
      }),

    pickedCount: publicProcedure
      .input(z.object({ token: z.string(), date: z.date().optional() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        const targetDate = input.date || new Date();
        return db.getSberbankPickedCount(payload.courierId, targetDate);
      }),
  }),

  // ─── Manager API ─────────────────────────────────────────────────────────────
  manager: router({
    allTasks: protectedProcedure.query(async () => {
      return db.getAllTasksWithCourier();
    }),

    allCouriers: protectedProcedure.query(async () => {
      return db.getAllCouriers();
    }),

    createCourier: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        username: z.string().min(3).max(50),
        password: z.string().min(4),
        phone: z.string().optional(),
        vehicleType: z.enum(["bicycle", "scooter", "car", "foot"]).default("scooter"),
      }))
      .mutation(async ({ input }) => {
        const existing = await db.getCourierByUsername(input.username);
        if (existing) throw new Error("Логин уже занят");
        const passwordHash = await bcrypt.hash(input.password, 10);
        const id = await db.createCourier({
          name: input.name,
          username: input.username,
          passwordHash,
          phone: input.phone ?? null,
          vehicleType: input.vehicleType,
          isActive: true,
          totalDeliveries: 0,
        });
        return { id };
      }),

    createTask: protectedProcedure
      .input(z.object({
        recipientName: z.string().min(1),
        recipientPhone: z.string().optional(),
        deliveryAddress: z.string().min(1),
        deliveryCity: z.string().optional(),
        recipientAddress: z.string().optional(),
        senderName: z.string().optional(),
        senderAddress: z.string().optional(),
        packageDescription: z.string().optional(),
        packageType: z.enum(["document", "small", "medium", "large", "fragile"]).default("small"),
        specialInstructions: z.string().optional(),
        estimatedMinutes: z.number().optional(),
        placesCount: z.number().int().min(1).default(1),
        deliveryTimeFrom: z.string().optional(),
        deliveryTimeTo: z.string().optional(),
        courierId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const taskId = await db.createTask({
          createdByUserId: ctx.user.id,
          courierId: input.courierId ?? null,
          status: input.courierId ? "assigned" : "pending",
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone ?? null,
          deliveryAddress: input.deliveryAddress,
          deliveryCity: input.deliveryCity ?? null,
          recipientAddress: input.recipientAddress ?? null,
          senderName: input.senderName ?? null,
          senderAddress: input.senderAddress ?? null,
          packageDescription: input.packageDescription ?? null,
          packageType: input.packageType,
          specialInstructions: input.specialInstructions ?? null,
          estimatedMinutes: input.estimatedMinutes ?? null,
          placesCount: input.placesCount,
          deliveryTimeFrom: input.deliveryTimeFrom ?? null,
          deliveryTimeTo: input.deliveryTimeTo ?? null,
        });
        await db.addTaskStatusHistory({
          taskId,
          status: input.courierId ? "assigned" : "pending",
          changedByUserId: ctx.user.id,
          note: "Задание создано менеджером",
        });
        
        // Send push notification if courier is assigned
        if (input.courierId) {
          try {
            const pushToken = await db.getCourierPushToken(input.courierId);
            if (pushToken) {
              await notifyNewTask(pushToken, taskId, input.recipientName);
            }
          } catch (error) {
            console.warn("[Push] Failed to send notification:", error);
          }
        }
        
        return { taskId };
      }),

    assignTask: protectedProcedure
      .input(z.object({ taskId: z.number(), courierId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.assignTaskToCourier(input.taskId, input.courierId, "assigned");
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "assigned",
          changedByUserId: ctx.user.id,
          note: `Задание назначено курьеру #${input.courierId}`,
        });
        return { success: true };
      }),

    taskHistory: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return db.getTaskStatusHistory(input.taskId);
      }),

    notificationSettings: router({
      get: protectedProcedure
        .query(async () => {
          const settings = await db.getNotificationSettings(1);
          if (!settings) {
            return await db.createDefaultNotificationSettings(1);
          }
          return settings;
        }),

      update: protectedProcedure
        .input(z.object({
          enabled: z.boolean().optional(),
          newTasks: z.boolean().optional(),
          statusChanges: z.boolean().optional(),
          messages: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          return await db.upsertNotificationSettings(1, input);
        }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
