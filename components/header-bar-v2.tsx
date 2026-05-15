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
  onFilterToggle,
  filterMode = "all",
  selectedDate = new Date(),
  onDatePress,
}: HeaderBarV2Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

  const border = dark ? "rgba(148,163,184,0.20)" : "rgba(226,232,240,0.95)";
  const glass = dark ? "rgba(12,20,30,0.94)" : "rgba(255,253,248,0.96)";
  const active = dark ? "rgba(59,130,246,0.18)" : "#EAF2FF";
  const activeText = dark ? "#BFD5FF" : colors.primary;
  const inactiveText = dark ? "#8B95A7" : colors.muted;

  const Segment = ({ value, label }: { value: "mine" | "all"; label: string }) => {
    const isActive = filterMode === value;
    return (
      <Pressable
        onPress={() => onFilterToggle?.(value)}
        style={({ pressed }) => ({
          flex: 1,
          opacity: pressed ? 0.72 : 1,
          borderRadius: 15,
          paddingVertical: 9,
          alignItems: "center",
          backgroundColor: isActive ? active : "transparent",
          borderWidth: isActive ? 1 : 0,
          borderColor: isActive ? "rgba(125,178,255,0.32)" : "transparent",
        })}
      >
        <Text style={{ color: isActive ? activeText : inactiveText, fontSize: 14, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ marginTop: -insets.top, paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: colors.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <View style={{ flex: 1.1, flexDirection: "row", backgroundColor: glass, borderRadius: 20, borderWidth: 1, borderColor: border, padding: 4 }}>
          <Segment value="mine" label="Мои" />
          <Segment value="all" label="Все" />
        </View>

        <View style={{ flex: 0.75, alignItems: "center" }}>
          <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "900", letterSpacing: 0.2 }}>Заявки</Text>
        </View>

        <Pressable
          onPress={onDatePress}
          style={({ pressed }) => ({
            flex: 0.88,
            opacity: pressed ? 0.72 : 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            backgroundColor: glass,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: border,
            paddingVertical: 13,
            paddingHorizontal: 8,
          })}
        >
          <MaterialIcons name="calendar-today" size={18} color={activeText} />
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "900" }}>{formatDate(selectedDate)}</Text>
        </Pressable>
      </View>
    </View>
  );
}
