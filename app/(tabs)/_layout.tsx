import { useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { SwipeTabs } from "@/components/swipe-tabs";

// Import all tab screens
import TaskListScreen from "./index";
import GemotestScreen from "./pickup-gemotest";
import SberbankScreen from "./pickup-sberbank";
import LettersScreen from "./letters";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

interface TabConfig {
  name: string;
  title: string;
  iconName: string;
  component: React.ReactNode;
}

const tabs: TabConfig[] = [
  {
    name: "index",
    title: "Все заявки",
    iconName: icon("list.bullet"),
    component: <TaskListScreen />,
  },
  {
    name: "pickup-gemotest",
    title: "Гемотест",
    iconName: icon("hemotest"),
    component: <GemotestScreen />,
  },
  {
    name: "pickup-sberbank",
    title: "Сбербанк",
    iconName: icon("sberbank"),
    component: <SberbankScreen />,
  },
  {
    name: "letters",
    title: "Письма",
    iconName: icon("envelope"),
    component: <LettersScreen />,
  },
];

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [currentTabIndex, setCurrentTabIndex] = useState(0);
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  const handleTabPress = (index: number) => {
    setCurrentTabIndex(index);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Swipe content area */}
      <SwipeTabs
        pages={tabs.map((tab) => tab.component)}
        initialPage={currentTabIndex}
        onPageChange={handleTabPress}
        style={{ flex: 1 }}
      />

      {/* Tab bar */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 12,
          paddingBottom: bottomPadding,
          paddingHorizontal: 0,
          height: tabBarHeight,
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
          flexDirection: "row",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        {tabs.map((tab, index) => (
          <Pressable
            key={tab.name}
            onPress={() => handleTabPress(index)}
            style={({ pressed }) => [
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginHorizontal: 4,
                backgroundColor:
                  index === currentTabIndex
                    ? "rgba(10, 126, 164, 0.15)"
                    : "transparent",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={{ alignItems: "center", gap: 2 }}>
              <IconSymbol
                size={26}
                name={tab.iconName as any}
                color={
                  index === currentTabIndex ? colors.primary : colors.muted
                }
              />
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "500",
                  marginTop: 2,
                  maxWidth: 50,
                  color:
                    index === currentTabIndex ? colors.primary : colors.muted,
                }}
              >
                {tab.title}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
