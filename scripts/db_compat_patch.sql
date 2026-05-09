-- Compatibility patch for existing production PostgreSQL databases.
-- Safe to run on every container start.

DO $$ BEGIN
  CREATE TYPE "request_status" AS ENUM('pending', 'assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "task_status" AS ENUM('assigned', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS "couriers"
ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255);

ALTER TABLE IF EXISTS "couriers"
ADD COLUMN IF NOT EXISTS "pushToken" varchar(255);

ALTER TABLE IF EXISTS "couriers"
ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true;

ALTER TABLE IF EXISTS "requests"
ADD COLUMN IF NOT EXISTS "status" request_status DEFAULT 'pending';

ALTER TABLE IF EXISTS "requests"
ADD COLUMN IF NOT EXISTS "courierId" integer;

ALTER TABLE IF EXISTS "tasks"
ADD COLUMN IF NOT EXISTS "status" task_status DEFAULT 'assigned';

ALTER TABLE IF EXISTS "tasks"
ADD COLUMN IF NOT EXISTS "courierId" integer;

ALTER TABLE IF EXISTS "tasks"
ADD COLUMN IF NOT EXISTS "requestId" integer;

ALTER TABLE IF EXISTS "tasks"
ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;

UPDATE "couriers"
SET
  "isActive" = COALESCE("isActive", true)
WHERE true;

UPDATE "requests"
SET
  "status" = COALESCE("status", 'pending')
WHERE true;

UPDATE "tasks"
SET
  "status" = COALESCE("status", 'assigned'),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

CREATE INDEX IF NOT EXISTS "idx_couriers_username"
ON "couriers"("username");

CREATE INDEX IF NOT EXISTS "idx_requests_status"
ON "requests"("status");

CREATE INDEX IF NOT EXISTS "idx_requests_courierId"
ON "requests"("courierId");

CREATE INDEX IF NOT EXISTS "idx_tasks_status"
ON "tasks"("status");

CREATE INDEX IF NOT EXISTS "idx_tasks_courierId"
ON "tasks"("courierId");

CREATE INDEX IF NOT EXISTS "idx_tasks_requestId"
ON "tasks"("requestId");
