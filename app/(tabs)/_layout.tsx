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
  const bottomSafeArea = Platform.OS === "web" ? 12 : Math.max(insets.bottom, Platform.OS === "android" ? 22 : 12);
  const tabBarHeight = 58 + bottomSafeArea;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: "rgba(10, 126, 164, 0.15)",
        tabBarAllowFontScaling: false,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarButton: HapticTab,
        tabBarBackground: () => null,
        sceneStyle: {
          paddingBottom: 0,
          backgroundColor: colors.background,
        },
        tabBarStyle: {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 10,
          paddingBottom: bottomSafeArea,
          paddingHorizontal: 0,
          height: tabBarHeight,
          backgroundColor: colors.surface,
          borderColor: "transparent",
          borderWidth: 0,
          borderRadius: 0,
          marginBottom: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          elevation: 8,
          zIndex: 1000,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "500",
          marginTop: 2,
          maxWidth: 56,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 4,
          paddingVertical: 4,
          paddingHorizontal: 10,
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
// Note: Tab bar uses safe-area bottom padding to avoid Android system navigation overlap
