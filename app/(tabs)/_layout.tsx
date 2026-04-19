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
        tabBarActiveBackgroundColor: "rgba(10, 126, 164, 0.12)",
        tabBarAllowFontScaling: false,
        headerShown: false,
        tabBarHideOnKeyboard: false,
        tabBarButton: HapticTab,
        tabBarBackground: () => {
          // Transparent background with blur effect
          return null;
        },
        sceneStyle: {
          paddingBottom: 0,
        },
        tabBarStyle: {
          position: "absolute",
          bottom: 12,
          left: 16,
          right: 16,
          paddingTop: 6,
          paddingBottom: bottomPadding + 2,
          paddingHorizontal: 16,
          height: "auto",
          backgroundColor: colors.surface,
          borderTopColor: "transparent",
          borderTopWidth: 0,
          borderRadius: 24,
          marginHorizontal: 0,
          marginBottom: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 8,
          zIndex: 1000,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginTop: 3,
          maxWidth: 70,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 3,
          paddingVertical: 6,
          paddingHorizontal: 10,
        },
        tabBarIconStyle: {
          marginBottom: 3,
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
// Note: Tab bar uses same surface color as header bar for unified design
// Note: Same width as header bar (12px left/right margins, 16px horizontal padding)
// Note: Compact padding (10px top, 6px bottom) to match header bar visual size
// Note: Reduced item padding and spacing for visual balance with header bar
