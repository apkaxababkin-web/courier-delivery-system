-- Correspondence tariffs, stage 1: services directory + tariff plans/items.
--
-- Scope of this migration is deliberately narrow: directories only.
-- It does NOT add shipment charges, costs, margins, snapshots, settlements,
-- documents or payments, and it does not touch any existing business table.
--
-- Two independent tariff directions:
--   correspondenceClientTariffPlans  -- how much is owed TO US (owner is a
--                                       correspondence client or a partner
--                                       who ordered the work)
--   correspondencePartnerTariffPlans -- how much WE owe an external partner
--                                       for work it performs
-- VAT is a plain nullable rate on the tariff item: NULL = "без НДС".
-- NULL cityFrom/cityTo/weightFrom/weightTo = open (wildcard) condition.
--
-- Safe to run multiple times.

-- ─── Services directory ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "correspondenceServices" (
  "id" serial PRIMARY KEY,
  "code" varchar(20) NOT NULL UNIQUE,
  "name" varchar(255) NOT NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp DEFAULT NOW() NOT NULL,
  "updatedAt" timestamp DEFAULT NOW() NOT NULL
);

INSERT INTO "correspondenceServices" ("code","name","sortOrder") VALUES
  ('pickup',   'Забор / сбор',           10),
  ('linehaul', 'Перевозка',              20),
  ('delivery', 'Доставка',               30),
  ('terminal', 'Терминальная обработка', 40),
  ('other',    'Дополнительная услуга',  50)
ON CONFLICT ("code") DO NOTHING;

-- ─── Client tariffs (money owed TO us) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "correspondenceClientTariffPlans" (
  "id" serial PRIMARY KEY,
  "ownerType" varchar(10) NOT NULL,
  "ownerId" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'RUB',
  "validFrom" date,
  "validTo" date,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT NOW() NOT NULL,
  "updatedAt" timestamp DEFAULT NOW() NOT NULL
);
-- ownerType='client' -> correspondenceClients.id, 'partner' -> partners.id.
-- Polymorphic FK is intentionally not used; ownership is validated server-side.
CREATE INDEX IF NOT EXISTS "correspondenceClientTariffPlans_owner_idx"
  ON "correspondenceClientTariffPlans" ("ownerType","ownerId");

-- Reference protection rules:
--   plan -> its own items          : ON DELETE CASCADE (intentional: a tariff
--                                    plan is deleted explicitly together with
--                                    its rows)
--   partner / service / city -> item: ON DELETE RESTRICT (a directory entry
--                                    must never silently destroy financial
--                                    tariff data; remove or reassign the
--                                    tariff rows explicitly first)

CREATE TABLE IF NOT EXISTS "correspondenceClientTariffItems" (
  "id" serial PRIMARY KEY,
  "planId" integer NOT NULL REFERENCES "correspondenceClientTariffPlans"("id") ON DELETE CASCADE,
  "serviceCode" varchar(20) NOT NULL REFERENCES "correspondenceServices"("code") ON DELETE RESTRICT,
  "cityFromId" integer REFERENCES "correspondenceCities"("id") ON DELETE RESTRICT,
  "cityToId" integer REFERENCES "correspondenceCities"("id") ON DELETE RESTRICT,
  "weightFromKg" numeric(12,3),
  "weightToKg" numeric(12,3),
  "pricingModel" varchar(20) NOT NULL,
  "basePrice" numeric(14,2),
  "pricePerKg" numeric(14,2),
  "vatRate" numeric(5,2),
  "priority" integer NOT NULL DEFAULT 100,
  "description" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT NOW() NOT NULL,
  "updatedAt" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "correspondenceClientTariffItems_plan_idx"
  ON "correspondenceClientTariffItems" ("planId");

-- ─── Partner tariffs (money WE owe an external partner) ─────────────────────
CREATE TABLE IF NOT EXISTS "correspondencePartnerTariffPlans" (
  "id" serial PRIMARY KEY,
  "partnerId" integer NOT NULL REFERENCES "partners"("id") ON DELETE RESTRICT,
  "name" varchar(255) NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'RUB',
  "validFrom" date,
  "validTo" date,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT NOW() NOT NULL,
  "updatedAt" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "correspondencePartnerTariffPlans_partner_idx"
  ON "correspondencePartnerTariffPlans" ("partnerId");

CREATE TABLE IF NOT EXISTS "correspondencePartnerTariffItems" (
  "id" serial PRIMARY KEY,
  "planId" integer NOT NULL REFERENCES "correspondencePartnerTariffPlans"("id") ON DELETE CASCADE,
  "serviceCode" varchar(20) NOT NULL REFERENCES "correspondenceServices"("code") ON DELETE RESTRICT,
  "cityFromId" integer REFERENCES "correspondenceCities"("id") ON DELETE RESTRICT,
  "cityToId" integer REFERENCES "correspondenceCities"("id") ON DELETE RESTRICT,
  "weightFromKg" numeric(12,3),
  "weightToKg" numeric(12,3),
  "pricingModel" varchar(20) NOT NULL,
  "basePrice" numeric(14,2),
  "pricePerKg" numeric(14,2),
  "vatRate" numeric(5,2),
  "priority" integer NOT NULL DEFAULT 100,
  "description" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT NOW() NOT NULL,
  "updatedAt" timestamp DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS "correspondencePartnerTariffItems_plan_idx"
  ON "correspondencePartnerTariffItems" ("planId");

-- Post-check:
--   SELECT code, name, "sortOrder" FROM "correspondenceServices" ORDER BY "sortOrder";
--   SELECT count(*) FROM "correspondenceClientTariffPlans";
--   SELECT count(*) FROM "correspondencePartnerTariffPlans";
