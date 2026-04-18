import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBadge } from "@/components/status-badge";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";

// ─── Status border colors (based on status) ────────────────────────────────

const STATUS_BORDER_COLORS: Record<TaskStatus, string> = {
  pending:     "#9CA3AF", // grey
  assigned:    "#3B82F6", // blue
  in_progress: "#F97316", // orange
  completed:   "#22C55E", // green
  cancelled:   "#EF4444", // red
};

// ─── Courier color dot ────────────────────────────────────────────────────────

const COURIER_COLORS = [
  "#007AFF", // blue
  "#22C55E", // green
  "#F59E0B", // orange
  "#8B5CF6", // purple
  "#EF4444", // red
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#84CC16", // lime
];

/** Returns a stable color for a given courier name */
function getCourierColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COURIER_COLORS[Math.abs(hash) % COURIER_COLORS.length];
}

/** Shorten name: "Иван Тестов" → "Иван Т." */
function shortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const borderColor = STATUS_BORDER_COLORS[task.status] ?? "#9CA3AF";

  const hasTimeInterval = task.deliveryTimeFrom || task.deliveryTimeTo;
  const timeLabel = hasTimeInterval
    ? `${task.deliveryTimeFrom ?? "?"} – ${task.deliveryTimeTo ?? "?"}`
    : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderLeftColor: borderColor,
        },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.7}
    >
      {/* Top row: ID + Status (right) */}
      <View style={styles.topRow}>
        <Text style={[styles.idText, { color: colors.foreground }]}>
          ID: {task.id}
        </Text>
        <StatusBadge status={task.status} size="sm" />
      </View>

      {/* Recipient name (bold) */}
      <Text style={[styles.recipientName, { color: colors.foreground }]}>
        {task.recipientName}
      </Text>

      {/* Sender (grey) */}
      {task.senderName && (
        <Text style={[styles.senderText, { color: colors.muted }]}>
          Отправитель: {task.senderName}
        </Text>
      )}

      {/* From address */}
      <View style={styles.addressRow}>
        <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
        <Text style={[styles.addressText, { color: colors.muted }]}>
          От: {task.senderAddress || task.deliveryAddress}
        </Text>
      </View>

      {/* To address */}
      <View style={styles.addressRow}>
        <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
        <Text style={[styles.addressText, { color: colors.muted }]}>
          До: {task.deliveryAddress}
        </Text>
      </View>

      {/* Time + Places (bottom row) */}
      <View style={styles.bottomRow}>
        {timeLabel && (
          <Text style={[styles.timeText, { color: colors.muted }]}>
            Время: {timeLabel}
          </Text>
        )}
        {task.placesCount != null && (
          <Text style={[styles.placesText, { color: colors.muted }]}>
            Мест: {task.placesCount}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  idText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    marginBottom: 4,
  },
  senderText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 4,
  },
  addressIcon: {
    fontSize: 14,
    lineHeight: 16,
    marginTop: 1,
  },
  addressText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
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
