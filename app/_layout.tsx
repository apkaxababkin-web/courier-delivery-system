import "@/global.css";
import { QueryClient, QueryClientProvider, skipToken } from "@tanstack/react-query";
import { Stack, Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { ToastProvider } from "react-native-toast-notifications";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { CourierAuthProvider, useCourierAuth } from "@/lib/courier-auth";
import { FilterProvider } from "@/lib/filter-context";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

function AuthRedirect() {
  const { isAuthenticated, loading } = useCourierAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/login" as never);
    }
  }, [isAuthenticated, loading, router]);

  return null;
}

function SessionValidator() {
  const { token, isAuthenticated, loading, logout } = useCourierAuth();
  const router = useRouter();

  const { error } = trpc.courierAuth.me.useQuery(
    token && isAuthenticated && !loading ? { token } : skipToken,
    {
      enabled: !!token && isAuthenticated && !loading,
      retry: false,
      staleTime: 60_000,
    },
  );

  useEffect(() => {
    if (!error || !isAuthenticated) return;

    const message = error.message?.toLowerCase() ?? "";
    const authError =
      message.includes("token") ||
      message.includes("токен") ||
      message.includes("недейств") ||
      message.includes("unauthorized") ||
      message.includes("forbidden");

    if (!authError) return;

    logout()
      .then(() => router.replace("/login" as never))
      .catch((logoutError) => console.warn("[Session] Failed to clear invalid session", logoutError));
  }, [error, isAuthenticated, logout, router]);

  return null;
}

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  useEffect(() => {
    initManusRuntime();

    if (Platform.OS !== "web") {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    Notifications.setNotificationChannelAsync("default", {
      name: "МИГ Курьер",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0A7EA4",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch((error) => {
      console.warn("[App] Failed to configure Android notification channel", error);
    });
  }, []);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;

    const registerPushToken = async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;

        const projectId =
          (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_APP_ID) ||
          undefined;
        if (!projectId) {
          console.log("[App] Push token skipped: no projectId configured");
          return;
        }

        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log("[App] Expo Push Token:", token.data);
      } catch (error) {
        console.warn("[App] Failed to get push token:", error);
      }
    };

    registerPushToken();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log("[App] Push notification tapped:", data);

      if (data.url) {
        router.push(`/${data.url}` as any);
      }
    });

    return () => subscription.remove();
  }, [router]);

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <FilterProvider>
              <CourierAuthProvider>
                <SessionValidator />
                <AuthRedirect />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="login" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
                </Stack>
                <StatusBar style="auto" />
              </CourierAuthProvider>
            </FilterProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </ToastProvider>
    </GestureHandlerRootView>
  );

  if (Platform.OS === "web") {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
