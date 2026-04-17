import React, { useState } from "react";
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
import { skipToken } from "@tanstack/react-query";

import { ScreenContainer } from "@/components/screen-container";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { type TaskStatus } from "@/shared/types";

type FilterTab = "active" | "history";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "active",  label: "Активные" },
  { key: "history", label: "История" },
];

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier } = useCourierAuth();
  const [tab, setTab] = useState<FilterTab>("active");

  const {
    data: activeTasks,
    isLoading: loadingActive,
    refetch: refetchActive,
    isRefetching: refreshingActive,
  } = trpc.tasks.all.useQuery(token ? { token } : skipToken);

  const {
    data: historyTasks,
    isLoading: loadingHistory,
    refetch: refetchHistory,
    isRefetching: refreshingHistory,
  } = trpc.tasks.history.useQuery(token ? { token } : skipToken);

  const seedMutation = trpc.tasks.seedDemo.useMutation({
    onSuccess: () => { refetchActive(); refetchHistory(); },
  });

  const tasks = tab === "active" ? (activeTasks ?? []) : (historyTasks ?? []);
  const isLoading = tab === "active" ? loadingActive : loadingHistory;
  const isRefreshing = tab === "active" ? refreshingActive : refreshingHistory;
  const refetch = tab === "active" ? refetchActive : refetchHistory;

  if (!token) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📦</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Войдите в аккаунт</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Перейдите на вкладку «Профиль» и введите логин и пароль
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Заявки</Text>
          {courier && (
            <Text style={[styles.headerSub, { color: colors.muted }]}>{courier.name}</Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.seedBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
          onPress={() => seedMutation.mutate({ token })}
          disabled={seedMutation.isPending}
        >
          <Text style={[styles.seedBtnText, { color: colors.primary }]}>
            {seedMutation.isPending ? "..." : "+ Демо"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {FILTER_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[
              styles.tab,
              tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.muted }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {tab === "active" ? "Нет активных заявок" : "История пуста"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {tab === "active" ? "Нажмите «+ Демо» для тестовых заявок" : "Выполненные заявки появятся здесь"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const cardData: TaskCardData = {
              id: item.id,
              recipientName: item.recipientName,
              deliveryAddress: item.deliveryAddress,
              deliveryCity: item.deliveryCity,
              recipientAddress: item.recipientAddress,
              status: item.status as TaskStatus,
              placesCount: item.placesCount,
              deliveryTimeFrom: item.deliveryTimeFrom,
              deliveryTimeTo: item.deliveryTimeTo,
              courierName: item.courierName,
            };
            return (
              <TaskCard
                task={cardData}
                onPress={() => router.push(`/task/${item.id}` as never)}
              />
            );
          }}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", lineHeight: 28 },
  headerSub: { fontSize: 13, lineHeight: 18, marginTop: 1 },
  seedBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  seedBtnText: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5 },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: "center",
    borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  list: { padding: 12, flexGrow: 1 },
  emptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
