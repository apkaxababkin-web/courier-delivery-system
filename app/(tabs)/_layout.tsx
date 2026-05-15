import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);
  const bottomSafeArea = Platform.OS === "web" ? 12 : Math.max(insets.bottom, Platform.OS === "android" ? 20 : 12);
  const tabBarHeight = 64 + bottomSafeArea;
  const tabBarBackground = dark ? "rgba(17,24,32,0.96)" : "rgba(255,253,248,0.97)";
  const activeBg = dark ? "rgba(59,130,246,0.18)" : "#EAF2FF";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: activeBg,
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
          bottom: 10,
          left: 12,
          right: 12,
          paddingTop: 9,
          paddingBottom: bottomSafeArea,
          paddingHorizontal: 8,
          height: tabBarHeight,
          backgroundColor: tabBarBackground,
          borderColor: dark ? "rgba(148,163,184,0.22)" : "rgba(226,232,240,0.95)",
          borderWidth: 1,
          borderRadius: 28,
          shadowColor: dark ? "#020617" : "#94A3B8",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: dark ? 0.34 : 0.18,
          shadowRadius: 24,
          elevation: 14,
          zIndex: 1000,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "800",
          marginTop: 2,
          maxWidth: 64,
        },
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 2,
          paddingVertical: 4,
          paddingHorizontal: 6,
        },
        tabBarIconStyle: {
          marginBottom: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Заявки",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name={icon("list.bullet")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pickup-gemotest"
        options={{
          title: "Гемотест",
          tabBarActiveTintColor: "#18C7B7",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name={icon("hemotest")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pickup-sberbank"
        options={{
          title: "Сбербанк",
          tabBarActiveTintColor: "#22C55E",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name={icon("sberbank")} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="letters"
        options={{
          title: "Письма",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={25} name={icon("envelope")} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// Note: Profile screen is accessed via header button (👤), not tab bar
// Note: Tab bar uses safe-area bottom padding to avoid Android system navigation overlap
