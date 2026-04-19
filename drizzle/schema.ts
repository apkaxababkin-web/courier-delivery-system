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
  /** Urgency threshold in minutes for orange highlight (default: 60) */
  urgencyThresholdOrange: int("urgencyThresholdOrange").default(60).notNull(),
  /** Urgency threshold in minutes for red highlight (default: 30) */
  urgencyThresholdRed: int("urgencyThresholdRed").default(30).notNull(),
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
    "assigned",    // Assigned to courier, waiting for pickup
    "in_progress", // Courier picked up the package — "Я заберу"
    "completed",   // Delivery confirmed — "Доставлено"
    "cancelled",   // Manager cancelled the task
  ]).default("assigned").notNull(),
  /** Task type: regular delivery, warehouse pickup, or courier call */
  taskType: mysqlEnum("taskType", ["regular", "warehouse_pickup", "courier_call"]).default("regular").notNull(),
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
  /** Delivery time interval — e.g. "10:00" to "14:00" */
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  /** Recipient address (apartment/floor/etc) */
  recipientAddress: text("recipientAddress"),
  /** Sender name */
  senderName: varchar("senderName", { length: 255 }),
  /** Sender address (where to pick up the package) */
  senderAddress: text("senderAddress"),
  /** Sender phone number */
  senderPhone: varchar("senderPhone", { length: 20 }),
  /** Comments from manager with delivery instructions */
  comments: text("comments"),
  /** Comments from courier during delivery */
  courierComments: text("courierComments"),
  /** JSON array of items for warehouse_pickup tasks: [{"name": "Орехи 200г", "quantity": 5}] */
  items: text("items"),
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

/**
 * Hemotest pickup points — list of Hemotest collection points in Ulan-Ude
 */
export const hemotestPickupPoints = mysqlTable("hemotestPickupPoints", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HemotestPickupPoint = typeof hemotestPickupPoints.$inferSelect;
export type InsertHemotestPickupPoint = typeof hemotestPickupPoints.$inferInsert;

/**
 * Hemotest daily pickups — tracks which points were picked up by which courier on which day
 */
export const hemotestPickups = mysqlTable("hemotestPickups", {
  id: int("id").autoincrement().primaryKey(),
  pointId: int("pointId").notNull(),
  courierId: int("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HemotestPickup = typeof hemotestPickups.$inferSelect;
export type InsertHemotestPickup = typeof hemotestPickups.$inferInsert;

/**
 * Sberbank pickup points — list of Sberbank collection points in Ulan-Ude
 */
export const sberbankPickupPoints = mysqlTable("sberbankPickupPoints", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SberbankPickupPoint = typeof sberbankPickupPoints.$inferSelect;
export type InsertSberbankPickupPoint = typeof sberbankPickupPoints.$inferInsert;

/**
 * Sberbank daily pickups — tracks which points were picked up by which courier on which day
 */
export const sberbankPickups = mysqlTable("sberbankPickups", {
  id: int("id").autoincrement().primaryKey(),
  pointId: int("pointId").notNull(),
  courierId: int("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SberbankPickup = typeof sberbankPickups.$inferSelect;
export type InsertSberbankPickup = typeof sberbankPickups.$inferInsert;
