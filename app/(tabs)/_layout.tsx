import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { HapticTab } from "@/components/haptic-tab";
import { useColors } from "@/hooks/use-colors";

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function TabIcon({
  name,
  focused,
  color,
  badge,
}: {
  name: React.ComponentProps<typeof MaterialIcons>["name"];
  focused: boolean;
  color: string;
  badge?: number;
}) {
  return (
    <View
      style={{
        width: 54,
        height: 38,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 18,
        backgroundColor: focused ? "rgba(59,130,246,0.14)" : "transparent",
        borderWidth: focused ? 1 : 0,
        borderColor: focused ? "rgba(125,178,255,0.32)" : "transparent",
        shadowColor: focused ? "#3B82F6" : "transparent",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: focused ? 0.30 : 0,
        shadowRadius: focused ? 12 : 0,
      }}
    >
      <MaterialIcons name={name} size={28} color={color} />
      {!!badge && (
        <View
          style={{
            position: "absolute",
            right: 5,
            top: 0,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#3B82F6",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900", lineHeight: 12 }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);
  const bottomSafeArea = Platform.OS === "web" ? 12 : Math.max(insets.bottom, Platform.OS === "android" ? 18 : 12);
  const tabBarHeight = 68 + bottomSafeArea;
  const tabBarBackground = dark ? "rgba(12,20,30,0.94)" : "rgba(255,253,248,0.96)";
  const activeColor = dark ? "#BFD5FF" : "#1D6FF2";
  const inactiveColor = dark ? "#8B95A7" : "#64748B";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
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
          bottom: 12,
          left: 14,
          right: 14,
          paddingTop: 9,
          paddingBottom: bottomSafeArea,
          paddingHorizontal: 8,
          height: tabBarHeight,
          backgroundColor: tabBarBackground,
          borderColor: dark ? "rgba(148,163,184,0.20)" : "rgba(226,232,240,0.95)",
          borderWidth: 1,
          borderRadius: 30,
          shadowColor: dark ? "#020617" : "#94A3B8",
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: dark ? 0.42 : 0.18,
          shadowRadius: 24,
          elevation: 16,
          zIndex: 1000,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "900",
          marginTop: 1,
          maxWidth: 70,
        },
        tabBarItemStyle: {
          borderRadius: 20,
          marginHorizontal: 1,
          paddingVertical: 3,
          paddingHorizontal: 2,
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
          tabBarIcon: ({ color, focused }) => <TabIcon name="assignment" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pickup-gemotest"
        options={{
          title: "Гемотест",
          tabBarIcon: ({ color, focused }) => <TabIcon name="bloodtype" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pickup-sberbank"
        options={{
          title: "Сбербанк",
          tabBarIcon: ({ color, focused }) => <TabIcon name="account-balance" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="letters"
        options={{
          title: "Письма",
          tabBarIcon: ({ color, focused }) => <TabIcon name="mail-outline" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Профиль",
          tabBarIcon: ({ color, focused }) => <TabIcon name="person-outline" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
