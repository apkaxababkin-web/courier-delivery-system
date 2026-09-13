-- Correspondence: explicit handling partner on a shipment + persisted billable weight.
--
-- partnerId on correspondenceShipments answers a different question than
-- ownerType/ownerId:
--   ownerType/ownerId  = whose shipment it is (billing / customer ownership)
--   partnerId          = which external partner actually handles / carries /
--                        delivers this shipment (may differ from the owner)
-- Therefore it is nullable and is never derived from ownerId. Rows flagged as
-- our own organisation (partners.isOwnCompany = true) are rejected in the
-- application layer, not by a constraint.
--
-- billableWeight is a persisted snapshot of
--   ceil(max(measuredWeight, manifestWeight, volumetricWeight))
-- in kilograms (same unit as the other weight columns, numeric(12,3)).
-- Existing rows keep NULL and are filled on the next edit; no mass backfill.
--
-- Safe to run multiple times.

ALTER TABLE "correspondenceShipments"
  ADD COLUMN IF NOT EXISTS "partnerId" integer;

ALTER TABLE "correspondenceShipments"
  ADD COLUMN IF NOT EXISTS "billableWeight" numeric(12,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correspondenceShipments_partnerId_fkey'
  ) THEN
    ALTER TABLE "correspondenceShipments"
      ADD CONSTRAINT "correspondenceShipments_partnerId_fkey"
      FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "correspondenceShipments_partnerId_idx"
ON "correspondenceShipments" ("partnerId");

-- Post-check (both columns present, FK with ON DELETE SET NULL):
--   SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'correspondenceShipments'
--      AND column_name IN ('partnerId','billableWeight');
--
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE conname = 'correspondenceShipments_partnerId_fkey';  -- confdeltype = 'n' (SET NULL)
