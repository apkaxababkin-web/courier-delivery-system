-- Distinguish our own organisation from external partners.
--
-- "ИП Бабкин" is us, not a partner, but it lives in the shared "partners"
-- table for legacy compatibility (courier_call senderCompany, mails.partnerId
-- history). The row is therefore NOT removed or deactivated: it only gets a
-- system flag so that Correspondence can stop offering it as an external
-- partner / shipment owner.
--
-- isOwnCompany is a system flag: it is intentionally not part of the partner
-- form whitelist and must only be changed by migrations or operations.

ALTER TABLE "partners"
  ADD COLUMN IF NOT EXISTS "isOwnCompany" boolean NOT NULL DEFAULT false;

-- Mark the existing own-organisation row.
-- Matching by exact normalised name rather than by id, so the migration stays
-- correct even if the row was recreated with a different id.
-- Use the preview SELECT below first to confirm which row will be updated.
--
--   SELECT id, name, "isActive" FROM "partners" WHERE btrim(name) ILIKE 'ип бабкин';
--
UPDATE "partners"
   SET "isOwnCompany" = true,
       "updatedAt"    = now()
 WHERE btrim(name) ILIKE 'ип бабкин'
   AND "isOwnCompany" IS NOT TRUE;

-- Post-check (expect exactly one own-company row):
--   SELECT id, name, "isActive", "isOwnCompany" FROM "partners" WHERE "isOwnCompany" = true;
