/**
 * Optimized Task Card Component
 * Uses React.memo to prevent unnecessary re-renders
 */

import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { cn } from "@/lib/utils";
import { useColors } from "@/hooks/use-colors";

export interface TaskData {
  id: number;
  title: string;
  recipientName: string;
  address: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  timeRemaining?: number; // in minutes
  createdAt: string;
}

interface TaskCardProps {
  task: TaskData;
  onPress: (taskId: number) => void;
  isSelected?: boolean;
}

/**
 * Internal task card component (not memoized)
 */
function TaskCardInternal({ task, onPress, isSelected }: TaskCardProps) {
  const colors = useColors();

  // Memoize computed values
  const statusText = useMemo(() => {
    const statusMap: Record<string, string> = {
      pending: "Ожидание",
      assigned: "Назначена",
      in_progress: "В работе",
      completed: "Завершена",
      cancelled: "Отменена",
    };
    return statusMap[task.status] || task.status;
  }, [task.status]);

  const priorityColor = useMemo(() => {
    const colorMap: Record<string, string> = {
      low: "#10B981",
      normal: "#3B82F6",
      high: "#F59E0B",
      urgent: "#EF4444",
    };
    return colorMap[task.priority] || "#3B82F6";
  }, [task.priority]);

  const isUrgent = useMemo(() => {
    return task.timeRemaining !== undefined && task.timeRemaining < 30;
  }, [task.timeRemaining]);

  const timeRemainingText = useMemo(() => {
    if (!task.timeRemaining) return null;
    if (task.timeRemaining < 1) return "< 1 мин";
    if (task.timeRemaining < 60) return `${Math.round(task.timeRemaining)} мин`;
    const hours = Math.floor(task.timeRemaining / 60);
    const mins = task.timeRemaining % 60;
    return `${hours}ч ${mins}м`;
  }, [task.timeRemaining]);

  return (
    <Pressable
      onPress={() => onPress(task.id)}
      style={({ pressed }) => [
        {
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        className={cn(
          "p-4 rounded-lg border mb-3",
          isSelected ? "bg-primary/10 border-primary" : "bg-surface border-border"
        )}
        style={{
          borderLeftWidth: 4,
          borderLeftColor: priorityColor,
        }}
      >
        {/* Urgent indicator */}
        {isUrgent && (
          <View
            className="absolute top-2 right-2 w-3 h-3 rounded-full"
            style={{ backgroundColor: "#EF4444" }}
          />
        )}

        {/* Title and Status */}
        <View className="flex-row justify-between items-start mb-2">
          <Text
            className="flex-1 text-base font-semibold text-foreground"
            numberOfLines={1}
          >
            {task.title}
          </Text>
          <Text
            className="text-xs font-medium ml-2 px-2 py-1 rounded"
            style={{
              color: priorityColor,
              backgroundColor: `${priorityColor}20`,
            }}
          >
            {statusText}
          </Text>
        </View>

        {/* Recipient */}
        <Text className="text-sm text-muted mb-1" numberOfLines={1}>
          👤 {task.recipientName}
        </Text>

        {/* Address */}
        <Text className="text-sm text-muted mb-2" numberOfLines={2}>
          📍 {task.address}
        </Text>

        {/* Time remaining */}
        {timeRemainingText && (
          <Text
            className="text-xs font-semibold"
            style={{
              color: isUrgent ? "#EF4444" : "#666",
            }}
          >
            ⏱️ {timeRemainingText}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/**
 * Memoized task card component
 * Only re-renders if task, onPress, or isSelected props change
 */
export const TaskCardOptimized = React.memo(TaskCardInternal, (prevProps, nextProps) => {
  // Return true if props are equal (don't re-render)
  // Return false if props are different (re-render)
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.priority === nextProps.task.priority &&
    prevProps.task.timeRemaining === nextProps.task.timeRemaining &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onPress === nextProps.onPress
  );
});

TaskCardOptimized.displayName = "TaskCardOptimized";
