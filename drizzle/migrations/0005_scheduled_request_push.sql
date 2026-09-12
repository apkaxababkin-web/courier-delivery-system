ALTER TABLE "requests"
ADD COLUMN IF NOT EXISTS "scheduledPushSentAt" timestamp;

-- Все существующие заявки на сегодня и прошлые даты считаем уже уведомлёнными.
-- Граница дня соответствует Asia/Irkutsk (UTC+8).
UPDATE "requests"
SET "scheduledPushSentAt" = NOW()
WHERE "scheduledPushSentAt" IS NULL
  AND "scheduledAt" IS NOT NULL
  AND "scheduledAt" < (
    date_trunc('day', NOW() AT TIME ZONE 'Asia/Irkutsk')
    + interval '1 day'
  ) AT TIME ZONE 'Asia/Irkutsk';
