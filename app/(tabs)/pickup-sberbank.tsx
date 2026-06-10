import { Alert, Pressable, ScrollView, Text, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { skipToken } from "@tanstack/react-query";
import { ScreenContainer } from "@/components/screen-container";
import { NetworkBanner } from "@/components/network-banner";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useCallback, useState } from "react";
import * as Haptics from "expo-haptics";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";

interface PickupPoint {
  id: number;
  name: string;
  address: string;
  isPicked: boolean;
  pickedAt: Date | null;
  courierName?: string;
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function formatTime(date: Date | null) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function SberbankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useCourierAuth();
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const border = dark ? "rgba(148,163,184,0.18)" : colors.border;
  const soft = dark ? "rgba(148,163,184,0.07)" : "#F8FAFC";
  const pickedBg = dark ? "rgba(34,197,94,0.10)" : "#F0FDF4";
  const selectedBg = dark ? "rgba(59,130,246,0.12)" : "#EFF6FF";

  const [selectedDate] = useState(new Date());
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const queryInput = token ? { token, date: selectedDate } : skipToken;

  const { data: pickupPoints = [], isLoading, refetch } = trpc.sberbank.pickupPoints.useQuery(queryInput);

  const { data: pickedCount = 0, refetch: refetchCount } = trpc.sberbank.pickedCount.useQuery(queryInput);

  useMobileLiveSync({
    enabled: true,
    onSync: useCallback(() => {
      if (!token) return;
      return Promise.all([refetch(), refetchCount()]);
    }, [token, refetch, refetchCount]),
  });

  const toggleMutation = trpc.sberbank.togglePickup.useMutation({
    onSuccess: () => {
      refetch();
      refetchCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleTogglePickup = (point: PickupPoint) => {
    if (!token || toggleMutation.isPending) return;

    if (!point.isPicked) {
      setSelectedPointId(point.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleMutation.mutate({ token, pointId: point.id, date: selectedDate });
      return;
    }

    const cancelPickup = () => {
      setSelectedPointId(point.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleMutation.mutate({ token, pointId: point.id, date: selectedDate });
    };

    if (Platform.OS === "web") {
      cancelPickup();
      return;
    }

    Alert.alert(
      "Отменить отметку?",
      `Точка «${point.name}» снова станет незабранной.`,
      [
        { text: "Не отменять", style: "cancel" },
        { text: "Отменить", style: "destructive", onPress: cancelPickup },
      ],
    );
  };

  const renderPickupPoint = ({ item, index }: { item: PickupPoint; index: number }) => {
    const selected = selectedPointId === item.id;
    const picked = item.isPicked;
    const pickedMeta = picked
      ? `${formatTime(item.pickedAt)}${item.courierName ? ` • ${item.courierName}` : ""}`
      : "";

    return (
      <Pressable
        onPress={() => handleTogglePickup(item)}
        style={({ pressed }) => ({
          backgroundColor: picked ? pickedBg : selected ? selectedBg : colors.surface,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: picked ? "rgba(34,197,94,0.28)" : selected ? "rgba(59,130,246,0.34)" : border,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 10, backgroundColor: picked ? "rgba(34,197,94,0.18)" : soft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: picked ? "rgba(34,197,94,0.38)" : border }}>
            <Text style={{ color: picked ? "#22C55E" : colors.muted, fontSize: 11, fontWeight: "900" }}>{picked ? "✓" : index + 1}</Text>
          </View>

          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 17 }}
          >
            <Text style={{ fontWeight: "900" }}>{item.name}</Text>
            <Text style={{ fontWeight: "500", color: colors.muted }}> • {item.address}</Text>
          </Text>

          {!!pickedMeta && (
            <Text
              numberOfLines={1}
              style={{
                maxWidth: 120,
                color: picked ? "#22C55E" : colors.primary,
                fontSize: 11,
                lineHeight: 16,
                fontWeight: "900",
                textAlign: "right",
              }}
            >
              {pickedMeta}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>Сбербанк</Text>
          </View>
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: border, alignItems: "flex-end" }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>Забрано</Text>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900" }}>{pickedCount} из {pickupPoints.length}</Text>
          </View>
        </View>
      </View>

      {pickupPoints.length > 0 ? (
        <View style={{ flex: 1, minHeight: 320, backgroundColor: colors.background }}>
          <ScrollView
            style={{ flex: 1, backgroundColor: colors.background }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 2,
              paddingBottom: Math.max(insets.bottom + 120, 150),
              backgroundColor: colors.background,
            }}
            showsVerticalScrollIndicator={Platform.OS === "web" ? true : false}
          >
            {pickupPoints.map((item: PickupPoint, index: number) => (
              <View key={item.id.toString()}>
                {renderPickupPoint({ item, index })}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.muted }}>Загрузка...</Text>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.muted }}>Нет точек сбора</Text>
        </View>
      )}
    </ScreenContainer>
  );
}
