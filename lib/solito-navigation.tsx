import React, { useState } from "react";
import { View, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { Text } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { NavigationProvider } from "@/lib/navigation-provider";

// Screen components
import TaskListScreen from "@/app/(tabs)/index";
import HemotestScreen from "@/app/(tabs)/pickup-gemotest";
import SberbankScreen from "@/app/(tabs)/pickup-sberbank";
import LettersScreen from "@/app/(tabs)/letters";
import TaskDetailScreen from "@/app/task/[id]";
import ProfileScreen from "@/app/profile";

type TabName = "all" | "gemotest" | "sberbank" | "letters";
type ScreenName = "tabs" | "task-detail" | "profile";

interface TabConfig {
  name: TabName;
  title: string;
  icon: string;
  component: React.ComponentType;
}

const TABS: TabConfig[] = [
  { name: "all", title: "Все заявки", icon: "list.bullet", component: TaskListScreen },
  { name: "gemotest", title: "Гемотест", icon: "hemotest", component: HemotestScreen },
  { name: "sberbank", title: "Сбербанк", icon: "sberbank", component: SberbankScreen },
  { name: "letters", title: "Письма", icon: "envelope", component: LettersScreen },
];

export function SolitoNavigation() {
  const [activeTab, setActiveTab] = useState<TabName>("all");
  const [currentScreen, setCurrentScreen] = useState<ScreenName>("tabs");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);

  // Navigation functions
  const navigateToTaskDetail = (taskId: number) => {
    setSelectedTaskId(taskId);
    setCurrentScreen("task-detail");
  };

  const navigateToProfile = () => {
    setCurrentScreen("profile");
  };

  const goBackToTabs = () => {
    setCurrentScreen("tabs");
    setSelectedTaskId(null);
  };

  // Get current screen component
  let CurrentComponent = TaskListScreen;
  if (currentScreen === "task-detail") {
    CurrentComponent = () => <TaskDetailScreen taskId={selectedTaskId} onBack={goBackToTabs} />;
  } else if (currentScreen === "profile") {
    CurrentComponent = () => <ProfileScreen onBack={goBackToTabs} />;
  } else {
    const currentTab = TABS.find((tab) => tab.name === activeTab);
    CurrentComponent = currentTab?.component || TaskListScreen;
  }

  return (
    <NavigationProvider navigateToTaskDetail={navigateToTaskDetail} navigateToProfile={navigateToProfile} navigateBack={goBackToTabs}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Screen content */}
        <View style={{ flex: 1 }}>
          <CurrentComponent />
        </View>



      {/* Custom Bottom Tab Bar - Only show on tabs screen */}
      {currentScreen === "tabs" && (
        <View
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            right: 12,
            backgroundColor: colors.background,
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginVertical: 6,
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.15,
            shadowRadius: 16,
            elevation: 8,
            zIndex: 1000,
          }}
        >
          {TABS.map((tab) => {
            const isFocused = activeTab === tab.name;

            return (
              <Pressable
                key={tab.name}
                onPress={() => setActiveTab(tab.name)}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: isFocused ? "rgba(10, 126, 164, 0.12)" : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ marginBottom: 2 }}>
                  <IconSymbol
                    size={24}
                    name={tab.icon as any}
                    color={isFocused ? colors.primary : colors.muted}
                  />
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "500",
                    color: isFocused ? colors.primary : colors.muted,
                    marginTop: 2,
                    maxWidth: 70,
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                >
                  {tab.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

        {/* Spacer for bottom padding */}
        <View style={{ height: bottomPadding }} />
      </View>
    </NavigationProvider>
  );
}
