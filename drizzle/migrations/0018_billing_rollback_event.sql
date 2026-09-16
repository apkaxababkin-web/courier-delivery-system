-- Allow the unified billing rollback operation to be recorded in the audit trail.
--
-- The billing document itself continues to use the existing `cancelled` status.
-- `rolled_back` is only an audit-event kind.

ALTER TABLE "billingDocumentEvents"
  DROP CONSTRAINT IF EXISTS "billingDocumentEvents_kind_valid";

ALTER TABLE "billingDocumentEvents"
  ADD CONSTRAINT "billingDocumentEvents_kind_valid"
  CHECK (
    "kind" IN (
      'issued',
      'reissued',
      'voided',
      'requests_released',
      'replaced_by',
      'payment_set',
      'payment_cleared',
      'rolled_back'
    )
  );
