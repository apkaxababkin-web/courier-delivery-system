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
import { StatusBadge } from "@/components/status-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { PACKAGE_TYPE_LABELS, type PackageType, type TaskStatus } from "@/shared/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

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
            const status = item.status as TaskStatus;
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/task/${item.id}` as never)}
                activeOpacity={0.75}
              >
                {/* Top row */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={[styles.recipient, { color: colors.foreground }]} numberOfLines={1}>
                      {item.recipientName}
                    </Text>
                    <Text style={[styles.taskId, { color: colors.muted }]}>Заявка #{item.id}</Text>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <StatusBadge status={status} size="sm" />
                    {item.courierName ? (
                      <Text style={[styles.courierName, { color: colors.muted }]} numberOfLines={1}>
                        {item.courierName}
                      </Text>
                    ) : (
                      <Text style={[styles.courierName, { color: colors.warning }]}>Не назначен</Text>
                    )}
                  </View>
                </View>

                {/* Address */}
                <View style={styles.addressRow}>
                  <IconSymbol name={icon("mappin.fill")} size={13} color={colors.primary} />
                  <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={2}>
                    {item.deliveryAddress}{item.deliveryCity ? `, ${item.deliveryCity}` : ""}
                  </Text>
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerLeft}>
                    <View style={styles.inlineRow}>
                      <IconSymbol name={icon("shippingbox.fill")} size={12} color={colors.muted} />
                      <Text style={[styles.footerText, { color: colors.muted }]}>
                        {PACKAGE_TYPE_LABELS[item.packageType as PackageType] ?? item.packageType}
                      </Text>
                    </View>
                    {item.placesCount > 1 && (
                      <Text style={[styles.footerText, { color: colors.primary }]}>
                        📦 {item.placesCount} мест
                      </Text>
                    )}
                  </View>
                  <View style={styles.footerRight}>
                    {item.estimatedMinutes ? (
                      <View style={styles.inlineRow}>
                        <IconSymbol name={icon("clock")} size={12} color={colors.muted} />
                        <Text style={[styles.footerText, { color: colors.muted }]}>
                          ~{item.estimatedMinutes} мин
                        </Text>
                      </View>
                    ) : null}
                    <IconSymbol name={icon("chevron.right")} size={16} color={colors.muted} />
                  </View>
                </View>
              </TouchableOpacity>
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
  list: { padding: 12, gap: 10, flexGrow: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardHeaderLeft: { flex: 1, gap: 2 },
  cardHeaderRight: { alignItems: "flex-end", gap: 4 },
  recipient: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  taskId: { fontSize: 12, lineHeight: 16 },
  courierName: { fontSize: 11, fontWeight: "500", lineHeight: 15 },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  address: { flex: 1, fontSize: 14, lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footerLeft: { flex: 1, gap: 3 },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerText: { fontSize: 12, lineHeight: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
