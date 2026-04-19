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
        tabBarActiveBackgroundColor: "rgba(10, 126, 164, 0.15)",
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
          left: 12,
          right: 12,
          paddingTop: 10,
          paddingBottom: bottomPadding + 6,
          paddingHorizontal: 16,
          height: "auto",
          backgroundColor: Platform.OS === "ios" ? "rgba(21, 23, 24, 0.6)" : "rgba(21, 23, 24, 0.7)",
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
          marginTop: 2,
          maxWidth: 60,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 2,
          paddingVertical: 6,
          paddingHorizontal: 8,
        },
        tabBarIconStyle: {
          marginBottom: 2,
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
// Note: Tab bar uses iOS Liquid Glass effect (rgba with low opacity for transparency)
// Note: Same width as header bar (12px left/right margins, 16px horizontal padding)
// Note: Height adjusted for proper spacing around icons (10px top, bottomPadding + 6 bottom)
