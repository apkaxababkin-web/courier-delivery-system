/**
 * Chat V2 reactions — palette validation + route contract.
 *
 * The database and courier auth are mocked: this test never touches PostgreSQL
 * and never needs a real conversation, message or courier account. It pins the
 * agreed reaction palette and the add / toggle / remove / invalid semantics of
 * POST /api/chat/v2/messages/:messageId/reactions.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const emittedEvents: string[] = [];
  const broadcastLiveMock = vi.fn((event: string) => {
    emittedEvents.push(event);
  });
  const assertCourierAccessMock = vi.fn(async () => undefined);
  const getCourierByIdMock = vi.fn(async (id: number) => ({
    id,
    name: "Test Courier",
    isActive: true,
  }));

  const state = {
    message: {
      id: 5,
      conversationId: 1,
      senderType: "courier" as const,
      senderId: 7,
      senderName: "Test Courier",
      text: "hello",
      replyToMessageId: null as number | null,
      editedAt: null as Date | null,
      deletedAt: null as Date | null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      deliveredCount: 0,
      readCount: 0,
    },
    actorReaction: null as { emoji: string } | null,
    participant: true,
    executeCount: 0,
    transactionCalls: 0,
    lastRequestedEmoji: "",
  };

  const messageRow = () => ({
    ...state.message,
    reactions: state.actorReaction
      ? [{ emoji: state.actorReaction.emoji, count: 1, reactedByMe: true }]
      : [],
  });

  const makeConn = () => ({
    execute: vi.fn(async () => {
      state.executeCount += 1;
      // 1) conversation lookup, 2) assertParticipant, 3+) loadMessage
      if (state.executeCount === 1) {
        return [{ conversationId: state.message.conversationId, deletedAt: state.message.deletedAt }];
      }
      if (state.executeCount === 2) {
        return state.participant ? [{ id: 1 }] : [];
      }
      return [messageRow()];
    }),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
      state.transactionCalls += 1;
      const requested = state.lastRequestedEmoji;
      let txCall = 0;
      const tx = {
        execute: vi.fn(async () => {
          txCall += 1;

          // Call 1 mirrors the real SQL:
          //   DELETE ... AND emoji = <requested> RETURNING id
          // If a row is returned the route stops (reaction removed).
          if (txCall === 1) {
            if (state.actorReaction && state.actorReaction.emoji === requested) {
              state.actorReaction = null;
              return [{ id: 1 }];
            }
            return [];
          }

          // Call 2 mirrors:
          //   INSERT ... ON CONFLICT (messageId, participantType, participantId)
          //   DO UPDATE SET emoji = EXCLUDED.emoji
          // i.e. at most one reaction per actor per message.
          state.actorReaction = { emoji: requested };
          return [];
        }),
      };
      return cb(tx);
    }),
  });

  return {
    emittedEvents,
    broadcastLiveMock,
    assertCourierAccessMock,
    getCourierByIdMock,
    state,
    makeConn,
  };
});

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => h.makeConn()),
  getCourierById: (id: number) => h.getCourierByIdMock(id),
  getManagerById: vi.fn(async () => null),
}));

vi.mock("../server/_core/courierAccess", () => ({
  assertCourierAccess: () => h.assertCourierAccessMock(),
  checkCourierAccess: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("../server/_core/liveEvents", () => ({
  broadcastLive: (event: string) => h.broadcastLiveMock(event),
}));

vi.mock("../server/_core/expoPush", () => ({
  isExpoPushToken: () => false,
  sendExpoPush: vi.fn(async () => undefined),
}));

import {
  CHAT_REACTION_LEGACY,
  CHAT_REACTION_PALETTE,
  CHAT_REACTION_EMOJIS,
  isAllowedReactionEmoji,
  registerChatV2Routes,
} from "../server/_core/chatV2Routes";

const AGREED_PALETTE = ["❤️", "🔥", "😂", "🤩", "😍", "🎉", "💯", "👏", "👍", "🤝", "👀", "🤯"];
const AGREED_LEGACY = ["✅", "❌", "⚠️", "🚀", "🎯", "💡", "📌", "📦", "⏳", "🛠️"];

describe("reaction palette", () => {
  it("exposes exactly the 12 agreed mobile emojis, in order", () => {
    expect([...CHAT_REACTION_PALETTE]).toEqual(AGREED_PALETTE);
  });

  it("keeps every legacy emoji so old reactions can still be removed", () => {
    expect([...CHAT_REACTION_LEGACY]).toEqual(AGREED_LEGACY);
  });

  it("accepts the union of palette and legacy, and pins the whole surface", () => {
    const expected = [...AGREED_PALETTE, ...AGREED_LEGACY];
    expect([...CHAT_REACTION_EMOJIS].sort()).toEqual([...expected].sort());
    expect(CHAT_REACTION_EMOJIS.size).toBe(22);

    for (const emoji of expected) expect(isAllowedReactionEmoji(emoji)).toBe(true);
  });

  it("rejects invalid values", () => {
    const rejected: unknown[] = [
      "",
      "   ",
      null,
      undefined,
      42,
      "🦄",
      "abc",
      "<script>",
      "❤", // U+2764 without the VS16 selector is not the agreed value
      "👍🏻", // skin-tone modifier is not part of the palette
    ];
    for (const value of rejected) {
      expect(isAllowedReactionEmoji(value)).toBe(false);
    }
  });

  it("trims surrounding whitespace like the route does", () => {
    expect(isAllowedReactionEmoji("  🔥  ")).toBe(true);
  });
});

describe("POST /api/chat/v2/messages/:messageId/reactions", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;

  beforeEach(async () => {
    h.emittedEvents.length = 0;
    h.broadcastLiveMock.mockClear();
    h.assertCourierAccessMock.mockClear();
    h.state.message.deletedAt = null;
    h.state.actorReaction = null;
    h.state.participant = true;
    h.state.lastRequestedEmoji = "";
    h.state.executeCount = 0;
    h.state.transactionCalls = 0;

    const app = express();
    app.use(express.json());
    app.use((_req, res, next) => {
      res.locals.courier = { courierId: 7 };
      next();
    });
    registerChatV2Routes(app);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function react(emoji: string) {
    h.state.executeCount = 0;
    h.state.transactionCalls = 0;
    h.state.lastRequestedEmoji = emoji;

    const response = await fetch(`${baseUrl}/api/chat/v2/messages/5/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  }

  it("adds a new palette reaction and returns the updated message", async () => {
    const { status, body } = await react("🔥");

    expect(status).toBe(200);
    expect(body.reactions).toEqual([{ emoji: "🔥", count: 1, reactedByMe: true }]);
    expect(h.state.actorReaction).toEqual({ emoji: "🔥" });
    expect(h.broadcastLiveMock).toHaveBeenCalledWith("chat_v2_changed");
    expect(h.emittedEvents).toContain("chat_v2_changed");
  });

  it("toggles the same reaction off (remove)", async () => {
    await react("🔥");
    const { status, body } = await react("🔥");

    expect(status).toBe(200);
    expect(body.reactions).toEqual([]);
    expect(h.state.actorReaction).toBeNull();
  });

  it("replaces the previous reaction when another emoji is chosen", async () => {
    await react("🔥");
    const { status, body } = await react("🎉");

    expect(status).toBe(200);
    expect(body.reactions).toEqual([{ emoji: "🎉", count: 1, reactedByMe: true }]);
    expect(h.state.actorReaction).toEqual({ emoji: "🎉" });
  });

  it("accepts a legacy emoji so an existing old reaction can be removed", async () => {
    h.state.actorReaction = { emoji: "✅" };
    const { status, body } = await react("✅");

    expect(status).toBe(200);
    expect(body.reactions).toEqual([]);
    expect(h.state.actorReaction).toBeNull();
  });

  it("supports all 12 agreed emojis", async () => {
    for (const emoji of AGREED_PALETTE) {
      h.state.actorReaction = null;
      const { status, body } = await react(emoji);
      expect(status, `emoji ${emoji}`).toBe(200);
      expect(body.reactions).toEqual([{ emoji, count: 1, reactedByMe: true }]);
    }
  });

  it("rejects an unsupported emoji with 400 and performs no write", async () => {
    const { status, body } = await react("🦄");

    expect(status).toBe(400);
    expect(String(body?.error?.message ?? "")).toContain("Недоступная реакция");
    expect(h.state.transactionCalls).toBe(0);
    expect(h.state.actorReaction).toBeNull();
  });

  it("rejects an unsupported emoji after a valid reaction without changing it", async () => {
    await react("🔥");
    const { status } = await react("🚫");

    expect(status).toBe(400);
    expect(h.state.actorReaction).toEqual({ emoji: "🔥" });
  });

  it("returns 404 for a deleted message", async () => {
    h.state.message.deletedAt = new Date();
    const { status } = await react("🔥");

    expect(status).toBe(404);
  });

  it("returns 404 when the actor is not a participant", async () => {
    h.state.participant = false;
    const { status } = await react("🔥");

    expect(status).toBe(404);
  });
});
