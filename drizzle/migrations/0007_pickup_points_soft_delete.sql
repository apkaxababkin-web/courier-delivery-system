-- Soft-delete flag for pickup point directories (Hemotest / Sberbank).
-- Archived points (isActive = false) stay in history, old lists and
-- reconciliation, but disappear from new selections and new pickup lists.
-- Safe to run multiple times.

ALTER TABLE "hemotestPickupPoints"
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

ALTER TABLE "sberbankPickupPoints"
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;
