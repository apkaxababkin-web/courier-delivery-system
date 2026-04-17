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
          borderLeftColor: accent,
        },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.75}
    >
      {/* Row 1: Number badge + Client name */}
      <View style={styles.row1}>
        <View style={[styles.numBadge, { backgroundColor: accent }]}>
          <Text style={styles.numText}>{task.id}</Text>
        </View>
        <Text style={[styles.clientName, { color: colors.foreground }]} numberOfLines={1}>
          {task.recipientName}
        </Text>
      </View>

      {/* Row 2: Sender name (if set) */}
      {task.senderName ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>👤 ОТПРАВИТЕЛЬ</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
            {task.senderName}
          </Text>
        </View>
      ) : null}

      {/* Row 3: Sender address */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>📍 АДРЕС</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
          {task.senderAddress ?? task.deliveryAddress}{task.deliveryCity ? `, ${task.deliveryCity}` : ""}
        </Text>
      </View>

      {/* Row 4: Recipient name */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>📦 ПОЛУЧАТЕЛЬ</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
          {task.recipientName}
        </Text>
      </View>

      {/* Row 5: Recipient address (if set) */}
      {task.recipientAddress ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>🏠 АДРЕС</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
            {task.recipientAddress}
          </Text>
        </View>
      ) : null}

      {/* Row 5: Time interval (if set) */}
      {timeLabel ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>🕐 ВРЕМЯ</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
            {timeLabel}
          </Text>
        </View>
      ) : null}

      {/* Footer: places left | status + courier right */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {/* Left: places count (empty if 1 or not set) */}
        <View style={styles.footerLeft}>
          {hasPlaces ? (
            <Text style={[styles.placesText, { color: colors.muted }]}>
              📦 {task.placesCount} мест
            </Text>
          ) : null}
        </View>

        {/* Right: status badge + courier */}
        <View style={styles.footerRight}>
          <StatusBadge status={task.status} size="sm" />

          {task.courierName ? (
            <View style={styles.courierRow}>
              <View style={[styles.courierDot, { backgroundColor: getCourierColor(task.courierName) }]} />
              <Text style={[styles.courierText, { color: colors.foreground }]}>
                {shortName(task.courierName)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.unassignedText, { color: colors.muted }]}>
              Не назначен
            </Text>
          )}

          <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 10,
    gap: 5,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  numBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  clientName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 17,
    width: 90,
    letterSpacing: 0.2,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 0.5,
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  placesText: {
    fontSize: 12,
    lineHeight: 17,
  },
  // Courier: just dot + name, no background box
  courierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  courierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  courierText: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
  },
  unassignedText: {
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  chevron: {
    fontSize: 18,
    lineHeight: 20,
  },
});
