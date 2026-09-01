import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Edit3,
  MessageCircle,
  Plus,
  Reply,
  Search,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react-native";

import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useCourierAuth } from "@/lib/courier-auth";
import {
  chatV2,
  type ChatV2Actor,
  type ChatV2Contacts,
  type ChatV2Conversation,
  type ChatV2Message,
} from "@/lib/chat-v2";

function clientMessageId() {
  return `courier:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

function actorKey(actor: Pick<ChatV2Actor, "type" | "id">) {
  return `${actor.type}:${actor.id}`;
}

function isMessageFromActor(message: ChatV2Message, actor?: ChatV2Actor | null) {
  if (!actor || message.senderType !== actor.type) return false;
  if (message.senderId !== null && message.senderId !== undefined) {
    return Number(message.senderId) === Number(actor.id);
  }

  return message.senderName.trim().toLocaleLowerCase("ru-RU") === actor.name.trim().toLocaleLowerCase("ru-RU");
}

const CHAT_TIME_ZONE = "Asia/Irkutsk";

function parseChatDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const hasTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed);
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasTime && !hasTimezone ? `${trimmed.replace(" ", "T")}Z` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chatDateKey(value?: string | null) {
  const date = parseChatDate(value);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHAT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toLocaleUpperCase("ru-RU")}${value.slice(1)}` : value;
}

function formatMessageDayLabel(value: string) {
  const date = parseChatDate(value);
  const dateKey = chatDateKey(value);
  if (!dateKey || !date) return "";

  const now = new Date();
  const todayKey = chatDateKey(now.toISOString());
  const yesterdayKey = chatDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
  const formattedDate = new Intl.DateTimeFormat("ru-RU", {
    timeZone: CHAT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(dateKey.slice(0, 4) === todayKey.slice(0, 4) ? {} : { year: "numeric" as const }),
  }).format(date);

  if (dateKey === todayKey) return `Сегодня, ${formattedDate}`;
  if (dateKey === yesterdayKey) return `Вчера, ${formattedDate}`;
  return capitalize(formattedDate);
}

