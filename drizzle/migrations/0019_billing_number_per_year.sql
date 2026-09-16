-- Annual billing document numbering.
--
-- Existing billing documents are preserved.
-- Document numbers may repeat in different calendar years, but never inside one year.
-- The annual sequence is independent from billingSettings.nextDocumentNumber.
--
-- 2026 is intentionally left uninitialized: the manager will enter the real
-- starting number once when issuing the first real document under the new system.
-- Future years are created automatically by the application and start from No. 1.

DROP INDEX IF EXISTS "billingDocuments_number_key";

CREATE UNIQUE INDEX "billingDocuments_year_number_key"
  ON "billingDocuments" (
    (EXTRACT(YEAR FROM "documentDate")),
    "number"
  );

CREATE TABLE "billingDocumentNumberSequences" (
  "year" integer PRIMARY KEY,
  "nextNumber" integer NOT NULL DEFAULT 1,
  "initialized" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "billingDocumentNumberSequences_year_valid"
    CHECK ("year" >= 2000 AND "year" <= 9999),
  CONSTRAINT "billingDocumentNumberSequences_next_positive"
    CHECK ("nextNumber" > 0)
);

INSERT INTO "billingDocumentNumberSequences"
  ("year", "nextNumber", "initialized")
VALUES
  (2026, 1, false)
ON CONFLICT ("year") DO NOTHING;
