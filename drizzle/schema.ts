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
  unique,
} from "drizzle-orm/pg-core";

// ─── PostgreSQL Enums ────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const courierVehicleTypeEnum = pgEnum("courier_vehicle_type", [
  "bicycle",
  "scooter",
  "car",
  "foot",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);
export const taskTypeEnum = pgEnum("task_type", [
  "regular",
  "warehouse_pickup",
  "courier_call",
]);
export const packageTypeEnum = pgEnum("package_type", [
  "document",
  "small",
  "medium",
  "large",
  "fragile",
]);
export const mailStatusEnum = pgEnum("mail_status", ["not_delivered", "delivered"]);
export const pickupListStatusEnum = pgEnum("pickup_list_status", [
  "active",
  "completed",
  "cancelled",
]);
export const requestTypeEnum = pgEnum("request_type", [
  "delivery",
  "movement",
  "nuts",
  "courier_call",
  "pickup_from_tc",
  "simple",
]);
export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "paid",
  "transfer",
  "cash",
  "terminal",
  "qr",
]);

// ─── Users Table ─────────────────────────────────────────────────────────────

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Couriers Table ──────────────────────────────────────────────────────────

/**
 * Couriers table — stores courier profile data linked to a user account.
 */
export const couriers = pgTable("couriers", {
  id: serial("id").primaryKey(),
  /** Optional link to Manus OAuth user — null for couriers created by manager */
  userId: integer("userId"),
  /** Display name of the courier */
  name: varchar("name", { length: 255 }).notNull(),
  /** Login username set by manager */
  username: varchar("username", { length: 100 }).notNull().unique(),
  /** Bcrypt hashed password */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  vehicleType: courierVehicleTypeEnum("vehicleType").default("scooter").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  totalDeliveries: integer("totalDeliveries").default(0).notNull(),
  /** Urgency threshold in minutes for orange highlight (default: 60) */
  urgencyThresholdOrange: integer("urgencyThresholdOrange").default(60).notNull(),
  /** Urgency threshold in minutes for red highlight (default: 30) */
  urgencyThresholdRed: integer("urgencyThresholdRed").default(30).notNull(),
  /** Expo push notification token */
  pushToken: varchar("pushToken", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Courier = typeof couriers.$inferSelect;
export type InsertCourier = typeof couriers.$inferInsert;

// ─── Tasks Table ─────────────────────────────────────────────────────────────

/**
 * Delivery tasks table — tasks created by managers and assigned to couriers.
 */
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  /** Manager's user ID who created the task */
  createdByUserId: integer("createdByUserId"),
  /** Assigned courier ID (null = unassigned) */
  courierId: integer("courierId"),
  status: taskStatusEnum("status").default("assigned").notNull(),
  /** Task type: regular delivery, warehouse pickup, or courier call */
  taskType: taskTypeEnum("taskType").default("regular").notNull(),
  /** Recipient information */
  recipientName: varchar("recipientName", { length: 255 }).notNull(),
  recipientPhone: varchar("recipientPhone", { length: 20 }),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress").notNull(),
  deliveryCity: varchar("deliveryCity", { length: 100 }),
  /** Package details */
  packageDescription: text("packageDescription"),
  packageType: packageTypeEnum("packageType").default("small").notNull(),
  /** Special instructions for the courier */
  specialInstructions: text("specialInstructions"),
  /** Number of packages/boxes (places). Default 1 */
  placesCount: integer("placesCount"),
  /** Estimated delivery time in minutes */
  estimatedMinutes: integer("estimatedMinutes"),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Task Status History Table ───────────────────────────────────────────────

/**
 * Task status history — audit log of all status changes.
 */
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

// ─── Hemotest Pickup Points Table ────────────────────────────────────────────

/**
 * Hemotest pickup points — list of Hemotest collection points in Ulan-Ude
 */
export const hemotestPickupPoints = pgTable("hemotestPickupPoints", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type HemotestPickupPoint = typeof hemotestPickupPoints.$inferSelect;
export type InsertHemotestPickupPoint = typeof hemotestPickupPoints.$inferInsert;

// ─── Hemotest Pickups Table ──────────────────────────────────────────────────

/**
 * Hemotest daily pickups — tracks which points were picked up by which courier on which day
 */
export const hemotestPickups = pgTable("hemotestPickups", {
  id: serial("id").primaryKey(),
  pointId: integer("pointId").notNull(),
  courierId: integer("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type HemotestPickup = typeof hemotestPickups.$inferSelect;
export type InsertHemotestPickup = typeof hemotestPickups.$inferInsert;

// ─── Sberbank Pickup Points Table ────────────────────────────────────────────

/**
 * Sberbank pickup points — list of Sberbank collection points in Ulan-Ude
 */
export const sberbankPickupPoints = pgTable("sberbankPickupPoints", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SberbankPickupPoint = typeof sberbankPickupPoints.$inferSelect;
export type InsertSberbankPickupPoint = typeof sberbankPickupPoints.$inferInsert;

// ─── Sberbank Pickups Table ──────────────────────────────────────────────────

/**
 * Sberbank daily pickups — tracks which points were picked up by which courier on which day
 */
export const sberbankPickups = pgTable("sberbankPickups", {
  id: serial("id").primaryKey(),
  pointId: integer("pointId").notNull(),
  courierId: integer("courierId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SberbankPickup = typeof sberbankPickups.$inferSelect;
export type InsertSberbankPickup = typeof sberbankPickups.$inferInsert;

// ─── Hemotest Pickup Lists Table ─────────────────────────────────────────────

/**
 * Hemotest pickup lists — manager-created lists of points to be picked up
 */
export const hemotestPickupLists = pgTable("hemotestPickupLists", {
  id: serial("id").primaryKey(),
  /** Manager who created the list */
  createdByUserId: integer("createdByUserId"),
  /** Date for which the list was created */
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  /** List name/description */
  name: varchar("name", { length: 255 }).notNull(),
  /** Status: active, completed, cancelled */
  status: pickupListStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type HemotestPickupList = typeof hemotestPickupLists.$inferSelect;
export type InsertHemotestPickupList = typeof hemotestPickupLists.$inferInsert;

// ─── Hemotest List Items Table ───────────────────────────────────────────────

/**
 * Hemotest list items — points included in each list (with deduplication)
 */
export const hemotestListItems = pgTable("hemotestListItems", {
  id: serial("id").primaryKey(),
  /** Reference to the pickup list */
  listId: integer("listId").notNull(),
  /** Reference to the pickup point */
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HemotestListItem = typeof hemotestListItems.$inferSelect;
export type InsertHemotestListItem = typeof hemotestListItems.$inferInsert;

// ─── Sberbank Pickup Lists Table ─────────────────────────────────────────────

/**
 * Sberbank pickup lists — manager-created lists of points to be picked up
 */
export const sberbankPickupLists = pgTable("sberbankPickupLists", {
  id: serial("id").primaryKey(),
  /** Manager who created the list */
  createdByUserId: integer("createdByUserId"),
  /** Template day of week used by manager quick selection (1-5 for Mon-Fri) */
  dayOfWeek: integer("dayOfWeek").notNull(),
  /** Date for which the list was created */
  date: varchar("date", { length: 10 }), // YYYY-MM-DD format
  /** List name/description */
  name: varchar("name", { length: 255 }).notNull(),
  /** Status: active, completed, cancelled */
  status: pickupListStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SberbankPickupList = typeof sberbankPickupLists.$inferSelect;
export type InsertSberbankPickupList = typeof sberbankPickupLists.$inferInsert;

// ─── Sberbank List Items Table ───────────────────────────────────────────────

/**
 * Sberbank list items — points included in each list (with deduplication)
 */
export const sberbankListItems = pgTable("sberbankListItems", {
  id: serial("id").primaryKey(),
  /** Reference to the pickup list */
  listId: integer("listId").notNull(),
  /** Reference to the pickup point */
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SberbankListItem = typeof sberbankListItems.$inferSelect;
export type InsertSberbankListItem = typeof sberbankListItems.$inferInsert;

// ─── Mails Table ─────────────────────────────────────────────────────────────

/**
 * Mail/Letters — tracks mail deliveries for couriers
 */
export const mails = pgTable("mails", {
  id: serial("id").primaryKey(),
  /** Waybill number — unique identifier for the mail */
  waybillNumber: varchar("waybillNumber", { length: 50 }).notNull().unique(),
  /** Recipient name */
  recipientName: varchar("recipientName", { length: 255 }),
  /** Recipient phone number */
  recipientPhone: varchar("recipientPhone", { length: 20 }).notNull(),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress").notNull(),
  /** Status: not_delivered or delivered */
  status: mailStatusEnum("status").default("not_delivered").notNull(),
  /** Recipient signature (text input by courier) */
  recipientSignature: text("recipientSignature"),
  /** Delivery date/time */
  deliveredAt: timestamp("deliveredAt"),
  /** Courier who delivered it */
  courierId: integer("courierId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Mail = typeof mails.$inferSelect;
export type InsertMail = typeof mails.$inferInsert;

// ─── Sberbank Pickup Schedule Table ──────────────────────────────────────────

/**
 * Sberbank pickup schedule — templates for which points to pick up on each day of the week (Mon-Fri)
 * This allows managers to set recurring schedules like "always pick up points 1,3,5 on Monday"
 */
export const sberbankPickupSchedule = pgTable("sberbankPickupSchedule", {
  id: serial("id").primaryKey(),
  /** Day of week: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday */
  dayOfWeek: integer("dayOfWeek").notNull(), // 1-5 for Mon-Fri
  /** Pickup point ID */
  pointId: integer("pointId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SberbankPickupSchedule = typeof sberbankPickupSchedule.$inferSelect;
export type InsertSberbankPickupSchedule = typeof sberbankPickupSchedule.$inferInsert;

// ─── Clients Table ───────────────────────────────────────────────────────────

/**
 * Clients table — stores client information for creating regular delivery tasks
 * Clients like "Основа движения", "Hello Korea", etc.
 */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;


// ─── Client Points Table ─────────────────────────────────────────────────────

export const clientPoints = pgTable("clientPoints", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientPoint = typeof clientPoints.$inferSelect;
export type InsertClientPoint = typeof clientPoints.$inferInsert;

// ─── Client Regular Clients Table ────────────────────────────────────────────

export const clientRegularClients = pgTable("clientRegularClients", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientRegularClient = typeof clientRegularClients.$inferSelect;
export type InsertClientRegularClient = typeof clientRegularClients.$inferInsert;

// ─── Requests Table ──────────────────────────────────────────────────────────

/**
 * Requests table — stores all types of requests created by managers
 * Supports multiple request types: Delivery, Movement, Nuts, Courier Call, Pickup from TC, Simple Request
 */
export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  /** Manager who created the request */
  createdByUserId: integer("createdByUserId").notNull(),
  /** Request type: delivery, movement, nuts, courier_call, pickup_from_tc, simple */
  requestType: requestTypeEnum("requestType").notNull(),

  /** Status: pending, assigned, in_progress, completed, cancelled */
  status: requestStatusEnum("status").default("pending").notNull(),

  /** Assigned courier ID (null = unassigned) */
  courierId: integer("courierId"),

  // Common fields for all request types
  /** Client ID (for delivery/movement/nuts) */
  clientId: integer("clientId"),
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
  packageType: packageTypeEnum("packageType"),
  /** Number of places (packages) */
  placesCount: integer("placesCount"),

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
  paymentMethod: paymentMethodEnum("paymentMethod"),
  /** Payment amount in rubles */
  paymentAmount: decimal("paymentAmount", { precision: 10, scale: 2 }),
  /** Delivery time from (HH:MM) */
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  /** Delivery time to (HH:MM) */
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  /** Estimated delivery minutes */
  estimatedMinutes: integer("estimatedMinutes"),

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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

// ─── Settings Table ──────────────────────────────────────────────────────────

/**
 * Settings table — stores application-wide settings like tariffs
 */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  /** Tariff for nuts in rubles per kg */
  nutsTariff: decimal("nutsTariff", { precision: 10, scale: 2 }).default("0"),
  /** Tariff for cedar oil in rubles per unit */
  cedroilTariff: decimal("cedroilTariff", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;

// ─── Managers Table ──────────────────────────────────────────────────────────

/**
 * Managers table — stores manager accounts for the web portal.
 */
export const managers = pgTable("managers", {
  id: serial("id").primaryKey(),
  /** Display name of the manager */
  name: varchar("name", { length: 255 }).notNull(),
  /** Login username */
  username: varchar("username", { length: 100 }).notNull().unique(),
  /** Email address */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Bcrypt hashed password */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Phone number */
  phone: varchar("phone", { length: 20 }),
  /** Account active status */
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Manager = typeof managers.$inferSelect;
export type InsertManager = typeof managers.$inferInsert;

// ─── Chat Messages Table ─────────────────────────────────────────────────────

export const chatMessages = pgTable("chatMessages", {
  id: serial("id").primaryKey(),
  authorType: varchar("authorType", { length: 20 }).notNull(), // manager | courier
  authorId: integer("authorId"),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  text: text("text").notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
