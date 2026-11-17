CREATE TABLE IF NOT EXISTS courier_push_devices (
  id BIGSERIAL PRIMARY KEY,

  courier_id INTEGER NOT NULL
    REFERENCES couriers(id) ON DELETE CASCADE,

  installation_id VARCHAR(128) NOT NULL,

  platform VARCHAR(16) NOT NULL,
  provider VARCHAR(16) NOT NULL,

  push_token TEXT NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_registered_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_courier_push_devices_platform
    CHECK (platform IN ('android', 'ios')),

  CONSTRAINT chk_courier_push_devices_provider
    CHECK (provider IN ('fcm', 'expo'))
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_courier_push_devices_token
ON courier_push_devices(push_token);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_courier_push_devices_installation
ON courier_push_devices(courier_id, installation_id);

CREATE INDEX IF NOT EXISTS
  idx_courier_push_devices_courier
ON courier_push_devices(courier_id);
