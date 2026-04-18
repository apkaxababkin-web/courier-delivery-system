import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBadge } from "@/components/status-badge";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";

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

// ─── Status accent colors (soft, not too bright) ─────────────────────────────

const STATUS_ACCENT: Record<TaskStatus, string> = {
  pending:     "#9CA3AF", // grey
  assigned:    "#3B82F6", // blue
  in_progress: "#F97316", // orange
  completed:   "#22C55E", // green
  cancelled:   "#D1D5DB", // light grey
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const accent = STATUS_ACCENT[task.status] ?? "#9CA3AF";

  const hasTimeInterval = task.deliveryTimeFrom || task.deliveryTimeTo;
  const timeLabel = hasTimeInterval
    ? `${task.deliveryTimeFrom ?? "?"} – ${task.deliveryTimeTo ?? "?"}`
    : null;

  // Show places only if more than 1
  const hasPlaces = task.placesCount != null && task.placesCount > 1;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.7}
    >
      {/* Main row: ID | Recipient | Address | Time | Places | Status | Courier | Chevron */}
      <View style={styles.mainRow}>
        {/* ID Badge */}
        <View style={[styles.idBadge, { backgroundColor: accent }]}>
          <Text style={styles.idText}>{task.id}</Text>
        </View>

        {/* Recipient name */}
        <Text style={[styles.recipientName, { color: colors.foreground }]} numberOfLines={1}>
          {task.recipientName}
        </Text>

        {/* Delivery address (compact) */}
        <Text style={[styles.addressText, { color: colors.muted }]} numberOfLines={1}>
          {task.deliveryAddress}
        </Text>

        {/* Time interval (if exists) */}
        {timeLabel && (
          <Text style={[styles.timeText, { color: colors.muted }]} numberOfLines={1}>
            {timeLabel}
          </Text>
        )}

        {/* Places count (if > 1) */}
        {hasPlaces && (
          <Text style={[styles.placesText, { color: colors.muted }]}>
            📦 {task.placesCount}
          </Text>
        )}

        {/* Status badge */}
        <StatusBadge status={task.status} size="sm" />

        {/* Courier indicator */}
        {task.courierName ? (
          <View style={styles.courierIndicator}>
            <View style={[styles.courierDot, { backgroundColor: getCourierColor(task.courierName) }]} />
            <Text style={[styles.courierText, { color: colors.foreground }]} numberOfLines={1}>
              {shortName(task.courierName)}
            </Text>
          </View>
        ) : (
          <Text style={[styles.unassignedText, { color: colors.muted }]}>
            —
          </Text>
        )}

        {/* Chevron */}
        <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginBottom: 6,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  idBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  idText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    minWidth: 80,
    maxWidth: 120,
  },
  addressText: {
    fontSize: 12,
    lineHeight: 16,
    minWidth: 100,
    maxWidth: 140,
  },
  timeText: {
    fontSize: 11,
    lineHeight: 16,
    minWidth: 60,
    maxWidth: 80,
  },
  placesText: {
    fontSize: 11,
    lineHeight: 16,
    minWidth: 35,
  },
  courierIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 60,
    maxWidth: 80,
  },
  courierDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  courierText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
  },
  unassignedText: {
    fontSize: 12,
    lineHeight: 16,
    minWidth: 20,
  },
  chevron: {
    fontSize: 16,
    lineHeight: 18,
    marginLeft: 4,
    flexShrink: 0,
  },
});
