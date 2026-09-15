-- Re-issue after annulment + client OGRN / postal address.
--
-- Why this migration exists:
--   * An annulled invoice must stay in history for ever, but its requests have to
--     become billable again after an explicit manager decision, otherwise a
--     cancelled document would block its period permanently.
--   * Documents now need the customer's OGRN/OGRNIP and postal address.
--
-- Everything here is additive and nullable, and no business data is rewritten.
-- The client columns are NOT required to issue a document: the printed template
-- does not demand them, so missing values stay empty instead of blocking.
--
-- Safe to run multiple times.

-- ─── 1. Customer requisites used by the printed documents ────────────────────
-- OGRN for organisations, OGRNIP for individual entrepreneurs: one column, the
-- printed document does not distinguish them.
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "ogrn" varchar(20),
  ADD COLUMN IF NOT EXISTS "postalAddress" text;

-- The postal address is frozen on the document, like every other requisite.
ALTER TABLE "billingDocuments"
  ADD COLUMN IF NOT EXISTS "clientPostalAddressSnapshot" text;

-- ─── 2. Which document replaced an annulled one ──────────────────────────────
-- Nullable self-reference: the old document points at the new one, so the history
-- shows "replaced by №N" without touching the old record.
ALTER TABLE "billingDocuments"
  ADD COLUMN IF NOT EXISTS "replacesDocumentId" integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billingDocuments_replacesDocument_fk') THEN
    ALTER TABLE "billingDocuments"
      ADD CONSTRAINT "billingDocuments_replacesDocument_fk"
      FOREIGN KEY ("replacesDocumentId") REFERENCES "billingDocuments"("id") ON DELETE SET NULL;
  END IF;
END
$$;

-- ─── 3. Explicit release of a request from an annulled document ──────────────
-- The row itself is never deleted: releasedAt / releasedByManagerId / releaseNote
-- keep the original composition of the annulled document readable.
ALTER TABLE "billingDocumentRequests"
  ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "releaseNote" text;

-- Same guarantee as before, now expressed on the explicit flag: one request can
-- belong to at most ONE active document. Releasing clears it for the next one.
DROP INDEX IF EXISTS "billingDocumentRequests_active_request_key";
CREATE UNIQUE INDEX IF NOT EXISTS "billingDocumentRequests_active_request_key"
  ON "billingDocumentRequests" ("requestId") WHERE "active";

CREATE INDEX IF NOT EXISTS "billingDocumentRequests_active_document_idx"
  ON "billingDocumentRequests" ("billingDocumentId") WHERE "active";

-- ─── 4. Audit trail of the document lifecycle ────────────────────────────────
-- Who did what, when, and why — including which document replaced which.
CREATE TABLE IF NOT EXISTS "billingDocumentEvents" (
  "id" serial PRIMARY KEY,
  "billingDocumentId" integer NOT NULL,
  "kind" varchar(40) NOT NULL,
  "managerId" integer,
  "managerName" varchar(255),
  "note" text,
  -- Structured extras (list of released request ids, replacement document id, …).
  "details" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "billingDocumentEvents_document_fk"
    FOREIGN KEY ("billingDocumentId") REFERENCES "billingDocuments"("id") ON DELETE RESTRICT,
  CONSTRAINT "billingDocumentEvents_manager_fk"
    FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL,
  CONSTRAINT "billingDocumentEvents_kind_valid"
    CHECK ("kind" IN ('issued','reissued','voided','requests_released','replaced_by','payment_set','payment_cleared'))
);

CREATE INDEX IF NOT EXISTS "billingDocumentEvents_document_idx"
  ON "billingDocumentEvents" ("billingDocumentId", "createdAt");

-- Post-check (read-only):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='clients' AND column_name IN ('ogrn','postalAddress');          -- 2
--   SELECT count(*) FROM "clients" WHERE "ogrn" IS NOT NULL;                          -- 0
--   SELECT indexdef FROM pg_indexes WHERE indexname='billingDocumentRequests_active_request_key';
--   SELECT count(*) FROM "billingDocumentEvents";                                     -- 0
