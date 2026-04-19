import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import * as Haptics from "expo-haptics";

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
  const { token, courier } = useCourierAuth();
  const [selectedDate] = useState(new Date());

  // Fetch pickup points
  const { data: pickupPoints = [], isLoading, refetch } = trpc.sberbank.pickupPoints.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: !!token }
  );

  // Fetch picked count
  const { data: pickedCount = 0, refetch: refetchCount } = trpc.sberbank.pickedCount.useQuery(
    { token: token || "", date: selectedDate },
    { enabled: !!token }
  );

  // Toggle pickup mutation
  const toggleMutation = trpc.sberbank.togglePickup.useMutation({
    onSuccess: () => {
      refetch();
      refetchCount();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
  });

  const handleTogglePickup = (pointId: number) => {
    if (!token) return;
    toggleMutation.mutate({
      token,
      pointId,
      date: selectedDate,
    });
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
          borderRadius: 8,
          backgroundColor: item.isPicked ? "#E8F5E9" : colors.background,
          borderLeftWidth: 4,
          borderLeftColor: item.isPicked ? colors.success : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View className="flex-row items-center gap-3">
        {/* Telegram-style checkbox */}
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: item.isPicked ? colors.success : colors.border,
            backgroundColor: item.isPicked ? colors.success : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {item.isPicked && (
            <Text style={{ color: colors.background, fontSize: 14, fontWeight: "bold" }}>✓</Text>
          )}
        </View>

        {/* Point info */}
        <View className="flex-1">
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: item.isPicked ? colors.success : colors.foreground,
            }}
          >
            {item.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 2,
            }}
          >
            {item.address}
          </Text>
          {item.isPicked && item.courierName && (
            <Text
              style={{
                fontSize: 11,
                color: colors.success,
                marginTop: 4,
                fontWeight: "500",
              }}
            >
              ✓ {item.courierName} • {formatTime(item.pickedAt)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="p-0">
      {/* Header with counter */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          Сбербанк
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
          Забрано: {pickedCount} из {pickupPoints.length}
        </Text>
      </View>

      {/* Pickup points list */}
      {pickupPoints.length > 0 ? (
        <FlatList
          data={pickupPoints}
          renderItem={renderPickupPoint}
          keyExtractor={(item) => item.id.toString()}
          scrollEnabled={true}
          contentContainerStyle={{
            paddingVertical: 4,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
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
