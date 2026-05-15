import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";

interface HeaderBarV2Props {
  onProfilePress?: () => void;
  onFilterToggle?: (filterMode: "all" | "mine") => void;
  filterMode?: "all" | "mine";
  selectedDate?: Date;
  onDatePress?: () => void;
  myTasksCount?: number;
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
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
  const dark = isDarkBackground(colors.background);

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
        paddingTop: insets.top + 4,
        paddingHorizontal: 12,
        paddingBottom: 8,
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: dark ? "rgba(148,163,184,0.20)" : "#E2E8F0",
          paddingHorizontal: 12,
          paddingVertical: 10,
          shadowColor: dark ? "#020617" : "#94A3B8",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: dark ? 0.34 : 0.12,
          shadowRadius: 18,
          elevation: 8,
        }}
      >
        <Pressable
          onPress={onProfilePress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            width: 44,
            height: 44,
            borderRadius: 16,
            backgroundColor: dark ? "rgba(59,130,246,0.14)" : "#F0F6FF",
            justifyContent: "center",
            alignItems: "center",
          })}
        >
          <MaterialIcons name="account-circle" size={28} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={onDatePress}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            flex: 1,
            marginHorizontal: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: dark ? "rgba(148,163,184,0.08)" : "#F8FAFC",
          })}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: colors.foreground,
              textAlign: "center",
            }}
          >
            {formatDate(selectedDate)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            const newMode = filterMode === "all" ? "mine" : "all";
            onFilterToggle?.(newMode);
          }}
          style={({ pressed }) => ({
            opacity: pressed ? 0.7 : 1,
            width: 44,
            height: 44,
            borderRadius: 16,
            backgroundColor: filterMode === "mine"
              ? dark
                ? "rgba(59,130,246,0.18)"
                : "#EAF2FF"
              : dark
                ? "rgba(148,163,184,0.08)"
                : "#F8FAFC",
            justifyContent: "center",
            alignItems: "center",
          })}
        >
          <View style={{ position: "relative" }}>
            <MaterialIcons
              name={filterMode === "all" ? "filter-list" : "filter-list-alt"}
              size={24}
              color={filterMode === "mine" ? colors.primary : colors.muted}
            />

            {myTasksCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: -7,
                  right: -8,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#EF4444",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: "900",
                    lineHeight: 12,
                  }}
                >
                  {myTasksCount > 99 ? "99+" : myTasksCount}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {filterMode === "mine" && (
        <View
          style={{
            marginTop: 8,
            alignSelf: "center",
            paddingHorizontal: 14,
            paddingVertical: 7,
            backgroundColor: dark ? "rgba(59,130,246,0.14)" : "#EAF2FF",
            borderRadius: 999,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: colors.primary,
              fontWeight: "800",
            }}
          >
            Мои заявки
          </Text>
        </View>
      )}
    </View>
  );
}
