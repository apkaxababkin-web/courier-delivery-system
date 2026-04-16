import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { skipToken } from "@tanstack/react-query";

import { ScreenContainer } from "@/components/screen-container";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";

export default function HistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, isAuthenticated } = useCourierAuth();

  const { data: tasks, isLoading } = trpc.tasks.myHistory.useQuery(
    token ? { token } : skipToken
  );

  return (
    <ScreenContainer>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>История доставок</Text>
        {isAuthenticated && (
          <Text style={[styles.headerSub, { color: colors.muted }]}>
            Всего: {(tasks ?? []).length}
          </Text>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !isAuthenticated ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Войдите в аккаунт
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Для просмотра истории необходимо войти в систему
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/profile" as any)}
          >
            <Text style={styles.loginBtnText}>Войти</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks ?? []}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TaskCard
              task={item as TaskCardData}
              onPress={(t) => router.push({ pathname: "/task/[id]" as any, params: { id: t.id } })}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            (tasks ?? []).length === 0 && styles.listEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                История пуста
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                Завершённые и отклонённые задания будут отображаться здесь
              </Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
  },
  listEmpty: {
    flex: 1,
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
  loginBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
