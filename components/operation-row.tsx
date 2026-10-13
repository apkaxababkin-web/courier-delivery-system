import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";

type OperationRowProps = {
  colors: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    border: string;
    primary: string;
  };
  status: string;
  statusColor: string;
  typeLabel: string;
  typeColor: string;
  TypeIcon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  requestNumber?: string | number;
  title: string;
  line3?: string | null;
  line4?: string | null;
  places?: string | null;
  courier?: string | null;
  courierColor?: string | null;
  amount?: string | null;
  time?: string | null;
  isLast?: boolean;
  onPress: () => void;
};

function alpha(hex: string, value: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(100, 116, 139, ${value})`;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${value})`;
}

function getStatusLabel(status?: string) {
  if (status === "new") return "Новая";
  if (status === "in_progress") return "В работе";
  if (status === "completed") return "Выполнена";
  if (status === "cancelled") return "Отмена";
  if (status === "postponed") return "Перенесена";
  return "Новая";
}

export function OperationRow({
  colors,
  status,
  statusColor,
  typeLabel,
  typeColor,
  TypeIcon,
  requestNumber,
  title,
  line3,
  line4,
  places,
  courier,
  courierColor,
  amount,
  time,
  onPress,
}: OperationRowProps) {
  const isCompleted = status === "completed";
  const courierText = courier || "Без курьера";
  const hasCourier = courierText !== "Без курьера";
  const footerParts = [amount, places].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        marginHorizontal: 10,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        backgroundColor: isCompleted
          ? pressed
            ? "rgba(34, 197, 94, 0.16)"
            : "rgba(34, 197, 94, 0.10)"
          : pressed
            ? colors.surface
            : colors.background,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ gap: 5 }}>
        <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>
            {requestNumber ? `№${requestNumber}` : "—"}
          </Text>

          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <TypeIcon size={13} color={typeColor} strokeWidth={2.2} />
            <Text numberOfLines={1} style={{ color: typeColor, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>
              {typeLabel}
            </Text>
          </View>

          <View style={{ borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: alpha(statusColor, 0.13) }}>
            <Text numberOfLines={1} style={{ color: statusColor, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>
              {getStatusLabel(status)}
            </Text>
          </View>
        </View>

        <View style={{ minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 19, fontWeight: "700" }}
          >
            {title || "Заявка"}
          </Text>
          {time ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "600" }}>
              {time}
            </Text>
          ) : null}
        </View>

        {line3 ? (
          <View style={{ justifyContent: "center" }}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              {line3}
            </Text>
          </View>
        ) : null}

        {line4 ? (
          <View style={{ justifyContent: "center" }}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
              {line4}
            </Text>
          </View>
        ) : null}

        <View style={{ minHeight: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{ flex: 1, color: hasCourier ? (courierColor || "#1D4ED8") : colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }}
          >
            {courierText}
          </Text>

          {footerParts.length > 0 ? (
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>
              {footerParts.map((part, index) => (
                <Text key={`${part}-${index}`} style={{ color: index === 0 && amount ? "#15803D" : colors.muted }}>
                  {index > 0 ? " · " : ""}
                  {part}
                </Text>
              ))}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
