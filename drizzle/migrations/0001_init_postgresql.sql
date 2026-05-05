-- PostgreSQL initialization migration for courier-delivery-system
-- This migration creates all tables from scratch for PostgreSQL

-- Create enums
CREATE TYPE "user_role" AS ENUM('user', 'admin');
CREATE TYPE "courier_vehicle_type" AS ENUM('bicycle', 'scooter', 'car', 'foot');
CREATE TYPE "task_status" AS ENUM('assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "task_type" AS ENUM('regular', 'warehouse_pickup', 'courier_call');
CREATE TYPE "package_type" AS ENUM('document', 'small', 'medium', 'large', 'fragile');
CREATE TYPE "mail_status" AS ENUM('not_delivered', 'delivered');
CREATE TYPE "pickup_list_status" AS ENUM('active', 'completed', 'cancelled');
CREATE TYPE "request_type" AS ENUM('delivery', 'movement', 'nuts', 'courier_call', 'pickup_from_tc', 'simple');
CREATE TYPE "request_status" AS ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "payment_method" AS ENUM('paid', 'transfer', 'cash', 'terminal', 'qr');

-- Users table
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "openId" VARCHAR(64) NOT NULL UNIQUE,
  "name" TEXT,
  "email" VARCHAR(320),
  "loginMethod" VARCHAR(64),
  "role" "user_role" NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSignedIn" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Couriers table
CREATE TABLE "couriers" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER,
  "name" VARCHAR(255) NOT NULL,
  "username" VARCHAR(100) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(20),
  "vehicleType" "courier_vehicle_type" NOT NULL DEFAULT 'scooter',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "totalDeliveries" INTEGER NOT NULL DEFAULT 0,
  "urgencyThresholdOrange" INTEGER NOT NULL DEFAULT 60,
  "urgencyThresholdRed" INTEGER NOT NULL DEFAULT 30,
  "pushToken" VARCHAR(255),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table
CREATE TABLE "tasks" (
  "id" SERIAL PRIMARY KEY,
  "createdByUserId" INTEGER,
  "courierId" INTEGER,
  "status" "task_status" NOT NULL DEFAULT 'assigned',
  "taskType" "task_type" NOT NULL DEFAULT 'regular',
  "recipientName" VARCHAR(255) NOT NULL,
  "recipientPhone" VARCHAR(20),
  "deliveryAddress" TEXT NOT NULL,
  "deliveryCity" VARCHAR(100),
  "packageDescription" TEXT,
  "packageType" "package_type" NOT NULL DEFAULT 'small',
  "specialInstructions" TEXT,
  "placesCount" INTEGER NOT NULL DEFAULT 1,
  "estimatedMinutes" INTEGER,
  "deliveryTimeFrom" VARCHAR(5),
  "deliveryTimeTo" VARCHAR(5),
  "recipientAddress" TEXT,
  "senderName" VARCHAR(255),
  "senderAddress" TEXT,
  "senderPhone" VARCHAR(20),
  "comments" TEXT,
  "courierComments" TEXT,
  "items" TEXT,
  "rejectionReason" TEXT,
  "scheduledAt" TIMESTAMP,
  "acceptedAt" TIMESTAMP,
  "completedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Task status history table
CREATE TABLE "taskStatusHistory" (
  "id" SERIAL PRIMARY KEY,
  "taskId" INTEGER NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "changedByUserId" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hemotest pickup points table
CREATE TABLE "hemotestPickupPoints" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hemotest pickups table
CREATE TABLE "hemotestPickups" (
  "id" SERIAL PRIMARY KEY,
  "pointId" INTEGER NOT NULL,
  "courierId" INTEGER NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "isPicked" BOOLEAN NOT NULL DEFAULT false,
  "pickedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sberbank pickup points table
CREATE TABLE "sberbankPickupPoints" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "address" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sberbank pickups table
CREATE TABLE "sberbankPickups" (
  "id" SERIAL PRIMARY KEY,
  "pointId" INTEGER NOT NULL,
  "courierId" INTEGER NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "isPicked" BOOLEAN NOT NULL DEFAULT false,
  "pickedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hemotest pickup lists table
CREATE TABLE "hemotestPickupLists" (
  "id" SERIAL PRIMARY KEY,
  "createdByUserId" INTEGER,
  "date" VARCHAR(10) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "status" "pickup_list_status" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Hemotest list items table
CREATE TABLE "hemotestListItems" (
  "id" SERIAL PRIMARY KEY,
  "listId" INTEGER NOT NULL,
  "pointId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sberbank pickup lists table
CREATE TABLE "sberbankPickupLists" (
  "id" SERIAL PRIMARY KEY,
  "createdByUserId" INTEGER,
  "dayOfWeek" INTEGER NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "status" "pickup_list_status" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sberbank list items table
CREATE TABLE "sberbankListItems" (
  "id" SERIAL PRIMARY KEY,
  "listId" INTEGER NOT NULL,
  "pointId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mails table
CREATE TABLE "mails" (
  "id" SERIAL PRIMARY KEY,
  "waybillNumber" VARCHAR(50) NOT NULL UNIQUE,
  "recipientName" VARCHAR(255),
  "recipientPhone" VARCHAR(20) NOT NULL,
  "deliveryAddress" TEXT NOT NULL,
  "status" "mail_status" NOT NULL DEFAULT 'not_delivered',
  "recipientSignature" TEXT,
  "deliveredAt" TIMESTAMP,
  "courierId" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sberbank pickup schedule table
CREATE TABLE "sberbankPickupSchedule" (
  "id" SERIAL PRIMARY KEY,
  "dayOfWeek" INTEGER NOT NULL,
  "pointId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE "clients" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "address" TEXT NOT NULL,
  "contactPerson" VARCHAR(255),
  "phone" VARCHAR(20),
  "email" VARCHAR(320),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Requests table
CREATE TABLE "requests" (
  "id" SERIAL PRIMARY KEY,
  "createdByUserId" INTEGER NOT NULL,
  "requestType" "request_type" NOT NULL,
  "status" "request_status" NOT NULL DEFAULT 'pending',
  "courierId" INTEGER,
  "clientId" INTEGER,
  "recipientName" VARCHAR(255),
  "recipientPhone" VARCHAR(20),
  "recipientAddress" TEXT,
  "deliveryAddress" TEXT,
  "deliveryCity" VARCHAR(100),
  "packageDescription" TEXT,
  "packageType" "package_type",
  "placesCount" INTEGER DEFAULT 1,
  "senderName" VARCHAR(255),
  "senderCompany" VARCHAR(255),
  "senderCity" VARCHAR(100),
  "senderAddress" TEXT,
  "senderPhone" VARCHAR(20),
  "recipientCompany" VARCHAR(255),
  "recipientCity" VARCHAR(100),
  "items" TEXT,
  "totalAmount" DECIMAL(10, 2),
  "callReason" TEXT,
  "tcName" VARCHAR(255),
  "tcAddress" TEXT,
  "trackingNumber" VARCHAR(100),
  "description" TEXT,
  "specialInstructions" TEXT,
  "comments" TEXT,
  "paymentMethod" "payment_method",
  "paymentAmount" DECIMAL(10, 2),
  "deliveryTimeFrom" VARCHAR(5),
  "deliveryTimeTo" VARCHAR(5),
  "estimatedMinutes" INTEGER,
  "scheduledAt" TIMESTAMP,
  "acceptedAt" TIMESTAMP,
  "completedAt" TIMESTAMP,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE "settings" (
  "id" SERIAL PRIMARY KEY,
  "nutsTariff" DECIMAL(10, 2) DEFAULT '0',
  "cedroilTariff" DECIMAL(10, 2) DEFAULT '0',
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Managers table
CREATE TABLE "managers" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "username" VARCHAR(100) NOT NULL UNIQUE,
  "email" VARCHAR(320) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  "phone" VARCHAR(20),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX "idx_users_openId" ON "users"("openId");
CREATE INDEX "idx_couriers_username" ON "couriers"("username");
CREATE INDEX "idx_couriers_userId" ON "couriers"("userId");
CREATE INDEX "idx_tasks_courierId" ON "tasks"("courierId");
CREATE INDEX "idx_tasks_createdByUserId" ON "tasks"("createdByUserId");
CREATE INDEX "idx_tasks_status" ON "tasks"("status");
CREATE INDEX "idx_tasks_createdAt" ON "tasks"("createdAt");
CREATE INDEX "idx_mails_waybillNumber" ON "mails"("waybillNumber");
CREATE INDEX "idx_mails_status" ON "mails"("status");
CREATE INDEX "idx_requests_createdByUserId" ON "requests"("createdByUserId");
CREATE INDEX "idx_requests_courierId" ON "requests"("courierId");
CREATE INDEX "idx_requests_status" ON "requests"("status");
CREATE INDEX "idx_requests_requestType" ON "requests"("requestType");
CREATE INDEX "idx_requests_createdAt" ON "requests"("createdAt");
CREATE INDEX "idx_managers_username" ON "managers"("username");
CREATE INDEX "idx_managers_email" ON "managers"("email");
