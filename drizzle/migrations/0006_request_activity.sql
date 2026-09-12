CREATE TABLE IF NOT EXISTS "requestActivity" (
  "id" serial PRIMARY KEY,
  "requestId" integer NOT NULL,

  "actorType" varchar(20) NOT NULL,
  "actorId" integer,
  "actorName" varchar(255),

  "action" varchar(50) NOT NULL,
  "note" text,
  "changes" text,

  "createdAt" timestamp DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "requestActivity_requestId_idx"
ON "requestActivity" ("requestId");

CREATE INDEX IF NOT EXISTS "requestActivity_createdAt_idx"
ON "requestActivity" ("createdAt");
