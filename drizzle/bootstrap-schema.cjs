const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[DB bootstrap] DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function createEnum(name, values) {
  const escapedValues = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
        CREATE TYPE "${name}" AS ENUM (${escapedValues});
      END IF;
    END $$;
  `);
}

async function main() {
  console.log('[DB bootstrap] Ensuring PostgreSQL enums...');
  await createEnum('user_role', ['user', 'admin']);
  await createEnum('courier_vehicle_type', ['bicycle', 'scooter', 'car', 'foot']);
  await createEnum('task_status', ['assigned', 'in_progress', 'completed', 'cancelled']);
  await createEnum('task_type', ['regular', 'warehouse_pickup', 'courier_call']);
  await createEnum('package_type', ['document', 'small', 'medium', 'large', 'fragile']);
  await createEnum('mail_status', ['not_delivered', 'delivered']);
  await createEnum('pickup_list_status', ['active', 'completed', 'cancelled']);
  await createEnum('request_type', ['delivery', 'movement', 'nuts', 'courier_call', 'pickup_from_tc', 'simple']);
  await createEnum('request_status', ['pending', 'assigned', 'in_progress', 'completed', 'cancelled']);
  await createEnum('payment_method', ['paid', 'transfer', 'cash', 'terminal', 'qr']);

  console.log('[DB bootstrap] Ensuring PostgreSQL tables...');
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" serial PRIMARY KEY,
      "openId" varchar(64) NOT NULL UNIQUE,
      "name" text,
      "email" varchar(320),
      "loginMethod" varchar(64),
      "role" "user_role" NOT NULL DEFAULT 'user',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now(),
      "lastSignedIn" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "couriers" (
      "id" serial PRIMARY KEY,
      "userId" integer,
      "name" varchar(255) NOT NULL,
      "username" varchar(100) NOT NULL UNIQUE,
      "passwordHash" varchar(255) NOT NULL,
      "phone" varchar(20),
      "vehicleType" "courier_vehicle_type" NOT NULL DEFAULT 'scooter',
      "isActive" boolean NOT NULL DEFAULT true,
      "totalDeliveries" integer NOT NULL DEFAULT 0,
      "urgencyThresholdOrange" integer NOT NULL DEFAULT 60,
      "urgencyThresholdRed" integer NOT NULL DEFAULT 30,
      "pushToken" varchar(255),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "tasks" (
      "id" serial PRIMARY KEY,
      "createdByUserId" integer,
      "courierId" integer,
      "status" "task_status" NOT NULL DEFAULT 'assigned',
      "taskType" "task_type" NOT NULL DEFAULT 'regular',
      "recipientName" varchar(255) NOT NULL,
      "recipientPhone" varchar(20),
      "deliveryAddress" text NOT NULL,
      "deliveryCity" varchar(100),
      "packageDescription" text,
      "packageType" "package_type" NOT NULL DEFAULT 'small',
      "specialInstructions" text,
      "placesCount" integer NOT NULL DEFAULT 1,
      "estimatedMinutes" integer,
      "deliveryTimeFrom" varchar(5),
      "deliveryTimeTo" varchar(5),
      "recipientAddress" text,
      "senderName" varchar(255),
      "senderAddress" text,
      "senderPhone" varchar(20),
      "comments" text,
      "courierComments" text,
      "items" text,
      "rejectionReason" text,
      "scheduledAt" timestamp,
      "acceptedAt" timestamp,
      "completedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "taskStatusHistory" (
      "id" serial PRIMARY KEY,
      "taskId" integer NOT NULL,
      "status" varchar(50) NOT NULL,
      "changedByUserId" integer,
      "note" text,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "hemotestPickupPoints" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL,
      "address" text NOT NULL,
      "phone" varchar(20),
      "contactPerson" varchar(255),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "hemotestPickups" (
      "id" serial PRIMARY KEY,
      "pointId" integer NOT NULL,
      "courierId" integer NOT NULL,
      "date" varchar(10) NOT NULL,
      "isPicked" boolean NOT NULL DEFAULT false,
      "pickedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "sberbankPickupPoints" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL,
      "address" text NOT NULL,
      "phone" varchar(20),
      "contactPerson" varchar(255),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "sberbankPickups" (
      "id" serial PRIMARY KEY,
      "pointId" integer NOT NULL,
      "courierId" integer NOT NULL,
      "date" varchar(10) NOT NULL,
      "isPicked" boolean NOT NULL DEFAULT false,
      "pickedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "hemotestPickupLists" (
      "id" serial PRIMARY KEY,
      "createdByUserId" integer,
      "date" varchar(10) NOT NULL,
      "name" varchar(255) NOT NULL,
      "status" "pickup_list_status" NOT NULL DEFAULT 'active',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "hemotestListItems" (
      "id" serial PRIMARY KEY,
      "listId" integer NOT NULL,
      "pointId" integer NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "sberbankPickupLists" (
      "id" serial PRIMARY KEY,
      "createdByUserId" integer,
      "dayOfWeek" integer NOT NULL,
      "name" varchar(255) NOT NULL,
      "status" "pickup_list_status" NOT NULL DEFAULT 'active',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "sberbankListItems" (
      "id" serial PRIMARY KEY,
      "listId" integer NOT NULL,
      "pointId" integer NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "mails" (
      "id" serial PRIMARY KEY,
      "waybillNumber" varchar(50) NOT NULL UNIQUE,
      "recipientName" varchar(255),
      "recipientPhone" varchar(20) NOT NULL,
      "deliveryAddress" text NOT NULL,
      "status" "mail_status" NOT NULL DEFAULT 'not_delivered',
      "recipientSignature" text,
      "deliveredAt" timestamp,
      "courierId" integer,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "sberbankPickupSchedule" (
      "id" serial PRIMARY KEY,
      "dayOfWeek" integer NOT NULL,
      "pointId" integer NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "clients" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL,
      "address" text NOT NULL,
      "contactPerson" varchar(255),
      "phone" varchar(20),
      "email" varchar(320),
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "requests" (
      "id" serial PRIMARY KEY,
      "createdByUserId" integer NOT NULL DEFAULT 1,
      "requestType" "request_type" NOT NULL,
      "status" "request_status" NOT NULL DEFAULT 'pending',
      "courierId" integer,
      "clientId" integer,
      "recipientName" varchar(255),
      "recipientPhone" varchar(20),
      "recipientAddress" text,
      "deliveryAddress" text,
      "deliveryCity" varchar(100),
      "packageDescription" text,
      "packageType" "package_type",
      "placesCount" integer DEFAULT 1,
      "senderName" varchar(255),
      "senderCompany" varchar(255),
      "senderCity" varchar(100),
      "senderAddress" text,
      "senderPhone" varchar(20),
      "recipientCompany" varchar(255),
      "recipientCity" varchar(100),
      "items" text,
      "totalAmount" decimal(10,2),
      "callReason" text,
      "tcName" varchar(255),
      "tcAddress" text,
      "trackingNumber" varchar(100),
      "description" text,
      "specialInstructions" text,
      "comments" text,
      "paymentMethod" "payment_method",
      "paymentAmount" decimal(10,2),
      "deliveryTimeFrom" varchar(5),
      "deliveryTimeTo" varchar(5),
      "estimatedMinutes" integer,
      "scheduledAt" timestamp,
      "acceptedAt" timestamp,
      "completedAt" timestamp,
      "rejectionReason" text,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "settings" (
      "id" serial PRIMARY KEY,
      "nutsTariff" decimal(10,2) DEFAULT '0',
      "cedroilTariff" decimal(10,2) DEFAULT '0',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS "managers" (
      "id" serial PRIMARY KEY,
      "name" varchar(255) NOT NULL,
      "username" varchar(100) NOT NULL UNIQUE,
      "email" varchar(320) NOT NULL UNIQUE,
      "passwordHash" varchar(255) NOT NULL,
      "phone" varchar(20),
      "isActive" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log('[DB bootstrap] Schema is ready');
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error('[DB bootstrap] Failed:', error);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  });
