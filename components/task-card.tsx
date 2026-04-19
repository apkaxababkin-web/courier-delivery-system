import { Pressable, Text, View } from "react-native";
import { StatusBadge } from "@/components/status-badge";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";
import { calculateUrgency } from "@/lib/task-sorting";

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
  senderName?: string | null;
  senderAddress?: string | null;
  recipientName: string;
  recipientAddress?: string | null;
  deliveryAddress: string;
  deliveryCity?: string | null;
  deliveryTimeFrom: string | null;
  deliveryTimeTo: string | null;
  status: TaskStatus;
  courierName?: string | null;
  placesCount?: number | null;
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
  const urgency = calculateUrgency(task);
  const isUrgent = urgency === "red" || urgency === "orange";
  const borderColor = isUrgent ? "#EF4444" : (STATUS_BORDER_COLORS[task.status] ?? "#9CA3AF");
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
    <Pressable
      onPress={() => onPress(task)}
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderWidth: 2,
          borderColor,
          padding: 12,
          marginBottom: 3,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {/* Header: recipient name + status badge */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: colors.foreground,
            flex: 1,
            marginRight: 8,
          }}
          numberOfLines={1}
        >
          {task.recipientName}
        </Text>
        <StatusBadge status={task.status} />
      </View>

      {/* Address */}
      <Text
        style={{
          fontSize: 14,
          color: colors.foreground,
          marginBottom: 8,
        }}
        numberOfLines={2}
      >
        {task.deliveryAddress}
      </Text>

      {/* Time label */}
      {timeLabel && (
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            marginBottom: 8,
          }}
        >
          ⏱️ {timeLabel}
        </Text>
      )}

      {/* Task type label (for warehouse_pickup) */}
      {taskTypeLabel && (
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            marginBottom: 8,
          }}
        >
          {taskTypeLabel}
        </Text>
      )}

      {/* Courier name (if assigned) */}
      {task.courierName && !isWarehousePickup && !isCourierCall && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: courierColor,
              marginRight: 6,
            }}
          />
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
            }}
          >
            {shortName(task.courierName)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
