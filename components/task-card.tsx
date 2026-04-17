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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskCardData {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  deliveryCity?: string | null;
  recipientAddress?: string | null;
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

  const statusBorderColor: Record<TaskStatus, string> = {
    pending:     "#6B7280",
    assigned:    "#1A73E8",
    in_progress: "#FF6D00",
    completed:   "#34A853",
    cancelled:   "#9CA3AF",
  };
  const leftBorderColor = statusBorderColor[task.status] ?? colors.border;

  const hasTimeInterval = task.deliveryTimeFrom || task.deliveryTimeTo;
  const timeLabel = hasTimeInterval
    ? `${task.deliveryTimeFrom ?? "?"} – ${task.deliveryTimeTo ?? "?"}`
    : null;

  const hasPlaces = task.placesCount != null && task.placesCount > 1;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: leftBorderColor,
        },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.75}
    >
      {/* Row 1: Number badge + Client name */}
      <View style={styles.row1}>
        <View style={[styles.numBadge, { backgroundColor: leftBorderColor }]}>
          <Text style={styles.numText}>#{task.id}</Text>
        </View>
        <Text style={[styles.clientName, { color: colors.foreground }]} numberOfLines={1}>
          {task.recipientName}
        </Text>
      </View>

      {/* Row 2: Pickup address */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>АДРЕС</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
          {task.deliveryAddress}
          {task.deliveryCity ? `, ${task.deliveryCity}` : ""}
        </Text>
      </View>

      {/* Row 3: Recipient */}
      <View style={styles.infoRow}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>ПОЛУЧАТЕЛЬ</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
          {task.recipientName}
        </Text>
      </View>

      {/* Row 4: Recipient address (if set) */}
      {task.recipientAddress ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>АДРЕС ПОЛУЧ.</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
            {task.recipientAddress}
          </Text>
        </View>
      ) : null}

      {/* Row 5: Time interval (if set) */}
      {timeLabel ? (
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.muted }]}>ВРЕМЯ</Text>
          <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
            {timeLabel}
          </Text>
        </View>
      ) : null}

      {/* Footer: places left | status + courier right */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {hasPlaces ? (
            <Text style={[styles.placesText, { color: colors.muted }]}>
              📦 {task.placesCount} места
            </Text>
          ) : <View />}
        </View>

        <View style={styles.footerRight}>
          <StatusBadge status={task.status} size="sm" />
          {task.courierName ? (
            <View style={styles.courierBadge}>
              <View
                style={[
                  styles.courierDot,
                  { backgroundColor: getCourierColor(task.courierName) },
                ]}
              />
              <Text style={[styles.courierName, { color: colors.foreground }]}>
                {task.courierName.split(" ")[0]}{" "}
                {task.courierName.split(" ")[1]?.[0] ? `${task.courierName.split(" ")[1][0]}.` : ""}
              </Text>
            </View>
          ) : (
            <View style={[styles.courierBadge, { backgroundColor: "rgba(245,158,11,0.12)" }]}>
              <Text style={[styles.courierName, { color: "#D97706" }]}>Не назначен</Text>
            </View>
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
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 6,
  },
  row1: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  numBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  clientName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 18,
    width: 80,
    letterSpacing: 0.3,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  footerLeft: {
    flex: 1,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  placesText: {
    fontSize: 12,
    lineHeight: 18,
  },
  courierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0f2f5",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  courierDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  courierName: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 18,
  },
  chevron: {
    fontSize: 18,
    lineHeight: 22,
  },
});
