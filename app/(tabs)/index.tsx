import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import type { TaskStatus } from "@/shared/types";

type FilterTab = "new" | "active" | "all";

const FILTER_TABS: { key: FilterTab; label: string; statuses: TaskStatus[] }[] = [
  { key: "new",    label: "Новые",   statuses: ["assigned"] },
  { key: "active", label: "В работе", statuses: ["accepted", "in_progress"] },
  { key: "all",    label: "Все",     statuses: ["assigned", "accepted", "in_progress"] },
];

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const {
    data: tasks,
    isLoading,
    refetch,
    isRefetching,
  } = trpc.tasks.myActive.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000, // Poll every 15 seconds for real-time updates
  });

  const seedMutation = trpc.courier.seedDemoTasks.useMutation({
    onSuccess: () => refetch(),
  });

  const currentFilter = FILTER_TABS.find((f) => f.key === activeFilter)!;
  const filteredTasks = (tasks ?? []).filter((t) =>
    currentFilter.statuses.includes(t.status as TaskStatus)
  ) as TaskCardData[];

  const handleTaskPress = useCallback(
    (task: TaskCardData) => {
      router.push({ pathname: "/task/[id]" as any, params: { id: task.id } });
    },
    [router]
  );

  if (authLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Войдите в аккаунт
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Для просмотра заданий необходимо авторизоваться
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/profile" as any)}
          >
            <Text style={styles.loginBtnText}>Перейти к входу</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Мои задания</Text>
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            {user?.name ?? "Курьер"}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}>
          <Text style={[styles.badgeText, { color: colors.primary }]}>
            {(tasks ?? []).length}
          </Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[styles.filterRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.filterTab,
                isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text
                style={[
                  styles.filterLabel,
                  { color: isActive ? colors.primary : colors.muted },
                  isActive && { fontWeight: "600" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Task list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Загрузка заданий...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TaskCard task={item} onPress={handleTaskPress} />
          )}
          contentContainerStyle={[
            styles.listContent,
            filteredTasks.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Нет активных заданий
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Новые задания появятся здесь автоматически
              </Text>
              <TouchableOpacity
                style={[styles.seedBtn, { borderColor: colors.primary }]}
                onPress={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Text style={[styles.seedBtnText, { color: colors.primary }]}>
                  {seedMutation.isPending ? "Загрузка..." : "Загрузить демо-задания"}
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  headerSub: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 16,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
  },
  listEmpty: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 4,
  },
  seedBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  seedBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  loginBtn: {
    marginTop: 20,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
