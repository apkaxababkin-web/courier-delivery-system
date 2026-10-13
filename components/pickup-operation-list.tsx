import { useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { CheckCircle2, Circle, XCircle } from "lucide-react-native";

export type PickupOperationPoint = {
  id: number;
  name: string;
  address: string;
  phone?: string | null;
  isPicked: boolean;
  pickedAt: Date | string | null;
  isCancelled?: boolean;
  cancelledAt?: Date | string | null;
  courierId?: number | null;
  courierName?: string | null;
};

export type PickupCourierOption = {
  id: number;
  name: string;
};

type PickupOperationListProps = {
  points: PickupOperationPoint[];
  couriers?: PickupCourierOption[];
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
  onCancel?: (pointId: number) => void;
  onAssignCourier?: (pointId: number, courierId: number | null) => void;
};

function formatTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function PickupOperationList({
  points,
  couriers = [],
  colors,
  fallbackName,
  disabled,
  onToggle,
  onCancel,
  onAssignCourier,
}: PickupOperationListProps) {
  const [selectedPoint, setSelectedPoint] = useState<PickupOperationPoint | null>(null);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const longPressPointRef = useRef<number | null>(null);

  const closeActions = () => {
    longPressPointRef.current = null;
    setSelectedPoint(null);
    setShowCourierPicker(false);
  };

  const handlePointPress = (pointId: number) => {
    if (disabled) return;

    if (longPressPointRef.current === pointId) {
      longPressPointRef.current = null;
      return;
    }

    onToggle(pointId);
  };

  const handlePointLongPress = (point: PickupOperationPoint) => {
    if (disabled) return;
    longPressPointRef.current = point.id;
    setSelectedPoint(point);
    setShowCourierPicker(false);
  };

  const cancelPoint = () => {
    if (!selectedPoint || disabled || !onCancel) return;
    onCancel(selectedPoint.id);
    closeActions();
  };

  const assignCourier = (courierId: number | null) => {
    if (!selectedPoint || disabled || !onAssignCourier) return;
    onAssignCourier(selectedPoint.id, courierId);
    closeActions();
  };

  return (
    <View>
      {points.map((point, index) => {
        const pickedTime = formatTime(point.pickedAt);
        const cancelled = Boolean(point.isCancelled);
        const done = Boolean(point.isPicked);

        return (
          <Pressable
            key={point.id}
            disabled={disabled}
            delayLongPress={450}
            onPress={() => handlePointPress(point.id)}
            onLongPress={() => handlePointLongPress(point)}
            style={({ pressed }) => ({
              minHeight: 72,
              flexDirection: "row",
              backgroundColor: cancelled
                ? pressed ? "rgba(220, 38, 38, 0.14)" : "rgba(220, 38, 38, 0.08)"
                : done
                  ? pressed ? "rgba(34, 197, 94, 0.16)" : "rgba(34, 197, 94, 0.10)"
                  : pressed ? colors.surface : colors.background,
              borderBottomWidth: 1,
              borderBottomColor: cancelled ? "rgba(220, 38, 38, 0.26)" : done ? "rgba(34, 197, 94, 0.28)" : colors.border,
              opacity: disabled ? 0.55 : 1,
            })}
          >
            <View style={{ width: 48, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: colors.border }}>
              {cancelled ? (
                <XCircle size={20} color="#DC2626" strokeWidth={2.3} />
              ) : done ? (
                <CheckCircle2 size={20} color={colors.success} strokeWidth={2.3} />
              ) : (
                <Circle size={20} color={colors.success} strokeWidth={2.3} />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0, paddingVertical: 13, paddingRight: 16, paddingLeft: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, lineHeight: 19, fontWeight: "700" }}>
                    {index + 1}. {point.name || fallbackName}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
                    {point.address || "Адрес не указан"}
                  </Text>
                </View>

                {done || cancelled || point.courierName ? (
                  <View style={{ alignItems: "flex-end", marginLeft: 12, maxWidth: 112 }}>
                    {cancelled ? (
                      <Text style={{ color: "#DC2626", fontSize: 11, lineHeight: 16, fontWeight: "800" }}>Отменено</Text>
                    ) : pickedTime ? (
                      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{pickedTime}</Text>
                    ) : null}
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

      <Modal visible={selectedPoint !== null} transparent animationType="fade" onRequestClose={closeActions}>
        <Pressable
          onPress={closeActions}
          style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(15, 23, 42, 0.52)" }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 16 }}
          >
            <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 17, lineHeight: 22, fontWeight: "800" }}>
              {selectedPoint?.name || fallbackName}
            </Text>
            <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 16 }}>
              {selectedPoint?.address || "Адрес не указан"}
            </Text>

            {showCourierPicker ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", marginBottom: 2 }}>
                  Выберите курьера
                </Text>

                {couriers.map((courier) => (
                  <Pressable
                    key={courier.id}
                    disabled={disabled}
                    onPress={() => assignCourier(courier.id)}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      justifyContent: "center",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 12,
                      backgroundColor: pressed ? colors.surface : colors.background,
                    })}
                  >
                    <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>
                      {courier.name}
                    </Text>
                  </Pressable>
                ))}

                <Pressable
                  disabled={disabled}
                  onPress={() => assignCourier(null)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#DC2626",
                    backgroundColor: pressed ? "rgba(220, 38, 38, 0.10)" : colors.background,
                  })}
                >
                  <Text style={{ color: "#DC2626", fontSize: 14, fontWeight: "800" }}>Снять курьера</Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowCourierPicker(false)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: pressed ? colors.surface : colors.background,
                  })}
                >
                  <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700" }}>Назад</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Pressable
                  disabled={disabled || !onCancel}
                  onPress={cancelPoint}
                  style={({ pressed }) => ({
                    minHeight: 46,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#DC2626",
                    backgroundColor: pressed ? "rgba(220, 38, 38, 0.10)" : colors.background,
                    opacity: disabled || !onCancel ? 0.45 : 1,
                  })}
                >
                  <Text style={{ color: "#DC2626", fontSize: 14, fontWeight: "800" }}>Отменено</Text>
                </Pressable>

                <Pressable
                  disabled={disabled || !onAssignCourier}
                  onPress={() => setShowCourierPicker(true)}
                  style={({ pressed }) => ({
                    minHeight: 46,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.surface : colors.background,
                    opacity: disabled || !onAssignCourier ? 0.45 : 1,
                  })}
                >
                  <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>Выбрать курьера</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
