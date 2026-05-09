-- Bridge manager requests to courier tasks.
-- Manager website writes into requests; courier app reads from tasks.
-- This patch keeps both tables synchronized without manual commands.

ALTER TABLE IF EXISTS "tasks" ADD COLUMN IF NOT EXISTS "sourceRequestId" integer;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tasks_sourceRequestId" ON "tasks"("sourceRequestId") WHERE "sourceRequestId" IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_request_to_task() RETURNS trigger AS $$
DECLARE
  mapped_task_status task_status;
  mapped_task_type task_type;
  mapped_package_type package_type;
  mapped_recipient_name text;
  mapped_delivery_address text;
BEGIN
  mapped_task_status := CASE NEW."status"
    WHEN 'in_progress' THEN 'in_progress'::task_status
    WHEN 'completed' THEN 'completed'::task_status
    WHEN 'cancelled' THEN 'cancelled'::task_status
    ELSE 'assigned'::task_status
  END;

  mapped_task_type := CASE NEW."requestType"
    WHEN 'courier_call' THEN 'courier_call'::task_type
    WHEN 'nuts' THEN 'warehouse_pickup'::task_type
    WHEN 'pickup_from_tc' THEN 'warehouse_pickup'::task_type
    ELSE 'regular'::task_type
  END;

  mapped_package_type := COALESCE(NEW."packageType", 'small'::package_type);
  mapped_recipient_name := COALESCE(NULLIF(NEW."recipientName", ''), NULLIF(NEW."recipientCompany", ''), NULLIF(NEW."description", ''), 'Получатель');
  mapped_delivery_address := COALESCE(NULLIF(NEW."deliveryAddress", ''), NULLIF(NEW."recipientAddress", ''), NULLIF(NEW."tcAddress", ''), NULLIF(NEW."senderAddress", ''), 'Адрес не указан');

  INSERT INTO "tasks" (
    "sourceRequestId",
    "createdByUserId",
    "courierId",
    "status",
    "taskType",
    "recipientName",
    "recipientPhone",
    "deliveryAddress",
    "deliveryCity",
    "packageDescription",
    "packageType",
    "specialInstructions",
    "placesCount",
    "estimatedMinutes",
    "deliveryTimeFrom",
    "deliveryTimeTo",
    "recipientAddress",
    "senderName",
    "senderAddress",
    "senderPhone",
    "comments",
    "items",
    "rejectionReason",
    "scheduledAt",
    "acceptedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
  ) VALUES (
    NEW."id",
    NEW."createdByUserId",
    NEW."courierId",
    mapped_task_status,
    mapped_task_type,
    mapped_recipient_name,
    NEW."recipientPhone",
    mapped_delivery_address,
    COALESCE(NEW."deliveryCity", NEW."recipientCity"),
    COALESCE(NEW."packageDescription", NEW."description", NEW."callReason"),
    mapped_package_type,
    NEW."specialInstructions",
    COALESCE(NEW."placesCount", 1),
    NEW."estimatedMinutes",
    NEW."deliveryTimeFrom",
    NEW."deliveryTimeTo",
    NEW."recipientAddress",
    COALESCE(NEW."senderName", NEW."senderCompany", NEW."tcName"),
    COALESCE(NEW."senderAddress", NEW."tcAddress"),
    NEW."senderPhone",
    NEW."comments",
    NEW."items",
    NEW."rejectionReason",
    NEW."scheduledAt",
    NEW."acceptedAt",
    NEW."completedAt",
    COALESCE(NEW."createdAt", CURRENT_TIMESTAMP),
    COALESCE(NEW."updatedAt", CURRENT_TIMESTAMP)
  )
  ON CONFLICT ("sourceRequestId") WHERE "sourceRequestId" IS NOT NULL
  DO UPDATE SET
    "createdByUserId" = EXCLUDED."createdByUserId",
    "courierId" = EXCLUDED."courierId",
    "status" = EXCLUDED."status",
    "taskType" = EXCLUDED."taskType",
    "recipientName" = EXCLUDED."recipientName",
    "recipientPhone" = EXCLUDED."recipientPhone",
    "deliveryAddress" = EXCLUDED."deliveryAddress",
    "deliveryCity" = EXCLUDED."deliveryCity",
    "packageDescription" = EXCLUDED."packageDescription",
    "packageType" = EXCLUDED."packageType",
    "specialInstructions" = EXCLUDED."specialInstructions",
    "placesCount" = EXCLUDED."placesCount",
    "estimatedMinutes" = EXCLUDED."estimatedMinutes",
    "deliveryTimeFrom" = EXCLUDED."deliveryTimeFrom",
    "deliveryTimeTo" = EXCLUDED."deliveryTimeTo",
    "recipientAddress" = EXCLUDED."recipientAddress",
    "senderName" = EXCLUDED."senderName",
    "senderAddress" = EXCLUDED."senderAddress",
    "senderPhone" = EXCLUDED."senderPhone",
    "comments" = EXCLUDED."comments",
    "items" = EXCLUDED."items",
    "rejectionReason" = EXCLUDED."rejectionReason",
    "scheduledAt" = EXCLUDED."scheduledAt",
    "acceptedAt" = EXCLUDED."acceptedAt",
    "completedAt" = EXCLUDED."completedAt",
    "updatedAt" = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sync_request_to_task" ON "requests";
