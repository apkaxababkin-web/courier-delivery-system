import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";

interface HeaderBarV2Props {
  onProfilePress?: () => void;
  onFilterToggle?: (filterMode: "all" | "mine") => void;
  filterMode?: "all" | "mine";
  selectedDate?: Date;
  onDatePress?: () => void;
  myTasksCount?: number;
}

export function HeaderBarV2({
  onProfilePress,
  onFilterToggle,
  filterMode = "all",
  selectedDate = new Date(),
  onDatePress,
  myTasksCount = 0,
}: HeaderBarV2Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
  };

  return (
    <View
      style={{
        marginTop: -insets.top,
        paddingTop: insets.top - 4,
        paddingHorizontal: 0,
        paddingBottom: 0,
        backgroundColor: colors.surface === "#f5f5f5" ? "#e8e8e8" : "#2a2d31",
      }}
    >
      {/* Main header bar with rounded corners and elevation */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface === "#f5f5f5" ? "#e8e8e8" : "#2a2d31",
          borderRadius: 0,
          overflow: "hidden",
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginLeft: 0,
          marginRight: 0,
          marginVertical: 0,
          marginTop: 0,
          // Shadow effect (iOS)
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
          // Elevation (Android)
          elevation: 8,
        }}
      >
        {/* Left: Profile icon */}
        <Pressable
          onPress={onProfilePress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: 8,
          })}
        >
          <MaterialIcons name="account-circle" size={28} color={colors.primary} />
        </Pressable>

        {/* Center: Date */}
        <Pressable
          onPress={onDatePress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 12,
            paddingVertical: 6,
          })}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: colors.foreground,
              textAlign: "center",
            }}
          >
            {formatDate(selectedDate)}
          </Text>
        </Pressable>

        {/* Right: Filter icon with dropdown */}
        <Pressable
          onPress={() => {
            const newMode = filterMode === "all" ? "mine" : "all";
            onFilterToggle?.(newMode);
          }}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            padding: 8,
          })}
        >
          <View
            style={{
              position: "relative",
            }}
          >
            <MaterialIcons
              name={filterMode === "all" ? "filter-list" : "filter-list-alt"}
              size={24}
              color={filterMode === "mine" ? colors.primary : colors.muted}
            />
            {myTasksCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: "#EF4444",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {myTasksCount > 99 ? "99+" : myTasksCount}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* Filter label below header */}
      {filterMode === "mine" && (
        <View
          style={{
            marginTop: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: "rgba(10, 126, 164, 0.1)",
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: colors.primary,
              fontWeight: "500",
            }}
          >
            Мои заявки
          </Text>
        </View>
      )}
    </View>
  );
}
