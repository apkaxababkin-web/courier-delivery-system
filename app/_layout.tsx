import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import "@/global.css";
import { QueryClient, QueryClientProvider, skipToken } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { AppState, Platform } from "react-native";
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
import * as NavigationBar from "expo-navigation-bar";
import { useRouter } from "expo-router";

import { ToastProvider } from "react-native-toast-notifications";

import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { CourierAuthProvider, useCourierAuth } from "@/lib/courier-auth";
import { FilterProvider } from "@/lib/filter-context";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };


function getPushRoute(data: Record<string, unknown> | undefined) {
  if (!data) return null;

  const type =
    typeof data.type === "string"
      ? data.type.trim()
      : "";

  const requestId =
    typeof data.requestId === "number"
      ? data.requestId
      : typeof data.requestId === "string"
        ? Number(data.requestId)
        : NaN;

  const taskId =
    typeof data.taskId === "number"
      ? data.taskId
      : typeof data.taskId === "string"
        ? Number(data.taskId)
        : NaN;

  const conversationId =
    typeof data.conversationId === "number"
      ? data.conversationId
      : typeof data.conversationId === "string"
        ? Number(data.conversationId)
        : NaN;

  // ----------------------------------------------------------
  // Обычные заявки.
  // ----------------------------------------------------------

  if (
    (type === "new_request_available" ||
      type === "request_assigned") &&
    Number.isFinite(taskId) &&
    taskId > 0
  ) {
    return `/task/${taskId}`;
  }

  // ----------------------------------------------------------
  // Chat V2 — сразу конкретный диалог.
  // ----------------------------------------------------------

  if (type === "chat_message_v2") {
    if (
      Number.isFinite(conversationId) &&
      conversationId > 0
    ) {
      return `/(tabs)/chat?conversationId=${conversationId}`;
    }

    return "/(tabs)/chat";
  }

  // Legacy chat.
  if (type === "chat_message") {
    return "/(tabs)/chat";
  }

  // ----------------------------------------------------------
  // Гемотест.
  // ----------------------------------------------------------

  if (
    type === "hemotest_list_created" ||
    type === "hemotest_point_added" ||
    type === "hemotest_point_removed"
  ) {
    return "/(tabs)/pickup-gemotest";
  }

  // ----------------------------------------------------------
  // Сбербанк.
  // ----------------------------------------------------------

  if (
    type === "sberbank_list_created" ||
    type === "sberbank_point_added" ||
    type === "sberbank_point_removed"
  ) {
    return "/(tabs)/pickup-sberbank";
  }

  // ----------------------------------------------------------
  // Напоминание о незакрытых заявках.
  // Открываем главный экран со списком заявок.
  // ----------------------------------------------------------

  if (type === "unfinished_tasks_reminder") {
    return "/(tabs)";
  }

  // ----------------------------------------------------------
  // Старые/явные push с URL.
  // Оставляем как fallback для совместимости.
  // ----------------------------------------------------------

  if (typeof data.url === "string" && data.url.trim()) {
    const rawUrl = data.url.trim();

    // Старый URL чата переводим в реальный Expo Router route.
    if (rawUrl === "chat") {
      return "/(tabs)/chat";
    }

    if (rawUrl.startsWith("chat?")) {
      return `/(tabs)/${rawUrl}`;
    }

    const url = rawUrl.replace(/^\/+/, "");
    return `/${url}`;
  }

  return null;
}

async function hideAndroidNavigationBar() {
  if (Platform.OS !== "android") return;

  try {
    await NavigationBar.setVisibilityAsync("hidden");
  } catch (error) {
    console.warn("[App] Failed to hide Android navigation bar", error);
  }
}

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
  const registerPushTokenMutation = trpc.couriers.registerPushToken.useMutation();

  const { error } = trpc.courierAuth.me.useQuery(
    token && isAuthenticated && !loading ? { token } : skipToken,
    {
      enabled: !!token && isAuthenticated && !loading,
      retry: false,
      staleTime: 60_000,
    },
  );

  useEffect(() => {
    if (Platform.OS === "web" || !token || !isAuthenticated || loading) return;

    const registerPushToken = async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") return;

        const projectId =
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;

        if (!projectId) {
          console.log("[Session] Push token skipped: no projectId configured");
          return;
        }

        const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
        await registerPushTokenMutation.mutateAsync({ token, pushToken: pushToken.data });
        console.log("[Session] Push token registered");
      } catch (pushError) {
        console.warn("[Session] Failed to register push token", pushError);
      }
    };

    registerPushToken();
  }, [token, isAuthenticated, loading, registerPushTokenMutation]);

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

