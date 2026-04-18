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
      {/* Top row: ID (right) */}
      <View style={styles.topRow}>
        <View style={{ flex: 1 }} />
        <Text style={[styles.idText, { color: colors.muted }]}>
          ID: {task.id}
        </Text>
      </View>

      {/* Sender name (bold) */}
      {task.senderName && (
        <Text style={[styles.senderName, { color: colors.foreground }]}>
          {task.senderName}
        </Text>
      )}

      {/* Sender address */}
      {task.senderAddress && (
        <View style={styles.addressRow}>
          <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
          <Text style={[styles.addressText, { color: colors.muted }]}>
            {task.senderAddress}
          </Text>
        </View>
      )}

      {/* Recipient name (bold) */}
      <Text style={[styles.recipientName, { color: colors.foreground }]}>
        {task.recipientName}
      </Text>

      {/* Recipient address */}
      <View style={styles.addressRow}>
        <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
        <Text style={[styles.addressText, { color: colors.muted }]}>
          {task.deliveryAddress}
        </Text>
      </View>

      {/* Time interval */}
      {timeLabel && (
        <Text style={[styles.timeText, { color: colors.foreground }]}>
          {timeLabel}
        </Text>
      )}

      {/* Bottom row: Status + Courier */}
      <View style={styles.bottomRow}>
        <StatusBadge status={task.status} size="sm" />
        {task.courierName && (
          <Text style={[styles.courierText, { color: colors.muted }]}>
            👤 {shortName(task.courierName)}
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
    justifyContent: "flex-end",
    alignItems: "center",
    marginBottom: 6,
  },
  idText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
  },
  senderName: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 2,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 2,
    marginTop: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 2,
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
  timeText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  courierText: {
    fontSize: 11,
    lineHeight: 14,
  },
  placesText: {
    fontSize: 11,
    lineHeight: 14,
  },
});
