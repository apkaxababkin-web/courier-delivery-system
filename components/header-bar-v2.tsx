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
}

export function HeaderBarV2({
  onProfilePress,
  onFilterToggle,
  filterMode = "all",
  selectedDate = new Date(),
  onDatePress,
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
        paddingTop: insets.top,
        paddingHorizontal: 0,
        paddingBottom: 0,
        backgroundColor: colors.background,
      }}
    >
      {/* Main header bar with rounded corners and elevation */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface === "#f5f5f5" ? "#e8e8e8" : "#2a2d31",
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 12,
          marginHorizontal: 12,
          marginVertical: 2,
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
            {filterMode === "mine" && (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.primary,
                }}
              />
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