function PushNavigationHandler() {
  const router = useRouter();
  const { token, loading, isAuthenticated } = useCourierAuth();
  const utils = trpc.useUtils();

  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);
  const lastHandledId = useRef<string | null>(null);
  const processingRef = useRef(false);
  const retryRequestedRef = useRef(false);
  const [pendingVersion, setPendingVersion] = useState(0);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let active = true;

    const receive = (response: Notifications.NotificationResponse) => {
      if (!active) return;
      pendingResponse.current = response;
      setPendingVersion((v) => v + 1);
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(receive);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active && response && !pendingResponse.current) {
          receive(response);
        }
      })
      .catch((error) =>
        console.warn("[Push] Failed to read initial response", error),
      );

    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        if (pendingResponse.current) {
          if (processingRef.current) {
            retryRequestedRef.current = true;
          } else {
            setPendingVersion((v) => v + 1);
          }
        }
      }
    });

    return () => {
      active = false;
      subscription.remove();
      unsubscribeNetwork();
    };
  }, []);

  useEffect(() => {
    if (loading || !isAuthenticated || !token || processingRef.current) {
      return;
    }

    const response = pendingResponse.current;
    if (!response) return;

    const notificationId = response.notification.request.identifier;

    if (notificationId && notificationId === lastHandledId.current) {
      pendingResponse.current = null;
      return;
    }

    processingRef.current = true;

    void (async () => {
      let handled = false;

      try {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;

        const isRequestPush =
          data?.type === "new_request_available" ||
          data?.type === "request_assigned";

        if (!isRequestPush) {
          const route = getPushRoute(data);
          if (route) router.push(route as any);
          handled = true;
        } else {
          const taskId = Number(data?.taskId);
          const requestId = Number(data?.requestId);

          if (Number.isSafeInteger(taskId) && taskId > 0) {
            router.push(`/task/${taskId}` as any);
            handled = true;
          } else if (Number.isSafeInteger(requestId) && requestId > 0) {
            const task = await utils.tasks.byRequestId.fetch({
              token,
              requestId,
            });

            if (task?.id) {
              router.push(`/task/${task.id}` as any);
            } else {
              console.warn("[Push] Task not found for request", requestId);
            }

            handled = true;
          } else {
            console.warn("[Push] Invalid taskId and requestId");
            handled = true;
          }
        }
      } catch (error) {
        console.warn("[Push] Navigation failed; waiting for retry", error);
      } finally {
        if (handled) {
          if (pendingResponse.current === response) {
            pendingResponse.current = null;
          }

          if (notificationId) {
            lastHandledId.current = notificationId;
          }

          void Notifications.clearLastNotificationResponseAsync().catch(
            (error) => console.warn("[Push] Failed to clear response", error),
          );
        }

        processingRef.current = false;

        if (retryRequestedRef.current) {
          retryRequestedRef.current = false;
          if (pendingResponse.current) {
            setPendingVersion((v) => v + 1);
          }
        }
      }
    })();
  }, [loading, isAuthenticated, token, pendingVersion, router, utils]);

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
    if (Platform.OS !== "android") return;

    hideAndroidNavigationBar();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hideAndroidNavigationBar();
      }
    });

    const intervalId = setInterval(() => {
      hideAndroidNavigationBar();
    }, 1500);

    return () => {
      appStateSubscription.remove();
      clearInterval(intervalId);
    };
  }, []);

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
      name: "МИГ Courier",
      importance: Notifications.AndroidImportance.MAX,
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
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;
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
                <PushNavigationHandler />
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
