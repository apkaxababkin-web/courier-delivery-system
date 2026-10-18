import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  date,
  decimal,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  uniqueIndex,
  varchar,
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

export const billingDocumentStatusEnum = pgEnum("billing_document_status", [
  "issued",
  "paid",
  "cancelled",
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
  phone: varchar("phone", { length: 50 }),
  displayColor: varchar("displayColor", { length: 20 }).default("#2563EB").notNull(),
  displayIcon: varchar("displayIcon", { length: 50 }).default("UserRound").notNull(),
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
},
  (table) => [
    index("idx_couriers_username").on(table.username),
  ]);

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
  recipientPhone: varchar("recipientPhone", { length: 50 }),
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
  senderPhone: varchar("senderPhone", { length: 50 }),
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
  /** Legacy link to request */
  requestId: integer("requestId"),
  /** Legacy source request link */
  sourceRequestId: integer("sourceRequestId"),
},
  (table) => [
    index("idx_tasks_courierId").on(table.courierId),
    index("idx_tasks_requestId").on(table.requestId),
    uniqueIndex("idx_tasks_sourceRequestId").on(table.sourceRequestId).where(sql`("sourceRequestId" IS NOT NULL)`),
    index("idx_tasks_status").on(table.status),
  ]);

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
  /**
   * Soft-delete flag. Archived points (false) stay in history, old lists and
   * reconciliation, but are hidden from new selections and new pickup lists.
   */
  isActive: boolean("isActive").default(true).notNull(),
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
  courierId: integer("courierId"),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  isCancelled: boolean("isCancelled").notNull().default(false),
  cancelledAt: timestamp("cancelledAt"),
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
  /**
   * Soft-delete flag. Archived points (false) stay in history, old lists and
   * reconciliation, but are hidden from new selections and new pickup lists.
   */
  isActive: boolean("isActive").default(true).notNull(),
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
  courierId: integer("courierId"),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD format
  isPicked: boolean("isPicked").default(false).notNull(),
  pickedAt: timestamp("pickedAt"),
  isCancelled: boolean("isCancelled").notNull().default(false),
  cancelledAt: timestamp("cancelledAt"),
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
  recipientPhone: varchar("recipientPhone", { length: 50 }),
  /** Delivery address */
  deliveryAddress: text("deliveryAddress").notNull(),
  /** Status: not_delivered or delivered */
  status: mailStatusEnum("status").default("not_delivered").notNull(),
  /** Legacy mail status column kept for existing database compatibility */
  mailStatus: mailStatusEnum("mailStatus").default("not_delivered").notNull(),
  /** Recipient signature (text input by courier) */
  recipientSignature: text("recipientSignature"),
  /** Delivery date/time */
  deliveredAt: timestamp("deliveredAt"),
  /** Courier who delivered it */
  courierId: integer("courierId"),
  /** Partner whose manifest/mail this belongs to */
  partnerId: integer("partnerId"),
  /** Shipment weight in kilograms */
  weight: decimal("weight", { precision: 10, scale: 3 }),
  /** Financial reconciliation review state */
  billingCheckedAt: timestamp("billingCheckedAt"),
  billingCheckedByManagerId: integer("billingCheckedByManagerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
},
  (table) => [
    index("idx_mails_createdAt").on(table.createdAt),
    index("idx_mails_status").on(table.status),
    index("idx_mails_waybillNumber").on(table.waybillNumber),
    index("mails_partnerId_idx").on(table.partnerId),
  ]);

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
  phone: varchar("phone", { length: 50 }),
  /** Email (optional) */
  email: varchar("email", { length: 320 }),

  // Billing / legal requisites
  /** Full legal name used in invoices and acts */
  legalName: varchar("legalName", { length: 500 }),
  /** Taxpayer identification number */
  inn: varchar("inn", { length: 20 }),
  /** Tax registration reason code (optional, mainly for legal entities) */
  kpp: varchar("kpp", { length: 20 }),
  /** Legal address used in billing documents */
  legalAddress: text("legalAddress"),
  /** OGRN for organisations / OGRNIP for individual entrepreneurs */
  ogrn: varchar("ogrn", { length: 20 }),
  /** Postal address printed on documents (falls back to the legal one) */
  postalAddress: text("postalAddress"),

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
  phone: varchar("phone", { length: 50 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientPoint = typeof clientPoints.$inferSelect;
export type InsertClientPoint = typeof clientPoints.$inferInsert;

// ─── Client Smart Tariff Rules ────────────────────────────────────────────────

/**
 * Configurable billing rules learned from real client requests.
 *
 * These rules complement clientTariffs; they do not replace the existing
 * base tariff card. A rule may be as broad as "all delivery requests" or as
 * specific as one route on selected weekdays.
 *
 * Matching priority is resolved server-side: the most specific matching rule
 * wins. A manual request price always has higher priority than any rule.
 */
export const clientTariffRules = pgTable("clientTariffRules", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),

  /** Human-readable manager label, e.g. "Ключевская → Аэропорт". */
  name: varchar("name", { length: 255 }).notNull(),

  /**
   * Optional existing request type. NULL means any request type.
   * We intentionally do not create new request types for tariff variations.
   */
  requestType: varchar("requestType", { length: 50 }),

  /**
   * Route matching.
   * Point IDs are preferred when a request can be tied to a saved client point.
   * Normalized addresses are kept as a fallback for legacy/free-text requests.
   */
  fromAddressNormalized: text("fromAddressNormalized"),
  toAddressNormalized: text("toAddressNormalized"),

  /**
   * ISO weekdays encoded as comma-separated numbers:
   * 1=Mon ... 7=Sun. NULL means every day.
   * Examples: "1,2,3,4,5" or "6,7".
   */
  weekdays: varchar("weekdays", { length: 20 }),

  /** Price for the first place and for every additional place. */
  firstPlacePrice: decimal("firstPlacePrice", { precision: 10, scale: 2 }).notNull(),
  nextPlacePrice: decimal("nextPlacePrice", { precision: 10, scale: 2 }).default("0").notNull(),

  /** More specific rules win; priority is an explicit tie-breaker. */
  priority: integer("priority").default(0).notNull(),

  /** Rules can be temporarily disabled without deleting their history. */
  isActive: boolean("isActive").default(true).notNull(),

  createdByManagerId: integer("createdByManagerId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
},
  (table) => [
    check("clientTariffRules_first_price_nonnegative", sql`("firstPlacePrice" >= (0)::numeric)`),
    check("clientTariffRules_next_price_nonnegative", sql`("nextPlacePrice" >= (0)::numeric)`),
    index("clientTariffRules_client_active_idx").on(table.clientId, table.isActive),
    index("clientTariffRules_client_request_type_idx").on(table.clientId, table.requestType),
  ]);

export type ClientTariffRule = typeof clientTariffRules.$inferSelect;
export type InsertClientTariffRule = typeof clientTariffRules.$inferInsert;


// ─── Client Regular Clients Table ────────────────────────────────────────────

export const clientRegularClients = pgTable("clientRegularClients", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type ClientRegularClient = typeof clientRegularClients.$inferSelect;
export type InsertClientRegularClient = typeof clientRegularClients.$inferInsert;

// ─── Partners Table ──────────────────────────────────────────────────────────

/**
 * Partners table — organizations or people who send mails, invoices, waybills and source files.
 */
export const partners = pgTable("partners", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  comment: text("comment"),
  isActive: boolean("isActive").default(true).notNull(),
  /**
   * System flag: the record is our own organisation, not an external partner.
   * Own-company rows stay in the shared partners directory for legacy mail /
   * courier-call compatibility, but are never offered or accepted as an
   * external partner for a Correspondence shipment owner.
   * Managed only by migrations / operations, not by the partner form.
   */
  isOwnCompany: boolean("isOwnCompany").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Partner = typeof partners.$inferSelect;
export type InsertPartner = typeof partners.$inferInsert;

// ─── Transport Companies Table ───────────────────────────────────────────────

/**
 * Transport companies table — reference list for pickup_from_tc requests.
 */
export const transportCompanies = pgTable("transportCompanies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  comment: text("comment"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type TransportCompany = typeof transportCompanies.$inferSelect;
export type InsertTransportCompany = typeof transportCompanies.$inferInsert;

// ─── Requests Table ──────────────────────────────────────────────────────────

/**
 * Requests table — stores all types of requests created by managers
 * Supports multiple request types: Delivery, Movement, Nuts, Courier Call, Pickup from TC, Simple Request
 */
export const managers = pgTable("managers", {
  id: serial("id").primaryKey(),
  /** Display name of the manager */
  name: varchar("name", { length: 255 }).notNull(),
  /** Login username */
  username: varchar("username", { length: 100 }).notNull().unique(),
  /** Email address */
  email: varchar("email", { length: 320 }).notNull().unique(),
  /** Legacy password column kept for existing database compatibility */
  password: varchar("password", { length: 255 }).notNull(),
  /** Bcrypt hashed password */
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  /** Legacy role column kept for existing database compatibility */
  role: text("role").default("manager"),
  /** Phone number */
  phone: varchar("phone", { length: 50 }),
  /** Account active status */
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  /** Manager who created the request */
  createdByUserId: integer("createdByUserId").notNull(),
  /** Request type: delivery, movement, nuts, courier_call, pickup_from_tc, simple */
  requestType: requestTypeEnum("requestType").notNull(),

  /** Status: pending, assigned, in_progress, completed, cancelled */
  status: requestStatusEnum("status").default("pending").notNull(),
  /** Legacy request status column kept for existing database compatibility */
  requestStatus: requestStatusEnum("requestStatus").default("pending").notNull(),

  /** Assigned courier ID (null = unassigned) */
  courierId: integer("courierId"),

  // Common fields for all request types
  /** Client ID (for delivery/movement/nuts) */
  clientId: integer("clientId"),
  /** Recipient name */
  recipientName: varchar("recipientName", { length: 255 }),
  /** Recipient phone */
  recipientPhone: varchar("recipientPhone", { length: 50 }),
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
  senderPhone: varchar("senderPhone", { length: 50 }),
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
  /**
   * Who ordered the courier call — a partner or a correspondence client.
   * Independent from sender ("Забрать у") and recipient ("Куда направляется").
   * 'partner' | 'correspondenceClient'; null for legacy rows.
   */
  requesterType: varchar("requesterType", { length: 20 }),
  /**
   * Polymorphic reference: partners.id for 'partner',
   * correspondenceClients.id for 'correspondenceClient'. No FK by design;
   * validated server-side.
   */
  requesterId: integer("requesterId"),
  /** Requester organisation name captured at save time (server-side snapshot). */
  requesterNameSnapshot: varchar("requesterNameSnapshot", { length: 255 }),

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
  /** Final delivery fee approved by manager */
  deliveryFee: decimal("deliveryFee", { precision: 10, scale: 2 }),

  // Price quote (server-side, automatic)
  /**
   * When deliveryFee was produced by the automatic server-side quote.
   * NULL with a non-NULL deliveryFee means the amount was entered by hand.
   */
  quoteCalculatedAt: timestamp("quoteCalculatedAt"),
  /**
   * Where the current deliveryFee came from: 'tariff' (automatic) or
   * 'manual_fee' (a manager corrected it). NULL for legacy rows.
   */
  quoteSource: varchar("quoteSource", { length: 20 }),
  /**
   * Smart tariff rule that produced the current automatic amount.
   * NULL for base tariffs, manual prices and legacy rows.
   */
  quoteTariffRuleId: integer("quoteTariffRuleId"),
  /**
   * Immutable JSON snapshot of the smart rule actually applied to this request.
   * Kept even if the rule is later edited or disabled.
   */
  quoteTariffSnapshot: text("quoteTariffSnapshot"),

  // Billing review
  /**
   * Manager decision for a request that is not billed as completed:
   * 'cancelled_confirmed' | 'completed_confirmed' | 'requires_clarification' |
   * 'not_billable'. NULL means "not reviewed yet".
   */
  billingReviewState: varchar("billingReviewState", { length: 30 }),
  /** Manager's reason for the decision above. */
  billingReviewNote: text("billingReviewNote"),
  /** When this completed work was financially checked by a manager */
  billingCheckedAt: timestamp("billingCheckedAt"),
  /** Manager who performed the latest financial check */
  billingCheckedByManagerId: integer("billingCheckedByManagerId"),

  /** Delivery time from (HH:MM) */
  deliveryTimeFrom: varchar("deliveryTimeFrom", { length: 5 }),
  /** Delivery time to (HH:MM) */
  deliveryTimeTo: varchar("deliveryTimeTo", { length: 5 }),
  /** Estimated delivery minutes */
  estimatedMinutes: integer("estimatedMinutes"),

  // Status tracking
  /** When the request was scheduled */
  scheduledAt: timestamp("scheduledAt"),
  /** When the start-of-day push for a future request was sent */
  scheduledPushSentAt: timestamp("scheduledPushSentAt"),
  /** When courier accepted the request */
  acceptedAt: timestamp("acceptedAt"),
  /** When the request was completed */
  completedAt: timestamp("completedAt"),
  /** Reason for cancellation or rejection */
  rejectionReason: text("rejectionReason"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
},
  (table) => [
    check("requests_billingReviewState_valid", sql`(("billingReviewState" IS NULL) OR (("billingReviewState")::text = ANY ((ARRAY['cancelled_confirmed'::character varying, 'completed_confirmed'::character varying, 'requires_clarification'::character varying, 'not_billable'::character varying])::text[])))`),
    check("requests_quoteSource_valid", sql`(("quoteSource" IS NULL) OR (("quoteSource")::text = ANY ((ARRAY['tariff'::character varying, 'manual_fee'::character varying])::text[])))`),
    index("idx_requests_courierId").on(table.courierId),
    index("idx_requests_status").on(table.status),
    index("requests_client_status_completed_idx").on(table.clientId, table.status, table.completedAt),
    index("requests_quote_tariff_rule_idx").on(table.quoteTariffRuleId),
    foreignKey({
      name: "requests_billingCheckedByManagerId_managers_id_fk",
      columns: [table.billingCheckedByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
  ]);

export type Request = typeof requests.$inferSelect;
export type InsertRequest = typeof requests.$inferInsert;

// ─── Request Activity Table ──────────────────────────────────────────────────

/**
 * Full audit trail for requests.
 *
 * actorType:
 *   manager | courier | system
 *
 * action:
 *   created | updated | courier_assigned | courier_unassigned |
 *   status_changed | started | completed | cancelled
 *
 * changes contains JSON with changed fields when applicable.
 */
export const requestActivity = pgTable("requestActivity", {
  id: serial("id").primaryKey(),
  requestId: integer("requestId").notNull(),

  actorType: varchar("actorType", { length: 20 }).notNull(),
  actorId: integer("actorId"),
  actorName: varchar("actorName", { length: 255 }),

  action: varchar("action", { length: 50 }).notNull(),
  note: text("note"),
  changes: text("changes"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
},
  (table) => [
    index("requestActivity_createdAt_idx").on(table.createdAt),
    index("requestActivity_requestId_idx").on(table.requestId),
  ]);

export type RequestActivity = typeof requestActivity.$inferSelect;
export type InsertRequestActivity = typeof requestActivity.$inferInsert;

// ─── Request Attachments Table ───────────────────────────────────────────────

/**
 * Files attached to manager requests and visible to couriers.
 */
export const requestAttachments = pgTable("requestAttachments", {
  id: serial("id").primaryKey(),
  requestId: integer("requestId").notNull(),
  originalName: text("originalName").notNull(),
  storedName: text("storedName").notNull(),
  fileUrl: text("fileUrl").notNull(),
  mimeType: varchar("mimeType", { length: 255 }),
  sizeBytes: integer("sizeBytes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RequestAttachment = typeof requestAttachments.$inferSelect;
export type InsertRequestAttachment = typeof requestAttachments.$inferInsert;


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
// ─── Billing Settings Table ──────────────────────────────────────────────────

/**
 * Requisites and numbering settings used to generate billing documents.
 * The application treats this table as singleton settings.
 */
export const billingSettings = pgTable("billingSettings", {
  id: serial("id").primaryKey(),

  executorName: varchar("executorName", { length: 500 }),
  executorInn: varchar("executorInn", { length: 20 }),
  executorKpp: varchar("executorKpp", { length: 20 }),
  executorAddress: text("executorAddress"),
  executorPhone: varchar("executorPhone", { length: 50 }),

  bankName: varchar("bankName", { length: 500 }),
  bankBik: varchar("bankBik", { length: 20 }),
  bankAccount: varchar("bankAccount", { length: 50 }),
  bankCorrespondentAccount: varchar("bankCorrespondentAccount", { length: 50 }),

  /** Short printed name, when the full one is too long for a form */
  executorShortName: varchar("executorShortName", { length: 500 }),
  executorOgrn: varchar("executorOgrn", { length: 20 }),
  executorOgrnip: varchar("executorOgrnip", { length: 20 }),
  executorPostalAddress: text("executorPostalAddress"),
  executorEmail: varchar("executorEmail", { length: 320 }),

  /** Signature block printed on the invoice and the act */
  directorName: varchar("directorName", { length: 255 }),
  directorPosition: varchar("directorPosition", { length: 255 }),
  accountantName: varchar("accountantName", { length: 255 }),

  /** 'vat' | 'without_vat'; vatText keeps the printed wording */
  vatMode: varchar("vatMode", { length: 20 }).default("without_vat").notNull(),
  vatRate: decimal("vatRate", { precision: 5, scale: 2 }).default("0").notNull(),
  vatExemptionBasis: text("vatExemptionBasis"),

  /** Optional images stored as files under uploads/billing-settings/ */
  signatureFile: text("signatureFile"),
  stampFile: text("stampFile"),
  /** Print the organisation stamp on invoices and acts. */
  addStampToDocuments: boolean("addStampToDocuments").default(false).notNull(),

  vatText: varchar("vatText", { length: 100 }).default("Без НДС").notNull(),
  documentNumberPrefix: varchar("documentNumberPrefix", { length: 50 }),
  nextDocumentNumber: integer("nextDocumentNumber").default(1).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
},
  (table) => [
    check("billingSettings_nextDocumentNumber_positive", sql`("nextDocumentNumber" > 0)`),
  ]);

export type BillingSettings = typeof billingSettings.$inferSelect;
export type InsertBillingSettings = typeof billingSettings.$inferInsert;


// ─── Billing Documents Table ─────────────────────────────────────────────────

/**
 * Independent annual sequence for invoice/act document numbers.
 *
 * 2026 is the transition year and is initialized manually once in production.
 * Future years start automatically from No. 1.
 */
export const billingDocumentNumberSequences = pgTable("billingDocumentNumberSequences", {
  year: integer("year").primaryKey(),
  nextNumber: integer("nextNumber").notNull().default(1),
  initialized: boolean("initialized").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
},
  (table) => [
    check("billingDocumentNumberSequences_next_positive", sql`("nextNumber" > 0)`),
    check("billingDocumentNumberSequences_year_valid", sql`((year >= 2000) AND (year <= 9999))`),
  ]);

/**
 * One row represents one immutable billing set:
 * invoice + act + completed works registry.
 */
export const billingDocuments = pgTable("billingDocuments", {
  id: serial("id").primaryKey(),

  number: varchar("number", { length: 100 }).notNull(),
  clientId: integer("clientId").notNull(),

  documentDate: date("documentDate").notNull(),
  periodFrom: date("periodFrom").notNull(),
  periodTo: date("periodTo").notNull(),

  requestsCount: integer("requestsCount").notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),

  status: billingDocumentStatusEnum("status").default("issued").notNull(),

  /** Exact service description printed in invoice and act */
  serviceDescription: text("serviceDescription").notNull(),

  // Customer requisites snapshot
  clientNameSnapshot: varchar("clientNameSnapshot", { length: 500 }).notNull(),
  clientInnSnapshot: varchar("clientInnSnapshot", { length: 20 }).notNull(),
  clientKppSnapshot: varchar("clientKppSnapshot", { length: 20 }),
  clientAddressSnapshot: text("clientAddressSnapshot").notNull(),

  // Executor requisites snapshot
  executorNameSnapshot: varchar("executorNameSnapshot", { length: 500 }).notNull(),
  executorInnSnapshot: varchar("executorInnSnapshot", { length: 20 }).notNull(),
  executorKppSnapshot: varchar("executorKppSnapshot", { length: 20 }),
  executorAddressSnapshot: text("executorAddressSnapshot").notNull(),
  executorPhoneSnapshot: varchar("executorPhoneSnapshot", { length: 50 }),

  bankNameSnapshot: varchar("bankNameSnapshot", { length: 500 }).notNull(),
  bankBikSnapshot: varchar("bankBikSnapshot", { length: 20 }).notNull(),
  bankAccountSnapshot: varchar("bankAccountSnapshot", { length: 50 }).notNull(),
  bankCorrespondentAccountSnapshot: varchar("bankCorrespondentAccountSnapshot", { length: 50 }).notNull(),

  vatTextSnapshot: varchar("vatTextSnapshot", { length: 100 }).notNull(),

  // Snapshot captured when the set is issued, so later directory edits cannot
  // rewrite an issued document.
  serviceNameSnapshot: varchar("serviceNameSnapshot", { length: 500 }),
  periodTextSnapshot: varchar("periodTextSnapshot", { length: 100 }),
  vatModeSnapshot: varchar("vatModeSnapshot", { length: 20 }),
  vatRateSnapshot: decimal("vatRateSnapshot", { precision: 5, scale: 2 }),
  vatAmountSnapshot: decimal("vatAmountSnapshot", { precision: 12, scale: 2 }),
  clientOgrnSnapshot: varchar("clientOgrnSnapshot", { length: 20 }),
  /** Customer postal address at issue time */
  clientPostalAddressSnapshot: text("clientPostalAddressSnapshot"),
  directorNameSnapshot: varchar("directorNameSnapshot", { length: 255 }),
  directorPositionSnapshot: varchar("directorPositionSnapshot", { length: 255 }),
  accountantNameSnapshot: varchar("accountantNameSnapshot", { length: 255 }),
  /** Signature/stamp files frozen at issue time (paths under uploads/). */
  signatureFileSnapshot: text("signatureFileSnapshot"),
  stampFileSnapshot: text("stampFileSnapshot"),
  stampEnabledSnapshot: boolean("stampEnabledSnapshot"),
  /** Shared printed date (DD.MM.YYYY) for the whole set */
  documentDateText: varchar("documentDateText", { length: 10 }),
  generatedAt: timestamp("generatedAt"),

  // Annulment instead of deletion
  voidedAt: timestamp("voidedAt"),
  voidedByManagerId: integer("voidedByManagerId"),

  /** The document that replaced this one after it was annulled */
  replacesDocumentId: integer("replacesDocumentId"),
  voidReason: text("voidReason"),

  /** Free-form note recorded with the payment */
  paymentComment: text("paymentComment"),

  // Generated files, stored as relative paths
  invoiceFile: text("invoiceFile"),
  actFile: text("actFile"),
  registryFile: text("registryFile"),

  // Audit
  createdByManagerId: integer("createdByManagerId").notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),

  paidAt: timestamp("paidAt"),
  paidByManagerId: integer("paidByManagerId"),


  cancelledAt: timestamp("cancelledAt"),
  cancelledByManagerId: integer("cancelledByManagerId"),


  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
},
  (table) => [
    foreignKey({
      name: "billingDocuments_client_fk",
      columns: [table.clientId],
      foreignColumns: [clients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "billingDocuments_replacesDocument_fk",
      columns: [table.replacesDocumentId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    check("billingDocuments_period_valid", sql`("periodFrom" <= "periodTo")`),
    check("billingDocuments_requestsCount_positive", sql`("requestsCount" > 0)`),
    check("billingDocuments_totalAmount_nonnegative", sql`("totalAmount" >= (0)::numeric)`),
    index("billingDocuments_client_idx").on(table.clientId),
    index("billingDocuments_client_period_idx").on(table.clientId, table.periodFrom, table.periodTo),
    index("billingDocuments_period_idx").on(table.periodFrom, table.periodTo),
    index("billingDocuments_status_idx").on(table.status),
    uniqueIndex("billingDocuments_year_number_key").on(sql`EXTRACT(YEAR FROM "documentDate")`, table.number),
    foreignKey({
      name: "billingDocuments_voidedByManager_fk",
      columns: [table.voidedByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
    foreignKey({
      name: "billingDocuments_createdByManager_fk",
      columns: [table.createdByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "billingDocuments_paidByManager_fk",
      columns: [table.paidByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
    foreignKey({
      name: "billingDocuments_cancelledByManager_fk",
      columns: [table.cancelledByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
  ]);

export type BillingDocument = typeof billingDocuments.$inferSelect;
export type InsertBillingDocument = typeof billingDocuments.$inferInsert;


// ─── Billing Document Requests Table ─────────────────────────────────────────

/**
 * Exact requests included in a billing set.
 * releasedAt allows a cancelled set to explicitly return works for rebilling.
 */
export const billingDocumentRequests = pgTable("billingDocumentRequests", {
  id: serial("id").primaryKey(),
  billingDocumentId: integer("billingDocumentId").notNull(),
  requestId: integer("requestId").notNull(),

  /** Request price snapshot at the moment documents were issued */
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),

  createdAt: timestamp("createdAt").defaultNow().notNull(),

  releasedAt: timestamp("releasedAt"),
  releasedByManagerId: integer("releasedByManagerId"),

  /** True while this link still holds the request on an active document. */
  active: boolean("active").default(true).notNull(),
  /** Why the manager released the request (re-issue after annulment). */
  releaseNote: text("releaseNote"),
},
  (table) => [
    foreignKey({
      name: "billingDocumentRequests_document_fk",
      columns: [table.billingDocumentId],
      foreignColumns: [billingDocuments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "billingDocumentRequests_request_fk",
      columns: [table.requestId],
      foreignColumns: [requests.id],
    }).onDelete("restrict"),
    check("billingDocumentRequests_amount_nonnegative", sql`(amount >= (0)::numeric)`),
    index("billingDocumentRequests_active_document_idx").on(table.billingDocumentId).where(sql`active`),
    uniqueIndex("billingDocumentRequests_active_request_key").on(table.requestId).where(sql`active`),
    index("billingDocumentRequests_document_idx").on(table.billingDocumentId),
    index("billingDocumentRequests_request_idx").on(table.requestId),
    foreignKey({
      name: "billingDocumentRequests_releasedByManager_fk",
      columns: [table.releasedByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
  ]);

export type BillingDocumentRequest = typeof billingDocumentRequests.$inferSelect;
export type InsertBillingDocumentRequest = typeof billingDocumentRequests.$inferInsert;


// ─── Billing Document Events Table ───────────────────────────────────────────

/**
 * Audit trail of the document lifecycle: issued, annulled, requests released,
 * replaced by another document, payment set/cleared.
 */
export const billingDocumentEvents = pgTable("billingDocumentEvents", {
  id: serial("id").primaryKey(),
  billingDocumentId: integer("billingDocumentId").notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  managerId: integer("managerId"),

  managerName: varchar("managerName", { length: 255 }),
  note: text("note"),
  /** Structured extras: released request ids, replacement document id, … */
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
},
  (table) => [
    foreignKey({
      name: "billingDocumentEvents_document_fk",
      columns: [table.billingDocumentId],
      foreignColumns: [billingDocuments.id],
    }).onDelete("restrict"),
    check("billingDocumentEvents_kind_valid", sql`((kind)::text = ANY ((ARRAY['issued'::character varying, 'reissued'::character varying, 'voided'::character varying, 'requests_released'::character varying, 'replaced_by'::character varying, 'payment_set'::character varying, 'payment_cleared'::character varying, 'rolled_back'::character varying])::text[]))`),
    index("billingDocumentEvents_document_idx").on(table.billingDocumentId, table.createdAt),
    foreignKey({
      name: "billingDocumentEvents_manager_fk",
      columns: [table.managerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
  ]);

export type BillingDocumentEvent = typeof billingDocumentEvents.$inferSelect;
export type InsertBillingDocumentEvent = typeof billingDocumentEvents.$inferInsert;




export type Manager = typeof managers.$inferSelect;
export type InsertManager = typeof managers.$inferInsert;

// --- Chat V2 ---------------------------------------------------------------

/**
 * Conversations for the shared chat and private manager/courier dialogs.
 * Participant identity is polymorphic because managers and couriers live in
 * separate account tables.
 */
export const chatV2Conversations = pgTable(
  "chatV2Conversations",
  {
    id: serial("id").primaryKey(),
    kind: varchar("kind", { length: 20 }).notNull(), // general | direct
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 80 }),
    directKey: varchar("directKey", { length: 160 }),
    createdByType: varchar("createdByType", { length: 20 }),
    createdById: integer("createdById"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    unique("chatV2Conversations_slug_key").on(table.slug),
    unique("chatV2Conversations_directKey_key").on(table.directKey),
    index("chatV2Conversations_updatedAt_idx").on(table.updatedAt),
    check("chatV2Conversations_createdByType_check", sql`(("createdByType" IS NULL) OR (("createdByType")::text = ANY ((ARRAY['manager'::character varying, 'courier'::character varying])::text[])))`),
    check("chatV2Conversations_kind_check", sql`((kind)::text = ANY ((ARRAY['general'::character varying, 'direct'::character varying])::text[]))`),
    unique("chatV2Conversations_directKey_key").on(table.directKey),
    unique("chatV2Conversations_slug_key").on(table.slug),
  ],
);

export type ChatV2Conversation = typeof chatV2Conversations.$inferSelect;
export type InsertChatV2Conversation = typeof chatV2Conversations.$inferInsert;

export const chatV2Participants = pgTable(
  "chatV2Participants",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversationId").notNull(),
    participantType: varchar("participantType", { length: 20 }).notNull(),
    participantId: integer("participantId").notNull(),
    lastReadMessageId: integer("lastReadMessageId"),
    lastReadAt: timestamp("lastReadAt"),
    isMuted: boolean("isMuted").default(false).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  (table) => [
    unique("chatV2Participants_member_key").on(
      table.conversationId,
      table.participantType,
      table.participantId,
    ),
    index("chatV2Participants_actor_idx").on(table.participantType, table.participantId),
    index("chatV2Participants_conversation_idx").on(table.conversationId),
    foreignKey({
      name: "chatV2Participants_conversationId_fkey",
      columns: [table.conversationId],
      foreignColumns: [chatV2Conversations.id],
    }).onDelete("cascade"),
    check("chatV2Participants_participantType_check", sql`(("participantType")::text = ANY ((ARRAY['manager'::character varying, 'courier'::character varying])::text[]))`),
    unique("chatV2Participants_member_key").on(table.conversationId, table.participantType, table.participantId),
  ],
);

export type ChatV2Participant = typeof chatV2Participants.$inferSelect;
export type InsertChatV2Participant = typeof chatV2Participants.$inferInsert;

export const chatV2Messages = pgTable(
  "chatV2Messages",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversationId").notNull(),
    senderType: varchar("senderType", { length: 20 }).notNull(),
    senderId: integer("senderId"),
    senderNameSnapshot: varchar("senderNameSnapshot", { length: 255 }).notNull(),
    clientMessageId: varchar("clientMessageId", { length: 80 }),
    text: text("text").notNull(),
    replyToMessageId: integer("replyToMessageId"),
    legacySource: varchar("legacySource", { length: 40 }),
    legacySourceId: integer("legacySourceId"),
    editedAt: timestamp("editedAt"),
    deletedAt: timestamp("deletedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    unique("chatV2Messages_client_key").on(
      table.senderType,
      table.senderId,
      table.clientMessageId,
    ),
    unique("chatV2Messages_legacy_key").on(table.legacySource, table.legacySourceId),
    index("chatV2Messages_conversation_id_idx").on(table.conversationId, table.id),
    index("chatV2Messages_reply_idx").on(table.replyToMessageId),
    foreignKey({
      name: "chatV2Messages_conversationId_fkey",
      columns: [table.conversationId],
      foreignColumns: [chatV2Conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "chatV2Messages_replyToMessageId_fkey",
      columns: [table.replyToMessageId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
    check("chatV2Messages_senderType_check", sql`(("senderType")::text = ANY ((ARRAY['manager'::character varying, 'courier'::character varying])::text[]))`),
    check("chatV2Messages_text_check", sql`((char_length(text) >= 1) AND (char_length(text) <= 4000))`),
    unique("chatV2Messages_client_key").on(table.senderType, table.senderId, table.clientMessageId),
    unique("chatV2Messages_legacy_key").on(table.legacySource, table.legacySourceId),
  ],
);

export type ChatV2Message = typeof chatV2Messages.$inferSelect;
export type InsertChatV2Message = typeof chatV2Messages.$inferInsert;

export const chatV2MessageReceipts = pgTable(
  "chatV2MessageReceipts",
  {
    id: serial("id").primaryKey(),
    messageId: integer("messageId").notNull(),
    conversationId: integer("conversationId").notNull(),
    participantType: varchar("participantType", { length: 20 }).notNull(),
    participantId: integer("participantId").notNull(),
    deliveredAt: timestamp("deliveredAt"),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    unique("chatV2MessageReceipts_recipient_key").on(
      table.messageId,
      table.participantType,
      table.participantId,
    ),
    index("chatV2MessageReceipts_recipient_idx").on(table.participantType, table.participantId),
    index("chatV2MessageReceipts_conversation_idx").on(table.conversationId),
    foreignKey({
      name: "chatV2MessageReceipts_conversationId_fkey",
      columns: [table.conversationId],
      foreignColumns: [chatV2Conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "chatV2MessageReceipts_messageId_fkey",
      columns: [table.messageId],
      foreignColumns: [chatV2Messages.id],
    }).onDelete("cascade"),
    check("chatV2MessageReceipts_participantType_check", sql`(("participantType")::text = ANY ((ARRAY['manager'::character varying, 'courier'::character varying])::text[]))`),
    unique("chatV2MessageReceipts_recipient_key").on(table.messageId, table.participantType, table.participantId),
  ],
);

export type ChatV2MessageReceipt = typeof chatV2MessageReceipts.$inferSelect;
export type InsertChatV2MessageReceipt = typeof chatV2MessageReceipts.$inferInsert;

export const chatV2MessageReactions = pgTable(
  "chatV2MessageReactions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("messageId").notNull(),
    conversationId: integer("conversationId").notNull(),
    participantType: varchar("participantType", { length: 20 }).notNull(),
    participantId: integer("participantId").notNull(),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    unique("chatV2MessageReactions_actor_key").on(
      table.messageId,
      table.participantType,
      table.participantId,
    ),
    index("chatV2MessageReactions_message_idx").on(table.messageId),
    index("chatV2MessageReactions_conversation_idx").on(table.conversationId),
    foreignKey({
      name: "chatV2MessageReactions_conversationId_fkey",
      columns: [table.conversationId],
      foreignColumns: [chatV2Conversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "chatV2MessageReactions_messageId_fkey",
      columns: [table.messageId],
      foreignColumns: [chatV2Messages.id],
    }).onDelete("cascade"),
    check("chatV2MessageReactions_emoji_check", sql`((emoji)::text = ANY ((ARRAY['❤️'::character varying, '🔥'::character varying, '😂'::character varying, '🤩'::character varying, '😍'::character varying, '🎉'::character varying, '💯'::character varying, '👏'::character varying, '👍'::character varying, '🤝'::character varying, '👀'::character varying, '🤯'::character varying, '✅'::character varying, '❌'::character varying, '⚠️'::character varying, '🚀'::character varying, '🎯'::character varying, '💡'::character varying, '📌'::character varying, '📦'::character varying, '⏳'::character varying, '🛠️'::character varying])::text[]))`),
    check("chatV2MessageReactions_participantType_check", sql`(("participantType")::text = ANY ((ARRAY['manager'::character varying, 'courier'::character varying])::text[]))`),
    unique("chatV2MessageReactions_actor_key").on(table.messageId, table.participantType, table.participantId),
  ],
);

export type ChatV2MessageReaction = typeof chatV2MessageReactions.$inferSelect;
export type InsertChatV2MessageReaction = typeof chatV2MessageReactions.$inferInsert;

export const chatV2Attachments = pgTable(
  "chatV2Attachments",
  {
    id: serial("id").primaryKey(),
    messageId: integer("messageId").notNull(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    storageKey: text("storageKey").notNull(),
    fileUrl: text("fileUrl").notNull(),
    mimeType: varchar("mimeType", { length: 255 }),
    sizeBytes: integer("sizeBytes").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [index("chatV2Attachments_message_idx").on(table.messageId),
    foreignKey({
      name: "chatV2Attachments_messageId_fkey",
      columns: [table.messageId],
      foreignColumns: [chatV2Messages.id],
    }).onDelete("cascade"),
    check("chatV2Attachments_sizeBytes_check", sql`("sizeBytes" >= 0)`),
  ],
);

export type ChatV2Attachment = typeof chatV2Attachments.$inferSelect;
export type InsertChatV2Attachment = typeof chatV2Attachments.$inferInsert;

// --- Runtime Chat Tables -----------------------------------------------------

/**
 * Legacy shared chat messages used by the existing realtime chat implementation.
 * This definition mirrors the production table; no migration is run at startup.
 */
export const chatMessages = pgTable("chatMessages", {
  id: serial("id").primaryKey(),
  authorType: varchar("authorType", { length: 20 }).notNull(),
  authorId: integer("authorId"),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  text: text("text").notNull(),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  replyToMessageId: integer("replyToMessageId"),
  editedAt: timestamp("editedAt"),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const chatMessageReactions = pgTable(
  "chatMessageReactions",
  {
    id: serial("id").primaryKey(),
    messageId: integer("messageId").notNull(),
    authorType: varchar("authorType", { length: 20 }).notNull(),
    authorId: integer("authorId"),
    authorName: varchar("authorName", { length: 255 }).notNull(),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    index("chatMessageReactions_messageId_idx").on(table.messageId),
  ],
);

export type ChatMessageReaction = typeof chatMessageReactions.$inferSelect;
export type InsertChatMessageReaction = typeof chatMessageReactions.$inferInsert;

export const chatReadStates = pgTable(
  "chatReadStates",
  {
    id: serial("id").primaryKey(),
    authorType: varchar("authorType", { length: 20 }).notNull(),
    authorId: integer("authorId"),
    authorName: varchar("authorName", { length: 255 }).notNull(),
    lastReadMessageId: integer("lastReadMessageId").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    index("chatReadStates_author_idx").on(table.authorType, table.authorId),
  ],
);

export type ChatReadState = typeof chatReadStates.$inferSelect;
export type InsertChatReadState = typeof chatReadStates.$inferInsert;

/**
 * Current manager/courier chat endpoint stores messages in this table.
 */
export const managerChatMessages = pgTable("managerChatMessages", {
  id: serial("id").primaryKey(),
  senderName: varchar("senderName", { length: 255 }).notNull(),
  senderRole: varchar("senderRole", { length: 40 }).default("manager").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ManagerChatMessage = typeof managerChatMessages.$inferSelect;
export type InsertManagerChatMessage = typeof managerChatMessages.$inferInsert;

// --- Client Portal and Tariffs -----------------------------------------------

export const clientPortalAccounts = pgTable(
  "clientPortalAccounts",
  {
    id: serial("id").primaryKey(),
    clientId: integer("clientId").notNull(),
    ownerName: varchar("ownerName", { length: 255 }).notNull(),
    login: varchar("login", { length: 320 }).notNull(),
    passwordHash: text("passwordHash").notNull(),
    temporaryPassword: varchar("temporaryPassword", { length: 120 }),
    role: varchar("role", { length: 50 }).default("owner").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    lastLoginAt: timestamp("lastLoginAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    unique("clientPortalAccounts_login_key").on(table.login),
    unique("clientPortalAccounts_login_key").on(table.login),
  ],
);

export type ClientPortalAccount = typeof clientPortalAccounts.$inferSelect;
export type InsertClientPortalAccount = typeof clientPortalAccounts.$inferInsert;

export const clientTariffs = pgTable(
  "clientTariffs",
  {
    id: serial("id").primaryKey(),
    clientId: integer("clientId").notNull(),
    deliveryFirstPlace: integer("deliveryFirstPlace").default(0).notNull(),
    deliveryNextPlace: integer("deliveryNextPlace").default(0).notNull(),
    transportCompanyFirstPlace: integer("transportCompanyFirstPlace").default(0).notNull(),
    transportCompanyNextPlace: integer("transportCompanyNextPlace").default(0).notNull(),
    movementFirstPlace: integer("movementFirstPlace").default(0).notNull(),
    movementNextPlace: integer("movementNextPlace").default(0).notNull(),
    otherFirstPlace: integer("otherFirstPlace").default(0).notNull(),
    otherNextPlace: integer("otherNextPlace").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    hemotestPointPrice: integer("hemotestPointPrice").default(0).notNull(),
    hemotestSundayFirstPointPrice: integer("hemotestSundayFirstPointPrice").default(0).notNull(),
    hemotestSundayNextPointPrice: integer("hemotestSundayNextPointPrice").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("clientTariffs_clientId_unique").on(table.clientId),
  ],
);

export type ClientTariff = typeof clientTariffs.$inferSelect;
export type InsertClientTariff = typeof clientTariffs.$inferInsert;

// ─── Address Book (shared organisation / address / contact directory) ────────
/**
 * One global address book shared by the courier manager site and
 * «МИГ · Корреспонденция». It answers "у кого забрать / кому доставить" and is
 * deliberately independent of the requester role: a physical organisation is not
 * owned by a partner, a correspondence client, a carrier or a single customer.
 *
 * Snapshots stay historical truth: editing the address book never rewrites the
 * sender and recipient snapshot fields of requests, correspondenceShipments,
 * mails or tasks, and no request or shipment references these tables (no
 * reference IDs by design).
 *
 * These tables start EMPTY: there is no backfill from existing requests.
 * Deactivation (isActive = false) is the normal way to retire a record; there is
 * no physical delete API. Foreign keys live only in the SQL migration, matching
 * the convention used by the other tables in this file.
 */
export const addressOrganizations = pgTable(
  "addressOrganizations",
  {
    id: serial("id").primaryKey(),
    /** Display name exactly as the manager typed it — never overwritten by the normalized form. */
    name: varchar("name", { length: 255 }).notNull(),
    /** Technical search/comparison key (trim + collapsed spaces + lowercase). Not unique. */
    normalizedName: varchar("normalizedName", { length: 255 }).notNull(),
    comment: text("comment"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    index("addressOrganizations_normalizedName_idx").on(table.normalizedName),
    index("addressOrganizations_name_idx").on(table.name),
  ],
);

export type AddressOrganization = typeof addressOrganizations.$inferSelect;
export type InsertAddressOrganization = typeof addressOrganizations.$inferInsert;

export const addressOrgLocations = pgTable(
  "addressOrgLocations",
  {
    id: serial("id").primaryKey(),
    /** FK -> addressOrganizations.id ON DELETE CASCADE (SQL migration). */
    organizationId: integer("organizationId").notNull(),
    /** Optional clarification such as "Склад 2" or "Офис 5". */
    label: varchar("label", { length: 255 }),
    city: varchar("city", { length: 100 }),
    /** Display address exactly as typed. */
    address: text("address").notNull(),
    postalCode: varchar("postalCode", { length: 20 }),
    /** Technical search key (trim + collapsed spaces + lowercase). Not unique. */
    normalizedAddress: text("normalizedAddress").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    index("addressOrgLocations_organizationId_idx").on(table.organizationId),
    index("addressOrgLocations_normalizedAddress_idx").on(table.normalizedAddress),
    foreignKey({
      name: "addressOrgLocations_organizationId_fkey",
      columns: [table.organizationId],
      foreignColumns: [addressOrganizations.id],
    }).onDelete("cascade"),
  ],
);

export type AddressOrgLocation = typeof addressOrgLocations.$inferSelect;
export type InsertAddressOrgLocation = typeof addressOrgLocations.$inferInsert;

export const addressOrgContacts = pgTable(
  "addressOrgContacts",
  {
    id: serial("id").primaryKey(),
    /** FK -> addressOrganizations.id ON DELETE CASCADE (SQL migration). */
    organizationId: integer("organizationId").notNull(),
    /**
     * Optional FK -> addressOrgLocations.id ON DELETE SET NULL (SQL migration).
     * A contact may belong to the whole organisation or to one specific address.
     */
    locationId: integer("locationId"),
    name: varchar("name", { length: 255 }),
    position: varchar("position", { length: 255 }),
    /** Display phone exactly as typed. */
    phone: varchar("phone", { length: 50 }),
    /** Digits only, 8XXXXXXXXXX normalised to 7XXXXXXXXXX. Search-only; never unique. */
    phoneNormalized: varchar("phoneNormalized", { length: 20 }),
    email: varchar("email", { length: 320 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (table) => [
    index("addressOrgContacts_organizationId_idx").on(table.organizationId),
    index("addressOrgContacts_locationId_idx").on(table.locationId),
    index("addressOrgContacts_phoneNormalized_idx").on(table.phoneNormalized),
    index("addressOrgContacts_name_idx").on(table.name),
    foreignKey({
      name: "addressOrgContacts_locationId_fkey",
      columns: [table.locationId],
      foreignColumns: [addressOrgLocations.id],
    }).onDelete("set null"),
    foreignKey({
      name: "addressOrgContacts_organizationId_fkey",
      columns: [table.organizationId],
      foreignColumns: [addressOrganizations.id],
    }).onDelete("cascade"),
  ],
);

export type AddressOrgContact = typeof addressOrgContacts.$inferSelect;
export type InsertAddressOrgContact = typeof addressOrgContacts.$inferInsert;

// ─── Billing document files (payment proof and future attachments) ───────────
/**
 * Metadata for files attached to a billing document. The bytes live on disk under
 * uploads/billing-documents/<documentId>/, exactly like request attachments; the
 * database only keeps the path and the validated metadata.
 */
export const billingDocumentFiles = pgTable("billingDocumentFiles", {
  id: serial("id").primaryKey(),
  /** FK -> billingDocuments.id ON DELETE RESTRICT (SQL migration). */
  billingDocumentId: integer("billingDocumentId").notNull(),
  /** 'payment_proof' today. */
  kind: varchar("kind", { length: 30 }).default("payment_proof").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  storedName: varchar("storedName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  /** Validated MIME type (not the client-declared extension). */
  mimeType: varchar("mimeType", { length: 150 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  uploadedByManagerId: integer("uploadedByManagerId"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
},
  (table) => [
    foreignKey({
      name: "billingDocumentFiles_document_fk",
      columns: [table.billingDocumentId],
      foreignColumns: [billingDocuments.id],
    }).onDelete("restrict"),
    check("billingDocumentFiles_kind_valid", sql`((kind)::text = 'payment_proof'::text)`),
    check("billingDocumentFiles_size_nonnegative", sql`("sizeBytes" >= 0)`),
    index("billingDocumentFiles_document_idx").on(table.billingDocumentId, table.kind),
    foreignKey({
      name: "billingDocumentFiles_uploadedByManager_fk",
      columns: [table.uploadedByManagerId],
      foreignColumns: [managers.id],
    }).onDelete("set null"),
  ]);

export type BillingDocumentFile = typeof billingDocumentFiles.$inferSelect;
export type InsertBillingDocumentFile = typeof billingDocumentFiles.$inferInsert;

// ─── MAX Mini App (tables created out-of-band; structure taken from the production
// catalogue dump of 2026-10-16, revision C.1). No migration is created here. ──────────
/** `bytea` is not built into drizzle-orm; this reproduces the production column exactly. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const maxClientChats = pgTable(
  "max_client_chats",
  {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clientId: integer("client_id").notNull(),
  inviteUrl: text("invite_url").notNull(),
  chatId: text("chat_id"),
  enabled: boolean("enabled").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  connectCodeHash: text("connect_code_hash"),
  connectExpiresAt: timestamp("connect_expires_at", { withTimezone: true }),
  },
  (table) => [
    check("max_chat_enabled_requires_verification", sql`(((NOT enabled) OR ((chat_id IS NOT NULL) AND (verified_at IS NOT NULL))))`),
    check("max_chat_invite_url_length", sql`((char_length(invite_url) <= 1000))`),
    foreignKey({
      name: "max_client_chats_client_id_fkey",
      columns: [table.clientId],
      foreignColumns: [clients.id],
    }).onDelete("cascade"),
    unique("max_client_chats_chat_id_key").on(table.chatId),
    index("max_client_chats_client_id_idx").on(table.clientId),
    uniqueIndex("max_client_chats_code_hash_idx").on(table.connectCodeHash).where(sql`(connect_code_hash IS NOT NULL)`),
  ],
);

export type MaxClientChats = typeof maxClientChats.$inferSelect;
export type InsertMaxClientChats = typeof maxClientChats.$inferInsert;

export const maxManagerLinks = pgTable(
  "max_manager_links",
  {
  maxUserId: text("max_user_id").primaryKey(),
  managerId: integer("manager_id").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  canApprove: boolean("can_approve").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("max_manager_links_max_user_id_check", sql`((max_user_id ~ '^\\d{1,20}$'::text))`),
    foreignKey({
      name: "max_manager_links_manager_id_fkey",
      columns: [table.managerId],
      foreignColumns: [managers.id],
    }),
  ],
);

export type MaxManagerLinks = typeof maxManagerLinks.$inferSelect;
export type InsertMaxManagerLinks = typeof maxManagerLinks.$inferInsert;

export const maxOrderDrafts = pgTable(
  "max_order_drafts",
  {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  chatBindingId: bigint("chat_binding_id", { mode: "number" }).notNull(),
  maxUserId: text("max_user_id").notNull(),
  requestData: jsonb("request_data").notNull(),
  status: text("status").notNull().default("pending"),
  requestId: integer("request_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  maxMessageId: text("max_message_id"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  qrOriginal: bytea("qr_original"),
  qrMime: text("qr_mime"),
  lastNotifiedStatus: text("last_notified_status"),
  },
  (table) => [
    check("max_order_drafts_status_check", sql`((status = ANY (ARRAY['pending'::text, 'approving'::text, 'approved'::text, 'rejected'::text, 'failed'::text])))`),
    foreignKey({
      name: "max_order_drafts_chat_binding_id_fkey",
      columns: [table.chatBindingId],
      foreignColumns: [maxClientChats.id],
    }),
    foreignKey({
      name: "max_order_drafts_request_id_fkey",
      columns: [table.requestId],
      foreignColumns: [requests.id],
    }),
    unique("max_order_drafts_idempotency_key_key").on(table.idempotencyKey),
    index("max_order_drafts_chat_idx").on(table.chatBindingId, sql`created_at DESC`),
  ],
);

export type MaxOrderDrafts = typeof maxOrderDrafts.$inferSelect;
export type InsertMaxOrderDrafts = typeof maxOrderDrafts.$inferInsert;

export const maxTimeSelectionMessages = pgTable(
  "max_time_selection_messages",
  {
  messageId: text("message_id").primaryKey(),
  draftId: bigint("draft_id", { mode: "number" }).notNull(),
  chatId: text("chat_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`(now() + '00:30:00'::interval)`),
  },
  (table) => [
    foreignKey({
      name: "max_time_selection_messages_draft_id_fkey",
      columns: [table.draftId],
      foreignColumns: [maxOrderDrafts.id],
    }).onDelete("cascade"),
    index("max_time_selection_draft_idx").on(table.draftId, table.expiresAt),
  ],
);

export type MaxTimeSelectionMessages = typeof maxTimeSelectionMessages.$inferSelect;
export type InsertMaxTimeSelectionMessages = typeof maxTimeSelectionMessages.$inferInsert;

// ─── Correspondence module (tables created out-of-band; structure taken from the
// production catalogue dump of 2026-10-16, revision C.2). No migration is created. ────

export const correspondenceCities = pgTable(
  "correspondenceCities",
  {
  id: integer("id").generatedByDefaultAsIdentity({ name: "correspondenceCities_id_seq" }).notNull().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  region: varchar("region", { length: 255 }).notNull().default(""),
  aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("correspondenceCities_name_check", sql`((btrim((name)::text) <> ''::text))`),
    uniqueIndex("correspondenceCities_name_region_uidx").on(sql`lower(btrim((name)::text))`, sql`lower(btrim((region)::text))`),
  ],
);

export type CorrespondenceCities = typeof correspondenceCities.$inferSelect;
export type InsertCorrespondenceCities = typeof correspondenceCities.$inferInsert;

export const correspondenceCarrierProfiles = pgTable(
  "correspondenceCarrierProfiles",
  {
  carrierId: integer("carrierId").notNull().primaryKey(),
  legalName: varchar("legalName", { length: 500 }),
  inn: varchar("inn", { length: 20 }),
  kpp: varchar("kpp", { length: 20 }),
  ogrn: varchar("ogrn", { length: 20 }),
  legalAddress: text("legalAddress"),
  postalAddress: text("postalAddress"),
  bankName: varchar("bankName", { length: 255 }),
  bik: varchar("bik", { length: 20 }),
  bankAccount: varchar("bankAccount", { length: 34 }),
  correspondentAccount: varchar("correspondentAccount", { length: 34 }),
  contractNumber: varchar("contractNumber", { length: 100 }),
  contractDate: date("contractDate"),
  signerName: varchar("signerName", { length: 255 }),
  signerPosition: varchar("signerPosition", { length: 255 }),
  signerAuthority: text("signerAuthority"),
  comment: text("comment"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondenceCarrierProfiles_carrierId_fkey",
      columns: [table.carrierId],
      foreignColumns: [transportCompanies.id],
    }).onDelete("restrict"),
  ],
);

export type CorrespondenceCarrierProfiles = typeof correspondenceCarrierProfiles.$inferSelect;
export type InsertCorrespondenceCarrierProfiles = typeof correspondenceCarrierProfiles.$inferInsert;

export const correspondencePartnerProfiles = pgTable(
  "correspondencePartnerProfiles",
  {
  partnerId: integer("partnerId").notNull().primaryKey(),
  legalName: varchar("legalName", { length: 500 }),
  inn: varchar("inn", { length: 20 }),
  kpp: varchar("kpp", { length: 20 }),
  ogrn: varchar("ogrn", { length: 20 }),
  legalAddress: text("legalAddress"),
  postalAddress: text("postalAddress"),
  bankName: varchar("bankName", { length: 255 }),
  bik: varchar("bik", { length: 20 }),
  bankAccount: varchar("bankAccount", { length: 34 }),
  correspondentAccount: varchar("correspondentAccount", { length: 34 }),
  contractNumber: varchar("contractNumber", { length: 100 }),
  contractDate: date("contractDate"),
  signerName: varchar("signerName", { length: 255 }),
  signerPosition: varchar("signerPosition", { length: 255 }),
  signerAuthority: text("signerAuthority"),
  comment: text("comment"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondencePartnerProfiles_partnerId_fkey",
      columns: [table.partnerId],
      foreignColumns: [partners.id],
    }).onDelete("restrict"),
  ],
);

export type CorrespondencePartnerProfiles = typeof correspondencePartnerProfiles.$inferSelect;
export type InsertCorrespondencePartnerProfiles = typeof correspondencePartnerProfiles.$inferInsert;

export const correspondenceManifestTemplates = pgTable(
  "correspondenceManifestTemplates",
  {
  id: serial("id").notNull().primaryKey(),
  partnerId: integer("partnerId").notNull(),
  sheetName: varchar("sheetName", { length: 255 }),
  startRow: integer("startRow").notNull().default(2),
  mapping: jsonb("mapping").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondenceManifestTemplates_partnerId_fkey",
      columns: [table.partnerId],
      foreignColumns: [partners.id],
    }).onDelete("restrict"),
    unique("correspondenceManifestTemplates_partnerId_key").on(table.partnerId),
  ],
);

export type CorrespondenceManifestTemplates = typeof correspondenceManifestTemplates.$inferSelect;
export type InsertCorrespondenceManifestTemplates = typeof correspondenceManifestTemplates.$inferInsert;

export const correspondenceClients = pgTable(
  "correspondenceClients",
  {
  id: serial("id").notNull().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  legalName: varchar("legalName", { length: 500 }),
  inn: varchar("inn", { length: 20 }),
  kpp: varchar("kpp", { length: 20 }),
  legalAddress: text("legalAddress"),
  postalAddress: text("postalAddress"),
  contactPerson: varchar("contactPerson", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 320 }),
  contractNumber: varchar("contractNumber", { length: 100 }),
  contractDate: date("contractDate"),
  comment: text("comment"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ogrn: varchar("ogrn", { length: 20 }),
  bankName: varchar("bankName", { length: 255 }),
  bik: varchar("bik", { length: 20 }),
  bankAccount: varchar("bankAccount", { length: 34 }),
  correspondentAccount: varchar("correspondentAccount", { length: 34 }),
  signerName: varchar("signerName", { length: 255 }),
  signerPosition: varchar("signerPosition", { length: 255 }),
  signerAuthority: text("signerAuthority"),
  },
);

export type CorrespondenceClients = typeof correspondenceClients.$inferSelect;
export type InsertCorrespondenceClients = typeof correspondenceClients.$inferInsert;

export const correspondenceAuditLog = pgTable(
  "correspondenceAuditLog",
  {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity({ name: "correspondenceAuditLog_id_seq" }).notNull().primaryKey(),
  managerId: integer("managerId"),
  occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull().defaultNow(),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entityType", { length: 100 }).notNull(),
  entityId: bigint("entityId", { mode: "number" }).notNull(),
  beforeData: jsonb("beforeData"),
  afterData: jsonb("afterData"),
  },
  (table) => [
    index("correspondenceAuditLog_entity_idx").on(table.entityType, table.entityId, sql`"occurredAt" DESC`, sql`id DESC`),
  ],
);

export type CorrespondenceAuditLog = typeof correspondenceAuditLog.$inferSelect;
export type InsertCorrespondenceAuditLog = typeof correspondenceAuditLog.$inferInsert;

export const correspondenceManifests = pgTable(
  "correspondenceManifests",
  {
  id: serial("id").notNull().primaryKey(),
  direction: varchar("direction", { length: 20 }).notNull(),
  partnerId: integer("partnerId"),
  importKey: varchar("importKey", { length: 80 }),
  importPayloadHash: varchar("importPayloadHash", { length: 64 }),
  manifestNumber: varchar("manifestNumber", { length: 100 }),
  manifestDate: date("manifestDate"),
  arrivedAt: date("arrivedAt"),
  sourceFileName: varchar("sourceFileName", { length: 255 }),
  sourceFileMime: varchar("sourceFileMime", { length: 150 }),
  sourceFileSha256: varchar("sourceFileSha256", { length: 64 }),
  sourceFileData: bytea("sourceFileData"),
  createdByManagerId: integer("createdByManagerId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  destinationCityId: integer("destinationCityId"),
  transportType: varchar("transportType", { length: 10 }),
  carrierId: integer("carrierId"),
  transportWaybillNumber: varchar("transportWaybillNumber", { length: 100 }),
  departureDate: date("departureDate"),
  plannedArrivalDate: date("plannedArrivalDate"),
  handedOverAt: timestamp("handedOverAt", { withTimezone: true }),
  handedOverByManagerId: integer("handedOverByManagerId"),
  transportPayer: varchar("transportPayer", { length: 10 }),
  transportCost: numeric("transportCost", { precision: 14, scale: 2 }),
  carrierMinBillableWeight: numeric("carrierMinBillableWeight", { precision: 12, scale: 3 }),
  terminalRequired: boolean("terminalRequired"),
  terminalCost: numeric("terminalCost", { precision: 14, scale: 2 }),
  terminalPayer: varchar("terminalPayer", { length: 10 }),
  comment: text("comment"),
  creationKey: uuid("creationKey"),
  creationPayloadHash: varchar("creationPayloadHash", { length: 64 }),
  },
  (table) => [
    check("correspondenceManifests_carrierMinBillableWeight_check", sql`((("carrierMinBillableWeight" >= 0.001) AND ("carrierMinBillableWeight" <= 999999999.999)))`),
    check("correspondenceManifests_creation_key_hash_check", sql`(((("creationKey" IS NULL) AND ("creationPayloadHash" IS NULL)) OR (("creationKey" IS NOT NULL) AND ("creationPayloadHash" IS NOT NULL) AND (("creationPayloadHash")::text ~ '^[0-9a-f]{64}$'::text))))`),
    check("correspondenceManifests_direction_check", sql`(((direction)::text = ANY ((ARRAY['incoming'::character varying, 'outgoing'::character varying])::text[])))`),
    check("correspondenceManifests_terminalCost_check", sql`((("terminalCost" >= (0)::numeric) AND ("terminalCost" <= 999999999999.99)))`),
    check("correspondenceManifests_terminalPayer_check", sql`((("terminalPayer")::text = ANY ((ARRAY['us'::character varying, 'partner'::character varying])::text[])))`),
    check("correspondenceManifests_transportCost_check", sql`((("transportCost" >= (0)::numeric) AND ("transportCost" <= 999999999999.99)))`),
    check("correspondenceManifests_transportPayer_check", sql`((("transportPayer")::text = ANY ((ARRAY['us'::character varying, 'partner'::character varying])::text[])))`),
    check("correspondenceManifests_transportType_check", sql`((("transportType")::text = ANY ((ARRAY['air'::character varying, 'ground'::character varying])::text[])))`),
    foreignKey({
      name: "correspondenceManifests_carrierId_fkey",
      columns: [table.carrierId],
      foreignColumns: [transportCompanies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceManifests_destinationCityId_fkey",
      columns: [table.destinationCityId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceManifests_partnerId_fkey",
      columns: [table.partnerId],
      foreignColumns: [partners.id],
    }).onDelete("restrict"),
    unique("correspondenceManifests_creationKey_key").on(table.creationKey),
    unique("correspondenceManifests_importKey_key").on(table.importKey),
  ],
);

export type CorrespondenceManifests = typeof correspondenceManifests.$inferSelect;
export type InsertCorrespondenceManifests = typeof correspondenceManifests.$inferInsert;

export const correspondenceShipments = pgTable(
  "correspondenceShipments",
  {
  id: serial("id").notNull().primaryKey(),
  mailId: integer("mailId"),
  manifestId: integer("manifestId"),
  direction: varchar("direction", { length: 20 }).notNull(),
  ownerType: varchar("ownerType", { length: 20 }),
  ownerId: integer("ownerId"),
  waybillDate: date("waybillDate"),
  senderCity: text("senderCity"),
  senderName: text("senderName"),
  senderCompany: text("senderCompany"),
  senderPhone: text("senderPhone"),
  senderPostalCode: text("senderPostalCode"),
  senderAddress: text("senderAddress"),
  recipientRegion: text("recipientRegion"),
  recipientCityRaw: text("recipientCityRaw"),
  recipientCityNormalized: text("recipientCityNormalized"),
  recipientName: text("recipientName"),
  recipientCompany: text("recipientCompany"),
  recipientPhone: text("recipientPhone"),
  recipientPostalCode: text("recipientPostalCode"),
  recipientAddress: text("recipientAddress"),
  declaredValue: numeric("declaredValue", { precision: 14, scale: 2 }),
  manifestWeight: numeric("manifestWeight", { precision: 12, scale: 3 }),
  volumetricWeight: numeric("volumetricWeight", { precision: 12, scale: 3 }),
  measuredWeight: numeric("measuredWeight", { precision: 12, scale: 3 }),
  placesCount: integer("placesCount"),
  contents: text("contents"),
  senderNotes: text("senderNotes"),
  paymentMethod: text("paymentMethod"),
  payer: text("payer"),
  specialConditions: text("specialConditions"),
  archivedAt: timestamp("archivedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  waybillNumber: varchar("waybillNumber", { length: 50 }),
  destinationCityId: integer("destinationCityId"),
  outgoingManifestId: integer("outgoingManifestId"),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }),
  acceptedByManagerId: integer("acceptedByManagerId"),
  intakeKey: uuid("intakeKey"),
  intakePayloadHash: varchar("intakePayloadHash", { length: 64 }),
  partnerId: integer("partnerId"),
  billableWeight: numeric("billableWeight", { precision: 12, scale: 3 }),
  },
  (table) => [
    check("correspondenceShipments_direction_check", sql`(((direction)::text = ANY ((ARRAY['incoming'::character varying, 'outgoing'::character varying])::text[])))`),
    check("correspondenceShipments_intake_key_hash_check", sql`(((("intakeKey" IS NULL) AND ("intakePayloadHash" IS NULL)) OR (("intakeKey" IS NOT NULL) AND ("intakePayloadHash" IS NOT NULL) AND (("intakePayloadHash")::text ~ '^[0-9a-f]{64}$'::text))))`),
    check("correspondenceShipments_mail_or_outgoing_waybill_check", sql`((("mailId" IS NOT NULL) OR (((direction)::text = 'outgoing'::text) AND ("waybillNumber" IS NOT NULL))))`),
    check("correspondenceShipments_ownerType_check", sql`((("ownerType")::text = ANY ((ARRAY['client'::character varying, 'partner'::character varying])::text[])))`),
    check("correspondenceShipments_waybillNumber_check", sql`((btrim(("waybillNumber")::text) <> ''::text))`),
    foreignKey({
      name: "correspondenceShipments_destinationCityId_fkey",
      columns: [table.destinationCityId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceShipments_mailId_fkey",
      columns: [table.mailId],
      foreignColumns: [mails.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceShipments_manifestId_fkey",
      columns: [table.manifestId],
      foreignColumns: [correspondenceManifests.id],
    }).onDelete("set null"),
    foreignKey({
      name: "correspondenceShipments_outgoingManifestId_fkey",
      columns: [table.outgoingManifestId],
      foreignColumns: [correspondenceManifests.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceShipments_partnerId_fkey",
      columns: [table.partnerId],
      foreignColumns: [partners.id],
    }).onDelete("set null"),
    unique("correspondenceShipments_intakeKey_key").on(table.intakeKey),
    unique("correspondenceShipments_mailId_key").on(table.mailId),
    index("correspondenceShipments_archive_created_idx").on(table.archivedAt, sql`"createdAt" DESC`),
    index("correspondenceShipments_destinationCityId_idx").on(table.destinationCityId),
    index("correspondenceShipments_manifestId_idx").on(table.manifestId),
    index("correspondenceShipments_outgoingManifestId_idx").on(table.outgoingManifestId),
    index("correspondenceShipments_partnerId_idx").on(table.partnerId),
    uniqueIndex("correspondenceShipments_waybillNumber_uidx").on(sql`lower(btrim(("waybillNumber")::text))`).where(sql`("waybillNumber" IS NOT NULL)`),
  ],
);

export type CorrespondenceShipments = typeof correspondenceShipments.$inferSelect;
export type InsertCorrespondenceShipments = typeof correspondenceShipments.$inferInsert;

export const correspondenceShipmentPlaces = pgTable(
  "correspondenceShipmentPlaces",
  {
  id: integer("id").generatedByDefaultAsIdentity({ name: "correspondenceShipmentPlaces_id_seq" }).notNull().primaryKey(),
  shipmentId: integer("shipmentId").notNull(),
  position: integer("position").notNull(),
  measuredWeight: numeric("measuredWeight", { precision: 12, scale: 3 }).notNull(),
  lengthCm: numeric("lengthCm", { precision: 10, scale: 2 }),
  widthCm: numeric("widthCm", { precision: 10, scale: 2 }),
  heightCm: numeric("heightCm", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("correspondenceShipmentPlaces_dimensions_check", sql`(((("lengthCm" IS NULL) AND ("widthCm" IS NULL) AND ("heightCm" IS NULL)) OR (("lengthCm" IS NOT NULL) AND ("widthCm" IS NOT NULL) AND ("heightCm" IS NOT NULL))))`),
    check("correspondenceShipmentPlaces_heightCm_check", sql`((("heightCm" >= 0.01) AND ("heightCm" <= 99999999.99)))`),
    check("correspondenceShipmentPlaces_lengthCm_check", sql`((("lengthCm" >= 0.01) AND ("lengthCm" <= 99999999.99)))`),
    check("correspondenceShipmentPlaces_measuredWeight_check", sql`((("measuredWeight" >= 0.001) AND ("measuredWeight" <= 999999999.999)))`),
    check("correspondenceShipmentPlaces_position_check", sql`(("position" > 0))`),
    check("correspondenceShipmentPlaces_widthCm_check", sql`((("widthCm" >= 0.01) AND ("widthCm" <= 99999999.99)))`),
    foreignKey({
      name: "correspondenceShipmentPlaces_shipmentId_fkey",
      columns: [table.shipmentId],
      foreignColumns: [correspondenceShipments.id],
    }).onDelete("restrict"),
    unique("correspondenceShipmentPlaces_shipmentId_position_key").on(table.shipmentId, table.position),
  ],
);

export type CorrespondenceShipmentPlaces = typeof correspondenceShipmentPlaces.$inferSelect;
export type InsertCorrespondenceShipmentPlaces = typeof correspondenceShipmentPlaces.$inferInsert;

// ─── Tariff directories (migration 0010) and courierAccess: structure taken from the
// production catalogue dump of 2026-10-16, revision C.3. No migration is created. ────

export const correspondenceServices = pgTable(
  "correspondenceServices",
  {
  id: serial("id").notNull().primaryKey(),
  code: varchar("code", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    unique("correspondenceServices_code_key").on(table.code),
  ],
);

export type CorrespondenceServices = typeof correspondenceServices.$inferSelect;
export type InsertCorrespondenceServices = typeof correspondenceServices.$inferInsert;

export const correspondenceClientTariffPlans = pgTable(
  "correspondenceClientTariffPlans",
  {
  id: serial("id").notNull().primaryKey(),
  ownerType: varchar("ownerType", { length: 10 }).notNull(),
  ownerId: integer("ownerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
  validFrom: date("validFrom"),
  validTo: date("validTo"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    index("correspondenceClientTariffPlans_owner_idx").on(table.ownerType, table.ownerId),
  ],
);

export type CorrespondenceClientTariffPlans = typeof correspondenceClientTariffPlans.$inferSelect;
export type InsertCorrespondenceClientTariffPlans = typeof correspondenceClientTariffPlans.$inferInsert;

export const correspondenceClientTariffItems = pgTable(
  "correspondenceClientTariffItems",
  {
  id: serial("id").notNull().primaryKey(),
  planId: integer("planId").notNull(),
  serviceCode: varchar("serviceCode", { length: 20 }).notNull(),
  cityFromId: integer("cityFromId"),
  cityToId: integer("cityToId"),
  weightFromKg: numeric("weightFromKg", { precision: 12, scale: 3 }),
  weightToKg: numeric("weightToKg", { precision: 12, scale: 3 }),
  pricingModel: varchar("pricingModel", { length: 20 }).notNull(),
  basePrice: numeric("basePrice", { precision: 14, scale: 2 }),
  pricePerKg: numeric("pricePerKg", { precision: 14, scale: 2 }),
  vatRate: numeric("vatRate", { precision: 5, scale: 2 }),
  priority: integer("priority").notNull().default(100),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondenceClientTariffItems_cityFromId_fkey",
      columns: [table.cityFromId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceClientTariffItems_cityToId_fkey",
      columns: [table.cityToId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondenceClientTariffItems_planId_fkey",
      columns: [table.planId],
      foreignColumns: [correspondenceClientTariffPlans.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "correspondenceClientTariffItems_serviceCode_fkey",
      columns: [table.serviceCode],
      foreignColumns: [correspondenceServices.code],
    }).onDelete("restrict"),
    index("correspondenceClientTariffItems_plan_idx").on(table.planId),
  ],
);

export type CorrespondenceClientTariffItems = typeof correspondenceClientTariffItems.$inferSelect;
export type InsertCorrespondenceClientTariffItems = typeof correspondenceClientTariffItems.$inferInsert;

export const correspondencePartnerTariffPlans = pgTable(
  "correspondencePartnerTariffPlans",
  {
  id: serial("id").notNull().primaryKey(),
  partnerId: integer("partnerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
  validFrom: date("validFrom"),
  validTo: date("validTo"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondencePartnerTariffPlans_partnerId_fkey",
      columns: [table.partnerId],
      foreignColumns: [partners.id],
    }).onDelete("restrict"),
    index("correspondencePartnerTariffPlans_partner_idx").on(table.partnerId),
  ],
);

export type CorrespondencePartnerTariffPlans = typeof correspondencePartnerTariffPlans.$inferSelect;
export type InsertCorrespondencePartnerTariffPlans = typeof correspondencePartnerTariffPlans.$inferInsert;

export const correspondencePartnerTariffItems = pgTable(
  "correspondencePartnerTariffItems",
  {
  id: serial("id").notNull().primaryKey(),
  planId: integer("planId").notNull(),
  serviceCode: varchar("serviceCode", { length: 20 }).notNull(),
  cityFromId: integer("cityFromId"),
  cityToId: integer("cityToId"),
  weightFromKg: numeric("weightFromKg", { precision: 12, scale: 3 }),
  weightToKg: numeric("weightToKg", { precision: 12, scale: 3 }),
  pricingModel: varchar("pricingModel", { length: 20 }).notNull(),
  basePrice: numeric("basePrice", { precision: 14, scale: 2 }),
  pricePerKg: numeric("pricePerKg", { precision: 14, scale: 2 }),
  vatRate: numeric("vatRate", { precision: 5, scale: 2 }),
  priority: integer("priority").notNull().default(100),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "correspondencePartnerTariffItems_cityFromId_fkey",
      columns: [table.cityFromId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondencePartnerTariffItems_cityToId_fkey",
      columns: [table.cityToId],
      foreignColumns: [correspondenceCities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "correspondencePartnerTariffItems_planId_fkey",
      columns: [table.planId],
      foreignColumns: [correspondencePartnerTariffPlans.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "correspondencePartnerTariffItems_serviceCode_fkey",
      columns: [table.serviceCode],
      foreignColumns: [correspondenceServices.code],
    }).onDelete("restrict"),
    index("correspondencePartnerTariffItems_plan_idx").on(table.planId),
  ],
);

export type CorrespondencePartnerTariffItems = typeof correspondencePartnerTariffItems.$inferSelect;
export type InsertCorrespondencePartnerTariffItems = typeof correspondencePartnerTariffItems.$inferInsert;

export const courierAccess = pgTable(
  "courierAccess",
  {
  courierId: integer("courierId").notNull().primaryKey(),
  allowedDaysMask: integer("allowedDaysMask").notNull().default(127),
  tasksAllowed: boolean("tasksAllowed").notNull().default(true),
  hemotestAllowed: boolean("hemotestAllowed").notNull().default(true),
  sberbankAllowed: boolean("sberbankAllowed").notNull().default(true),
  mailsAllowed: boolean("mailsAllowed").notNull().default(true),
  chatAllowed: boolean("chatAllowed").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "courierAccess_courierId_fkey",
      columns: [table.courierId],
      foreignColumns: [couriers.id],
    }).onDelete("cascade"),
  ],
);

export type CourierAccess = typeof courierAccess.$inferSelect;
export type InsertCourierAccess = typeof courierAccess.$inferInsert;
