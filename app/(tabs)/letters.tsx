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

export default function LettersScreen() {
  const colors = useColors();
  const { token } = useCourierAuth();
  const { isOnline } = useNetworkStatus();

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

  const deliverMutation = trpc.mails.deliver.useMutation({
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
    <ScreenContainer className="p-4">
      <NetworkBanner visible={!isOnline} />

      <View style={{ gap: 12 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: colors.foreground,
          }}
        >
          Письма
        </Text>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по накладной"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderWidth: 1,
            borderColor: colors.border,
            color: colors.foreground,
          }}
        />

        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            ["all", "Все"],
            ["not_delivered", "Не вручено"],
            ["delivered", "Вручено"],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value as any)}
              style={{
                backgroundColor:
                  filter === value ? colors.primary : colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor:
                  filter === value ? colors.primary : colors.border,
              }}
            >
              <Text
                style={{
                  color:
                    filter === value ? "white" : colors.foreground,
                  fontWeight: "600",
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredMails}
        keyExtractor={(item: any) => item.id.toString()}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}
        renderItem={({ item }: any) => {
          const delivered = item.status === "delivered";
          const hasPhone = Boolean(normalizePhoneForDial(item.recipientPhone));

          return (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 22,
                padding: 18,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.foreground,
                  }}
                >
                  #{item.waybillNumber}
                </Text>

                <View
                  style={{
                    backgroundColor: delivered
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(249,115,22,0.15)",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      color: delivered ? "#16a34a" : "#f97316",
                      fontWeight: "700",
                    }}
                  >
                    {delivered ? "Вручено" : "В пути"}
                  </Text>
                </View>
              </View>

              <Text style={{ color: colors.muted, marginBottom: 4 }}>
                Получатель
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  fontSize: 16,
                  fontWeight: "600",
                  marginBottom: 12,
                }}
              >
                {item.recipientName || "—"}
              </Text>

              <Text style={{ color: colors.muted, marginBottom: 4 }}>
                Телефон
              </Text>
              {hasPhone ? (
                <Pressable onPress={() => callRecipient(item.recipientPhone)} style={{ marginBottom: 12 }}>
                  <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>
                    {item.recipientPhone}
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ color: colors.foreground, marginBottom: 12 }}>—</Text>
              )}

              <Text style={{ color: colors.muted, marginBottom: 4 }}>
                Адрес
              </Text>
              <Text
                style={{
                  color: colors.foreground,
                  lineHeight: 22,
                }}
              >
                {item.deliveryAddress}
              </Text>

              {delivered ? (
                <View style={{ marginTop: 16, gap: 4 }}>
                  <Text style={{ color: colors.muted }}>
                    Получил: {item.recipientSignature || "—"}
                  </Text>
                  <Text style={{ color: colors.muted }}>
                    Время вручения: {formatDeliveredAt(item.deliveredAt)}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => openDeliveryModal(item.id)}
                  style={{
                    marginTop: 18,
                    backgroundColor: colors.primary,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight: "700",
                      fontSize: 16,
                    }}
                  >
                    Вручено
                  </Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />

      <Modal visible={selectedMailId !== null} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: colors.background,
              borderRadius: 24,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: colors.foreground,
                marginBottom: 16,
              }}
            >
              Кто получил?
            </Text>

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
                borderColor: colors.border,
                color: colors.foreground,
              }}
            />

            <Text style={{ color: colors.muted, marginTop: 14, marginBottom: 6 }}>
              Дата и время вручения
            </Text>
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
                borderColor: deliveryTimeError ? colors.error : colors.border,
                color: colors.foreground,
              }}
            />

            {deliveryTimeError ? (
              <Text style={{ color: colors.error, marginTop: 8 }}>
                {deliveryTimeError}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable
                onPress={() => {
                  setSelectedMailId(null);
                  setDeliveryTimeError("");
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "700" }}>
                  Отмена
                </Text>
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
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  opacity: deliverMutation.isPending ? 0.7 : 1,
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  {deliverMutation.isPending ? "Сохраняю..." : "Подтвердить"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
