import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBadge } from "@/components/status-badge";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";

// ─── Urgency & Border Colors ──────────────────────────────────────────────────
const URGENCY_CONFIG = {
  critical: { borderColor: "#EF4444", urgencyText: "< 30 мин", urgencyColor: "#EF4444" },
  high: { borderColor: "#F59E0B", urgencyText: "< 1 час", urgencyColor: "#F59E0B" },
  normal: { borderColor: "#22C55E", urgencyText: "", urgencyColor: "#687076" },
  low: { borderColor: "#0a7ea4", urgencyText: "", urgencyColor: "#687076" },
};

function getUrgencyConfig(deliveryTimeFrom?: string | null): typeof URGENCY_CONFIG.critical {
  if (!deliveryTimeFrom) return URGENCY_CONFIG.normal;

  const now = new Date();
  const deliveryTime = new Date(deliveryTimeFrom);
  const minutesUntilDelivery = (deliveryTime.getTime() - now.getTime()) / (1000 * 60);

  if (minutesUntilDelivery < 30) return URGENCY_CONFIG.critical;
  if (minutesUntilDelivery < 60) return URGENCY_CONFIG.high;
  if (minutesUntilDelivery < 240) return URGENCY_CONFIG.normal;
  return URGENCY_CONFIG.low;
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TaskCardData {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  deliveryCity?: string | null;
  recipientAddress?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  status: TaskStatus;
  placesCount?: number | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  courierName?: string | null;
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const urgency = getUrgencyConfig(task.deliveryTimeFrom);

  // Format time range
  const timeRange = task.deliveryTimeFrom && task.deliveryTimeTo
    ? `${task.deliveryTimeFrom.slice(0, 5)} - ${task.deliveryTimeTo.slice(0, 5)}`
    : "";

  return (
    <TouchableOpacity onPress={() => onPress(task)} activeOpacity={0.7}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderLeftColor: urgency.borderColor,
          },
        ]}
      >
        {/* Row 1: ID + Urgency + Status */}
        <View style={styles.row1}>
          <View style={styles.idUrgencyContainer}>
            <Text style={[styles.idText, { color: colors.muted }]}>
              ID: {task.id}
            </Text>
            {urgency.urgencyText && (
              <Text style={[styles.urgencyText, { color: urgency.urgencyColor }]}>
                {urgency.urgencyText}
              </Text>
            )}
          </View>
          <StatusBadge status={task.status} size="sm" />
        </View>

        {/* Row 2: Recipient Name */}
        <Text style={[styles.recipientName, { color: colors.foreground }]}>
          {task.recipientName}
        </Text>

        {/* Row 3: Sender */}
        {task.senderAddress && (
          <Text style={[styles.senderText, { color: colors.muted }]}>
            Отправитель: {task.senderAddress}
          </Text>
        )}

        {/* Row 4: From/To Addresses */}
        <View style={styles.addressesContainer}>
          <View style={styles.addressRow}>
            <Text style={[styles.addressLabel, { color: colors.muted }]}>📍 От:</Text>
            <Text style={[styles.addressValue, { color: colors.muted }]}>
              {task.recipientAddress || "—"}
            </Text>
          </View>
          <View style={styles.addressRow}>
            <Text style={[styles.addressLabel, { color: colors.muted }]}>📍 До:</Text>
            <Text style={[styles.addressValue, { color: colors.muted }]}>
              {task.deliveryAddress}
            </Text>
          </View>
        </View>

        {/* Row 5: Time + Places */}
        <View style={styles.row5}>
          {timeRange && (
            <Text style={[styles.timeText, { color: colors.muted }]}>
              Время: {timeRange}
            </Text>
          )}
          {task.placesCount && task.placesCount > 0 && (
            <Text style={[styles.placesText, { color: colors.muted }]}>
              Мест: {task.placesCount}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 5,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  row1: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  idUrgencyContainer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  idText: {
    fontSize: 12,
    fontWeight: "500",
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: "600",
  },
  recipientName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    lineHeight: 20,
  },
  senderText: {
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 16,
  },
  addressesContainer: {
    marginBottom: 8,
    gap: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  addressLabel: {
    fontSize: 12,
    fontWeight: "500",
    minWidth: 30,
  },
  addressValue: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  row5: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  placesText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