function formatTime(value?: string | null) {
  const date = parseChatDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("ru-RU", { timeZone: CHAT_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

function formatListTime(value?: string | null) {
  const date = parseChatDate(value);
  if (!date) return "";
  if (chatDateKey(value) === chatDateKey(new Date().toISOString())) return formatTime(value);
  return date.toLocaleDateString("ru-RU", { timeZone: CHAT_TIME_ZONE, day: "2-digit", month: "2-digit" });
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const { token } = useCourierAuth();

  const [contacts, setContacts] = useState<ChatV2Contacts | null>(null);
  const [conversations, setConversations] = useState<ChatV2Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatV2Message[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [openingContactKey, setOpeningContactKey] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatV2Message | null>(null);
  const [editing, setEditing] = useState<ChatV2Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<ChatV2Message | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatV2Message>>(null);
  const nearBottomRef = useRef(true);
  const shouldScrollRef = useRef(false);
  const messageRequestRef = useRef(0);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );
  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.lastMessageSenderName || ""} ${conversation.lastMessageText || ""}`
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [conversations, search]);
  const filteredContacts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    const filter = (items: ChatV2Actor[]) => query
      ? items.filter((item) => item.name.toLocaleLowerCase("ru").includes(query))
      : items;
    return {
      managers: filter(contacts?.managers || []),
      couriers: filter(contacts?.couriers || []),
    };
  }, [contacts, search]);

  const loadConversations = useCallback(async () => {
    if (!token) return [];
    const rows = await chatV2.conversations(token);
    setConversations(rows);
    return rows;
  }, [token]);

  const loadDirectory = useCallback(async (showLoader = false) => {
    if (!token) return;
    try {
      if (showLoader) setIsLoadingList(true);
      const [contactRows] = await Promise.all([chatV2.contacts(token), loadConversations()]);
      setContacts(contactRows);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить чаты");
    } finally {
      if (showLoader) setIsLoadingList(false);
    }
  }, [loadConversations, token]);

  const loadMessages = useCallback(async (conversationId: number, showLoader = false) => {
    if (!token) return;
    const requestId = ++messageRequestRef.current;
    try {
      if (showLoader) setIsLoadingMessages(true);
      const page = await chatV2.messages(token, conversationId);
      if (requestId !== messageRequestRef.current) return;
      shouldScrollRef.current = showLoader || nearBottomRef.current;
      setMessages(page.messages);
      setNextCursor(page.nextCursor);
      setError(null);
      if (isFocused) {
        void chatV2.read(token, conversationId).then(() => {
          setConversations((current) => current.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
          ));
        }).catch(() => undefined);
      }
    } catch (caught) {
      if (requestId === messageRequestRef.current) {
        setError(caught instanceof Error ? caught.message : "Не удалось загрузить сообщения");
      }
    } finally {
      if (showLoader && requestId === messageRequestRef.current) setIsLoadingMessages(false);
    }
  }, [isFocused, token]);

  useEffect(() => {
    if (!token) {
      setIsLoadingList(false);
      return;
    }
    void loadDirectory(true);
  }, [loadDirectory, token]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const raw = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
    const conversationId = Number(raw || 0);
    if (conversationId > 0) setSelectedConversationId(conversationId);
  }, [params.conversationId]);

  useEffect(() => {
    if (!selectedConversationId || !isFocused) return;
    setReplyTo(null);
    setEditing(null);
    void loadMessages(selectedConversationId, true);
  }, [isFocused, loadMessages, selectedConversationId]);

  useMobileLiveSync({
    enabled: Boolean(token) && isFocused,
    events: ["app_active", "chat_v2_changed", "chat_v2_read"],
    onSync: useCallback(async (eventType) => {
      await loadConversations();
      if (eventType === "chat_v2_changed" && selectedConversationId) {
        await loadMessages(selectedConversationId, false);
      }
    }, [loadConversations, loadMessages, selectedConversationId]),
  });

  const openConversation = (conversationId: number) => {
    nearBottomRef.current = true;
    setSelectedConversationId(conversationId);
    setSearch("");
    setIsContactsOpen(false);
  };

  const closeConversation = () => {
    messageRequestRef.current += 1;
    setSelectedConversationId(null);
    setMessages([]);
    setNextCursor(null);
    setDraft("");
    setReplyTo(null);
    setEditing(null);
    setError(null);
    void loadConversations();
  };

  const createDirect = async (target: ChatV2Actor) => {
    if (!token) return;
    try {
      setOpeningContactKey(actorKey(target));
      const result = await chatV2.createDirect(token, target);
      await loadConversations();
      openConversation(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось открыть личный чат");
    } finally {
      setOpeningContactKey(null);
    }
  };

  const refresh = async () => {
    try {
      setIsRefreshing(true);
      if (selectedConversationId) await loadMessages(selectedConversationId, false);
      else await loadDirectory(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadOlder = async () => {
    if (!token || !selectedConversationId || !nextCursor || isLoadingOlder) return;
    try {
      setIsLoadingOlder(true);
      const page = await chatV2.messages(token, selectedConversationId, nextCursor);
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !known.has(message.id)), ...current];
      });
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить старые сообщения");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!token || !selectedConversationId || !text || isSending) return;
    try {
      setIsSending(true);
      if (editing) {
        const updated = await chatV2.edit(token, editing.id, text);
        setMessages((current) => current.map((message) => message.id === editing.id ? updated : message));
      } else {
        const sent = await chatV2.send(token, selectedConversationId, {
          text,
          clientMessageId: clientMessageId(),
          replyToMessageId: replyTo?.id || null,
        });
        shouldScrollRef.current = true;
        setMessages((current) => current.some((message) => message.id === sent.id) ? current : [...current, sent]);
      }
      setDraft("");
      setEditing(null);
      setReplyTo(null);
      setError(null);
      void loadConversations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось отправить сообщение");
    } finally {
      setIsSending(false);
    }
  };

  const deleteMessage = async () => {
    if (!token || !messageMenu) return;
    try {
      await chatV2.remove(token, messageMenu.id);
      setMessages((current) => current.map((message) => message.id === messageMenu.id
        ? { ...message, text: "", deletedAt: new Date().toISOString() }
        : message));
      setMessageMenu(null);
      setDeleteConfirmation(false);
      void loadConversations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить сообщение");
    }
  };

  const beginEdit = (message: ChatV2Message) => {
    setEditing(message);
    setReplyTo(null);
    setDraft(message.text);
    setMessageMenu(null);
  };

  const beginReply = (message: ChatV2Message) => {
    setReplyTo(message);
    setEditing(null);
    setMessageMenu(null);
  };

  const onMessageListScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottomRef.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 100;
  };

  const border = "rgba(148,163,184,0.22)";
  const keyboardHidesTabBar = Platform.OS === "ios" && isKeyboardVisible;
  const inputBottomGap = Platform.OS === "web" || keyboardHidesTabBar ? 0 : Math.max(tabBarHeight - insets.bottom, 0);
  const inputBottomPadding = keyboardHidesTabBar ? 8 : Math.max(insets.bottom, 8);

  if (!token) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <MessageCircle size={34} color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.foreground, fontSize: 17, fontWeight: "700" }}>Войдите в приложение</Text>
        <Text style={{ marginTop: 5, color: colors.muted, fontSize: 13, textAlign: "center" }}>Чаты доступны после входа в аккаунт курьера.</Text>
      </SafeAreaView>
    );
  }

  if (!selectedConversation) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ height: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: colors.surface }}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "800" }}>Чаты</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>Общий и личные диалоги</Text></View>
          <Pressable onPress={() => { setSearch(""); setIsContactsOpen(true); }} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 })}><Plus size={21} color="#fff" /></Pressable>
        </View>

        <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border }}>
          <View style={{ height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: border }}>
            <Search size={17} color={colors.muted} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Поиск по чатам" placeholderTextColor={colors.muted} style={{ flex: 1, marginLeft: 8, color: colors.foreground, fontSize: 14 }} />
            {search ? <Pressable onPress={() => setSearch("")}><X size={17} color={colors.muted} /></Pressable> : null}
          </View>
        </View>

        {error ? <Pressable onPress={() => setError(null)} style={{ margin: 10, padding: 10, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.10)" }}><Text style={{ color: "#DC2626", fontSize: 12, textAlign: "center" }}>{error}</Text></Pressable> : null}

        {isLoadingList ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /><Text style={{ marginTop: 8, color: colors.muted, fontSize: 12 }}>Загружаем чаты…</Text></View>
        ) : (
          <FlatList
            data={filteredConversations}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 12, flexGrow: 1 }}
            ListEmptyComponent={<View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }}><MessageCircle size={30} color={colors.muted} /><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: 10 }}>Чаты не найдены</Text><Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 4 }}>Создайте личный диалог кнопкой «+».</Text></View>}
            renderItem={({ item }) => (
              <Pressable onPress={() => openConversation(item.id)} style={({ pressed }) => ({ flexDirection: "row", paddingHorizontal: 14, paddingTop: 12, opacity: pressed ? 0.65 : 1 })}>
                <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: item.kind === "general" ? colors.primary : "rgba(29,111,242,0.12)" }}>{item.kind === "general" ? <Users size={22} color="#fff" /> : <UserRound size={22} color={colors.primary} />}</View>
                <View style={{ flex: 1, minWidth: 0, marginLeft: 11, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: border }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}><Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: "700" }}>{item.title}</Text><Text style={{ marginLeft: 8, color: colors.muted, fontSize: 10 }}>{formatListTime(item.lastMessageAt || item.updatedAt)}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}><Text numberOfLines={1} style={{ flex: 1, color: colors.muted, fontSize: 12 }}>{item.lastMessageText ? `${item.lastMessageSenderName || ""}: ${item.lastMessageText}` : "Сообщений пока нет"}</Text>{item.unreadCount > 0 ? <View style={{ minWidth: 21, height: 21, paddingHorizontal: 5, marginLeft: 8, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text></View> : null}</View>
                </View>
              </Pressable>
            )}
          />
        )}

        <Modal visible={isContactsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsContactsOpen(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={{ height: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: border }}><View style={{ flex: 1 }}><Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "800" }}>Новый чат</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Выберите собеседника</Text></View><Pressable onPress={() => setIsContactsOpen(false)} style={{ padding: 8 }}><X size={23} color={colors.foreground} /></Pressable></View>
            <View style={{ margin: 12, height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: border }}><Search size={17} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Найти человека" placeholderTextColor={colors.muted} style={{ flex: 1, marginLeft: 8, color: colors.foreground }} /></View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {filteredContacts.managers.length > 0 ? <Text style={{ paddingHorizontal: 16, paddingVertical: 8, color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>Менеджеры</Text> : null}
              {filteredContacts.managers.map((contact) => <ContactRow key={actorKey(contact)} contact={contact} loading={openingContactKey === actorKey(contact)} colors={colors} border={border} onPress={() => void createDirect(contact)} />)}
              {filteredContacts.couriers.length > 0 ? <Text style={{ paddingHorizontal: 16, paddingVertical: 8, color: colors.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>Курьеры</Text> : null}
              {filteredContacts.couriers.map((contact) => <ContactRow key={actorKey(contact)} contact={contact} loading={openingContactKey === actorKey(contact)} colors={colors} border={border} onPress={() => void createDirect(contact)} />)}
              {filteredContacts.managers.length === 0 && filteredContacts.couriers.length === 0 ? <Text style={{ padding: 32, color: colors.muted, fontSize: 13, textAlign: "center" }}>Никого не найдено</Text> : null}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: border, backgroundColor: colors.surface }}>
        <Pressable onPress={closeConversation} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}><ArrowLeft size={23} color={colors.foreground} /></Pressable>
        <View style={{ width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: selectedConversation.kind === "general" ? colors.primary : "rgba(29,111,242,0.12)" }}>{selectedConversation.kind === "general" ? <Users size={19} color="#fff" /> : <UserRound size={19} color={colors.primary} />}</View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}><Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 15, fontWeight: "800" }}>{selectedConversation.title}</Text><Text style={{ color: colors.muted, fontSize: 10.5, marginTop: 1 }}>{selectedConversation.kind === "general" ? "Общий рабочий чат" : "Личный диалог"}</Text></View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {isLoadingMessages ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Загружаем сообщения…</Text></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScroll={onMessageListScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => { if (shouldScrollRef.current) { shouldScrollRef.current = false; requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); } }}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12 }}
            ListHeaderComponent={nextCursor ? <Pressable onPress={() => void loadOlder()} disabled={isLoadingOlder} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", marginBottom: 12, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: colors.surface }}>{isLoadingOlder ? <ActivityIndicator size="small" color={colors.primary} /> : null}<Text style={{ marginLeft: isLoadingOlder ? 6 : 0, color: colors.muted, fontSize: 11, fontWeight: "700" }}>Предыдущие сообщения</Text></Pressable> : null}
            ListEmptyComponent={<View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }}><MessageCircle size={31} color={colors.muted} /><Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: 10 }}>Сообщений пока нет</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Начните разговор первым.</Text></View>}
            renderItem={({ item, index }) => {
              const own = isMessageFromActor(item, contacts?.me);
              const replied = item.replyToMessageId ? messagesById.get(Number(item.replyToMessageId)) : null;
              const messageDateKey = chatDateKey(item.createdAt);
              const previousDateKey = index > 0 ? chatDateKey(messages[index - 1]?.createdAt) : "";
              const showDateSeparator = index === 0 || messageDateKey !== previousDateKey;
              return (
                <View style={{ width: "100%" }}>
                  {showDateSeparator ? (
                    <View accessibilityRole="text" accessibilityLabel={formatMessageDayLabel(item.createdAt)} style={{ flexDirection: "row", alignItems: "center", marginTop: index === 0 ? 2 : 8, marginBottom: 10 }}>
                      <View style={{ height: 1, flex: 1, backgroundColor: border }} />
                      <View style={{ marginHorizontal: 9, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: colors.surface }}>
                        <Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "700" }}>{formatMessageDayLabel(item.createdAt)}</Text>
                      </View>
                      <View style={{ height: 1, flex: 1, backgroundColor: border }} />
                    </View>
                  ) : null}
                <View style={{ width: "100%", alignItems: own ? "flex-end" : "flex-start", marginBottom: 7 }}>
                  <Pressable onLongPress={() => { if (!item.deletedAt) setMessageMenu(item); }} delayLongPress={330} style={{ maxWidth: "84%", minWidth: 88, paddingHorizontal: 11, paddingTop: 7, paddingBottom: 5, borderRadius: 13, borderBottomRightRadius: own ? 4 : 13, borderBottomLeftRadius: own ? 13 : 4, borderWidth: own ? 0 : 1, borderColor: border, backgroundColor: own ? "#174B78" : colors.surface }}>
                    {!own ? <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 10.5, fontWeight: "700", marginBottom: 3 }}>{item.senderName} · {item.senderType === "manager" ? "Менеджер" : "Курьер"}</Text> : null}
                    {replied ? <View style={{ marginBottom: 5, paddingLeft: 7, borderLeftWidth: 3, borderLeftColor: own ? "rgba(255,255,255,0.45)" : colors.primary }}><Text numberOfLines={1} style={{ color: own ? "rgba(255,255,255,0.78)" : colors.primary, fontSize: 10, fontWeight: "700" }}>{replied.senderName}</Text><Text numberOfLines={2} style={{ color: own ? "rgba(255,255,255,0.70)" : colors.muted, fontSize: 10 }}>{replied.deletedAt ? "Сообщение удалено" : replied.text}</Text></View> : null}
                    <Text style={{ color: item.deletedAt ? (own ? "rgba(255,255,255,0.55)" : colors.muted) : (own ? "#F5F9FF" : colors.foreground), fontSize: 13, lineHeight: 18, fontStyle: item.deletedAt ? "italic" : "normal" }}>{item.deletedAt ? "Сообщение удалено" : item.text}</Text>
                    <View style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", marginTop: 2 }}><Text style={{ color: own ? "rgba(235,245,255,0.68)" : colors.muted, fontSize: 9.5 }}>{formatTime(item.createdAt)}{item.editedAt ? " · изменено" : ""}</Text>{own && !item.deletedAt ? (Number(item.readCount) > 0 ? <CheckCheck size={13} color="#72B5FF" style={{ marginLeft: 3 }} /> : Number(item.deliveredCount) > 0 ? <CheckCheck size={13} color="rgba(235,245,255,0.68)" style={{ marginLeft: 3 }} /> : <Check size={13} color="rgba(235,245,255,0.68)" style={{ marginLeft: 3 }} />) : null}</View>
                  </Pressable>
                </View>
                </View>
              );
            }}
          />
        )}

        {error ? <Pressable onPress={() => setError(null)} style={{ paddingHorizontal: 12, paddingVertical: 5 }}><Text style={{ color: "#DC2626", fontSize: 11, textAlign: "center" }}>{error}</Text></Pressable> : null}
        {editing || replyTo ? <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 11, paddingVertical: 7, borderTopWidth: 1, borderTopColor: border, backgroundColor: colors.surface }}><View style={{ flex: 1 }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{editing ? "Редактирование сообщения" : `Ответ: ${replyTo?.senderName || ""}`}</Text><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10.5, marginTop: 2 }}>{(editing || replyTo)?.text}</Text></View><Pressable onPress={() => { setEditing(null); setReplyTo(null); setDraft(""); }} style={{ padding: 8 }}><X size={18} color={colors.muted} /></Pressable></View> : null}

        <View style={{ minHeight: 58, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 7, paddingBottom: inputBottomPadding, marginBottom: inputBottomGap, borderTopWidth: 1, borderTopColor: border, backgroundColor: colors.background }}>
          <View style={{ flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: colors.surface }}><TextInput value={draft} onChangeText={setDraft} placeholder={editing ? "Изменить сообщение" : "Сообщение"} placeholderTextColor={colors.muted} multiline maxLength={4000} style={{ minHeight: 40, maxHeight: 94, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, fontSize: 13, lineHeight: 18 }} /></View>
          <Pressable onPress={() => void sendMessage()} disabled={!draft.trim() || isSending} style={({ pressed }) => ({ width: 42, height: 42, marginLeft: 7, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: pressed || !draft.trim() || isSending ? 0.45 : 1 })}>{isSending ? <ActivityIndicator color="#fff" size="small" /> : <Send size={18} color="#fff" />}</Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={messageMenu != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setMessageMenu(null); setDeleteConfirmation(false); }}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(15,23,42,0.32)" }}><Pressable onPress={() => { setMessageMenu(null); setDeleteConfirmation(false); }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
          {messageMenu ? <View style={{ borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: border }}>
            {deleteConfirmation ? <View style={{ padding: 18 }}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800" }}>Удалить сообщение?</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>Участники увидят отметку «Сообщение удалено».</Text><View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 16, gap: 8 }}><Pressable onPress={() => setDeleteConfirmation(false)} style={{ paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ color: colors.muted, fontWeight: "700" }}>Отмена</Text></Pressable><Pressable onPress={() => void deleteMessage()} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: "#DC2626" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Удалить</Text></Pressable></View></View> : <>
              {!messageMenu.deletedAt ? <MenuRow icon={<Reply size={18} color={colors.foreground} />} label="Ответить" colors={colors} onPress={() => beginReply(messageMenu)} /> : null}
              {contacts?.me.type === messageMenu.senderType && Number(contacts.me.id) === Number(messageMenu.senderId) && !messageMenu.deletedAt ? <MenuRow icon={<Edit3 size={18} color={colors.foreground} />} label="Изменить" colors={colors} onPress={() => beginEdit(messageMenu)} /> : null}
              {contacts?.me.type === messageMenu.senderType && Number(contacts.me.id) === Number(messageMenu.senderId) && !messageMenu.deletedAt ? <MenuRow icon={<Trash2 size={18} color="#DC2626" />} label="Удалить" danger colors={colors} onPress={() => setDeleteConfirmation(true)} /> : null}
            </>}
          </View> : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ContactRow({ contact, loading, colors, border, onPress }: { contact: ChatV2Actor; loading: boolean; colors: any; border: string; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, opacity: pressed || loading ? 0.55 : 1 })}><View style={{ width: 43, height: 43, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: contact.type === "manager" ? "rgba(124,58,237,0.12)" : "rgba(29,111,242,0.12)" }}><Text style={{ color: contact.type === "manager" ? "#7C3AED" : colors.primary, fontSize: 16, fontWeight: "800" }}>{contact.name.charAt(0).toUpperCase()}</Text></View><View style={{ flex: 1, marginLeft: 11, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: border }}><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>{contact.name}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{contact.type === "manager" ? "Менеджер" : "Курьер"}</Text></View>{loading ? <ActivityIndicator color={colors.primary} /> : <MessageCircle size={18} color={colors.muted} />}</Pressable>;
}

function MenuRow({ icon, label, danger, colors, onPress }: { icon: React.ReactNode; label: string; danger?: boolean; colors: any; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 17, paddingVertical: 14, backgroundColor: pressed ? "rgba(148,163,184,0.12)" : colors.surface })}>{icon}<Text style={{ color: danger ? "#DC2626" : colors.foreground, fontSize: 15, fontWeight: "700" }}>{label}</Text></Pressable>;
}
