-- Address Book: one shared organisation / address / contact directory for the
-- courier manager site and «МИГ · Корреспонденция».
--
-- It answers "у кого забрать / кому доставить" and is deliberately independent
-- of the requester role (requests.requesterType/requesterId, migration 0011):
-- a physical organisation is not owned by a partner, a correspondence client,
-- a carrier or a single customer.
--
-- Purely additive: three new tables, empty. There is NO backfill from the 989
-- existing requests and NO change to any existing table, column, index or row.
-- Snapshots remain historical truth — editing the address book can never rewrite
-- requests.sender*/recipient*, correspondenceShipments.*, mails or tasks, and
-- nothing in those tables references these tables (no reference IDs by design).
--
-- Retirement of a record is isActive = false. No physical delete API exists.
--
-- Safe to run multiple times (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS "addressOrganizations" (
  "id" serial PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "normalizedName" varchar(255) NOT NULL,
  "comment" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "addressOrgLocations" (
  "id" serial PRIMARY KEY,
  "organizationId" integer NOT NULL,
  "label" varchar(255),
  "city" varchar(100),
  "address" text NOT NULL,
  "postalCode" varchar(20),
  "normalizedAddress" text NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "addressOrgContacts" (
  "id" serial PRIMARY KEY,
  "organizationId" integer NOT NULL,
  "locationId" integer,
  "name" varchar(255),
  "position" varchar(255),
  "phone" varchar(50),
  "phoneNormalized" varchar(20),
  "email" varchar(320),
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Internal child rows follow their organisation. This cascade only ever touches
-- address-book rows: no request, shipment, mail or task references these tables.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'addressOrgLocations_organizationId_fkey'
  ) THEN
    ALTER TABLE "addressOrgLocations"
      ADD CONSTRAINT "addressOrgLocations_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "addressOrganizations"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'addressOrgContacts_organizationId_fkey'
  ) THEN
    ALTER TABLE "addressOrgContacts"
      ADD CONSTRAINT "addressOrgContacts_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "addressOrganizations"("id") ON DELETE CASCADE;
  END IF;

  -- Deleting a location must never destroy its contacts: they fall back to
  -- organisation-level scope instead.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'addressOrgContacts_locationId_fkey'
  ) THEN
    ALTER TABLE "addressOrgContacts"
      ADD CONSTRAINT "addressOrgContacts_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "addressOrgLocations"("id") ON DELETE SET NULL;
  END IF;
END
$$;

-- Search indexes only. Deliberately NO UNIQUE constraint on name, address or
-- phone: historical spellings and phone formats vary, and duplicates must be
-- resolvable by a human, never blocked or merged automatically.
CREATE INDEX IF NOT EXISTS "addressOrganizations_normalizedName_idx"
  ON "addressOrganizations" ("normalizedName");
CREATE INDEX IF NOT EXISTS "addressOrganizations_name_idx"
  ON "addressOrganizations" ("name");
CREATE INDEX IF NOT EXISTS "addressOrgLocations_organizationId_idx"
  ON "addressOrgLocations" ("organizationId");
CREATE INDEX IF NOT EXISTS "addressOrgLocations_normalizedAddress_idx"
  ON "addressOrgLocations" ("normalizedAddress");
CREATE INDEX IF NOT EXISTS "addressOrgContacts_organizationId_idx"
  ON "addressOrgContacts" ("organizationId");
CREATE INDEX IF NOT EXISTS "addressOrgContacts_locationId_idx"
  ON "addressOrgContacts" ("locationId");
CREATE INDEX IF NOT EXISTS "addressOrgContacts_phoneNormalized_idx"
  ON "addressOrgContacts" ("phoneNormalized");
CREATE INDEX IF NOT EXISTS "addressOrgContacts_name_idx"
  ON "addressOrgContacts" ("name");

-- Post-check (all three must return 0 right after applying):
--   SELECT count(*) FROM "addressOrganizations";   -- 0 — no backfill
--   SELECT count(*) FROM "addressOrgLocations";    -- 0
--   SELECT count(*) FROM "addressOrgContacts";     -- 0
--
--   SELECT conname, confdeltype FROM pg_constraint
--    WHERE conname LIKE 'addressOrg%_fkey';
--   -- addressOrgLocations_organizationId_fkey  -> c (CASCADE)
--   -- addressOrgContacts_organizationId_fkey   -> c (CASCADE)
--   -- addressOrgContacts_locationId_fkey       -> n (SET NULL)
