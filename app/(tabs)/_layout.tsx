import { Tabs } from "expo-router";
import { Platform, Image } from "react-native";
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
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 12,
          paddingBottom: 16,
          paddingHorizontal: 0,
          height: "auto",
          backgroundColor: colors.surface === "#f5f5f5" ? "#e8e8e8" : "#2a2d31",
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
          maxWidth: 50,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 4,
          paddingVertical: 4,
          paddingHorizontal: 12,
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
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require("@/assets/images/hemotest-icon.png")}
              style={{
                width: 28,
                height: 28,
                opacity: focused ? 1 : 0.6,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="pickup-sberbank"
        options={{
          title: "Сбербанк",
          tabBarIcon: ({ color, focused }) => (
            <Image
              source={require("@/assets/images/sberbank-icon.png")}
              style={{
                width: 28,
                height: 28,
                opacity: focused ? 1 : 0.6,
              }}
            />
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
// Note: Increased padding and spacing to match header bar proportions
