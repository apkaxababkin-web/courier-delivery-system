-- Printed documents: signature/stamp snapshot + "add stamp" flag.
--
-- Why:
--   * An issued document must keep looking exactly as it looked when it was issued.
--     Until now the invoice/act stored only the *current* settings reference, so a
--     later signature/stamp replacement would change what a re-render shows. The
--     paths are now frozen on the document, like every other requisite snapshot.
--   * Printing the stamp is a per-organisation decision, so it needs an explicit
--     flag instead of "print whenever a file exists".
--
-- Additive and nullable only: existing document №1 keeps its columns NULL and is
-- never rewritten. No data is modified, no row is deleted.
--
-- Safe to run multiple times.

-- ─── 1. "Add stamp to documents" switch ──────────────────────────────────────
ALTER TABLE "billingSettings"
  ADD COLUMN IF NOT EXISTS "addStampToDocuments" boolean DEFAULT false NOT NULL;

-- ─── 2. Signature / stamp snapshot on the issued document ───────────────────
-- File paths (under uploads/), not image bytes: the picture itself stays on disk.
ALTER TABLE "billingDocuments"
  ADD COLUMN IF NOT EXISTS "signatureFileSnapshot" text,
  ADD COLUMN IF NOT EXISTS "stampFileSnapshot" text,
  ADD COLUMN IF NOT EXISTS "stampEnabledSnapshot" boolean;

-- Post-check (read-only):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='billingSettings' AND column_name='addStampToDocuments';   -- 1
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='billingDocuments'
--      AND column_name IN ('signatureFileSnapshot','stampFileSnapshot','stampEnabledSnapshot'); -- 3
--   SELECT count(*) FROM "billingDocuments" WHERE "stampEnabledSnapshot" IS NOT NULL;          -- 0
