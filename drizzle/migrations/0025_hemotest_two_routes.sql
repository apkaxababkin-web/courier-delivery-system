-- Apply only after database backup, before deploying the corresponding API.
ALTER TABLE "hemotestPickups"
  ADD COLUMN IF NOT EXISTS "routeNumber" integer;
CREATE TABLE IF NOT EXISTS "hemotestDailyRoutes" (
  "id" serial PRIMARY KEY,
  "date" varchar(10) NOT NULL,
  "routeNumber" integer NOT NULL CHECK ("routeNumber" IN (1, 2)),
  "courierId" integer,
  "isFrozen" boolean NOT NULL DEFAULT false,
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "hemotestDailyRoutes_date_route_unique" UNIQUE ("date", "routeNumber")
);
CREATE UNIQUE INDEX IF NOT EXISTS "hemotestDailyRoutes_date_route_unique"
  ON "hemotestDailyRoutes" ("date", "routeNumber");
-- Existing pickup rows remain unassigned until explicitly distributed by a manager.
