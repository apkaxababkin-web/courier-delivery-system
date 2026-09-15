-- Client financial document cycle: requisites, review decisions, payment tracking.
--
-- Adds the data needed to turn a verified period into a complete document set
-- (invoice + act + registry), to record what a manager decided about requests that
-- were NOT completed, and to track payment with a proof attachment.
--
-- Everything here is additive and nullable: no existing row, column, index or
-- constraint changes meaning, and no business data is rewritten. Existing
-- billingDocuments rows keep working (new snapshot columns stay NULL until a
-- document is issued by the new code).
--
-- Safe to run multiple times.

-- ─── 1. Our own organisation requisites / document settings ──────────────────
-- billingSettings already holds executor/bank/vat/numbering fields. Only the
-- fields the official invoice and act need are added; nothing is duplicated.
ALTER TABLE "billingSettings"
  ADD COLUMN IF NOT EXISTS "executorShortName" varchar(500),
  ADD COLUMN IF NOT EXISTS "executorOgrn" varchar(20),
  ADD COLUMN IF NOT EXISTS "executorOgrnip" varchar(20),
  ADD COLUMN IF NOT EXISTS "executorPostalAddress" text,
  ADD COLUMN IF NOT EXISTS "executorEmail" varchar(320),
  ADD COLUMN IF NOT EXISTS "directorName" varchar(255),
  ADD COLUMN IF NOT EXISTS "directorPosition" varchar(255),
  ADD COLUMN IF NOT EXISTS "accountantName" varchar(255),
  -- 'vat' or 'without_vat'; vatText keeps the printed wording ("Без НДС", "НДС 20%").
  ADD COLUMN IF NOT EXISTS "vatMode" varchar(20) DEFAULT 'without_vat' NOT NULL,
  ADD COLUMN IF NOT EXISTS "vatRate" numeric(5, 2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "vatExemptionBasis" text,
  -- Optional images stored as files under uploads/billing-settings/, path in DB.
  ADD COLUMN IF NOT EXISTS "signatureFile" text,
  ADD COLUMN IF NOT EXISTS "stampFile" text;

-- ─── 2. Manager decision for requests that are not "completed" ───────────────
-- A cancelled or unfinished request must be explicitly resolved before the period
-- can be billed. NULL means "not reviewed yet".
ALTER TABLE "requests"
  ADD COLUMN IF NOT EXISTS "billingReviewState" varchar(30),
  ADD COLUMN IF NOT EXISTS "billingReviewNote" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'requests_billingReviewState_valid') THEN
    ALTER TABLE "requests"
      ADD CONSTRAINT "requests_billingReviewState_valid"
      CHECK ("billingReviewState" IS NULL OR "billingReviewState" IN (
        'cancelled_confirmed',      -- manager confirmed the work was not performed
        'completed_confirmed',      -- manager said it WAS performed; request goes through the completed workflow
        'requires_clarification',   -- needs more information before the period can be billed
        'not_billable'              -- performed but not chargeable (e.g. included elsewhere)
      ));
  END IF;
END
$$;

