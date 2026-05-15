import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Linking,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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
  const parsed = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDeliveredAt(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDateTimeInput(date);
}

function normalizePhoneForDial(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^+\d]/g, "");
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

export default function LettersScreen() {
  const colors = useColors();
  const { token } = useCourierAuth();
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const cardBorder = dark ? "rgba(148,163,184,0.20)" : colors.border;
  const softSurface = dark ? "rgba(148,163,184,0.08)" : "#F8FAFC";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "delivered" | "not_delivered">("all");
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [deliveredAtInput, setDeliveredAtInput] = useState(formatDateTimeInput(new Date()));
  const [deliveryTimeError, setDeliveryTimeError] = useState("");

  const { data: mails = [], refetch } = trpc.mails.all.useQuery(
    { token: token || "" },
    { enabled: !!token, refetchInterval: 5000 }
  );

  useMobileLiveSync({
    enabled: !!token,
    onSync: useCallback(() => refetch(), [refetch]),
  });

  const deliverMutation = (trpc.mails as any).deliver.useMutation({
    onSuccess: () => {
      setSelectedMailId(null);
      setRecipientName("");
      setDeliveryTimeError("");
      setDeliveredAtInput(formatDateTimeInput(new Date()));
      refetch();
    },
  });

  const filteredMails = useMemo(() => {
    return mails.filter((mail: any) => {
      const matchesSearch =
        mail.waybillNumber?.toLowerCase().includes(search.toLowerCase()) ||
        mail.recipientName?.toLowerCase().includes(search.toLowerCase()) ||
        mail.recipientPhone?.toLowerCase().includes(search.toLowerCase()) ||
        mail.deliveryAddress?.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "delivered"
          ? mail.status === "delivered"
          : mail.status !== "delivered";

      return matchesSearch && matchesFilter;
    });
  }, [mails, search, filter]);

  const openDeliveryModal = (mailId: number) => {
    setSelectedMailId(mailId);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  const callRecipient = async (phone?: string | null) => {
    const normalizedPhone = normalizePhoneForDial(phone);
    if (!normalizedPhone) return;

    try {
      await Linking.openURL(`tel:${normalizedPhone}`);
    } catch (error) {
      console.warn("[Letters] Failed to open dialer", error);
    }
  };

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12, backgroundColor: colors.background }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: cardBorder, padding: 16 }}>
          <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>Письма</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, fontWeight: "700" }}>
            Вручение и подтверждение получателя
          </Text>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по накладной, получателю, телефону"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 18,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: cardBorder,
            color: colors.foreground,
            fontSize: 15,
            fontWeight: "700",
          }}
        />

        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["all", "Все"],
            ["not_delivered", "Не вручено"],
            ["delivered", "Вручено"],
          ].map(([value, label]) => {
            const active = filter === value;
            return (
              <Pressable
                key={value}
                onPress={() => setFilter(value as any)}
                style={{
                  backgroundColor: active ? colors.primary : colors.surface,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : cardBorder,
                }}
              >
                <Text
                  style={{
                    color: active ? "white" : colors.foreground,
                    fontWeight: "900",
                    fontSize: 13,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        data={filteredMails}
        keyExtractor={(item: any) => item.id.toString()}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 128, backgroundColor: colors.background }}
        renderItem={({ item }: any) => {
          const delivered = item.status === "delivered";
          const hasPhone = Boolean(normalizePhoneForDial(item.recipientPhone));

          return (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 22,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: cardBorder,
                shadowColor: dark ? "#020617" : "#94A3B8",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: dark ? 0.26 : 0.12,
                shadowRadius: 18,
                elevation: 5,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>#{item.waybillNumber}</Text>

                <View
                  style={{
                    backgroundColor: delivered
                      ? dark ? "rgba(34,197,94,0.16)" : "#DCFCE7"
                      : dark ? "rgba(249,115,22,0.16)" : "#FFEDD5",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: delivered ? "#16a34a" : "#f97316", fontWeight: "900", fontSize: 12 }}>
                    {delivered ? "Вручено" : "В пути"}
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: softSurface, borderRadius: 18, padding: 12, gap: 10 }}>
                <View>
                  <Text style={{ color: colors.muted, marginBottom: 4, fontWeight: "800", fontSize: 12 }}>Получатель</Text>
                  <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900" }}>{item.recipientName || "—"}</Text>
                </View>

                <View>
                  <Text style={{ color: colors.muted, marginBottom: 4, fontWeight: "800", fontSize: 12 }}>Телефон</Text>
                  {hasPhone ? (
                    <Pressable onPress={() => callRecipient(item.recipientPhone)}>
                      <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "900" }}>{item.recipientPhone}</Text>
                    </Pressable>
                  ) : (
                    <Text style={{ color: colors.foreground, fontWeight: "700" }}>—</Text>
                  )}
                </View>

                <View>
                  <Text style={{ color: colors.muted, marginBottom: 4, fontWeight: "800", fontSize: 12 }}>Адрес</Text>
                  <Text style={{ color: colors.foreground, lineHeight: 21, fontWeight: "700" }}>{item.deliveryAddress}</Text>
                </View>
              </View>

              {delivered ? (
                <View style={{ marginTop: 14, gap: 4, paddingHorizontal: 2 }}>
                  <Text style={{ color: colors.muted, fontWeight: "700" }}>Получил: {item.recipientSignature || "—"}</Text>
                  <Text style={{ color: colors.muted, fontWeight: "700" }}>Время вручения: {formatDeliveredAt(item.deliveredAt)}</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => openDeliveryModal(item.id)}
                  style={{
                    marginTop: 16,
                    backgroundColor: colors.primary,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Вручено</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <Modal visible={selectedMailId !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 26, padding: 20, borderWidth: 1, borderColor: cardBorder }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>Кто получил?</Text>

            <TextInput
              value={recipientName}
              onChangeText={setRecipientName}
              placeholder="Введите ФИО"
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor: cardBorder,
                color: colors.foreground,
                fontWeight: "700",
              }}
            />

            <Text style={{ color: colors.muted, marginTop: 14, marginBottom: 6, fontWeight: "800" }}>Дата и время вручения</Text>
            <TextInput
              value={deliveredAtInput}
              onChangeText={(value) => {
                setDeliveredAtInput(value);
                setDeliveryTimeError("");
              }}
              placeholder="ДД.ММ.ГГГГ ЧЧ:ММ"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor: deliveryTimeError ? colors.error : cardBorder,
                color: colors.foreground,
                fontWeight: "700",
              }}
            />

            {deliveryTimeError ? <Text style={{ color: colors.error, marginTop: 8, fontWeight: "800" }}>{deliveryTimeError}</Text> : null}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable
                onPress={() => {
                  setSelectedMailId(null);
                  setDeliveryTimeError("");
                }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", borderWidth: 1, borderColor: cardBorder }}
              >
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

                  deliverMutation.mutate({
                    token,
                    mailId: selectedMailId,
                    recipientSignature: recipientName.trim(),
                    deliveredAt,
                  } as any);
                }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", opacity: deliverMutation.isPending ? 0.7 : 1 }}
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
