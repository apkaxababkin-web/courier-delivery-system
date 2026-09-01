import { getApiBaseUrl } from "@/constants/oauth";

export type ChatV2ActorType = "manager" | "courier";

export type ChatV2Actor = {
  type: ChatV2ActorType;
  id: number;
  name: string;
};

export type ChatV2Contacts = {
  me: ChatV2Actor;
  managers: ChatV2Actor[];
  couriers: ChatV2Actor[];
};

export type ChatV2Conversation = {
  id: number;
  kind: "general" | "direct";
  title: string;
  slug?: string | null;
  updatedAt: string;
  lastMessageId?: number | null;
  lastMessageSenderName?: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
};

export type ChatV2Message = {
  id: number;
  conversationId: number;
  senderType: ChatV2ActorType;
  senderId: number | null;
  senderName: string;
  text: string;
  replyToMessageId?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deliveredCount: number;
  readCount: number;
  reactions: ChatV2Reaction[];
};

export type ChatV2Reaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

type ChatV2MessagePage = { messages: ChatV2Message[]; nextCursor: number | null };

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Ошибка чата (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const chatV2 = {
  contacts: (token: string) => request<ChatV2Contacts>(token, "/api/chat/v2/contacts"),
  conversations: async (token: string) => {
    const rows = await request<ChatV2Conversation[]>(token, "/api/chat/v2/conversations");
    return rows.map((row) => ({ ...row, unreadCount: Number(row.unreadCount || 0) }));
  },
  createDirect: (token: string, target: ChatV2Actor) => request<{ id: number; created: boolean }>(token, "/api/chat/v2/conversations/direct", {
    method: "POST",
    body: JSON.stringify({ targetType: target.type, targetId: target.id }),
  }),
  messages: (token: string, conversationId: number, before?: number | null) => {
    const params = new URLSearchParams({ limit: "60" });
    if (before) params.set("before", String(before));
    return request<ChatV2MessagePage>(token, `/api/chat/v2/conversations/${conversationId}/messages?${params}`);
  },
  send: (token: string, conversationId: number, input: { text: string; clientMessageId: string; replyToMessageId?: number | null }) => request<ChatV2Message>(token, `/api/chat/v2/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  }),
  read: (token: string, conversationId: number) => request(token, `/api/chat/v2/conversations/${conversationId}/read`, { method: "POST" }),
  edit: (token: string, messageId: number, text: string) => request<ChatV2Message>(token, `/api/chat/v2/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  }),
  remove: (token: string, messageId: number) => request(token, `/api/chat/v2/messages/${messageId}`, { method: "DELETE" }),
  react: (token: string, messageId: number, emoji: string) => request<ChatV2Message>(token, `/api/chat/v2/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  }),
};