-- ─── 3. Document snapshot and lifecycle on billingDocuments ──────────────────
ALTER TABLE "billingDocuments"
  -- Service wording is fixed when the document is issued, so a later tariff or
  -- period change can never rewrite an issued document.
  ADD COLUMN IF NOT EXISTS "serviceNameSnapshot" varchar(500),
  ADD COLUMN IF NOT EXISTS "periodTextSnapshot" varchar(100),
  ADD COLUMN IF NOT EXISTS "vatModeSnapshot" varchar(20),
  ADD COLUMN IF NOT EXISTS "vatRateSnapshot" numeric(5, 2),
  ADD COLUMN IF NOT EXISTS "vatAmountSnapshot" numeric(12, 2),
  -- Customer requisites used by the printed documents.
  ADD COLUMN IF NOT EXISTS "clientOgrnSnapshot" varchar(20),
  -- Signature block captured at issue time.
  ADD COLUMN IF NOT EXISTS "directorNameSnapshot" varchar(255),
  ADD COLUMN IF NOT EXISTS "directorPositionSnapshot" varchar(255),
  ADD COLUMN IF NOT EXISTS "accountantNameSnapshot" varchar(255),
  -- Paths (under uploads/) of the generated set; existing invoiceFile/actFile/
  -- registryFile columns are reused for the same purpose.
  ADD COLUMN IF NOT EXISTS "generatedAt" timestamp,
  -- Annulment instead of deletion; requests become billable again only after the
  -- active membership row is released, which stays an explicit operation.
  ADD COLUMN IF NOT EXISTS "voidedAt" timestamp,
  ADD COLUMN IF NOT EXISTS "voidedByManagerId" integer,
  ADD COLUMN IF NOT EXISTS "voidReason" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billingDocuments_voidedByManager_fk') THEN
    ALTER TABLE "billingDocuments"
      ADD CONSTRAINT "billingDocuments_voidedByManager_fk"
      FOREIGN KEY ("voidedByManagerId") REFERENCES "managers"("id") ON DELETE SET NULL;
  END IF;
END
$$;

-- ─── 4. Payment state is already covered by status/paidAt/paidByManagerId ────
-- 'issued' = ожидает оплаты, 'paid' = оплачено, 'cancelled' = аннулирован.
ALTER TABLE "billingDocuments"
  ADD COLUMN IF NOT EXISTS "paymentComment" text;

-- Both the invoice and the act of one set share the same number: the number is
-- allocated once for the document set, so the printed date must be one value.
ALTER TABLE "billingDocuments"
  ADD COLUMN IF NOT EXISTS "documentDateText" varchar(10);

-- ─── 5. Payment proof attachments (metadata in DB, bytes on disk) ────────────
CREATE TABLE IF NOT EXISTS "billingDocumentFiles" (
  "id" serial PRIMARY KEY,
  "billingDocumentId" integer NOT NULL,
  -- 'payment_proof' today; kept open for future document kinds.
  "kind" varchar(30) NOT NULL DEFAULT 'payment_proof',
  "originalName" varchar(255) NOT NULL,
  "storedName" varchar(255) NOT NULL,
  "fileUrl" text NOT NULL,
  "mimeType" varchar(150) NOT NULL,
  "sizeBytes" integer NOT NULL,
  "uploadedByManagerId" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "billingDocumentFiles_document_fk"
    FOREIGN KEY ("billingDocumentId") REFERENCES "billingDocuments"("id") ON DELETE RESTRICT,
  CONSTRAINT "billingDocumentFiles_uploadedByManager_fk"
    FOREIGN KEY ("uploadedByManagerId") REFERENCES "managers"("id") ON DELETE SET NULL,
  CONSTRAINT "billingDocumentFiles_size_nonnegative" CHECK ("sizeBytes" >= 0),
  CONSTRAINT "billingDocumentFiles_kind_valid" CHECK ("kind" IN ('payment_proof'))
);

CREATE INDEX IF NOT EXISTS "billingDocumentFiles_document_idx"
  ON "billingDocumentFiles" ("billingDocumentId", "kind");

-- Review screens filter by client + period + lifecycle state.
CREATE INDEX IF NOT EXISTS "billingDocuments_client_period_idx"
  ON "billingDocuments" ("clientId", "periodFrom", "periodTo");

-- Post-check (read-only):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='requests' AND column_name IN ('billingReviewState','billingReviewNote');
--
--   SELECT count(*) FROM requests WHERE "billingReviewState" IS NOT NULL;   -- 0 right after applying
--
--   SELECT count(*) FROM "billingDocuments" WHERE "generatedAt" IS NOT NULL; -- 0
--
--   SELECT count(*) FROM "billingDocumentFiles";                             -- 0
