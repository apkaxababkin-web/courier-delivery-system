import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MessageCircle, Paperclip, Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCourierAuth } from "@/lib/courier-auth";
import { DESIGN_PREVIEW_TOKEN } from "@/lib/design-preview";

type ChatMessage = {
  id: number;
  authorType: "manager" | "courier";
  authorId: number | null;
  authorName: string;
  text: string;
  createdAt: string;
};

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
  const { height: windowHeight } = useWindowDimensions();
  const { token, courier } = useCourierAuth();

  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const border = useMemo(() => "rgba(148,163,184,0.18)", []);
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const isReady = Boolean(token) && !isDesignPreview;

  const loadMessages = useCallback(async (showLoader = false) => {
    if (!token || isDesignPreview) return;

    try {
      if (showLoader) setIsLoading(true);

      const response = await fetch(`${getApiBaseUrl()}/api/chat/messages?limit=120`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || "Не удалось загрузить чат");
      }

      setMessages(Array.isArray(data) ? data : []);
      setError(null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка загрузки чата";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isDesignPreview, token]);

  useEffect(() => {
    if (!isReady) {
      setIsLoading(false);
      return;
    }

    loadMessages(true);
  }, [isReady, loadMessages]);

  useMobileLiveSync({
    enabled: isReady,
    onSync: useCallback(() => {
      loadMessages(false);
    }, [loadMessages]),
  });

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !token || isSending || isDesignPreview) return;

    setIsSending(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });

      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error?.message || "Не удалось отправить сообщение");
      }

      setDraft("");
      await loadMessages(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ошибка отправки сообщения";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  if (!isReady) {
    return (
      <ScreenContainer className="p-0">
        <HeaderBarV2 title="Чат" subtitle="Общий чат" onProfilePress={() => router.push("/profile" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MessageCircle size={30} color={colors.primary} strokeWidth={2} />
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }}>Войдите в профиль</Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 }}>
            Общий чат доступен после входа курьера
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      className="p-0"
      style={{
        height: Platform.OS === "web" ? windowHeight : undefined,
        backgroundColor: colors.background,
      }}
    >
      <HeaderBarV2 title="Чат" subtitle="Общий чат МИГ" onProfilePress={() => router.push("/profile" as never)} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={{ flex: 1, minHeight: 0, paddingBottom: Platform.OS === "web" ? 76 : 64 + Math.max(insets.bottom, 12) }}
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
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 10, paddingTop: 12, paddingBottom: 12 }}
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
              const own = item.authorType === "courier" && item.authorId === courier?.id;

              return (
                <View
                  style={{
                    width: "100%",
                    alignItems: own ? "flex-end" : "flex-start",
                    marginBottom: 7,
                  }}
                >
                  <View
                    style={{
                      maxWidth: "82%",
                      minWidth: 92,
                      paddingHorizontal: 11,
                      paddingTop: 7,
                      paddingBottom: 6,
                      borderRadius: 12,
                      borderBottomRightRadius: own ? 3 : 12,
                      borderBottomLeftRadius: own ? 12 : 3,
                      borderWidth: own ? 0 : 1,
                      borderColor: border,
                      backgroundColor: own ? "#174B78" : colors.surface,
                    }}
                  >
                    {!own ? (
                      <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, lineHeight: 16, fontWeight: "600", marginBottom: 2 }}>
                        {item.authorType === "manager" ? `Менеджер • ${item.authorName}` : `Курьер • ${item.authorName}`}
                      </Text>
                    ) : null}
                    <Text style={{ color: own ? "#F5F9FF" : colors.foreground, fontSize: 12.5, lineHeight: 18, fontWeight: "400" }}>
                      {item.text}
                    </Text>
                    <Text style={{ alignSelf: "flex-end", color: own ? "rgba(235,245,255,0.68)" : colors.muted, fontSize: 9.5, lineHeight: 13, marginTop: 2 }}>
                      {formatMessageTime(item.createdAt)}
                    </Text>
                  </View>
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

        <View style={{ minHeight: 58, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 7, paddingBottom: 8, borderTopWidth: 1, borderTopColor: border, backgroundColor: colors.background }}>
          <View style={{ flex: 1, minHeight: 42, maxHeight: 94, flexDirection: "row", alignItems: "flex-end", borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: colors.surface }}>
            <Pressable style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Paperclip size={19} color={colors.muted} strokeWidth={2} />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Сообщение"
              placeholderTextColor={colors.muted}
              multiline
              style={{ flex: 1, maxHeight: 88, minHeight: 40, paddingRight: 11, paddingVertical: 10, color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}
            />
          </View>
          <Pressable
            onPress={sendMessage}
            disabled={!draft.trim() || isSending}
            style={({ pressed }) => ({ width: 42, height: 42, marginLeft: 7, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed || !draft.trim() || isSending ? 0.5 : 1 })}
          >
            <Send size={18} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
