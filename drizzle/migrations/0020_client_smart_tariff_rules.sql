-- Smart per-client tariff rules.
-- Existing clientTariffs remains unchanged and continues to provide base rates.

CREATE TABLE "clientTariffRules" (
  "id" serial PRIMARY KEY,
  "clientId" integer NOT NULL,
  "name" varchar(255) NOT NULL,
  "requestType" varchar(50),
  "fromAddressNormalized" text,
  "toAddressNormalized" text,
  "weekdays" varchar(20),
  "firstPlacePrice" numeric(10,2) NOT NULL,
  "nextPlacePrice" numeric(10,2) NOT NULL DEFAULT 0,
  "priority" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdByManagerId" integer,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),

  CONSTRAINT "clientTariffRules_first_price_nonnegative"
    CHECK ("firstPlacePrice" >= 0),

  CONSTRAINT "clientTariffRules_next_price_nonnegative"
    CHECK ("nextPlacePrice" >= 0)
);

CREATE INDEX "clientTariffRules_client_active_idx"
  ON "clientTariffRules" ("clientId", "isActive");

CREATE INDEX "clientTariffRules_client_request_type_idx"
  ON "clientTariffRules" ("clientId", "requestType");

-- Audit the exact smart tariff used for an automatically calculated request.
-- Stored on the request so later tariff edits cannot rewrite historical meaning.
ALTER TABLE "requests"
  ADD COLUMN "quoteTariffRuleId" integer;

ALTER TABLE "requests"
  ADD COLUMN "quoteTariffSnapshot" text;

CREATE INDEX "requests_quote_tariff_rule_idx"
  ON "requests" ("quoteTariffRuleId");
