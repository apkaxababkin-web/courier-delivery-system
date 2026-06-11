import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";

interface HeaderBarV2Props {
  title?: string;
  subtitle?: string;
  onProfilePress?: () => void;
  onFilterToggle?: (filterMode: "all" | "mine") => void;
  filterMode?: "all" | "mine";
  selectedDate?: Date;
  onDatePress?: () => void;
  showDate?: boolean;
  showFilter?: boolean;
  myTasksCount?: number;
}

const uiFont = Platform.select({
  ios: "SF Pro Text",
  android: "sans-serif",
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
});

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

export function HeaderBarV2({
  title = "Заявки",
  subtitle,
  onProfilePress,
  onFilterToggle,
  filterMode = "all",
  selectedDate = new Date(),
  onDatePress,
  showDate = false,
  showFilter = false,
}: HeaderBarV2Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  const border = dark ? "rgba(148,163,184,0.20)" : "rgba(226,232,240,0.95)";
  const barBackground = dark ? "#08141E" : "#FFFFFF";
  const controlBackground = dark ? "#102331" : "#F1F3F5";
  const activeText = dark ? "#BFD5FF" : colors.primary;

  return (
    <View
      style={{
        marginTop: -insets.top,
        minHeight: 64 + insets.top,
        paddingTop: insets.top,
        paddingHorizontal: 8,
        backgroundColor: barBackground,
        borderBottomWidth: 1,
        borderBottomColor: border,
        justifyContent: "center",
      }}
    >
      <View style={{ height: 64, flexDirection: "row", alignItems: "center" }}>
        <Pressable
          accessibilityLabel="Открыть профиль"
          onPress={onProfilePress}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: controlBackground,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <MaterialIcons name="person-outline" size={21} color={colors.muted} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontFamily: uiFont, fontSize: 16, lineHeight: 20, fontWeight: "600" }}>{title}</Text>
          {showDate ? (
            <Pressable onPress={onDatePress} disabled={!onDatePress} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: 1 })}>
              <Text style={{ color: activeText, fontFamily: uiFont, fontSize: 11, lineHeight: 16, fontWeight: "400" }}>{formatDate(selectedDate)}</Text>
            </Pressable>
          ) : subtitle ? (
            <Text style={{ color: colors.muted, fontFamily: uiFont, fontSize: 11, lineHeight: 16, fontWeight: "400", marginTop: 1 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {showFilter ? (
          <Pressable
            accessibilityLabel={filterMode === "all" ? "Показать мои заявки" : "Показать все заявки"}
            onPress={() => onFilterToggle?.(filterMode === "all" ? "mine" : "all")}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: filterMode === "mine" ? activeText : border,
              backgroundColor: controlBackground,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <MaterialIcons
              name={filterMode === "mine" ? "person-search" : "tune"}
              size={20}
              color={filterMode === "mine" ? activeText : colors.muted}
            />
          </Pressable>
        ) : <View style={{ width: 38, height: 38 }} />}
      </View>
    </View>
  );
}
