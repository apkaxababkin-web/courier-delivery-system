-- Chat V2 is deployed alongside the legacy chat. The legacy tables are kept
-- intact until both clients have been switched and verified.

CREATE TABLE IF NOT EXISTS "managerChatMessages" (
  "id" serial PRIMARY KEY,
  "senderName" varchar(255) NOT NULL,
  "senderRole" varchar(40) DEFAULT 'manager' NOT NULL,
  "text" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chatV2Conversations" (
  "id" serial PRIMARY KEY,
  "kind" varchar(20) NOT NULL CHECK ("kind" IN ('general', 'direct')),
  "title" varchar(255) NOT NULL,
  "slug" varchar(80),
  "directKey" varchar(160),
  "createdByType" varchar(20) CHECK ("createdByType" IS NULL OR "createdByType" IN ('manager', 'courier')),
  "createdById" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chatV2Conversations_slug_key" UNIQUE ("slug"),
  CONSTRAINT "chatV2Conversations_directKey_key" UNIQUE ("directKey")
);

CREATE INDEX IF NOT EXISTS "chatV2Conversations_updatedAt_idx"
  ON "chatV2Conversations" ("updatedAt");

CREATE TABLE IF NOT EXISTS "chatV2Participants" (
  "id" serial PRIMARY KEY,
  "conversationId" integer NOT NULL REFERENCES "chatV2Conversations"("id") ON DELETE CASCADE,
  "participantType" varchar(20) NOT NULL CHECK ("participantType" IN ('manager', 'courier')),
  "participantId" integer NOT NULL,
  "lastReadMessageId" integer,
  "lastReadAt" timestamp,
  "isMuted" boolean DEFAULT false NOT NULL,
  "joinedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chatV2Participants_member_key"
    UNIQUE ("conversationId", "participantType", "participantId")
);

CREATE INDEX IF NOT EXISTS "chatV2Participants_actor_idx"
  ON "chatV2Participants" ("participantType", "participantId");
CREATE INDEX IF NOT EXISTS "chatV2Participants_conversation_idx"
  ON "chatV2Participants" ("conversationId");

CREATE TABLE IF NOT EXISTS "chatV2Messages" (
  "id" serial PRIMARY KEY,
  "conversationId" integer NOT NULL REFERENCES "chatV2Conversations"("id") ON DELETE CASCADE,
  "senderType" varchar(20) NOT NULL CHECK ("senderType" IN ('manager', 'courier')),
  "senderId" integer,
  "senderNameSnapshot" varchar(255) NOT NULL,
  "clientMessageId" varchar(80),
  "text" text NOT NULL CHECK (char_length("text") BETWEEN 1 AND 4000),
  "replyToMessageId" integer REFERENCES "chatV2Messages"("id") ON DELETE SET NULL,
  "legacySource" varchar(40),
  "legacySourceId" integer,
  "editedAt" timestamp,
  "deletedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chatV2Messages_client_key"
    UNIQUE ("senderType", "senderId", "clientMessageId"),
  CONSTRAINT "chatV2Messages_legacy_key"
    UNIQUE ("legacySource", "legacySourceId")
);

CREATE INDEX IF NOT EXISTS "chatV2Messages_conversation_id_idx"
  ON "chatV2Messages" ("conversationId", "id");
CREATE INDEX IF NOT EXISTS "chatV2Messages_reply_idx"
  ON "chatV2Messages" ("replyToMessageId");

CREATE TABLE IF NOT EXISTS "chatV2MessageReceipts" (
  "id" serial PRIMARY KEY,
  "messageId" integer NOT NULL REFERENCES "chatV2Messages"("id") ON DELETE CASCADE,
  "conversationId" integer NOT NULL REFERENCES "chatV2Conversations"("id") ON DELETE CASCADE,
  "participantType" varchar(20) NOT NULL CHECK ("participantType" IN ('manager', 'courier')),
  "participantId" integer NOT NULL,
  "deliveredAt" timestamp,
  "readAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chatV2MessageReceipts_recipient_key"
    UNIQUE ("messageId", "participantType", "participantId")
);

CREATE INDEX IF NOT EXISTS "chatV2MessageReceipts_recipient_idx"
  ON "chatV2MessageReceipts" ("participantType", "participantId");
CREATE INDEX IF NOT EXISTS "chatV2MessageReceipts_conversation_idx"
  ON "chatV2MessageReceipts" ("conversationId");

CREATE TABLE IF NOT EXISTS "chatV2Attachments" (
  "id" serial PRIMARY KEY,
  "messageId" integer NOT NULL REFERENCES "chatV2Messages"("id") ON DELETE CASCADE,
  "originalName" varchar(255) NOT NULL,
  "storageKey" text NOT NULL,
  "fileUrl" text NOT NULL,
  "mimeType" varchar(255),
  "sizeBytes" integer NOT NULL CHECK ("sizeBytes" >= 0),
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "chatV2Attachments_message_idx"
  ON "chatV2Attachments" ("messageId");

-- Create the single company-wide room and add every active account.
INSERT INTO "chatV2Conversations" ("kind", "title", "slug", "createdAt", "updatedAt")
VALUES ('general', 'Общий чат', 'general', now(), now())
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "chatV2Participants" ("conversationId", "participantType", "participantId")
SELECT conversation."id", 'manager', manager."id"
FROM "chatV2Conversations" conversation
CROSS JOIN "managers" manager
WHERE conversation."slug" = 'general' AND manager."isActive" = true
ON CONFLICT ("conversationId", "participantType", "participantId") DO NOTHING;

INSERT INTO "chatV2Participants" ("conversationId", "participantType", "participantId")
SELECT conversation."id", 'courier', courier."id"
FROM "chatV2Conversations" conversation
CROSS JOIN "couriers" courier
WHERE conversation."slug" = 'general' AND courier."isActive" = true
ON CONFLICT ("conversationId", "participantType", "participantId") DO NOTHING;

-- Preserve the current shared history. Legacy rows have no trustworthy account
-- id, so their name is retained as a snapshot and senderId intentionally stays
-- NULL. Rerunning this migration cannot duplicate imported messages.
INSERT INTO "chatV2Messages" (
  "conversationId",
  "senderType",
  "senderId",
  "senderNameSnapshot",
  "text",
  "legacySource",
  "legacySourceId",
  "createdAt",
  "updatedAt"
)
SELECT
  conversation."id",
  CASE WHEN legacy."senderRole" = 'manager' THEN 'manager' ELSE 'courier' END,
  NULL,
  legacy."senderName",
  legacy."text",
  'managerChatMessages',
  legacy."id",
  legacy."createdAt",
  legacy."createdAt"
FROM "managerChatMessages" legacy
CROSS JOIN "chatV2Conversations" conversation
WHERE conversation."slug" = 'general'
ON CONFLICT ("legacySource", "legacySourceId") DO NOTHING;

UPDATE "chatV2Conversations" conversation
SET "updatedAt" = imported."lastMessageAt"
FROM (
  SELECT "conversationId", max("createdAt") AS "lastMessageAt"
  FROM "chatV2Messages"
  GROUP BY "conversationId"
) imported
WHERE conversation."id" = imported."conversationId";
