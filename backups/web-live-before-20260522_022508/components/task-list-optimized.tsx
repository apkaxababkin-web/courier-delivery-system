/**
 * Optimized Task List Component
 * Uses FlatList for efficient rendering of large lists
 */

import React, { useCallback, useMemo } from "react";
import { FlatList, View, Text, ActivityIndicator } from "react-native";
import { TaskCardOptimized, type TaskData } from "./task-card-optimized";
import { useColors } from "@/hooks/use-colors";

interface TaskListOptimizedProps {
  tasks: TaskData[];
  onTaskPress: (taskId: number) => void;
  isLoading?: boolean;
  selectedTaskId?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
}

/**
 * Optimized task list using FlatList
 * - Only renders visible items
 * - Efficient scrolling performance
 * - Batches updates
 * - Removes clipped subviews from memory
 */
export function TaskListOptimized({
  tasks,
  onTaskPress,
  isLoading = false,
  selectedTaskId,
  onEndReached,
  onEndReachedThreshold = 0.5,
}: TaskListOptimizedProps) {
  const colors = useColors();

  // Memoize key extractor
  const keyExtractor = useCallback((item: TaskData) => item.id.toString(), []);

  // Memoize render item
  const renderItem = useCallback(
    ({ item }: { item: TaskData }) => (
      <TaskCardOptimized
        task={item}
        onPress={onTaskPress}
        isSelected={selectedTaskId === item.id}
      />
    ),
    [onTaskPress, selectedTaskId]
  );

  // Memoize empty list component
  const ListEmptyComponent = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-8">
        <Text className="text-muted text-center">Нет заявок</Text>
      </View>
    ),
    []
  );

  // Memoize loading footer
  const ListFooterComponent = useMemo(
    () =>
      isLoading ? (
        <View className="py-4 items-center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null,
    [isLoading, colors.primary]
  );

  return (
    <FlatList
      data={tasks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      // Performance optimizations
      initialNumToRender={10} // Render 10 items initially
      maxToRenderPerBatch={10} // Add 10 items per batch
      updateCellsBatchingPeriod={50} // Batch updates every 50ms
      removeClippedSubviews={true} // Remove off-screen items from memory
      scrollEventThrottle={16} // Throttle scroll events to 60fps
      // Pagination
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      // Styling
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
      showsVerticalScrollIndicator={true}
    />
  );
}
