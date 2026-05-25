import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const [lastTapTime, setLastTapTime] = useState<number>(0);

  const { data: pickupPoints = [], isLoading, refetch } = trpc.sberbank.pickupPoints.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: true },
  );

  const { data: pickedCount = 0, refetch: refetchCount } = trpc.sberbank.pickedCount.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: true },
  );

  useMobileLiveSync({
    enabled: true,
    onSync: useCallback(() => Promise.all([refetch(), refetchCount()]), [refetch, refetchCount]),
  });

  const toggleMutation = trpc.sberbank.togglePickup.useMutation({
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

  const renderPickupPoint = ({ item, index }: { item: PickupPoint; index: number }) => {
    const selected = selectedPointId === item.id;
    const picked = item.isPicked;
    const pickedMeta = picked
      ? `${formatTime(item.pickedAt)}${item.courierName ? ` • ${item.courierName}` : ""}`
      : selected
        ? "ещё тап"
        : "";

    return (
      <Pressable
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 24, height: 24, borderRadius: 10, backgroundColor: picked ? "rgba(34,197,94,0.18)" : soft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: picked ? "rgba(34,197,94,0.38)" : border }}>
            <Text style={{ color: picked ? "#22C55E" : colors.muted, fontSize: 11, fontWeight: "900" }}>{picked ? "✓" : index + 1}</Text>
          </View>

          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, color: colors.foreground, fontSize: 13, lineHeight: 18, fontWeight: "800" }}
          >
            {item.name} • {item.address}
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
          <View>
            <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>Сбербанк</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, fontWeight: "700" }}>Двойной тап по строке — отметить забор</Text>
          </View>
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: border, alignItems: "flex-end" }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800" }}>Забрано</Text>
            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900" }}>{pickedCount} из {pickupPoints.length}</Text>
          </View>
        </View>
      </View>

      {pickupPoints.length > 0 ? (
        <FlatList
          data={pickupPoints}
          renderItem={renderPickupPoint}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: Math.max(insets.bottom + 190, 220), backgroundColor: colors.background }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 180 }} />}
        />
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
