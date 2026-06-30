import { AppState, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useRouter } from "expo-router";
import EventSource from "react-native-sse";
import { getApiBaseUrl } from "@/constants/oauth";
import { skipToken } from "@tanstack/react-query";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { NetworkBanner } from "@/components/network-banner";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { useColors } from "@/hooks/use-colors";
import { useCallback, useEffect, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { PickupOperationList } from "@/components/pickup-operation-list";
import { performSuccessHaptic } from "@/lib/vibration-preference";
import { DESIGN_PREVIEW_TOKEN, designPreviewPickupPoints } from "@/lib/design-preview";

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { token } = useCourierAuth();
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const border = dark ? "rgba(148,163,184,0.18)" : colors.border;

  const [selectedDate] = useState(new Date());

  const queryInput = token && !isDesignPreview ? { token, date: selectedDate } : skipToken;

  const { data: pickupPointsRaw = [], isLoading, refetch } = trpc.hemotest.pickupPoints.useQuery(queryInput);
  const pickupPoints = isDesignPreview
    ? (designPreviewPickupPoints as PickupPoint[])
    : Array.isArray(pickupPointsRaw) ? (pickupPointsRaw as PickupPoint[]) : [];
  const { data: pickedCountRaw = 0, refetch: refetchCount } = trpc.hemotest.pickedCount.useQuery(queryInput);
  const pickedCount = Number(pickedCountRaw) || pickupPoints.filter((point) => point.isPicked).length;

  const toggleMutation = trpc.hemotest.togglePickup.useMutation({
    onSuccess: () => {
      refetch();
      refetchCount();
      performSuccessHaptic().catch(() => undefined);
    },
  });

  const refreshHemotest = useCallback(() => {
    if (!token || isDesignPreview) return;
    void refetch();
    void refetchCount();
  }, [token, isDesignPreview, refetch, refetchCount]);

  useFocusEffect(
    useCallback(() => {
      refreshHemotest();

      const interval = setInterval(refreshHemotest, 5000);

      return () => clearInterval(interval);
    }, [refreshHemotest])
  );

  useEffect(() => {
    if (!token || isDesignPreview) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshHemotest();
    });

    return () => subscription.remove();
  }, [token, isDesignPreview, refetch, refetchCount]);

  useEffect(() => {
    if (!token || isDesignPreview) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource(`${getApiBaseUrl()}/api/live`, {
          pollingInterval: 0,
        });

        eventSource.addEventListener("connected", () => {
          console.log("[HemotestLiveSync] connected");
        });

        eventSource.addEventListener("hemotest_changed", () => {
          console.log("[HemotestLiveSync] hemotest_changed");
          refreshHemotest();
        });

        eventSource.addEventListener("data_changed", () => {
          console.log("[HemotestLiveSync] data_changed");
          refreshHemotest();
        });

        eventSource.addEventListener("error", (error: unknown) => {
          console.warn("[HemotestLiveSync] error:", error);

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        });
      } catch (error) {
        console.warn("[HemotestLiveSync] connect failed:", error);

        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      closed = true;

      if (reconnectTimer) clearTimeout(reconnectTimer);

      try {
        eventSource?.close();
      } catch {}
    };
  }, [token, isDesignPreview, refetch, refetchCount]);

  const handleTogglePickup = (pointId: number) => {
    if (isDesignPreview) return;
    if (!token) return;
    toggleMutation.mutate({ token, pointId, date: selectedDate });
  };

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
      <NetworkBanner visible={!isOnline} />

      <HeaderBarV2
        title="Гемотест"
        onProfilePress={() => router.push("/profile" as never)}
        selectedDate={selectedDate}
        showDate
      />

      <View style={{ backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: border }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 13 }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: 8 }}>
            Забрано <Text style={{ color: colors.foreground, fontWeight: "700" }}>{pickedCount}</Text> из {pickupPoints.length}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface, overflow: "hidden" }}>
            <View style={{ width: `${pickupPoints.length ? (pickedCount / pickupPoints.length) * 100 : 0}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
          </View>
        </View>
      </View>

      {pickupPoints.length > 0 ? (
        <ScrollView
          style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: Math.max(tabBarHeight + 24, insets.bottom + 32), flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <PickupOperationList points={pickupPoints} colors={colors} fallbackName="Точка Гемотест" disabled={toggleMutation.isPending} onToggle={handleTogglePickup} />
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
    </SafeAreaView>
  );
}
