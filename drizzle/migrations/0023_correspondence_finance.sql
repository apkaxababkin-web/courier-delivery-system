-- Correspondence financial workflow:
-- reconciliation -> immutable document set -> payment -> archive.

CREATE TABLE IF NOT EXISTS "correspondenceShipmentCharges" (
  "shipmentId" integer PRIMARY KEY
    REFERENCES "correspondenceShipments"("id") ON DELETE RESTRICT,
  "clientAmount" numeric(14,2),
  "partnerAmount" numeric(14,2),
  "clientRateSource" varchar(30),
  "partnerRateSource" varchar(30),
  "clientComment" text,
  "partnerComment" text,
  "checkedAt" timestamptz,
  "checkedByManagerId" integer,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "correspondenceShipmentCharges_clientAmount_check"
    CHECK ("clientAmount" IS NULL OR ("clientAmount">=0 AND "clientAmount"<=999999999999.99)),
  CONSTRAINT "correspondenceShipmentCharges_partnerAmount_check"
    CHECK ("partnerAmount" IS NULL OR ("partnerAmount">=0 AND "partnerAmount"<=999999999999.99)),
  CONSTRAINT "correspondenceShipmentCharges_clientRateSource_check"
    CHECK ("clientRateSource" IS NULL OR "clientRateSource" IN ('manual','tariff','calculator','discount')),
  CONSTRAINT "correspondenceShipmentCharges_partnerRateSource_check"
    CHECK ("partnerRateSource" IS NULL OR "partnerRateSource" IN ('manual','tariff','calculator','discount'))
);

CREATE INDEX IF NOT EXISTS "correspondenceShipmentCharges_checked_idx"
  ON "correspondenceShipmentCharges" ("checkedAt","shipmentId");

CREATE TABLE IF NOT EXISTS "correspondenceDocumentCounters" (
  "counterpartyType" varchar(10) NOT NULL,
  "year" integer NOT NULL,
  "lastNumber" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("counterpartyType","year"),
  CONSTRAINT "correspondenceDocumentCounters_type_check"
    CHECK ("counterpartyType" IN ('client','partner')),
  CONSTRAINT "correspondenceDocumentCounters_year_check" CHECK ("year" BETWEEN 2000 AND 2200),
  CONSTRAINT "correspondenceDocumentCounters_number_check" CHECK ("lastNumber">=0)
);

CREATE TABLE IF NOT EXISTS "correspondenceDocumentSets" (
  "id" serial PRIMARY KEY,
  "counterpartyType" varchar(10) NOT NULL,
  "counterpartyId" integer NOT NULL,
  "documentNumber" varchar(50) NOT NULL,
  "documentYear" integer NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "documentDate" date NOT NULL,
  "periodFrom" date NOT NULL,
  "periodTo" date NOT NULL,
  "settlementDirection" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'issued',
  "totalAmount" numeric(14,2) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "invoiceFile" text,
  "actFile" text,
  "registryFile" text,
  "paidAt" timestamptz,
  "paymentComment" text,
  "createdByManagerId" integer,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "correspondenceDocumentSets_counterparty_check"
    CHECK ("counterpartyType" IN ('client','partner')),
  CONSTRAINT "correspondenceDocumentSets_direction_check"
    CHECK ("settlementDirection" IN ('counterparty_to_us','us_to_counterparty')),
  CONSTRAINT "correspondenceDocumentSets_status_check"
    CHECK ("status" IN ('issued','paid','void')),
  CONSTRAINT "correspondenceDocumentSets_amount_check"
    CHECK ("totalAmount">=0 AND "totalAmount"<=999999999999.99),
  CONSTRAINT "correspondenceDocumentSets_period_check" CHECK ("periodFrom"<="periodTo"),
  CONSTRAINT "correspondenceDocumentSets_revision_check" CHECK ("revision">0),
  CONSTRAINT "correspondenceDocumentSets_number_revision_key"
    UNIQUE ("counterpartyType","documentYear","documentNumber","revision")
);

CREATE INDEX IF NOT EXISTS "correspondenceDocumentSets_party_idx"
  ON "correspondenceDocumentSets" ("counterpartyType","counterpartyId","documentDate" DESC);
CREATE INDEX IF NOT EXISTS "correspondenceDocumentSets_status_idx"
  ON "correspondenceDocumentSets" ("status","documentDate" DESC);

CREATE TABLE IF NOT EXISTS "correspondenceDocumentItems" (
  "id" bigserial PRIMARY KEY,
  "documentId" integer NOT NULL
    REFERENCES "correspondenceDocumentSets"("id") ON DELETE RESTRICT,
  "shipmentId" integer NOT NULL
    REFERENCES "correspondenceShipments"("id") ON DELETE RESTRICT,
  "counterpartyType" varchar(10) NOT NULL,
  "counterpartyId" integer NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "snapshot" jsonb NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "correspondenceDocumentItems_amount_check"
    CHECK ("amount">=-999999999999.99 AND "amount"<=999999999999.99),
  CONSTRAINT "correspondenceDocumentItems_counterparty_check"
    CHECK ("counterpartyType" IN ('client','partner')),
  CONSTRAINT "correspondenceDocumentItems_document_shipment_key" UNIQUE ("documentId","shipmentId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "correspondenceDocumentItems_active_party_uidx"
  ON "correspondenceDocumentItems" ("shipmentId","counterpartyType","counterpartyId") WHERE "active";
CREATE INDEX IF NOT EXISTS "correspondenceDocumentItems_document_idx"
  ON "correspondenceDocumentItems" ("documentId","active");
