import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useRouter } from "expo-router";
import { NetworkBanner } from "@/components/network-banner";
import { trpc } from "@/lib/trpc";
import { useCourierAuth } from "@/lib/courier-auth";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { DESIGN_PREVIEW_TOKEN, designPreviewMails } from "@/lib/design-preview";
import { CalendarDays, CheckCircle2, Circle, FileText, Search, UserRound, X } from "lucide-react-native";

function formatDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeInput(value: string): Date | null {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizePhoneForDial(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^+\d]/g, "");
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function groupLabel(value?: string | Date | null) {
  if (!value) return "Без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Без даты";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function shortTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function LettersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useCourierAuth();
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const border = dark ? "rgba(148,163,184,0.18)" : colors.border;
  const soft = dark ? "rgba(148,163,184,0.07)" : "#F8FAFC";

  const [search, setSearch] = useState("");
  const [selectedDate] = useState(new Date());
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [selectedMailIds, setSelectedMailIds] = useState<number[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [deliveredAtInput, setDeliveredAtInput] = useState(formatDateTimeInput(new Date()));
  const [deliveryTimeError, setDeliveryTimeError] = useState("");
  const longPressHandledRef = useRef(false);

  const isDeliveryModalOpen = selectedMailId !== null;
  const { data: mailsRaw = [], refetch } = trpc.mails.all.useQuery(
    { token: token || "" },
    { enabled: !!token && !isDesignPreview, refetchInterval: isDeliveryModalOpen || isDesignPreview ? false : 5000 },
  );
  const mails = isDesignPreview ? designPreviewMails : mailsRaw;

  useMobileLiveSync({ enabled: !isDeliveryModalOpen && !isDesignPreview, onSync: useCallback(() => refetch(), [refetch]) });

  const deliverMutation = (trpc.mails as any).deliver.useMutation({
    onSuccess: () => refetch(),
  });

  const groupedMails = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedDateKey = selectedDate.toISOString().slice(0, 10);
    const todayKey = new Date().toISOString().slice(0, 10);

    const filtered = mails.filter((mail: any) => {
      const matchesSearch =
        !q ||
        mail.waybillNumber?.toLowerCase().includes(q) ||
        mail.recipientName?.toLowerCase().includes(q) ||
        mail.recipientPhone?.toLowerCase().includes(q) ||
        mail.deliveryAddress?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const delivered = mail.status === "delivered";

      if (!delivered) {
        return selectedDateKey === todayKey;
      }

      const deliveredKey = String(mail.deliveredAt || "").slice(0, 10);

      return deliveredKey === selectedDateKey;
    });

    const rows: Array<{ type: "header"; title: string } | { type: "mail"; mail: any }> = [];
    let current = "";
    filtered.forEach((mail: any) => {
      const delivered = mail.status === "delivered";
      const label = delivered ? groupLabel(mail.deliveredAt) : "Сегодня";
      if (label !== current) {
        current = label;
        rows.push({ type: "header", title: label });
      }
      rows.push({ type: "mail", mail });
    });
    return rows;
  }, [mails, search, selectedDate]);

  const callRecipient = async (phone?: string | null) => {
    const normalizedPhone = normalizePhoneForDial(phone);
    if (!normalizedPhone) return;
    try {
      await Linking.openURL(`tel:${normalizedPhone}`);
    } catch (error) {
      console.warn("[Letters] Failed to open dialer", error);
    }
  };

  const openDeliveryModal = (mailIds: number[]) => {
    if (!mailIds.length) return;
    setSelectedMailIds(mailIds);
    setSelectedMailId(mailIds[0]);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  const closeDeliveryModal = () => {
    setSelectedMailId(null);
    setSelectedMailIds([]);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  const confirmDelivery = async () => {
    const mailIds = selectedMailIds.length ? selectedMailIds : selectedMailId ? [selectedMailId] : [];
    if (!mailIds.length || !recipientName.trim()) return;
    const deliveredAt = parseDateTimeInput(deliveredAtInput);
    if (!deliveredAt) {
      setDeliveryTimeError("Введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ");
      return;
    }
    if (isDesignPreview) {
      closeDeliveryModal();
      return;
    }
    if (!token) return;
    for (const mailId of mailIds) {
      await deliverMutation.mutateAsync({ token, mailId, recipientSignature: recipientName.trim(), deliveredAt } as any);
    }
    closeDeliveryModal();
    refetch();
  };

  const toggleMailSelection = (mailId: number) => {
    setSelectedMailIds((current) => current.includes(mailId) ? current.filter((id) => id !== mailId) : [...current, mailId]);
  };

  const selectionMode = selectedMailIds.length > 0 && selectedMailId === null;

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <HeaderBarV2
        title="Письма"
        onProfilePress={() => router.push("/profile" as never)}
        selectedDate={selectedDate}
        showDate
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, backgroundColor: colors.background }}>
        <View style={{ height: 38, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: border, paddingHorizontal: 12 }}>
          <Search size={17} color={colors.muted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Накладная, получатель или адрес"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, height: 38, paddingHorizontal: 9, paddingVertical: 0, color: colors.foreground, fontSize: 12 }}
          />
        </View>
      </View>

      <FlatList
        data={groupedMails}
        keyExtractor={(item: any, index) => item.type === "header" ? `h-${item.title}-${index}` : `m-${item.mail.id}`}
        contentContainerStyle={{ paddingBottom: 150, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: border }}
        ListFooterComponent={<View style={{ height: 90 }} />}
        renderItem={({ item }: any) => {
          if (item.type === "header") {
            if (item.title === "Сегодня") return null;
            return <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", paddingHorizontal: 16, paddingTop: 9, paddingBottom: 6 }}>{item.title}</Text>;
          }

          const mail = item.mail;
          const delivered = mail.status === "delivered";
          const hasPhone = Boolean(normalizePhoneForDial(mail.recipientPhone));
          const selected = selectedMailIds.includes(mail.id);

          return (
            <Pressable
              onLongPress={() => {
                if (delivered) return;
                longPressHandledRef.current = true;
                setSelectedMailId(null);
                toggleMailSelection(mail.id);
              }}
              delayLongPress={350}
              onPress={() => {
                if (delivered) return;
                if (longPressHandledRef.current) {
                  longPressHandledRef.current = false;
                  return;
                }
                if (selectionMode) {
                  toggleMailSelection(mail.id);
                  return;
                }
                openDeliveryModal([mail.id]);
              }}
              style={({ pressed }) => ({
                minHeight: 73,
                backgroundColor: selected ? "rgba(59,130,246,0.10)" : pressed ? colors.surface : colors.background,
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: border,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <View style={{ width: 48, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: border }}>
                <FileText size={21} color={colors.muted} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, lineHeight: 18, fontWeight: "700", flex: 1 }}>
                    Письмо №-{mail.waybillNumber}
                    {mail.recipientName ? <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}>  {mail.recipientName}</Text> : null}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 10 }}>{shortTime(mail.deliveredAt || mail.createdAt)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, lineHeight: 17, fontWeight: "600", flex: 1 }}>
                    {mail.recipientName || "—"}
                    <Text style={{ color: colors.muted, fontWeight: "400" }}>  {mail.deliveryAddress || "—"}</Text>
                  </Text>
                  {selected ? (
                    <CheckCircle2 size={17} color={colors.primary} strokeWidth={2.4} />
                  ) : delivered ? (
                    <CheckCircle2 size={17} color={colors.success} strokeWidth={2.2} />
                  ) : (
                    <Circle size={17} color={colors.primary} strokeWidth={2.2} />
                  )}
                </View>
                {delivered ? (
                  <Text numberOfLines={1} style={{ color: colors.muted, marginTop: 3, fontSize: 11, lineHeight: 16 }}>
                    Получил: {mail.recipientSignature || mail.recipientName || "—"}{mail.courierName ? `  ·  ${mail.courierName}` : ""}
                  </Text>
                ) : hasPhone ? (
                  <Pressable onPress={() => callRecipient(mail.recipientPhone)}>
                    <Text style={{ color: colors.primary, marginTop: 3, fontSize: 11, lineHeight: 16 }}>{mail.recipientPhone}</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      {selectionMode ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 94,
            zIndex: 20,
            minHeight: 54,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: border,
          }}
        >
          <Pressable onPress={() => setSelectedMailIds([])} hitSlop={8}>
            <X size={20} color={colors.muted} />
          </Pressable>
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "700", marginLeft: 12 }}>
            Выбрано: {selectedMailIds.length}
          </Text>
          <Pressable
            onPress={() => openDeliveryModal(selectedMailIds)}
            style={{ minHeight: 36, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Вручить</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={selectedMailId !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "position"}
          keyboardVerticalOffset={Platform.OS === "android" ? 12 : 0}
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", padding: 16, paddingBottom: 86 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 16, textAlign: "center", fontWeight: "700", color: colors.foreground, marginBottom: 3 }}>Кто получил?</Text>
            {selectedMailIds.length > 1 ? (
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginBottom: 10 }}>
                Будет отмечено писем: {selectedMailIds.length}
              </Text>
            ) : <View style={{ height: 10 }} />}
            <View style={{ height: 42, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: colors.background, paddingHorizontal: 11 }}>
              <UserRound size={17} color={colors.muted} />
              <TextInput
                autoFocus
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="Введите ФИО"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
                style={{ flex: 1, height: 42, paddingHorizontal: 10, paddingVertical: 0, color: colors.foreground, fontSize: 12 }}
              />
            </View>
            <View style={{ height: 42, flexDirection: "row", alignItems: "center", marginTop: 9, borderRadius: 8, borderWidth: 1, borderColor: deliveryTimeError ? colors.error : border, backgroundColor: colors.background, paddingHorizontal: 11 }}>
              <CalendarDays size={17} color={colors.muted} />
              <TextInput value={deliveredAtInput} onChangeText={(value) => { setDeliveredAtInput(value); setDeliveryTimeError(""); }} placeholder="ДД.ММ.ГГГГ ЧЧ:ММ" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={{ flex: 1, height: 42, paddingHorizontal: 10, paddingVertical: 0, color: colors.foreground, fontSize: 12 }} />
              <Pressable onPress={() => setDeliveredAtInput("")} hitSlop={8}><X size={16} color={colors.muted} /></Pressable>
            </View>
            {deliveryTimeError ? <Text style={{ color: colors.error, marginTop: 8, fontWeight: "800" }}>{deliveryTimeError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={closeDeliveryModal} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: soft, alignItems: "center", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelivery}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", opacity: deliverMutation.isPending || !recipientName.trim() ? 0.62 : 1 }}
              >
                <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>{deliverMutation.isPending ? "Сохраняю..." : "Подтвердить"}</Text>
              </Pressable>
            </View>
          </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}
