import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Couriers table — stores courier profile data linked to a user account.
 */
export const couriers = mysqlTable("couriers", {
  id: int("id").autoincrement().primaryKey(),
  /** Optional link to Manus OAuth user — null for couriers created by manager */
  userId: int("userId"),
  /** Display name of the courier */
  name: varchar("name", { length: 255 }).notNull(),
  /** Login username set by manager */
  username: varchar("username", { length: 100 }).notNull().unique(),
  /** Bcrypt hashed password */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  vehicleType: mysqlEnum("vehicleType", ["bicycle", "scooter", "car", "foot"]).default("scooter").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  totalDeliveries: int("totalDeliveries").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Courier = typeof couriers.$inferSelect;
export type InsertCourier = typeof couriers.$inferInsert;

/**
 * Delivery tasks table — tasks created by managers and assigned to couriers.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  /** Manager's user ID who created the task */
  createdByUserId: int("createdByUserId"),
  /** Assigned courier ID (null = unassigned) */
  courierId: int("courierId"),
  status: mysqlEnum("status", [
    "pending",     // Waiting to be assigned
    "assigned",    // Assigned to courier, waiting for pickup
    "in_progress", // Courier picked up the package — "Я заберу"
    "completed",   // Delivery confirmed — "Доставлено"
    "cancelled",   // Manager cancelled the task
  ]).default("pending").notNull(),
  /** Recipient information */
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientPhone: varchar("recipientPhone", { length: 20 }),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress").notNull(),
  deliveryCity: varchar("deliveryCity", { length: 100 }),
  /** Package details */
  packageDescription: text("packageDescription"),
  packageType: mysqlEnum("packageType", ["document", "small", "medium", "large", "fragile"]).default("small").notNull(),
  /** Special instructions for the courier */
  specialInstructions: text("specialInstructions"),
  /** Number of packages/boxes (places). Default 1 */
  placesCount: int("placesCount").default(1).notNull(),
  /** Estimated delivery time in minutes */
  estimatedMinutes: int("estimatedMinutes"),
  /** Note from courier or manager */
  rejectionReason: text("rejectionReason"),
  /** Timestamps */
  scheduledAt: timestamp("scheduledAt"),
  acceptedAt: timestamp("acceptedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Task status history — audit log of all status changes.
 */
export const taskStatusHistory = mysqlTable("taskStatusHistory", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  changedByUserId: int("changedByUserId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect;
export type InsertTaskStatusHistory = typeof taskStatusHistory.$inferInsert;
