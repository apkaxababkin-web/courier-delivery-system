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

export default function SberbankScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token } = useCourierAuth();
  const { isOnline } = useNetworkStatus();
  const [selectedDate] = useState(new Date());
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);
  const [lastTapTime, setLastTapTime] = useState<number>(0);

  const { data: pickupPoints = [], isLoading, refetch } = trpc.sberbank.pickupPoints.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: !!token },
  );

  const { data: pickedCount = 0, refetch: refetchCount } = trpc.sberbank.pickedCount.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: !!token },
  );

  useMobileLiveSync({
    enabled: !!token,
    onSync: useCallback(() => Promise.all([refetch(), refetchCount()]), [refetch, refetchCount]),
  });

  const toggleMutation = trpc.sberbank.togglePickup.useMutation({
    onSuccess: () => {
      refetch();
      refetchCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleTogglePickup = (pointId: number) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;

    if (selectedPointId !== pointId || timeSinceLastTap > 500) {
      setSelectedPointId(pointId);
      setLastTapTime(now);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }

    if (!token) return;
    toggleMutation.mutate({ token, pointId, date: selectedDate });
    setSelectedPointId(null);
  };

  const formatTime = (date: Date | null) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const renderPickupPoint = ({ item }: { item: PickupPoint }) => (
    <Pressable
      onPress={() => handleTogglePickup(item.id)}
      style={({ pressed }) => [
        {
          paddingVertical: 10,
          paddingHorizontal: 12,
          marginVertical: 2,
          marginHorizontal: 4,
          borderRadius: 16,
          backgroundColor: item.isPicked ? "rgba(76, 175, 80, 0.15)" : selectedPointId === item.id ? "rgba(59, 130, 246, 0.1)" : colors.background,
          borderLeftWidth: 4,
          borderLeftColor: item.isPicked ? "rgba(76, 175, 80, 0.6)" : selectedPointId === item.id ? "rgba(59, 130, 246, 0.6)" : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-start gap-3 flex-1">
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              borderWidth: 2,
              borderColor: item.isPicked ? "rgba(76, 175, 80, 0.6)" : colors.border,
              backgroundColor: item.isPicked ? "rgba(76, 175, 80, 0.6)" : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
              flexShrink: 0,
            }}
          >
            {item.isPicked && <Text style={{ color: "white", fontSize: 12, fontWeight: "bold" }}>✓</Text>}
          </View>

          <View className="flex-1">
            <Text style={{ fontSize: 14, fontWeight: "600", color: item.isPicked ? "rgba(76, 175, 80, 0.8)" : colors.foreground }}>
              {item.name}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>{item.address}</Text>
          </View>
        </View>

        {item.isPicked && item.courierName && (
          <View style={{ alignItems: "flex-end", justifyContent: "flex-start" }}>
            <Text style={{ fontSize: 11, color: "rgba(76, 175, 80, 0.7)", fontWeight: "500" }}>{formatTime(item.pickedAt)}</Text>
            <Text style={{ fontSize: 11, color: "rgba(76, 175, 80, 0.7)", marginTop: 2 }}>{item.courierName}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Сбербанк</Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Забрано: {pickedCount} из {pickupPoints.length}</Text>
      </View>

      {pickupPoints.length > 0 ? (
        <FlatList
          data={pickupPoints}
          renderItem={renderPickupPoint}
          keyExtractor={(item) => item.id.toString()}
          scrollEnabled={true}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: Math.max(insets.bottom, 16) }}
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
