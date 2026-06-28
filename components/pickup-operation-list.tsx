import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Circle } from "lucide-react-native";

export type PickupOperationPoint = {
  id: number;
  name: string;
  address: string;
  phone?: string | null;
  isPicked: boolean;
  pickedAt: Date | string | null;
  courierName?: string | null;
};

type PickupOperationListProps = {
  points: PickupOperationPoint[];
  colors: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    primary: string;
    success: string;
  };
  fallbackName: string;
  disabled?: boolean;
  onToggle: (pointId: number) => void;
};

function formatTime(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function PickupOperationList({
  points,
  colors,
  fallbackName,
  disabled,
  onToggle,
}: PickupOperationListProps) {
  return (
    <View>
      {points.map((point, index) => {
        const pickedTime = formatTime(point.pickedAt);

        return (
          <Pressable
            key={point.id}
            disabled={disabled}
            onPress={() => onToggle(point.id)}
            style={({ pressed }) => {
              const pickedBackground = "rgba(34, 197, 94, 0.10)";
              const pickedPressedBackground = "rgba(34, 197, 94, 0.16)";

              return {
                minHeight: 72,
                flexDirection: "row",
                backgroundColor: point.isPicked
                  ? pressed
                    ? pickedPressedBackground
                    : pickedBackground
                  : pressed
                    ? colors.surface
                    : colors.background,
                borderBottomWidth: 1,
                borderBottomColor: point.isPicked ? "rgba(34, 197, 94, 0.28)" : colors.border,
                opacity: disabled ? 0.55 : 1,
              };
            }}
          >
            <View
              style={{
                width: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRightWidth: 1,
                borderRightColor: colors.border,
              }}
            >
              {point.isPicked ? (
                <CheckCircle2 size={20} color={colors.success} strokeWidth={2.3} />
              ) : (
                <Circle size={20} color={colors.success} strokeWidth={2.3} />
              )}
            </View>

            <View
              style={{
                flex: 1,
                minWidth: 0,
                paddingVertical: 13,
                paddingRight: 16,
                paddingLeft: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, lineHeight: 19, fontWeight: "700" }}>
                    {index + 1}. {point.name || fallbackName}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
                    {point.address || "Адрес не указан"}
                  </Text>
                </View>

                {point.isPicked ? (
                  <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                    {pickedTime ? <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{pickedTime}</Text> : null}
                    {point.courierName ? (
                      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 }}>
                        {point.courierName}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
