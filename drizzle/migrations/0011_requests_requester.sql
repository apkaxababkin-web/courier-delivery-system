-- Courier call: store the requester independently from sender / recipient.
--
-- A courier_call request has three independent participants:
--   1. requester  — who ordered the call (partner or correspondence client)
--   2. sender     — where the courier picks up ("Забрать у")
--   3. recipient  — where it goes ("Куда направляется")
--
-- Before this change the requester was written into senderCompany/senderName,
-- which made the customer and the real pickup organisation indistinguishable.
--
-- requesterId is a polymorphic reference (partners.id or correspondenceClients.id)
-- and therefore has no foreign key; it is validated in the application layer.
-- requesterNameSnapshot keeps the organisation name as it was at save time.
--
-- Purely additive and nullable: existing courier_call rows keep NULL requester
-- and their historical sender*/recipient* values. No backfill, no UPDATE.
-- Safe to run multiple times.

ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "requesterType" varchar(20);

ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "requesterId" integer;

ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "requesterNameSnapshot" varchar(255);

-- Post-check:
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'requests'
--      AND column_name IN ('requesterType','requesterId','requesterNameSnapshot');
--
--   SELECT count(*) FROM "requests" WHERE "requesterId" IS NOT NULL;  -- 0 right after applying
