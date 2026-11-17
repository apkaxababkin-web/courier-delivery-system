-- Correspondence route sheets.
-- Manager-created daily assignments for letters and parcels.  Historical
-- sheets are retained; only a sheet for the current local day affects the
-- courier application's normal list.

CREATE TABLE IF NOT EXISTS "correspondenceRouteSheets" (
  "id" serial PRIMARY KEY,
  "routeDate" date NOT NULL,
  "courierId" integer NOT NULL REFERENCES "couriers"("id") ON DELETE RESTRICT,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "comment" text,
  "createdByManagerId" integer,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "correspondenceRouteSheets_status_check"
    CHECK ("status" IN ('active','closed','cancelled')),
  CONSTRAINT "correspondenceRouteSheets_date_courier_key"
    UNIQUE ("routeDate","courierId")
);

CREATE INDEX IF NOT EXISTS "correspondenceRouteSheets_date_idx"
  ON "correspondenceRouteSheets" ("routeDate" DESC,"id" DESC);

CREATE TABLE IF NOT EXISTS "correspondenceRouteSheetItems" (
  "id" bigserial PRIMARY KEY,
  "routeSheetId" integer NOT NULL
    REFERENCES "correspondenceRouteSheets"("id") ON DELETE CASCADE,
  "shipmentId" integer NOT NULL
    REFERENCES "correspondenceShipments"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  "addedByManagerId" integer,
  "createdAt" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "correspondenceRouteSheetItems_position_check" CHECK ("position" > 0),
  CONSTRAINT "correspondenceRouteSheetItems_sheet_shipment_key"
    UNIQUE ("routeSheetId","shipmentId")
);

CREATE INDEX IF NOT EXISTS "correspondenceRouteSheetItems_shipment_idx"
  ON "correspondenceRouteSheetItems" ("shipmentId","routeSheetId");

