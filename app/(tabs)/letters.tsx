import { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useCourierAuth } from "@/lib/courier-auth";
import { useColors } from "@/hooks/use-colors";

export default function LettersScreen() {
  const colors = useColors();
  const { token } = useCourierAuth();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "delivered" | "not_delivered">("all");
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState("");

  const { data: mails = [], refetch } = trpc.mails.all.useQuery(
    { token: token || "" },
    { enabled: !!token, refetchInterval: 5000 }
  );

  const deliverMutation = trpc.mails.deliver.useMutation({
    onSuccess: () => {
      setSelectedMailId(null);
      setRecipientName("");
      refetch();
    },
  });

  const filteredMails = useMemo(() => {
    return mails.filter((mail: any) => {
      const matchesSearch =
        mail.waybillNumber?.toLowerCase().includes(search.toLowerCase()) ||
        mail.recipientName?.toLowerCase().includes(search.toLowerCase()) ||
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

  return (
    <ScreenContainer className="p-4">
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
                {item.recipientName}
              </Text>

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
                <View style={{ marginTop: 16 }}>
                  <Text style={{ color: colors.muted }}>
                    Получил: {item.recipientSignature || "—"}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => setSelectedMailId(item.id)}
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

            <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
              <Pressable
                onPress={() => setSelectedMailId(null)}
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

                  deliverMutation.mutate({
                    token,
                    mailId: selectedMailId,
                    recipientSignature: recipientName.trim(),
                  });
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 16,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "700" }}>
                  Подтвердить
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
