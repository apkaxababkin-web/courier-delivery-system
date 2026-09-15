-- Server-side price quote state for client requests.
--
-- Background: the amount owed by a client (requests."deliveryFee") used to be
-- computed only inside the manager browser, on the client reconciliation screen.
-- The server therefore had no idea whether a completed request had a price, and
-- the billing review had to rely on the browser to fill the amounts in.
--
-- Two nullable, additive columns make the quote state explicit:
--
--   quoteCalculatedAt – set when the amount was produced by the automatic
--                       server-side quote. NULL + non-NULL deliveryFee means the
--                       amount was entered by hand and must never be overwritten
--                       by automatic recalculation.
--   quoteSource       – 'tariff' (automatic) or 'manual_fee' (manager correction).
--                       NULL for legacy rows, which stay usable: an amount with
--                       NULL quoteCalculatedAt is treated as manually fixed.
--
-- Both columns are nullable with no default, so every existing row keeps its data
-- and its meaning. No backfill happens here; a separate, explicit operation fills
-- in old completed requests that never received a price.
--
-- Safe to run multiple times. No existing column, row, index or constraint is
-- touched, nothing is deleted, and no business data is rewritten.

ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "quoteCalculatedAt" timestamp;

ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "quoteSource" varchar(20);

-- Guard the vocabulary without blocking legacy NULLs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'requests_quoteSource_valid'
  ) THEN
    ALTER TABLE "requests"
      ADD CONSTRAINT "requests_quoteSource_valid"
      CHECK ("quoteSource" IS NULL OR "quoteSource" IN ('tariff', 'manual_fee'));
  END IF;
END
$$;

-- The billing review lists completed requests of one client for a period and
-- filters on the quote/verification state; this index keeps that lookup cheap.
CREATE INDEX IF NOT EXISTS "requests_client_status_completed_idx"
  ON "requests" ("clientId", "status", "completedAt");

-- Post-check (read-only):
--   SELECT column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_name='requests' AND column_name IN ('quoteCalculatedAt','quoteSource');
--
--   SELECT count(*) FROM requests WHERE "quoteSource" IS NOT NULL;   -- 0 right after applying
--
--   SELECT count(*) FROM requests WHERE status='completed' AND "deliveryFee" IS NULL;
--   -- unchanged by this migration; the explicit backfill decides what to do
