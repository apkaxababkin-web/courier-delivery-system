CREATE TABLE IF NOT EXISTS max_delayed_notifications (
  id BIGSERIAL PRIMARY KEY,
  draft_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT max_delayed_notifications_status_check
    CHECK (status IN ('pending','sending','sent','cancelled','failed')),
  CONSTRAINT max_delayed_notifications_event_check
    CHECK (event_type IN ('approved','rejected','places','completed','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS max_delayed_notifications_active_unique
ON max_delayed_notifications(draft_id,event_type)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS max_delayed_notifications_due_idx
ON max_delayed_notifications(due_at,id)
WHERE status = 'pending';
