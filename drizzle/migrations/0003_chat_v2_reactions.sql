-- One reaction per participant and message. Selecting the active reaction
-- removes it; selecting another emoji replaces it.

CREATE TABLE IF NOT EXISTS "chatV2MessageReactions" (
  "id" serial PRIMARY KEY,
  "messageId" integer NOT NULL REFERENCES "chatV2Messages"("id") ON DELETE CASCADE,
  "conversationId" integer NOT NULL REFERENCES "chatV2Conversations"("id") ON DELETE CASCADE,
  "participantType" varchar(20) NOT NULL CHECK ("participantType" IN ('manager', 'courier')),
  "participantId" integer NOT NULL,
  "emoji" varchar(16) NOT NULL CHECK ("emoji" IN ('✅', '❌', '⚠️', '🚀', '🎯', '💡', '📌', '📦', '⏳', '🛠️')),
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "chatV2MessageReactions_actor_key"
    UNIQUE ("messageId", "participantType", "participantId")
);

CREATE INDEX IF NOT EXISTS "chatV2MessageReactions_message_idx"
  ON "chatV2MessageReactions" ("messageId");

CREATE INDEX IF NOT EXISTS "chatV2MessageReactions_conversation_idx"
  ON "chatV2MessageReactions" ("conversationId");
