import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import EventSource from "react-native-sse";
import { useCallback, useEffect, useState, type ComponentProps } from "react";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import { useCourierAuth } from "@/lib/courier-auth";

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function TabIcon({ name, focused, color }: { name: ComponentProps<typeof MaterialIcons>["name"]; focused: boolean; color: string }) {
  return (
    <View
      style={{
        width: 50,
        height: 34,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: "transparent",
        borderWidth: 0,
        borderColor: "transparent",
        shadowColor: "transparent",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: focused ? 9 : 0,
      }}
    >
      <MaterialIcons name={name} size={24} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);
  const bottomSafeArea = Platform.OS === "web" ? 12 : Math.max(insets.bottom, Platform.OS === "android" ? 16 : 12);
  const tabBarHeight = 64 + bottomSafeArea;
  const activeColor = dark ? "#8EBEFF" : "#1D6FF2";
  const inactiveColor = dark ? "#8B96A6" : "#64748B";
  const { token } = useCourierAuth();
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const loadChatUnreadCount = useCallback(async () => {
    if (!token) {
      setChatUnreadCount(0);
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/chat/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();
      setChatUnreadCount(Number(data?.count || 0));
    } catch {}
  }, [token]);

  useEffect(() => {
    void loadChatUnreadCount();

    const interval = setInterval(() => {
      void loadChatUnreadCount();
    }, 10000);

    return () => clearInterval(interval);
  }, [loadChatUnreadCount]);

  useEffect(() => {
    if (!token) return;

    let eventSource: any = null;

    try {
      eventSource = new EventSource(`${getApiBaseUrl()}/api/live`, { pollingInterval: 0 });
      eventSource.addEventListener("chat_changed", () => {
        void loadChatUnreadCount();
      });
      eventSource.addEventListener("chat_read", () => {
        void loadChatUnreadCount();
      });
    } catch {}

    return () => {
      try {
        eventSource?.close();
      } catch {}
    };
  }, [token, loadChatUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarAllowFontScaling: false,
        headerShown: false,
        tabBarHideOnKeyboard: Platform.OS !== "android",
        tabBarButton: HapticTab,
        tabBarBackground: () => null,
        sceneStyle: { paddingBottom: 0, backgroundColor: colors.background },
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: tabBarHeight,
          paddingTop: 7,
          paddingBottom: bottomSafeArea,
          paddingHorizontal: 8,
          backgroundColor: dark ? "#08141E" : "#FFFFFF",
          borderColor: dark ? "rgba(148,163,184,0.18)" : "rgba(226,232,240,0.95)",
          borderWidth: 1,
          borderRadius: 0,
          shadowColor: dark ? "#020617" : "#94A3B8",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: dark ? 0.36 : 0.16,
          shadowRadius: 22,
          elevation: 16,
          zIndex: 1000,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 1,
          maxWidth: 70,
        },
        tabBarItemStyle: {
          borderRadius: 10,
          marginHorizontal: 0,
          paddingVertical: 2,
          paddingHorizontal: 1,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Заявки", tabBarIcon: ({ color, focused }) => <TabIcon name="assignment" color={color} focused={focused} /> }} />
      <Tabs.Screen name="pickup-gemotest" options={{ title: "Гемотест", tabBarIcon: ({ color, focused }) => <TabIcon name="biotech" color={color} focused={focused} /> }} />
      <Tabs.Screen name="pickup-sberbank" options={{ title: "Сбербанк", tabBarIcon: ({ color, focused }) => <TabIcon name="account-balance" color={color} focused={focused} /> }} />
      <Tabs.Screen name="letters" options={{ title: "Письма", tabBarIcon: ({ color, focused }) => <TabIcon name="description" color={color} focused={focused} /> }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Чат",
          tabBarBadge: chatUnreadCount > 0 ? (chatUnreadCount > 99 ? "99+" : chatUnreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: "#EF4444", color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
          tabBarIcon: ({ color, focused }) => <TabIcon name="chat-bubble-outline" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
