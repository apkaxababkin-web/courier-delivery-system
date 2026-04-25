import { boolean, decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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

/**
 * Hemotest pickup lists — manager-created lists of points to be picked up
 */
export const hemotestPickupLists = mysqlTable("hemotestPickupLists", {
  id: int("id").autoincrement().primaryKey(),
  /** Manager who created the list */
  createdByUserId: int("createdByUserId"),
  /** Date for which the list was created */
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  /** List name/description */
  name: varchar("name", { length: 255 }).notNull(),
  /** Status: active, completed, cancelled */
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HemotestPickupList = typeof hemotestPickupLists.$inferSelect;
export type InsertHemotestPickupList = typeof hemotestPickupLists.$inferInsert;

/**
 * Hemotest list items — points included in each list (with deduplication)
 */
export const hemotestListItems = mysqlTable("hemotestListItems", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the pickup list */
  listId: int("listId").notNull(),
  /** Reference to the pickup point */
  pointId: int("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HemotestListItem = typeof hemotestListItems.$inferSelect;
export type InsertHemotestListItem = typeof hemotestListItems.$inferInsert;

/**
 * Sberbank pickup lists — manager-created lists of points to be picked up
 */
export const sberbankPickupLists = mysqlTable("sberbankPickupLists", {
  id: int("id").autoincrement().primaryKey(),
  /** Manager who created the list */
  createdByUserId: int("createdByUserId"),
  /** Day of week for which the list was created (1-5 for Mon-Fri) */
  dayOfWeek: int("dayOfWeek").notNull(),
  /** List name/description */
  name: varchar("name", { length: 255 }).notNull(),
  /** Status: active, completed, cancelled */
  status: mysqlEnum("status", ["active", "completed", "cancelled"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SberbankPickupList = typeof sberbankPickupLists.$inferSelect;
export type InsertSberbankPickupList = typeof sberbankPickupLists.$inferInsert;

/**
 * Sberbank list items — points included in each list (with deduplication)
 */
export const sberbankListItems = mysqlTable("sberbankListItems", {
  id: int("id").autoincrement().primaryKey(),
  /** Reference to the pickup list */
  listId: int("listId").notNull(),
  /** Reference to the pickup point */
  pointId: int("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SberbankListItem = typeof sberbankListItems.$inferSelect;
export type InsertSberbankListItem = typeof sberbankListItems.$inferInsert;

/**
 * Mail/Letters — tracks mail deliveries for couriers
 */
export const mails = mysqlTable("mails", {
  id: int("id").autoincrement().primaryKey(),
  /** Waybill number — unique identifier for the mail */
  waybillNumber: varchar("waybillNumber", { length: 50 }).notNull().unique(),
  /** Recipient name */
  recipientName: varchar("recipientName", { length: 255 }),
  /** Recipient phone number */
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress").notNull(),
  /** Status: not_delivered or delivered */
  status: mysqlEnum("mailStatus", ["not_delivered", "delivered"]).default("not_delivered").notNull(),
  /** Recipient signature (text input by courier) */
  recipientSignature: text("recipientSignature"),
  /** Delivery date/time */
  deliveredAt: timestamp("deliveredAt"),
  /** Courier who delivered it */
  courierId: int("courierId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Mail = typeof mails.$inferSelect;
export type InsertMail = typeof mails.$inferInsert;

/**
 * Sberbank pickup schedule — templates for which points to pick up on each day of the week (Mon-Fri)
 * This allows managers to set recurring schedules like "always pick up points 1,3,5 on Monday"
 */
export const sberbankPickupSchedule = mysqlTable("sberbankPickupSchedule", {
  id: int("id").autoincrement().primaryKey(),
  /** Day of week: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday */
  dayOfWeek: int("dayOfWeek").notNull(), // 1-5 for Mon-Fri
  /** Pickup point ID */
  pointId: int("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SberbankPickupSchedule = typeof sberbankPickupSchedule.$inferSelect;
export type InsertSberbankPickupSchedule = typeof sberbankPickupSchedule.$inferInsert;

/**
 * Clients table — stores client information for creating regular delivery tasks
 * Clients like "Основа движения", "Hello Korea", etc.
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  /** Client name (required) */
  name: varchar("name", { length: 255 }).notNull(),
  /** Client address (required) - used as sender address for tasks */
  address: text("address").notNull(),
  /** Contact person name (optional) */
  contactPerson: varchar("contactPerson", { length: 255 }),
  /** Phone number (optional) */
  phone: varchar("phone", { length: 20 }),
  /** Email (optional) */
  email: varchar("email", { length: 320 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * Requests table — stores all types of requests created by managers
 * Supports multiple request types: Delivery, Movement, Nuts, Courier Call, Pickup from TC, Simple Request
 */
export const requests = mysqlTable("requests", {
  id: int("id").autoincrement().primaryKey(),
  /** Manager who created the request */
  createdByUserId: int("createdByUserId").notNull(),
  /** Request type: delivery, movement, nuts, courier_call, pickup_from_tc, simple */
  requestType: mysqlEnum("requestType", [
    "delivery",      // Доставка
    "movement",      // Перемещение
    "nuts",          // Орехи
    "courier_call",  // Вызов курьера
    "pickup_from_tc", // Забор груза с ТК
    "simple",        // Простая заявка
  ]).notNull(),
  
  /** Status: pending, assigned, in_progress, completed, cancelled */
  status: mysqlEnum("requestStatus", [
    "pending",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
  ]).default("pending").notNull(),
  
  /** Assigned courier ID (null = unassigned) */
  courierId: int("courierId"),
  
  // Common fields for all request types
  /** Client ID (for delivery/movement/nuts) */
  clientId: int("clientId"),
  /** Recipient name */
  recipientName: varchar("recipientName", { length: 255 }),
  /** Recipient phone */
  recipientPhone: varchar("recipientPhone", { length: 20 }),
  /** Recipient address (for courier_call apartment/office) */
  recipientAddress: text("recipientAddress"),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress"),
  /** Delivery city */
  deliveryCity: varchar("deliveryCity", { length: 100 }),
  
  // Delivery-specific fields
  /** Package description */
  packageDescription: text("packageDescription"),
  /** Package type: document, small, medium, large, fragile */
  packageType: mysqlEnum("packageType", ["document", "small", "medium", "large", "fragile"]),
  /** Number of places (packages) */
  placesCount: int("placesCount").default(1),
  
  // Movement-specific fields
  /** Sender name (for movement) */
  senderName: varchar("senderName", { length: 255 }),
  /** Sender company (for courier_call) */
  senderCompany: varchar("senderCompany", { length: 255 }),
  /** Sender city (for courier_call) */
  senderCity: varchar("senderCity", { length: 100 }),
  /** Sender address (for movement) */
  senderAddress: text("senderAddress"),
  /** Sender phone (for movement) */
  senderPhone: varchar("senderPhone", { length: 20 }),
  /** Recipient company (for courier_call) */
  recipientCompany: varchar("recipientCompany", { length: 255 }),
  /** Recipient city (for courier_call) */
  recipientCity: varchar("recipientCity", { length: 100 }),
  
  // Nuts-specific fields
  /** Items JSON: [{"name": "Орехи 200г", "quantity": 5}] */
  items: text("items"),
  /** Total amount for nuts request (in rubles) */
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }),
  
  // Courier Call-specific fields
  /** Reason for courier call */
  callReason: text("callReason"),
  
  // Pickup from TC-specific fields
  /** TC (Transport Company) name */
  tcName: varchar("tcName", { length: 255 }),
  /** TC address */
  tcAddress: text("tcAddress"),
  /** Tracking number */
  trackingNumber: varchar("trackingNumber", { length: 100 }),
  
  // Simple Request fields
  /** Simple request description */
  description: text("description"),
  
  // Common optional fields
  /** Special instructions */
  specialInstructions: text("specialInstructions"),
  /** Comments visible to couriers */
  comments: text("comments"),
  /** Payment method: paid, transfer, cash, terminal, qr */
  paymentMethod: mysqlEnum("paymentMethod", ["paid", "transfer", "cash", "terminal", "qr"]),
  /** Payment amount in rubles */
  paymentAmount: decimal("paymentAmount", { precision: 10, scale: 2 }),
  /** Delivery time from (HH:MM) */
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  /** Delivery time to (HH:MM) */
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  /** Estimated delivery minutes */
  estimatedMinutes: int("estimatedMinutes"),
  
  // Status tracking
  /** When the request was scheduled */
  scheduledAt: timestamp("scheduledAt"),
  /** When courier accepted the request */
  acceptedAt: timestamp("acceptedAt"),
  /** When the request was completed */
  completedAt: timestamp("completedAt"),
  /** Reason for cancellation or rejection */
  rejectionReason: text("rejectionReason"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;


/**
 * Settings table — stores application-wide settings like tariffs
 */
export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Tariff for nuts in rubles per kg */
  nutsTariff: decimal("nutsTariff", { precision: 10, scale: 2 }).default("0"),
  /** Tariff for cedar oil in rubles per unit */
  cedroilTariff: decimal("cedroilTariff", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;
