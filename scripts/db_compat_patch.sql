-- Compatibility patch for existing production PostgreSQL databases.
-- Safe to run on every container start: only creates missing enum types/columns/indexes.

DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "courier_vehicle_type" AS ENUM('bicycle', 'scooter', 'car', 'foot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "task_status" AS ENUM('assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "task_type" AS ENUM('regular', 'warehouse_pickup', 'courier_call');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "package_type" AS ENUM('document', 'small', 'medium', 'large', 'fragile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "mail_status" AS ENUM('not_delivered', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "pickup_list_status" AS ENUM('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "request_type" AS ENUM('delivery', 'movement', 'nuts', 'courier_call', 'pickup_from_tc', 'simple');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "request_status" AS ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "payment_method" AS ENUM('paid', 'transfer', 'cash', 'terminal', 'qr');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Couriers: fields used by manager and courier app.
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "username" varchar(100);
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255);
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "vehicleType" courier_vehicle_type DEFAULT 'scooter';
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "totalDeliveries" integer DEFAULT 0;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "urgencyThresholdOrange" integer DEFAULT 60;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "urgencyThresholdRed" integer DEFAULT 30;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "pushToken" varchar(255);
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "couriers" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
UPDATE "couriers" SET
  "vehicleType" = COALESCE("vehicleType", 'scooter'),
  "isActive" = COALESCE("isActive", true),
  "totalDeliveries" = COALESCE("totalDeliveries", 0),
  "urgencyThresholdOrange" = COALESCE("urgencyThresholdOrange", 60),
  "urgencyThresholdRed" = COALESCE("urgencyThresholdRed", 30),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

-- Requests: this is where old DBs most often miss columns and produce 502 errors.
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "createdByUserId" integer DEFAULT 1;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "requestType" request_type DEFAULT 'delivery';
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "status" request_status DEFAULT 'pending';
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "courierId" integer;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "clientId" integer;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "recipientName" varchar(255);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "recipientPhone" varchar(20);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "recipientAddress" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "deliveryAddress" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "deliveryCity" varchar(100);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "packageDescription" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "packageType" package_type;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "placesCount" integer DEFAULT 1;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "senderName" varchar(255);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "senderCompany" varchar(255);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "senderCity" varchar(100);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "senderAddress" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "senderPhone" varchar(20);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "recipientCompany" varchar(255);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "recipientCity" varchar(100);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "items" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "totalAmount" decimal(10,2);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "callReason" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "tcName" varchar(255);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "tcAddress" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "trackingNumber" varchar(100);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "specialInstructions" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "comments" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "paymentMethod" payment_method;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "paymentAmount" decimal(10,2);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "deliveryTimeFrom" varchar(5);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "deliveryTimeTo" varchar(5);
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "estimatedMinutes" integer;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "scheduledAt" timestamp;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamp;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "completedAt" timestamp;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "rejectionReason" text;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "requests" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
UPDATE "requests" SET
  "createdByUserId" = COALESCE("createdByUserId", 1),
  "requestType" = COALESCE("requestType", 'delivery'),
  "status" = COALESCE("status", 'pending'),
  "placesCount" = COALESCE("placesCount", 1),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

-- Mails: allow manifests without phone numbers and keep all columns present.
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "waybillNumber" varchar(50);
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "recipientName" varchar(255);
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "recipientPhone" varchar(20);
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "deliveryAddress" text;
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "status" mail_status DEFAULT 'not_delivered';
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "recipientSignature" text;
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp;
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "courierId" integer;
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "mails" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "mails" ALTER COLUMN "recipientPhone" DROP NOT NULL;
UPDATE "mails" SET
  "status" = COALESCE("status", 'not_delivered'),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

-- Clients.
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "contactPerson" varchar(255);
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "email" varchar(320);
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "clients" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;

-- Pickup points/lists used by manager pages.
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "contactPerson" varchar(255);
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "hemotestPickupPoints" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "contactPerson" varchar(255);
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankPickupPoints" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "createdByUserId" integer;
ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "date" varchar(10);
ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "status" pickup_list_status DEFAULT 'active';
ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "hemotestPickupLists" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "hemotestListItems" ADD COLUMN IF NOT EXISTS "listId" integer;
ALTER TABLE IF EXISTS "hemotestListItems" ADD COLUMN IF NOT EXISTS "pointId" integer;
ALTER TABLE IF EXISTS "hemotestListItems" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "createdByUserId" integer;
ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "dayOfWeek" integer;
ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "name" varchar(255);
ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "status" pickup_list_status DEFAULT 'active';
ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankPickupLists" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankListItems" ADD COLUMN IF NOT EXISTS "listId" integer;
ALTER TABLE IF EXISTS "sberbankListItems" ADD COLUMN IF NOT EXISTS "pointId" integer;
ALTER TABLE IF EXISTS "sberbankListItems" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankPickupSchedule" ADD COLUMN IF NOT EXISTS "dayOfWeek" integer;
ALTER TABLE IF EXISTS "sberbankPickupSchedule" ADD COLUMN IF NOT EXISTS "pointId" integer;
ALTER TABLE IF EXISTS "sberbankPickupSchedule" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "sberbankPickupSchedule" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;

-- Tasks.
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "createdByUserId" integer;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "courierId" integer;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "status" task_status DEFAULT 'assigned';
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "taskType" task_type DEFAULT 'regular';
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "recipientName" varchar(255);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "recipientPhone" varchar(20);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "deliveryAddress" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "deliveryCity" varchar(100);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "packageDescription" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "packageType" package_type DEFAULT 'small';
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "specialInstructions" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "placesCount" integer DEFAULT 1;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "estimatedMinutes" integer;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "deliveryTimeFrom" varchar(5);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "deliveryTimeTo" varchar(5);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "recipientAddress" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "senderName" varchar(255);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "senderAddress" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "senderPhone" varchar(20);
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "comments" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "courierComments" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "items" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "rejectionReason" text;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "scheduledAt" timestamp;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamp;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "completedAt" timestamp;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;
UPDATE "tasks" SET
  "status" = COALESCE("status", 'assigned'),
  "taskType" = COALESCE("taskType", 'regular'),
  "packageType" = COALESCE("packageType", 'small'),
  "placesCount" = COALESCE("placesCount", 1),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

-- Safe indexes for common queries.
CREATE INDEX IF NOT EXISTS "idx_couriers_username" ON "couriers"("username");
CREATE INDEX IF NOT EXISTS "idx_mails_waybillNumber" ON "mails"("waybillNumber");
CREATE INDEX IF NOT EXISTS "idx_mails_status" ON "mails"("status");
CREATE INDEX IF NOT EXISTS "idx_requests_status" ON "requests"("status");
CREATE INDEX IF NOT EXISTS "idx_requests_requestType" ON "requests"("requestType");
