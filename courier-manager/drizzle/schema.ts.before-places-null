import {
  boolean,
  decimal,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const vehicleTypeEnum = pgEnum("vehicleType", ["bicycle", "scooter", "car", "foot"]);
export const taskStatusEnum = pgEnum("taskStatus", ["assigned", "in_progress", "completed", "cancelled"]);
export const taskTypeEnum = pgEnum("taskType", ["regular", "warehouse_pickup", "courier_call"]);
export const packageTypeEnum = pgEnum("packageType", ["document", "small", "medium", "large", "fragile"]);
export const pickupListStatusEnum = pgEnum("pickupListStatus", ["active", "completed", "cancelled"]);
export const mailStatusEnum = pgEnum("mailStatus", ["not_delivered", "delivered"]);
export const requestTypeEnum = pgEnum("requestType", ["delivery", "movement", "nuts", "courier_call", "pickup_from_tc", "simple"]);
export const requestStatusEnum = pgEnum("requestStatus", ["pending", "assigned", "in_progress", "completed", "cancelled"]);
export const paymentMethodEnum = pgEnum("paymentMethod", ["paid", "transfer", "cash", "terminal", "qr"]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const couriers = pgTable("couriers", {
  id: serial("id").primaryKey(),
  userId: integer("userId"),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  vehicleType: vehicleTypeEnum("vehicleType").default("scooter").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  totalDeliveries: integer("totalDeliveries").default(0).notNull(),
  urgencyThresholdOrange: integer("urgencyThresholdOrange").default(60).notNull(),
  urgencyThresholdRed: integer("urgencyThresholdRed").default(30).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Courier = typeof couriers.$inferSelect;
export type InsertCourier = typeof couriers.$inferInsert;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  createdByUserId: integer("createdByUserId"),
  courierId: integer("courierId"),
  status: taskStatusEnum("status").default("assigned").notNull(),
  taskType: taskTypeEnum("taskType").default("regular").notNull(),
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientPhone: varchar("recipientPhone", { length: 20 }),
  deliveryAddress: text("deliveryAddress").notNull(),
  deliveryCity: varchar("deliveryCity", { length: 100 }),
  packageDescription: text("packageDescription"),
  packageType: packageTypeEnum("packageType").default("small").notNull(),
  specialInstructions: text("specialInstructions"),
  placesCount: integer("placesCount").default(1).notNull(),
  estimatedMinutes: integer("estimatedMinutes"),
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  recipientAddress: text("recipientAddress"),
  senderName: varchar("senderName", { length: 255 }),
  senderAddress: text("senderAddress"),
  senderPhone: varchar("senderPhone", { length: 20 }),
  comments: text("comments"),
  courierComments: text("courierComments"),
  items: text("items"),
  rejectionReason: text("rejectionReason"),
  scheduledAt: timestamp("scheduledAt"),
  acceptedAt: timestamp("acceptedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

export const taskStatusHistory = pgTable("taskStatusHistory", {
  id: serial("id").primaryKey(),
  taskId: integer("taskId").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  changedByUserId: integer("changedByUserId"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect;
export type InsertTaskStatusHistory = typeof taskStatusHistory.$inferInsert;

export const hemotestPickupPoints = pgTable("hemotestPickupPoints", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type HemotestPickupPoint = typeof hemotestPickupPoints.$inferSelect;
export type InsertHemotestPickupPoint = typeof hemotestPickupPoints.$inferInsert;

export const hemotestPickups = pgTable("hemotestPickups", {
  id: serial("id").primaryKey(),
  pointId: integer("pointId").notNull(),
  courierId: integer("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type HemotestPickup = typeof hemotestPickups.$inferSelect;
export type InsertHemotestPickup = typeof hemotestPickups.$inferInsert;

export const sberbankPickupPoints = pgTable("sberbankPickupPoints", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SberbankPickupPoint = typeof sberbankPickupPoints.$inferSelect;
export type InsertSberbankPickupPoint = typeof sberbankPickupPoints.$inferInsert;

export const sberbankPickups = pgTable("sberbankPickups", {
  id: serial("id").primaryKey(),
  pointId: integer("pointId").notNull(),
  courierId: integer("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SberbankPickup = typeof sberbankPickups.$inferSelect;
export type InsertSberbankPickup = typeof sberbankPickups.$inferInsert;

export const hemotestPickupLists = pgTable("hemotestPickupLists", {
  id: serial("id").primaryKey(),
  createdByUserId: integer("createdByUserId"),
  date: varchar("date", { length: 10 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: pickupListStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type HemotestPickupList = typeof hemotestPickupLists.$inferSelect;
export type InsertHemotestPickupList = typeof hemotestPickupLists.$inferInsert;

export const hemotestListItems = pgTable("hemotestListItems", {
  id: serial("id").primaryKey(),
  listId: integer("listId").notNull(),
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type HemotestListItem = typeof hemotestListItems.$inferSelect;
export type InsertHemotestListItem = typeof hemotestListItems.$inferInsert;

export const sberbankPickupLists = pgTable("sberbankPickupLists", {
  id: serial("id").primaryKey(),
  createdByUserId: integer("createdByUserId"),
  dayOfWeek: integer("dayOfWeek").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: pickupListStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SberbankPickupList = typeof sberbankPickupLists.$inferSelect;
export type InsertSberbankPickupList = typeof sberbankPickupLists.$inferInsert;

export const sberbankListItems = pgTable("sberbankListItems", {
  id: serial("id").primaryKey(),
  listId: integer("listId").notNull(),
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SberbankListItem = typeof sberbankListItems.$inferSelect;
export type InsertSberbankListItem = typeof sberbankListItems.$inferInsert;

export const mails = pgTable("mails", {
  id: serial("id").primaryKey(),
  waybillNumber: varchar("waybillNumber", { length: 50 }).notNull().unique(),
  recipientName: varchar("recipientName", { length: 255 }),
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  deliveryAddress: text("deliveryAddress").notNull(),
  status: mailStatusEnum("mailStatus").default("not_delivered").notNull(),
  recipientSignature: text("recipientSignature"),
  deliveredAt: timestamp("deliveredAt"),
  courierId: integer("courierId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Mail = typeof mails.$inferSelect;
export type InsertMail = typeof mails.$inferInsert;

export const sberbankPickupSchedule = pgTable("sberbankPickupSchedule", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("dayOfWeek").notNull(),
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type SberbankPickupSchedule = typeof sberbankPickupSchedule.$inferSelect;
export type InsertSberbankPickupSchedule = typeof sberbankPickupSchedule.$inferInsert;

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  createdByUserId: integer("createdByUserId").notNull(),
  requestType: requestTypeEnum("requestType").notNull(),
  status: requestStatusEnum("requestStatus").default("pending").notNull(),
  courierId: integer("courierId"),
  clientId: integer("clientId"),
  recipientName: varchar("recipientName", { length: 255 }),
  recipientPhone: varchar("recipientPhone", { length: 20 }),
  recipientAddress: text("recipientAddress"),
  deliveryAddress: text("deliveryAddress"),
  deliveryCity: varchar("deliveryCity", { length: 100 }),
  packageDescription: text("packageDescription"),
  packageType: packageTypeEnum("packageType"),
  placesCount: integer("placesCount").default(1),
  senderName: varchar("senderName", { length: 255 }),
  senderCompany: varchar("senderCompany", { length: 255 }),
  senderCity: varchar("senderCity", { length: 100 }),
  senderAddress: text("senderAddress"),
  senderPhone: varchar("senderPhone", { length: 20 }),
  recipientCompany: varchar("recipientCompany", { length: 255 }),
  recipientCity: varchar("recipientCity", { length: 100 }),
  items: text("items"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
  callReason: text("callReason"),
  tcName: varchar("tcName", { length: 255 }),
  tcAddress: text("tcAddress"),
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  description: text("description"),
  specialInstructions: text("specialInstructions"),
  comments: text("comments"),
  paymentMethod: paymentMethodEnum("paymentMethod"),
  paymentAmount: decimal("paymentAmount", { precision: 10, scale: 2 }),
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  estimatedMinutes: integer("estimatedMinutes"),
  scheduledAt: timestamp("scheduledAt"),
  acceptedAt: timestamp("acceptedAt"),
  completedAt: timestamp("completedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  nutsTariff: decimal("nutsTariff", { precision: 10, scale: 2 }).default("0"),
  cedroilTariff: decimal("cedroilTariff", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

export const managers = pgTable("managers", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type Manager = typeof managers.$inferSelect;
export type InsertManager = typeof managers.$inferInsert;