CREATE TRIGGER "trg_sync_request_to_task"
AFTER INSERT OR UPDATE ON "requests"
FOR EACH ROW EXECUTE FUNCTION sync_request_to_task();

CREATE OR REPLACE FUNCTION sync_task_to_request() RETURNS trigger AS $$
DECLARE
  mapped_request_status request_status;
BEGIN
  IF NEW."sourceRequestId" IS NULL THEN
    RETURN NEW;
  END IF;

  mapped_request_status := CASE NEW."status"
    WHEN 'in_progress' THEN 'in_progress'::request_status
    WHEN 'completed' THEN 'completed'::request_status
    WHEN 'cancelled' THEN 'cancelled'::request_status
    ELSE 'assigned'::request_status
  END;

  UPDATE "requests"
  SET
    "courierId" = NEW."courierId",
    "status" = mapped_request_status,
    "acceptedAt" = COALESCE(NEW."acceptedAt", "requests"."acceptedAt"),
    "completedAt" = COALESCE(NEW."completedAt", "requests"."completedAt"),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = NEW."sourceRequestId";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_sync_task_to_request" ON "tasks";
CREATE TRIGGER "trg_sync_task_to_request"
AFTER UPDATE OF "status", "courierId", "acceptedAt", "completedAt" ON "tasks"
FOR EACH ROW EXECUTE FUNCTION sync_task_to_request();

-- Backfill tasks for requests that existed before the trigger was installed.
INSERT INTO "tasks" (
  "sourceRequestId", "createdByUserId", "courierId", "status", "taskType",
  "recipientName", "recipientPhone", "deliveryAddress", "deliveryCity",
  "packageDescription", "packageType", "specialInstructions", "placesCount",
  "estimatedMinutes", "deliveryTimeFrom", "deliveryTimeTo", "recipientAddress",
  "senderName", "senderAddress", "senderPhone", "comments", "items",
  "rejectionReason", "scheduledAt", "acceptedAt", "completedAt", "createdAt", "updatedAt"
)
SELECT
  r."id",
  r."createdByUserId",
  r."courierId",
  CASE r."status"
    WHEN 'in_progress' THEN 'in_progress'::task_status
    WHEN 'completed' THEN 'completed'::task_status
    WHEN 'cancelled' THEN 'cancelled'::task_status
    ELSE 'assigned'::task_status
  END,
  CASE r."requestType"
    WHEN 'courier_call' THEN 'courier_call'::task_type
    WHEN 'nuts' THEN 'warehouse_pickup'::task_type
    WHEN 'pickup_from_tc' THEN 'warehouse_pickup'::task_type
    ELSE 'regular'::task_type
  END,
  COALESCE(NULLIF(r."recipientName", ''), NULLIF(r."recipientCompany", ''), NULLIF(r."description", ''), 'Получатель'),
  r."recipientPhone",
  COALESCE(NULLIF(r."deliveryAddress", ''), NULLIF(r."recipientAddress", ''), NULLIF(r."tcAddress", ''), NULLIF(r."senderAddress", ''), 'Адрес не указан'),
  COALESCE(r."deliveryCity", r."recipientCity"),
  COALESCE(r."packageDescription", r."description", r."callReason"),
  COALESCE(r."packageType", 'small'::package_type),
  r."specialInstructions",
  COALESCE(r."placesCount", 1),
  r."estimatedMinutes",
  r."deliveryTimeFrom",
  r."deliveryTimeTo",
  r."recipientAddress",
  COALESCE(r."senderName", r."senderCompany", r."tcName"),
  COALESCE(r."senderAddress", r."tcAddress"),
  r."senderPhone",
  r."comments",
  r."items",
  r."rejectionReason",
  r."scheduledAt",
  r."acceptedAt",
  r."completedAt",
  COALESCE(r."createdAt", CURRENT_TIMESTAMP),
  COALESCE(r."updatedAt", CURRENT_TIMESTAMP)
FROM "requests" r
WHERE NOT EXISTS (
  SELECT 1 FROM "tasks" t WHERE t."sourceRequestId" = r."id"
);
