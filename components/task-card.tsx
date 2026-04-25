import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBadge } from "@/components/status-badge";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";
import { calculateUrgencyFromTimeString } from "@/lib/task-sorting";

// ─── Status border colors (based on status) ────────────────────────────────

const STATUS_BORDER_COLORS: Record<TaskStatus, string> = {
  pending:     "#9CA3AF", // grey
  assigned:    "#3B82F6", // blue
  in_progress: "#F97316", // orange
  completed:   "#22C55E", // green
  cancelled:   "#EF4444", // red
};

// ─── Courier color palette ────────────────────────────────────────────────────

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
  taskType?: "regular" | "warehouse_pickup" | "courier_call";
  items?: string | null; // JSON array of {name: string, quantity: number}
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const urgency = calculateUrgencyFromTimeString(task.deliveryTimeTo);
  const borderColor = urgency === "red" ? "#EF4444" : (urgency === "orange" ? "#FF6D00" : STATUS_BORDER_COLORS[task.status] ?? "#9CA3AF");
  const courierColor = task.courierName ? getCourierColor(task.courierName) : colors.muted;

  const hasTimeInterval = task.deliveryTimeFrom || task.deliveryTimeTo;
  const timeLabel = hasTimeInterval
    ? `${task.deliveryTimeFrom ?? "?"} – ${task.deliveryTimeTo ?? "?"}`
    : null;

  // Get task type label - for warehouse_pickup, use first item name if available
  let taskTypeLabel = null;
  if (task.taskType === "warehouse_pickup" && task.items) {
    try {
      const items = JSON.parse(task.items);
      const category = items[0]?.category || "Товар";
      taskTypeLabel = `📦 ${category}`;
    } catch {
      taskTypeLabel = "📦 Товар";
    }
  } else if (task.taskType === "warehouse_pickup") {
    taskTypeLabel = "📦 Товар";
  } else if (task.taskType === "courier_call") {
    taskTypeLabel = "📞 Вызов курьера";
  }

  // For warehouse_pickup: show all info on card
  // For courier_call: show minimal info (address + time)
  // For regular: show current layout
  const isWarehousePickup = task.taskType === "warehouse_pickup";
  const isCourierCall = task.taskType === "courier_call";

  return (
    <View style={{ position: "relative" }}>
      {/* Red dot for urgent tasks */}
      {urgency === "red" && (
        <View
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            marginLeft: -4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: "#EF4444",
            zIndex: 10,
          }}
        />
      )}

      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderLeftColor: borderColor,
            borderColor: colors.border,
          },
        ]}
        onPress={() => onPress(task)}
        activeOpacity={0.7}
      >
        {/* Task type label (if applicable) */}
      {taskTypeLabel && (
        <Text style={[styles.taskTypeLabel, { color: colors.primary }]}>
          {taskTypeLabel}
        </Text>
      )}

      {/* Top row: Sender name + ID (hide sender name for warehouse_pickup) */}
      <View style={styles.topRow}>
        {!isWarehousePickup && (
          <Text style={[styles.senderName, { color: colors.foreground }]}>
            {task.senderName || "Отправитель"}
          </Text>
        )}
        <Text style={[styles.idText, { color: colors.muted }]}>
          ID: {task.id}
        </Text>
      </View>

      {/* Sender address - show for regular only, hide for warehouse_pickup and courier_call */}
      {task.senderAddress && !isCourierCall && !isWarehousePickup && (
        <View style={styles.addressRow}>
          <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
          <Text style={[styles.addressText, { color: colors.muted }]}>
            {task.senderAddress}
          </Text>
        </View>
      )}

      {/* For courier_call: show address as pickup location */}
      {isCourierCall && task.senderAddress && (
        <View style={styles.addressRow}>
          <Text style={[styles.addressIcon, { color: colors.muted }]}>🏢</Text>
          <Text style={[styles.addressText, { color: colors.muted }]}>
            Адрес: {task.senderAddress}
          </Text>
        </View>
      )}

      {/* Recipient name - hide for courier_call and warehouse_pickup */}
      {!isCourierCall && !isWarehousePickup && (
        <Text style={[styles.recipientName, { color: colors.foreground }]}>
          {task.recipientName}
        </Text>
      )}

      {/* For warehouse_pickup: show delivery location name */}
      {isWarehousePickup && (
        <Text style={[styles.recipientName, { color: colors.foreground }]}>
          {task.recipientName}
        </Text>
      )}

      {/* Recipient address - show for all except courier_call */}
      {!isCourierCall && (
        <View style={styles.addressRow}>
          <Text style={[styles.addressIcon, { color: colors.muted }]}>📍</Text>
          <Text style={[styles.addressText, { color: colors.muted }]}>
            {task.deliveryAddress}
          </Text>
        </View>
      )}

      {/* Items list for warehouse_pickup */}
      {isWarehousePickup && task.items && (
        <View style={styles.itemsContainer}>
          {(() => {
            try {
              const items = JSON.parse(task.items);
              return items.map((item: {category?: string; name: string; quantity: number}, idx: number) => (
                <Text key={idx} style={[styles.itemText, { color: colors.foreground }]}>
                  • {item.name} — {item.quantity} шт
                </Text>
              ));
            } catch {
              return null;
            }
          })()}
        </View>
      )}

      {/* Time interval */}
      {timeLabel && (
        <Text style={[styles.timeText, { color: colors.foreground }]}>
          {timeLabel}
        </Text>
      )}

      {/* Bottom row: Status + Courier + Places */}
      <View style={styles.bottomRow}>
        <StatusBadge status={task.status} size="sm" />
        
        {task.courierName && (
          <View style={styles.courierBadge}>
            <View
              style={[
                styles.courierDot,
                { backgroundColor: courierColor },
              ]}
            />
            <Text style={[styles.courierText, { color: colors.muted }]}>
              {shortName(task.courierName)}
            </Text>
          </View>
        )}
        
        {task.placesCount != null && (
          <Text style={[styles.placesText, { color: colors.muted }]}>
            Мест: {task.placesCount}
          </Text>
        )}
      </View>
    </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  taskTypeLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  card: {
    borderRadius: 20,
    borderLeftWidth: 6,
    borderWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  idText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
  },
  senderName: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  recipientName: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 2,
    marginTop: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 1,
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
  courierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  courierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  courierText: {
    fontSize: 11,
    lineHeight: 14,
  },
  itemsContainer: {
    marginTop: 8,
    paddingLeft: 4,
    gap: 4,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
  },
  placesText: {
    fontSize: 11,
    lineHeight: 14,
    marginLeft: "auto",
  },
});
