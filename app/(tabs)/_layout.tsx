import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        sceneStyle: {
          paddingBottom: tabBarHeight + 8,
        },
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 12,
          paddingBottom: bottomPadding + 8,
          paddingHorizontal: 12,
          height: tabBarHeight + 8,
          backgroundColor: Platform.OS === "ios" ? "rgba(21, 23, 24, 0.6)" : "rgba(30, 32, 34, 0.7)",
          borderTopColor: "transparent",
          borderTopWidth: 0,
          borderRadius: 0,
          marginHorizontal: 0,
          marginBottom: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 15,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginTop: 1,
          maxWidth: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Все заявки",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name={icon("list.bullet")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pickup-gemotest"
        options={{
          title: "Гемотест",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name={icon("hemotest")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pickup-sberbank"
        options={{
          title: "Сбербанк",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name={icon("sberbank")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="letters"
        options={{
          title: "Письма",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name={icon("envelope")} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// Note: Profile screen is accessed via header button (👤), not tab bar
// Note: BlurView from expo-blur is automatically applied via tabBarStyle backgroundColor transparency
