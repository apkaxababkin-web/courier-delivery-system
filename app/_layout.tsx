import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/**
 * Redirects to /login when not authenticated, and to /(tabs) when authenticated.
 * Must be rendered inside CourierAuthProvider.
 */
function AuthRedirect() {
  const { isAuthenticated, loading } = useCourierAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/login" as never);
    }
  }, [isAuthenticated, loading]);

  return null;
}
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
    
    // Set up notification handler
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

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  const router = useRouter();

  // Register push token when app starts
  useEffect(() => {
    if (Platform.OS === "web") return;
    
    const registerPushToken = async () => {
      try {
        // Request permission first
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") return;
        // getExpoPushTokenAsync requires projectId in standalone builds.
        // Skip silently if not configured to prevent crash.
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

  // Handle push notification responses (when user taps on notification)
  useEffect(() => {
    if (Platform.OS === "web") return;

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log("[App] Push notification tapped:", data);
        
        // Handle deep link navigation
        if (data.url) {
          console.log("[App] Navigating to:", data.url);
          router.push(`/${data.url}` as any);
        }
      }
    );

    return () => subscription.remove();
  }, [router]);

  // Ensure minimum 8px padding for top and bottom on mobile
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

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
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
