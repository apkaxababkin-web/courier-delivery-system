import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Linking, Modal, Pressable, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { NetworkBanner } from "@/components/network-banner";
import { trpc } from "@/lib/trpc";
import { useCourierAuth } from "@/lib/courier-auth";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";

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

function localDateKey(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Irkutsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isMailDelivered(mail: any) {
  return ["delivered", "completed", "done"].includes(String(mail.status || "").toLowerCase());
}

function mailDeliveredDate(mail: any) {
  return mail.deliveredAt || mail.receivedAt || mail.completedAt || mail.updatedAt || null;
}

export default function LettersScreen() {
  const colors = useColors();
  const { token } = useCourierAuth();
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const border = dark ? "rgba(148,163,184,0.18)" : colors.border;
  const soft = dark ? "rgba(148,163,184,0.07)" : "#F8FAFC";

  const [search, setSearch] = useState("");
  const [selectedDate] = useState(new Date());
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [deliveredAtInput, setDeliveredAtInput] = useState(formatDateTimeInput(new Date()));
  const [deliveryTimeError, setDeliveryTimeError] = useState("");

  const { data: mails = [], refetch } = trpc.mails.all.useQuery({ token: token || "" }, { enabled: true, refetchInterval: 5000 });

  useMobileLiveSync({ enabled: true, onSync: useCallback(() => refetch(), [refetch]) });

  const deliverMutation = (trpc.mails as any).deliver.useMutation({
    onSuccess: () => {
      setSelectedMailId(null);
      setRecipientName("");
      setDeliveryTimeError("");
      setDeliveredAtInput(formatDateTimeInput(new Date()));
      refetch();
    },
  });

  const undoDeliveryMutation = (trpc.mails as any).undoDelivery.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const confirmUndoDelivery = (mailId: number) => {
    if (!token || undoDeliveryMutation.isPending) return;

    Alert.alert(
      "Вернуть письмо в недоставленные?",
      "Отметка доставки будет отменена, письмо снова появится в списке к доставке.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Вернуть",
          style: "destructive",
          onPress: () => undoDeliveryMutation.mutate({ token, mailId }),
        },
      ],
    );
  };

  const groupedMails = useMemo(() => {
    const q = search.trim().toLowerCase();
    const todayKey = localDateKey(new Date());

    const filtered = mails.filter((mail: any) => {
      const matchesSearch =
        !q ||
        mail.waybillNumber?.toLowerCase().includes(q) ||
        mail.recipientName?.toLowerCase().includes(q) ||
        mail.recipientPhone?.toLowerCase().includes(q) ||
        mail.deliveryAddress?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const delivered = isMailDelivered(mail);
      if (!delivered) return true;

      return localDateKey(mailDeliveredDate(mail)) === todayKey;
    });

    const rows: Array<{ type: "header"; title: string } | { type: "mail"; mail: any }> = [];
    let current = "";
    filtered.forEach((mail: any) => {
      const delivered = isMailDelivered(mail);
      const label = delivered ? groupLabel(mailDeliveredDate(mail)) : "К доставке";
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

  const openDeliveryModal = (mailId: number) => {
    setSelectedMailId(mailId);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground, marginBottom: 12 }}>Письма</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по № накладной или адресу"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            paddingHorizontal: 15,
            paddingVertical: 13,
            borderWidth: 1,
            borderColor: border,
            color: colors.foreground,
            fontSize: 12,
            fontWeight: "700",
          }}
        />
      </View>

      <FlatList
        data={groupedMails}
        keyExtractor={(item: any, index) => item.type === "header" ? `h-${item.title}-${index}` : `m-${item.mail.id}`}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 220, backgroundColor: colors.background }}
        ListFooterComponent={<View style={{ height: 260 }} />}
        renderItem={({ item }: any) => {
          if (item.type === "header") {
            return <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "900", marginTop: 10, marginBottom: 8 }}>{item.title}</Text>;
          }

          const mail = item.mail;
          const delivered = isMailDelivered(mail);
          const hasPhone = Boolean(normalizePhoneForDial(mail.recipientPhone));

          return (
            <Pressable
              onPress={() => !delivered && openDeliveryModal(mail.id)}
              style={({ pressed }) => ({
                backgroundColor: colors.surface,
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: border,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900" }}>Письмо №-{mail.waybillNumber}</Text>
                  <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12, fontWeight: "700" }}>{mail.recipientName || "—"}</Text>
                  <Text style={{ color: colors.muted, marginTop: 3, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{mail.deliveryAddress || "—"}</Text>
                  {hasPhone && (
                    <Pressable onPress={() => callRecipient(mail.recipientPhone)}>
                      <Text style={{ color: colors.primary, marginTop: 5, fontSize: 12, fontWeight: "900" }}>{mail.recipientPhone}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <View style={{ backgroundColor: delivered ? "rgba(34,197,94,0.16)" : "rgba(59,130,246,0.14)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                    <Text style={{ color: delivered ? "#22C55E" : colors.primary, fontSize: 11, fontWeight: "900" }}>{delivered ? "Получено" : "В пути"}</Text>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>{shortTime(mailDeliveredDate(mail) || mail.createdAt)}</Text>
                </View>
              </View>
              {delivered && (
                <Pressable
                  onPress={() => confirmUndoDelivery(mail.id)}
                  disabled={undoDeliveryMutation.isPending}
                  style={{
                    marginTop: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.error,
                    paddingVertical: 10,
                    alignItems: "center",
                    opacity: undoDeliveryMutation.isPending ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: "900" }}>
                    {undoDeliveryMutation.isPending ? "Возвращаю..." : "Вернуть в недоставленные"}
                  </Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      <Modal visible={selectedMailId !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 18, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 14 }}>Кто получил?</Text>
            <TextInput value={recipientName} onChangeText={setRecipientName} placeholder="Введите ФИО" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: border, color: colors.foreground, fontWeight: "700" }} />
            <Text style={{ color: colors.muted, marginTop: 12, marginBottom: 6, fontWeight: "800" }}>Дата и время вручения</Text>
            <TextInput value={deliveredAtInput} onChangeText={(value) => { setDeliveredAtInput(value); setDeliveryTimeError(""); }} placeholder="ДД.ММ.ГГГГ ЧЧ:ММ" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: deliveryTimeError ? colors.error : border, color: colors.foreground, fontWeight: "700" }} />
            {deliveryTimeError ? <Text style={{ color: colors.error, marginTop: 8, fontWeight: "800" }}>{deliveryTimeError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => { setSelectedMailId(null); setDeliveryTimeError(""); }} style={{ flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: soft, alignItems: "center", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!token || !selectedMailId || !recipientName.trim()) return;
                  const deliveredAt = parseDateTimeInput(deliveredAtInput);
                  if (!deliveredAt) {
                    setDeliveryTimeError("Введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ");
                    return;
                  }
                  deliverMutation.mutate({ token, mailId: selectedMailId, recipientSignature: recipientName.trim(), deliveredAt } as any);
                }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", opacity: deliverMutation.isPending ? 0.7 : 1 }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>{deliverMutation.isPending ? "Сохраняю..." : "Подтвердить"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
