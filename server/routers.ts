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
    /**
     * Login with username + password.
     * Returns a JWT token to be stored in SecureStore on the device.
     */
    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const courier = await db.getCourierByUsername(input.username);
        if (!courier) {
          throw new Error("Неверный логин или пароль");
        }
        if (!courier.isActive) {
          throw new Error("Аккаунт курьера деактивирован");
        }
        const valid = await bcrypt.compare(input.password, courier.passwordHash);
        if (!valid) {
          throw new Error("Неверный логин или пароль");
        }
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

    /**
     * Verify token and return courier profile.
     * Used on app startup to restore session.
     */
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
  }),

  // ─── Tasks (courier view) ───────────────────────────────────────────────────
  tasks: router({
    /**
     * Active tasks: assigned + in_progress
     */
    myActive: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        return db.getActiveTasksForCourier(payload.courierId);
      }),

    /**
     * History: completed + cancelled tasks
     */
    myHistory: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        return db.getTaskHistoryForCourier(payload.courierId);
      }),

    byId: publicProcedure
      .input(z.object({ token: z.string(), id: z.number() }))
      .query(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        return db.getTaskById(input.id);
      }),

    /**
     * "Я заберу" — courier picks up the package, task moves to in_progress.
     * Multiple tasks can be in_progress simultaneously.
     */
    pickup: publicProcedure
      .input(z.object({ token: z.string(), taskId: z.number() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        if (task.courierId !== payload.courierId) throw new Error("Задание не назначено вам");
        if (task.status !== "assigned") throw new Error("Задание уже взято или завершено");

        await db.updateTaskStatus(input.taskId, "in_progress");
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "in_progress",
          note: "Курьер забрал посылку",
        });
        return { success: true };
      }),

    /**
     * "Доставлено" — courier confirms delivery, task moves to completed.
     */
    complete: publicProcedure
      .input(z.object({ token: z.string(), taskId: z.number() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Задание не найдено");
        if (task.courierId !== payload.courierId) throw new Error("Задание не назначено вам");
        if (task.status !== "in_progress") throw new Error("Сначала нажмите 'Я заберу'");

        await db.updateTaskStatus(input.taskId, "completed", { completedAt: new Date() });
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "completed",
          note: "Доставка выполнена",
        });
        // Increment courier's total deliveries
        await db.incrementCourierDeliveries(payload.courierId);
        return { success: true };
      }),

    seedDemo: publicProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const payload = await verifyCourierToken(input.token);
        if (!payload) throw new Error("Недействительный токен");
        await db.seedDemoTasksForCourier(payload.courierId);
        return { success: true };
      }),
  }),

  // ─── Manager API ─────────────────────────────────────────────────────────────
  manager: router({
    allTasks: protectedProcedure.query(async () => {
      return db.getAllTasks();
    }),

    allCouriers: protectedProcedure.query(async () => {
      return db.getAllCouriers();
    }),

    /**
     * Create a new courier account (manager action).
     * Password is hashed before storage.
     */
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
        packageDescription: z.string().optional(),
        packageType: z.enum(["document", "small", "medium", "large", "fragile"]).default("small"),
        specialInstructions: z.string().optional(),
        estimatedMinutes: z.number().optional(),
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
          packageDescription: input.packageDescription ?? null,
          packageType: input.packageType,
          specialInstructions: input.specialInstructions ?? null,
          estimatedMinutes: input.estimatedMinutes ?? null,
        });
        await db.addTaskStatusHistory({
          taskId,
          status: input.courierId ? "assigned" : "pending",
          changedByUserId: ctx.user.id,
          note: "Задание создано менеджером",
        });
        return { taskId };
      }),

    assignTask: protectedProcedure
      .input(z.object({ taskId: z.number(), courierId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.assignTaskToCourier(input.taskId, input.courierId);
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
  }),
});

export type AppRouter = typeof appRouter;
