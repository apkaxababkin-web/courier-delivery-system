-- Mails manifest compatibility patch.
-- Safe to run repeatedly.

DO $$ BEGIN
  CREATE TYPE "mail_status" AS ENUM('not_delivered', 'delivered', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "waybillNumber" varchar(50);

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "recipientName" varchar(255);

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "recipientPhone" varchar(20);

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "deliveryAddress" text;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "status" mail_status DEFAULT 'not_delivered';

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "recipientSignature" text;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "deliveredAt" timestamp;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "courierId" integer;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS "mails"
ADD COLUMN IF NOT EXISTS "updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS "mails"
ALTER COLUMN "recipientPhone" DROP NOT NULL;

UPDATE "mails"
SET
  "status" = COALESCE("status", 'not_delivered'),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE true;

CREATE INDEX IF NOT EXISTS "idx_mails_waybillNumber"
ON "mails"("waybillNumber");

CREATE INDEX IF NOT EXISTS "idx_mails_status"
ON "mails"("status");

CREATE INDEX IF NOT EXISTS "idx_mails_createdAt"
ON "mails"("createdAt");
