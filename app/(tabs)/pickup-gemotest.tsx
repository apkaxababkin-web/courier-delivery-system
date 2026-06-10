import { Pressable, ScrollView, Text, View } from "react-native";
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
  phone?: string | null;
  isPicked: boolean;
  pickedAt: Date | string | null;
  courierName?: string | null;
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function formatTime(date: Date | string | null) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function HemotestScreen() {
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
  const [lastTapTime, setLastTapTime] = useState<number>(0);

  const queryInput = token ? { token, date: selectedDate } : skipToken;

  const { data: pickupPointsRaw = [], isLoading, refetch } = trpc.hemotest.pickupPoints.useQuery(queryInput);
  const pickupPoints = Array.isArray(pickupPointsRaw) ? (pickupPointsRaw as PickupPoint[]) : [];

  const { data: pickedCountRaw = 0, refetch: refetchCount } = trpc.hemotest.pickedCount.useQuery(queryInput);
  const pickedCount = Number(pickedCountRaw) || pickupPoints.filter((point) => point.isPicked).length;

  useMobileLiveSync({
    enabled: true,
    onSync: useCallback(() => {
      if (!token) return;
      return Promise.all([refetch(), refetchCount()]);
    }, [token, refetch, refetchCount]),
  });

  const toggleMutation = trpc.hemotest.togglePickup.useMutation({
    onSuccess: () => {
      refetch();
      refetchCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleTogglePickup = (pointId: number) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;

    if (selectedPointId !== pointId || timeSinceLastTap > 520) {
      setSelectedPointId(pointId);
      setLastTapTime(now);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (!token) return;
    toggleMutation.mutate({ token, pointId, date: selectedDate });
    setSelectedPointId(null);
  };

  const renderPickupPoint = (item: PickupPoint, index: number) => {
    const selected = selectedPointId === item.id;
    const picked = !!item.isPicked;
    const pickedMeta = picked
      ? [formatTime(item.pickedAt), item.courierName].filter(Boolean).join(" • ")
      : "";
    const actionLabel = picked ? "Забрано" : selected ? "Еще раз" : "Забрать";

    return (
      <Pressable
        key={String(item.id)}
        onPress={() => handleTogglePickup(item.id)}
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
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ width: 24, height: 24, borderRadius: 10, backgroundColor: picked ? "rgba(34,197,94,0.18)" : soft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: picked ? "rgba(34,197,94,0.38)" : border }}>
            <Text style={{ color: picked ? "#22C55E" : colors.muted, fontSize: 11, fontWeight: "900" }}>{picked ? "✓" : index + 1}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 0, marginLeft: 10, marginRight: 10 }}>
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, lineHeight: 17, fontWeight: "900" }}>
              {item.name || "Точка Гемотест"}
            </Text>
            <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 }}>
              {item.address || "Адрес не указан"}
            </Text>
            {!!item.phone && (
              <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 2 }}>
                {item.phone}
              </Text>
            )}
          </View>

          <View style={{ alignItems: "flex-end", maxWidth: 128 }}>
            <Text
              numberOfLines={1}
              style={{
                color: picked ? "#22C55E" : selected ? colors.primary : colors.muted,
                fontSize: 11,
                lineHeight: 16,
                fontWeight: "900",
                textAlign: "right",
              }}
            >
              {actionLabel}
            </Text>
            {!!pickedMeta && (
            <Text
              numberOfLines={1}
              style={{
                color: "#22C55E",
                fontSize: 10.5,
                lineHeight: 16,
                fontWeight: "800",
                textAlign: "right",
              }}
            >
              {pickedMeta}
            </Text>
            )}
          </View>
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
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>Гемотест</Text>
          </View>
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: border, alignItems: "flex-end" }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>Забрано</Text>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900" }}>{pickedCount} из {pickupPoints.length}</Text>
          </View>
        </View>
      </View>

      {pickupPoints.length > 0 ? (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: Math.max(insets.bottom + 190, 220), flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {pickupPoints.map((point, index) => renderPickupPoint(point, index))}
          <View style={{ height: 180 }} />
        </ScrollView>
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
