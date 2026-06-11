import { useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { MessageCircle, Paperclip, Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { DESIGN_PREVIEW_TOKEN } from "@/lib/design-preview";

type DemoMessage = {
  id: number;
  author: string;
  text: string;
  time: string;
  own?: boolean;
};

const initialMessages: DemoMessage[] = [
  { id: 1, author: "Менеджер", text: "Добавлена новая заявка №202. Нужно забрать до 14:10.", time: "10:04" },
  { id: 2, author: "Юрий Бабкин", text: "Принял. Сначала заеду в Hello Korea.", time: "10:06" },
  { id: 3, author: "Аркадий Бабкин", text: "Гемотест на Партизанской забрал, две пробирки.", time: "10:18", own: true },
  { id: 4, author: "Менеджер", text: "Хорошо. По письмам на Ленина два разных получателя.", time: "10:21" },
  { id: 5, author: "Аркадий Бабкин", text: "Понял, отмечу каждое письмо отдельно.", time: "10:23", own: true },
];

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { token } = useCourierAuth();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);
  const border = useMemo(() => "rgba(148,163,184,0.18)", []);

  const sendDemoMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        author: "Аркадий Бабкин",
        text,
        time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        own: true,
      },
    ]);
    setDraft("");
  };

  if (token !== DESIGN_PREVIEW_TOKEN) {
    return (
      <ScreenContainer className="p-0">
        <HeaderBarV2 title="Чат" subtitle="Общий чат" onProfilePress={() => router.push("/profile" as never)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <MessageCircle size={30} color={colors.primary} strokeWidth={2} />
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }}>Чат появится позже</Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 4 }}>
            Сейчас раздел оставлен как заглушка
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
      <HeaderBarV2 title="Чат" subtitle="Общий чат" onProfilePress={() => router.push("/profile" as never)} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
        style={{ flex: 1, minHeight: 0, paddingBottom: Platform.OS === "web" ? 76 : 64 + Math.max(insets.bottom, 12) }}
      >

        <FlatList
          data={messages}
          keyExtractor={(item) => String(item.id)}
          style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 10, paddingTop: 12, paddingBottom: 12 }}
          ListHeaderComponent={
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: colors.surface }}>
                <Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "500" }}>Сегодня</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{
                width: "100%",
                alignItems: item.own ? "flex-end" : "flex-start",
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
                  borderBottomRightRadius: item.own ? 3 : 12,
                  borderBottomLeftRadius: item.own ? 12 : 3,
                  borderWidth: item.own ? 0 : 1,
                  borderColor: border,
                  backgroundColor: item.own ? "#174B78" : colors.surface,
                }}
              >
                {!item.own ? (
                  <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, lineHeight: 16, fontWeight: "600", marginBottom: 2 }}>
                    {item.author}
                  </Text>
                ) : null}
                <Text style={{ color: item.own ? "#F5F9FF" : colors.foreground, fontSize: 12.5, lineHeight: 18, fontWeight: "400" }}>
                  {item.text}
                </Text>
                <Text style={{ alignSelf: "flex-end", color: item.own ? "rgba(235,245,255,0.68)" : colors.muted, fontSize: 9.5, lineHeight: 13, marginTop: 2 }}>
                  {item.time}
                </Text>
              </View>
            </View>
          )}
        />

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
            onPress={sendDemoMessage}
            disabled={!draft.trim()}
            style={({ pressed }) => ({ width: 42, height: 42, marginLeft: 7, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed || !draft.trim() ? 0.5 : 1 })}
          >
            <Send size={18} color="#fff" strokeWidth={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
