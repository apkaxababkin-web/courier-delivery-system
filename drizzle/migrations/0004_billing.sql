-- Billing / client settlements v1.
-- Adds financial review fields, client legal requisites,
-- billing settings, document sets and exact billed request membership.

DO $$
BEGIN
  CREATE TYPE "billing_document_status" AS ENUM ('issued', 'paid', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Client legal requisites used for invoice / act generation.
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "legalName" varchar(500),
  ADD COLUMN IF NOT EXISTS "inn" varchar(20),
  ADD COLUMN IF NOT EXISTS "kpp" varchar(20),
  ADD COLUMN IF NOT EXISTS "legalAddress" text;

-- Financial review state.
ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "billingCheckedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "billingCheckedByManagerId" integer;

ALTER TABLE "requests"
  DROP CONSTRAINT IF EXISTS "requests_billingCheckedByManagerId_managers_id_fk";

ALTER TABLE "requests"
  ADD CONSTRAINT "requests_billingCheckedByManagerId_managers_id_fk"
  FOREIGN KEY ("billingCheckedByManagerId")
  REFERENCES "managers"("id")
  ON DELETE SET NULL;


-- Executor requisites and numbering configuration.
CREATE TABLE IF NOT EXISTS "billingSettings" (
  "id" serial PRIMARY KEY,

  "executorName" varchar(500),
  "executorInn" varchar(20),
  "executorKpp" varchar(20),
  "executorAddress" text,
  "executorPhone" varchar(50),

  "bankName" varchar(500),
  "bankBik" varchar(20),
  "bankAccount" varchar(50),
  "bankCorrespondentAccount" varchar(50),

  "vatText" varchar(100) DEFAULT 'Без НДС' NOT NULL,
  "documentNumberPrefix" varchar(50),
  "nextDocumentNumber" integer DEFAULT 1 NOT NULL,

  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "billingSettings_nextDocumentNumber_positive"
    CHECK ("nextDocumentNumber" > 0)
);


-- One row = invoice + act + completed works registry.
CREATE TABLE IF NOT EXISTS "billingDocuments" (
  "id" serial PRIMARY KEY,

  "number" varchar(100) NOT NULL,
  "clientId" integer NOT NULL,

  "documentDate" date NOT NULL,
  "periodFrom" date NOT NULL,
  "periodTo" date NOT NULL,

  "requestsCount" integer NOT NULL,
  "totalAmount" numeric(12, 2) NOT NULL,

  "status" "billing_document_status" DEFAULT 'issued' NOT NULL,

  "serviceDescription" text NOT NULL,

  -- Customer snapshot
  "clientNameSnapshot" varchar(500) NOT NULL,
  "clientInnSnapshot" varchar(20) NOT NULL,
  "clientKppSnapshot" varchar(20),
  "clientAddressSnapshot" text NOT NULL,

  -- Executor snapshot
  "executorNameSnapshot" varchar(500) NOT NULL,
  "executorInnSnapshot" varchar(20) NOT NULL,
  "executorKppSnapshot" varchar(20),
  "executorAddressSnapshot" text NOT NULL,
  "executorPhoneSnapshot" varchar(50),

  "bankNameSnapshot" varchar(500) NOT NULL,
  "bankBikSnapshot" varchar(20) NOT NULL,
  "bankAccountSnapshot" varchar(50) NOT NULL,
  "bankCorrespondentAccountSnapshot" varchar(50) NOT NULL,

  "vatTextSnapshot" varchar(100) NOT NULL,

  -- Relative paths under uploads/billing-documents/
  "invoiceFile" text,
  "actFile" text,
  "registryFile" text,

  -- Audit
  "createdByManagerId" integer NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,

  "paidAt" timestamp,
  "paidByManagerId" integer,

  "cancelledAt" timestamp,
  "cancelledByManagerId" integer,

  "updatedAt" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "billingDocuments_client_fk"
    FOREIGN KEY ("clientId")
    REFERENCES "clients"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "billingDocuments_createdByManager_fk"
    FOREIGN KEY ("createdByManagerId")
    REFERENCES "managers"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "billingDocuments_paidByManager_fk"
    FOREIGN KEY ("paidByManagerId")
    REFERENCES "managers"("id")
    ON DELETE SET NULL,

  CONSTRAINT "billingDocuments_cancelledByManager_fk"
    FOREIGN KEY ("cancelledByManagerId")
    REFERENCES "managers"("id")
    ON DELETE SET NULL,

  CONSTRAINT "billingDocuments_period_valid"
    CHECK ("periodFrom" <= "periodTo"),

  CONSTRAINT "billingDocuments_requestsCount_positive"
    CHECK ("requestsCount" > 0),

  CONSTRAINT "billingDocuments_totalAmount_nonnegative"
    CHECK ("totalAmount" >= 0)
);


-- Exact request membership of each billing document set.
CREATE TABLE IF NOT EXISTS "billingDocumentRequests" (
  "id" serial PRIMARY KEY,

  "billingDocumentId" integer NOT NULL,
  "requestId" integer NOT NULL,

  "amount" numeric(12, 2) NOT NULL,

  "createdAt" timestamp DEFAULT now() NOT NULL,

  "releasedAt" timestamp,
  "releasedByManagerId" integer,

  CONSTRAINT "billingDocumentRequests_document_fk"
    FOREIGN KEY ("billingDocumentId")
    REFERENCES "billingDocuments"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "billingDocumentRequests_request_fk"
    FOREIGN KEY ("requestId")
    REFERENCES "requests"("id")
    ON DELETE RESTRICT,

  CONSTRAINT "billingDocumentRequests_releasedByManager_fk"
    FOREIGN KEY ("releasedByManagerId")
    REFERENCES "managers"("id")
    ON DELETE SET NULL,

  CONSTRAINT "billingDocumentRequests_amount_nonnegative"
    CHECK ("amount" >= 0)
);


CREATE UNIQUE INDEX IF NOT EXISTS "billingDocuments_number_key"
  ON "billingDocuments" ("number");

CREATE INDEX IF NOT EXISTS "billingDocuments_client_idx"
  ON "billingDocuments" ("clientId");

CREATE INDEX IF NOT EXISTS "billingDocuments_status_idx"
  ON "billingDocuments" ("status");

CREATE INDEX IF NOT EXISTS "billingDocuments_period_idx"
  ON "billingDocuments" ("periodFrom", "periodTo");

CREATE INDEX IF NOT EXISTS "billingDocumentRequests_document_idx"
  ON "billingDocumentRequests" ("billingDocumentId");

CREATE INDEX IF NOT EXISTS "billingDocumentRequests_request_idx"
  ON "billingDocumentRequests" ("requestId");

-- Hard protection against billing one request twice.
-- A request can be billed again only after an explicit release.
CREATE UNIQUE INDEX IF NOT EXISTS "billingDocumentRequests_active_request_key"
  ON "billingDocumentRequests" ("requestId")
  WHERE "releasedAt" IS NULL;
