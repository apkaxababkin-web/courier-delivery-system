-- Separate durable delivery to client and manager chats for decisions.
CREATE TABLE IF NOT EXISTS max_decision_deliveries (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('approved','rejected')),
  destination TEXT NOT NULL CHECK (destination IN ('client','manager')),
  chat_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  UNIQUE (draft_id,event_type,destination)
);
CREATE INDEX IF NOT EXISTS max_decision_deliveries_due_idx
ON max_decision_deliveries(due_at,id) WHERE status='pending';
-- Historical decisions remain in the original queue. Only decisions made after
-- this deployment use the new two-recipient outbox; do not replay old decisions.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='courier_app') THEN
    GRANT SELECT,INSERT,UPDATE,DELETE ON max_decision_deliveries TO courier_app;
    GRANT USAGE,SELECT ON SEQUENCE max_decision_deliveries_id_seq TO courier_app;
  END IF;
END $$;
