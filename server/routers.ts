import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Courier profile ────────────────────────────────────────────────────────
  courier: router({
    /**
     * Get or create courier profile for the logged-in user.
     * Returns the courier record linked to the current user.
     */
    me: protectedProcedure.query(async ({ ctx }) => {
      let courier = await db.getCourierByUserId(ctx.user.id);
      if (!courier) {
        // Auto-create courier profile on first login
        const id = await db.createCourier({
          userId: ctx.user.id,
          vehicleType: "scooter",
          isActive: true,
          totalDeliveries: 0,
        });
        courier = await db.getCourierByUserId(ctx.user.id);
      }
      return {
        ...courier,
        user: ctx.user,
      };
    }),

    /**
     * Seed demo tasks for the current courier (for testing/demo purposes).
     */
    seedDemoTasks: protectedProcedure.mutation(async ({ ctx }) => {
      let courier = await db.getCourierByUserId(ctx.user.id);
      if (!courier) {
        const id = await db.createCourier({
          userId: ctx.user.id,
          vehicleType: "scooter",
          isActive: true,
          totalDeliveries: 0,
        });
        courier = await db.getCourierByUserId(ctx.user.id);
      }
      if (!courier) throw new Error("Failed to get courier");
      await db.seedDemoTasksForCourier(courier.id);
      return { success: true };
    }),
  }),

  // ─── Tasks (courier view) ───────────────────────────────────────────────────
  tasks: router({
    /**
     * Get active tasks assigned to the current courier.
     * Includes tasks with status: assigned, accepted, in_progress.
     */
    myActive: protectedProcedure.query(async ({ ctx }) => {
      const courier = await db.getCourierByUserId(ctx.user.id);
      if (!courier) return [];
      return db.getActiveTasksForCourier(courier.id);
    }),

    /**
     * Get task history for the current courier (completed + rejected).
     */
    myHistory: protectedProcedure.query(async ({ ctx }) => {
      const courier = await db.getCourierByUserId(ctx.user.id);
      if (!courier) return [];
      return db.getTaskHistoryForCourier(courier.id);
    }),

    /**
     * Get a single task by ID.
     */
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.getTaskById(input.id);
      }),

    /**
     * Accept a task — courier confirms they will deliver.
     */
    accept: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const courier = await db.getCourierByUserId(ctx.user.id);
        if (!courier) throw new Error("Courier profile not found");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Task not found");
        if (task.courierId !== courier.id) throw new Error("Task not assigned to you");
        if (task.status !== "assigned") throw new Error("Task cannot be accepted in current status");

        await db.updateTaskStatus(input.taskId, "accepted", {
          acceptedAt: new Date(),
        });
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "accepted",
          changedByUserId: ctx.user.id,
          note: "Курьер принял задание",
        });
        return { success: true };
      }),

    /**
     * Reject a task — courier declines the delivery.
     */
    reject: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const courier = await db.getCourierByUserId(ctx.user.id);
        if (!courier) throw new Error("Courier profile not found");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Task not found");
        if (task.courierId !== courier.id) throw new Error("Task not assigned to you");
        if (!["assigned", "accepted"].includes(task.status)) {
          throw new Error("Task cannot be rejected in current status");
        }

        await db.updateTaskStatus(input.taskId, "rejected", {
          rejectionReason: input.reason ?? null,
        });
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "rejected",
          changedByUserId: ctx.user.id,
          note: input.reason ?? "Курьер отклонил задание",
        });
        return { success: true };
      }),

    /**
     * Mark task as in_progress — courier picked up the package.
     */
    startDelivery: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const courier = await db.getCourierByUserId(ctx.user.id);
        if (!courier) throw new Error("Courier profile not found");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Task not found");
        if (task.courierId !== courier.id) throw new Error("Task not assigned to you");
        if (task.status !== "accepted") throw new Error("Task must be accepted first");

        await db.updateTaskStatus(input.taskId, "in_progress");
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "in_progress",
          changedByUserId: ctx.user.id,
          note: "Курьер забрал посылку",
        });
        return { success: true };
      }),

    /**
     * Complete a task — courier confirms delivery.
     */
    complete: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const courier = await db.getCourierByUserId(ctx.user.id);
        if (!courier) throw new Error("Courier profile not found");

        const task = await db.getTaskById(input.taskId);
        if (!task) throw new Error("Task not found");
        if (task.courierId !== courier.id) throw new Error("Task not assigned to you");
        if (task.status !== "in_progress") throw new Error("Task must be in progress to complete");

        await db.updateTaskStatus(input.taskId, "completed", {
          completedAt: new Date(),
        });
        await db.addTaskStatusHistory({
          taskId: input.taskId,
          status: "completed",
          changedByUserId: ctx.user.id,
          note: "Доставка выполнена",
        });
        return { success: true };
      }),
  }),

  // ─── Manager API ─────────────────────────────────────────────────────────────
  manager: router({
    /**
     * Get all tasks (for manager dashboard on website).
     */
    allTasks: protectedProcedure.query(async () => {
      return db.getAllTasks();
    }),

    /**
     * Get all couriers (for manager dashboard on website).
     */
    allCouriers: protectedProcedure.query(async () => {
      return db.getAllCouriersWithUsers();
    }),

    /**
     * Create a new delivery task (manager action).
     */
    createTask: protectedProcedure
      .input(
        z.object({
          recipientName: z.string().min(1),
          recipientPhone: z.string().optional(),
          deliveryAddress: z.string().min(1),
          deliveryCity: z.string().optional(),
          packageDescription: z.string().optional(),
          packageType: z.enum(["document", "small", "medium", "large", "fragile"]).default("small"),
          specialInstructions: z.string().optional(),
          estimatedMinutes: z.number().optional(),
          courierId: z.number().optional(),
        })
      )
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

    /**
     * Assign a task to a courier (manager action).
     */
    assignTask: protectedProcedure
      .input(
        z.object({
          taskId: z.number(),
          courierId: z.number(),
        })
      )
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

    /**
     * Get status history for a task.
     */
    taskHistory: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ input }) => {
        return db.getTaskStatusHistory(input.taskId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
