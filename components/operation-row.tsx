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
  primaryName: string;
  primaryAddress?: string;
  secondaryName?: string;
  secondaryAddress?: string;
  detailLine?: string;
  places?: string | null;
  courier?: string | null;
  trailingMeta?: string | null;
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

function isEmpty(value?: string | null) {
  return !String(value || "").trim();
}

export function OperationRow({
  colors,
  status,
  statusColor,
  typeLabel,
  typeColor,
  TypeIcon,
  requestNumber,
  primaryName,
  primaryAddress,
  secondaryName,
  secondaryAddress,
  detailLine,
  places,
  courier,
  trailingMeta,
  time,
  isLast,
  onPress,
}: OperationRowProps) {
  const isCompleted = status === "completed";
  const statusLabel = getStatusLabel(status);
  const courierText = courier || "Без курьера";
  const hasCourier = courierText !== "Без курьера";

  const routeTitle = secondaryName
    ? `${primaryName || "—"} → ${secondaryName}`
    : primaryName || "—";

  const routeAddress = secondaryName
    ? [primaryAddress, secondaryAddress].filter((part) => !isEmpty(part)).join(" → ")
    : primaryAddress || "";

  const infoParts = [time, detailLine].filter((part) => !isEmpty(part));
  const footerParts = [places, trailingMeta].filter((part) => !isEmpty(part));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 112,
        paddingHorizontal: 12,
        paddingVertical: 10,
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
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 1,
          backgroundColor: isCompleted ? "rgba(34, 197, 94, 0.28)" : colors.border,
        }}
      />

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View
            style={{
              maxWidth: "58%",
              minHeight: 28,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 9,
              paddingHorizontal: 9,
              paddingVertical: 4,
              backgroundColor: alpha(typeColor, 0.12),
            }}
          >
            <TypeIcon size={15} color={typeColor} strokeWidth={2.4} />
            <Text
              numberOfLines={1}
              style={{
                color: typeColor,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "800",
                marginLeft: 6,
              }}
            >
              {typeLabel}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.muted,
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "700",
              }}
            >
              {requestNumber ? `№${requestNumber}` : "—"}
            </Text>

            <View
              style={{
                minHeight: 26,
                borderRadius: 9,
                paddingHorizontal: 9,
                paddingVertical: 4,
                backgroundColor: alpha(statusColor, 0.13),
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: statusColor,
                  fontSize: 12,
                  lineHeight: 17,
                  fontWeight: "800",
                }}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 5 }}>
          <View style={{ gap: 1 }}>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                color: colors.muted,
                fontSize: 10.5,
                lineHeight: 14,
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Отправитель
            </Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                color: colors.foreground,
                fontSize: 15,
                lineHeight: 20,
                fontWeight: "900",
              }}
            >
              {primaryName || "—"}
            </Text>
            {!isEmpty(primaryAddress) ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  color: colors.muted,
                  fontSize: 12.5,
                  lineHeight: 17,
                  fontWeight: "600",
                }}
              >
                {primaryAddress}
              </Text>
            ) : null}
          </View>

          {secondaryName || !isEmpty(secondaryAddress) ? (
            <View style={{ gap: 1 }}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  color: colors.muted,
                  fontSize: 10.5,
                  lineHeight: 14,
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                Получатель
              </Text>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  color: colors.foreground,
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: "900",
                }}
              >
                {secondaryName || "—"}
              </Text>
              {!isEmpty(secondaryAddress) ? (
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{
                    color: colors.muted,
                    fontSize: 12.5,
                    lineHeight: 17,
                    fontWeight: "600",
                  }}
                >
                  {secondaryAddress}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: colors.muted,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: "500",
          }}
        >
          {infoParts.length > 0 ? infoParts.join(" · ") : "Без комментария"}
        </Text>

        <View
          style={{
            minHeight: 30,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 10,
            paddingHorizontal: 8,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              maxWidth: "48%",
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: "transparent",
            }}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                color: hasCourier ? "#1D4ED8" : colors.muted,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "900",
              }}
            >
              {courierText}
            </Text>
          </View>

          {footerParts.length > 0 ? (
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{
                flex: 1,
                color: colors.muted,
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "700",
                marginLeft: 8,
              }}
            >
              {footerParts.map((part, index) => (
                <Text
                  key={`${part}-${index}`}
                  style={{
                    color: String(part).includes("₽") || String(part).toLowerCase().includes("оплач")
                      ? "#15803D"
                      : colors.muted,
                    fontWeight: String(part).includes("₽") || String(part).toLowerCase().includes("оплач")
                      ? "900"
                      : "700",
                  }}
                >
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
