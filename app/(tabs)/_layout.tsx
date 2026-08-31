import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useState, type ComponentProps } from "react";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useCourierAuth } from "@/lib/courier-auth";
import { chatV2 } from "@/lib/chat-v2";

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
      <MaterialIcons name={name} size={25} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);
  const bottomSafeArea = Platform.OS === "web" ? 12 : Math.max(insets.bottom, Platform.OS === "android" ? 16 : 12);
  const tabBarHeight = 64 + bottomSafeArea;
  const activeColor = dark ? "#C7D8F8" : "#1D6FF2";
  const inactiveColor = dark ? "#7C8797" : "#64748B";
  const { token } = useCourierAuth();
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const loadChatUnreadCount = useCallback(async () => {
    if (!token) {
      setChatUnreadCount(0);
      return;
    }
    try {
      const conversations = await chatV2.conversations(token);
      setChatUnreadCount(conversations.reduce((total, conversation) => total + conversation.unreadCount, 0));
    } catch {}
  }, [token]);

  useEffect(() => {
    void loadChatUnreadCount();
  }, [loadChatUnreadCount]);

  useMobileLiveSync({
    enabled: Boolean(token),
    events: ["app_active", "chat_v2_changed", "chat_v2_read"],
    onSync: loadChatUnreadCount,
  });

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
          paddingTop: 8,
          paddingBottom: bottomSafeArea,
          paddingHorizontal: 8,
          backgroundColor: dark ? "rgba(10,16,24,0.95)" : "rgba(255,253,248,0.96)",
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
          fontSize: 9.5,
          fontWeight: "900",
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
