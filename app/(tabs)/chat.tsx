import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MessageCircle, Paperclip, Send } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import EventSource from "react-native-sse";

import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCourierAuth } from "@/lib/courier-auth";
import { DESIGN_PREVIEW_TOKEN } from "@/lib/design-preview";

type ChatMessage = {
  id: number;
  senderRole?: "manager" | "courier" | string;
  senderName?: string;
  senderId?: number | string | null;
  authorType?: "manager" | "courier" | string;
  authorId?: number | string | null;
  authorName?: string | null;
  text: string;
  replyToMessageId?: number | null;
  editedAt?: string | null;
  reactions?: Array<{ emoji: string; count: number }>;
  createdAt: string;
};

const CHAT_REACTIONS = ["👍", "✅", "👀", "🙏", "🔥", "❤️", "😂", "😮"] as const;

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const inputBottomGap = Platform.OS === "ios" || Platform.OS === "web"
    ? 0
    : Math.max(tabBarHeight - insets.bottom, 0);
  const { token, courier } = useCourierAuth();

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ item: ChatMessage; own: boolean } | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const border = useMemo(() => "rgba(148,163,184,0.18)", []);
  const messagesById = useMemo(() => {
    const map = new Map<number, ChatMessage>();
    for (const message of messages) map.set(message.id, message);
    return map;
  }, [messages]);
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const isReady = Boolean(token) && !isDesignPreview;

  const markChatRead = useCallback(async () => {
    if (!token || isDesignPreview) return;

    try {
      await fetch(`${getApiBaseUrl()}/api/chat/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [token, isDesignPreview]);

  const loadMessages = useCallback(async (showLoader = false) => {
    if (!token || isDesignPreview) return;

    try {
      if (showLoader) setIsLoading(true);

      const response = await fetch(`${getApiBaseUrl()}/api/manager/chat/messages?limit=120`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || "Не удалось загрузить чат");
      }

      if (!Array.isArray(data)) {
        throw new Error("Сервер вернул неверный формат сообщений");
      }

      setMessages(data);
      setError(null);
      void markChatRead();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка загрузки чата";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isDesignPreview, token, markChatRead]);

  useEffect(() => {
    if (!isReady) {
      setIsLoading(false);
      return;
    }

    loadMessages(true);
  }, [isReady, loadMessages]);

  useEffect(() => {
    if (!isReady) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource(`${getApiBaseUrl()}/api/live`, {
          pollingInterval: 0,
        });

        eventSource.addEventListener("connected", () => {
          console.log("[ChatLiveSync] connected");
        });

        eventSource.addEventListener("chat_changed", () => {
          console.log("[ChatLiveSync] chat_changed");
          void loadMessages(false);
        });

        eventSource.addEventListener("error", (error: unknown) => {
          console.warn("[ChatLiveSync] error:", error);

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        });
      } catch (error) {
        console.warn("[ChatLiveSync] connect failed:", error);

        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      closed = true;

      if (reconnectTimer) clearTimeout(reconnectTimer);

      try {
        eventSource?.close();
      } catch {}
    };
  }, [isReady, loadMessages]);


  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      void loadMessages(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [isReady, loadMessages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), Platform.OS === "ios" ? 180 : 110);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const deleteMessage = useCallback(async (messageId: number) => {
    if (!token || isDesignPreview) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/messages/${messageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || "Не удалось удалить сообщение");
      }

      await loadMessages(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка удаления сообщения";
      setError(message);
    }
  }, [token, isDesignPreview, loadMessages]);

  const toggleReaction = useCallback(async (item: ChatMessage, emoji: string) => {
    if (!token || isDesignPreview) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/messages/${item.id}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji, authorName: courier?.name || "Курьер" }),
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || "Не удалось поставить реакцию");
      }

      await loadMessages(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка реакции";
      setError(message);
    }
  }, [token, isDesignPreview, courier?.name, loadMessages]);

  const closeMessageMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 105,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setMessageMenu(null);
    });
  }, [menuAnim]);

  const handleMessageLongPress = useCallback((item: ChatMessage, own: boolean) => {
    setMessageMenu({ item, own });
    menuAnim.setValue(0);

    Animated.timing(menuAnim, {
      toValue: 1,
      duration: 210,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true,
    }).start();
  }, [menuAnim]);

  const handleMenuReply = useCallback(() => {
    if (!messageMenu?.item) return;
    setReplyToMessage(messageMenu.item);
    setEditingMessage(null);
    closeMessageMenu();
  }, [messageMenu, closeMessageMenu]);

  const handleMenuEdit = useCallback(() => {
    if (!messageMenu?.item) return;
    setEditingMessage(messageMenu.item);
    setReplyToMessage(null);
    setDraft(messageMenu.item.text || "");
    closeMessageMenu();
  }, [messageMenu, closeMessageMenu]);

  const handleMenuDelete = useCallback(() => {
    if (!messageMenu?.item) return;
    const id = messageMenu.item.id;
    closeMessageMenu();
    void deleteMessage(id);
  }, [messageMenu, closeMessageMenu, deleteMessage]);

  const handleMenuReaction = useCallback((emoji: string) => {
    if (!messageMenu?.item) return;
    const item = messageMenu.item;
    closeMessageMenu();
    void toggleReaction(item, emoji);
  }, [messageMenu, closeMessageMenu, toggleReaction]);


  const canSend = draft.trim().length > 0 && !isSending && !isDesignPreview;

  const cancelChatAction = useCallback(() => {
    setEditingMessage(null);
    setReplyToMessage(null);
    setDraft("");
  }, []);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!canSend || !token) return;

    setIsSending(true);
    try {
      const response = editingMessage
        ? await fetch(`${getApiBaseUrl()}/api/chat/messages/${editingMessage.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ text }),
          })
        : await fetch(`${getApiBaseUrl()}/api/manager/chat/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              text,
              senderName: courier?.name || "Курьер",
              senderRole: "courier",
              replyToMessageId: replyToMessage?.id ?? null,
            }),
          });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || (editingMessage ? "Не удалось изменить сообщение" : "Не удалось отправить сообщение"));
      }

      setDraft("");
      setEditingMessage(null);
      setReplyToMessage(null);
      await loadMessages(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : editingMessage ? "Ошибка изменения сообщения" : "Ошибка отправки сообщения";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isReady) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <HeaderBarV2 title="Чат" subtitle="Общий чат" onProfilePress={() => router.push("/profile" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MessageCircle size={30} color={colors.primary} strokeWidth={2} />
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }}>Войдите в профиль</Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 }}>
            Общий чат доступен после входа курьера
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <HeaderBarV2 title="Чат" subtitle="Общий чат МИГ" onProfilePress={() => router.push("/profile" as never)} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled
        keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(insets.top, 0) : 0}
        style={{ flex: 1, minHeight: 0 }}
      >
        {isLoading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Загружаем чат…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "flex-end",
              paddingHorizontal: 10,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom + 12, 20),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            scrollIndicatorInsets={{ bottom: Math.max(insets.bottom + 12, 20) }}
            onContentSizeChange={() => {
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            }}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
                <MessageCircle size={26} color={colors.primary} strokeWidth={2} />
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", marginTop: 10 }}>Сообщений пока нет</Text>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  Напишите первое сообщение в общий чат
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const displayName =
                item.authorName ||
                item.senderName ||
                (item.authorType === "manager" || item.senderRole === "manager" ? "Менеджер" : "Курьер");

              const replyMessage = item.replyToMessageId ? messagesById.get(Number(item.replyToMessageId)) : null;

              const own =
                (item.authorType === "courier" && String(item.authorId || "") === String(courier?.id || "")) ||
                (item.senderRole === "courier" && item.senderId != null && String(item.senderId) === String(courier?.id || "")) ||
                (item.senderRole === "courier" && item.senderName === courier?.name) ||
                (item.authorType === "courier" && item.authorName === courier?.name);

              const selected = messageMenu?.item.id === item.id;

              return (
                <View
                  style={{
                    width: "100%",
                    alignItems: own ? "flex-end" : "flex-start",
                    marginBottom: 7,
                  }}
                >
                  <Pressable
                    onLongPress={() => handleMessageLongPress(item, own)}
                    delayLongPress={350}
                    style={{
                      maxWidth: "82%",
                      minWidth: 92,
                      paddingHorizontal: 11,
                      paddingTop: 7,
                      paddingBottom: 6,
                      borderRadius: 12,
                      borderBottomRightRadius: own ? 3 : 12,
                      borderBottomLeftRadius: own ? 12 : 3,
                      borderWidth: selected ? 2 : own ? 0 : 1,
                      borderColor: selected ? colors.primary : border,
                      backgroundColor: own ? "#174B78" : colors.surface,
                      opacity: messageMenu && !selected ? 0.38 : 1,
                      transform: [{ scale: selected ? 1.015 : 1 }],
                    }}
                  >
                    {!own ? (
                      <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, lineHeight: 16, fontWeight: "600", marginBottom: 2 }}>
                        {displayName}
                      </Text>
                    ) : null}
                    {replyMessage ? (
                      <View style={{ borderLeftWidth: 3, borderLeftColor: own ? "rgba(245,249,255,0.45)" : colors.primary, paddingLeft: 7, marginBottom: 5, opacity: 0.92 }}>
                        <Text numberOfLines={1} style={{ color: own ? "rgba(245,249,255,0.78)" : colors.primary, fontSize: 10.5, fontWeight: "700" }}>
                          {replyMessage.authorName || replyMessage.senderName || "Сообщение"}
                        </Text>
                        <Text numberOfLines={2} style={{ color: own ? "rgba(245,249,255,0.72)" : colors.muted, fontSize: 10.5, lineHeight: 14 }}>
                          {replyMessage.text}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={{ color: own ? "#F5F9FF" : colors.foreground, fontSize: 12.5, lineHeight: 18, fontWeight: "400" }}>
                      {item.text}
                    </Text>
                    <Text style={{ alignSelf: "flex-end", color: own ? "rgba(235,245,255,0.68)" : colors.muted, fontSize: 9.5, lineHeight: 13, marginTop: 2 }}>
                      {formatMessageTime(item.createdAt)}{item.editedAt ? " · изменено" : ""}
                    </Text>
                    {item.reactions && item.reactions.length > 0 ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 5, alignSelf: own ? "flex-end" : "flex-start" }}>
                        {item.reactions.map((reaction) => (
                          <Pressable
                            key={`${item.id}-${reaction.emoji}`}
                            onPress={() => toggleReaction(item, reaction.emoji)}
                            style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: own ? "rgba(255,255,255,0.16)" : "rgba(148,163,184,0.16)" }}
                          >
                            <Text style={{ color: own ? "#F5F9FF" : colors.foreground, fontSize: 11 }}>
                              {reaction.emoji} {reaction.count}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        {error ? (
          <Text style={{ color: "#EF4444", fontSize: 11, textAlign: "center", paddingHorizontal: 12, paddingVertical: 4 }}>
            {error}
          </Text>
        ) : null}

        {editingMessage || replyToMessage ? (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: border, backgroundColor: colors.surface }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
                {editingMessage ? "Редактирование сообщения" : "Ответ на сообщение"}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                {(editingMessage || replyToMessage)?.text}
              </Text>
            </View>
            <Pressable onPress={cancelChatAction} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Отмена</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={{
            minHeight: 58,
            flexDirection: "row",
            alignItems: "flex-end",
            paddingHorizontal: 8,
            paddingTop: 7,
            paddingBottom: Math.max(insets.bottom, 8),
            marginBottom: inputBottomGap,
            borderTopWidth: 1,
            borderTopColor: border,
            backgroundColor: colors.background,
          }}
        >
          <View style={{ flex: 1, minHeight: 42, maxHeight: 94, flexDirection: "row", alignItems: "flex-end", borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: colors.surface }}>
            <Pressable style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Paperclip size={19} color={colors.muted} strokeWidth={2} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={editingMessage ? "Изменить сообщение" : replyToMessage ? "Ответить" : "Сообщение"}
              placeholderTextColor={colors.muted}
              multiline
              blurOnSubmit={false}
              scrollEnabled={false}
              style={{ flex: 1, maxHeight: 88, minHeight: 40, paddingRight: 11, paddingVertical: 10, color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}
            />
          </View>
          <Pressable
            onPress={sendMessage}
            disabled={!canSend}
            style={({ pressed }) => ({ width: 42, height: 42, marginLeft: 7, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed || !canSend ? 0.5 : 1 })}
          >
            <Send size={18} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={messageMenu != null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeMessageMenu}
      >
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "rgba(15,23,42,0.18)" }}>
          <Pressable
            onPress={closeMessageMenu}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />

          {messageMenu ? (
            <Animated.View
              style={{
                opacity: menuAnim,
                transform: [
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                  {
                    scale: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.985, 1],
                    }),
                  },
                ],
                alignSelf: messageMenu.own ? "flex-end" : "flex-start",
                width: "86%",
                maxWidth: 320,
              }}
            >
              <View style={{ alignSelf: messageMenu.own ? "flex-end" : "flex-start", flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.82)", marginBottom: 8 }}>
                {CHAT_REACTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => handleMenuReaction(emoji)}
                    style={({ pressed }) => ({
                      width: 28,
                      height: 28,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 14,
                      backgroundColor: pressed ? "rgba(29,111,242,0.10)" : "transparent",
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                    })}
                  >
                    <Text style={{ fontSize: 19 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>

              <View
                style={{
                  overflow: "hidden",
                  borderRadius: 18,
                  backgroundColor: "rgba(255,255,255,0.88)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.70)",
                  shadowColor: "#0F172A",
                  shadowOpacity: 0.18,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 10 },
                  elevation: 14,
                }}
              >
                <Pressable
                  onPress={handleMenuReply}
                  style={({ pressed }) => ({
                    paddingHorizontal: 18,
                    paddingVertical: 13,
                    backgroundColor: pressed ? "rgba(29,111,242,0.08)" : "transparent",
                  })}
                >
                  <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "700" }}>Ответить</Text>
                </Pressable>

                {messageMenu.own ? (
                  <Pressable
                    onPress={handleMenuEdit}
                    style={({ pressed }) => ({
                      paddingHorizontal: 18,
                      paddingVertical: 13,
                      backgroundColor: pressed ? "rgba(29,111,242,0.08)" : "transparent",
                    })}
                  >
                    <Text style={{ color: "#0F172A", fontSize: 16, fontWeight: "700" }}>Изменить</Text>
                  </Pressable>
                ) : null}

                {messageMenu.own ? (
                  <View style={{ height: 1, marginHorizontal: 16, backgroundColor: "rgba(148,163,184,0.18)" }} />
                ) : null}

                {messageMenu.own ? (
                  <Pressable
                    onPress={handleMenuDelete}
                    style={({ pressed }) => ({
                      paddingHorizontal: 18,
                      paddingVertical: 13,
                      backgroundColor: pressed ? "rgba(239,68,68,0.08)" : "transparent",
                    })}
                  >
                    <Text style={{ color: "#DC2626", fontSize: 16, fontWeight: "800" }}>Удалить</Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}
