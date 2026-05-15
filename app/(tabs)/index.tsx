import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { skipToken } from "@tanstack/react-query";

import { NetworkBanner } from "@/components/network-banner";
import { ScreenContainer } from "@/components/screen-container";
import { TaskCard, type TaskCardData } from "@/components/task-card";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useCourierAuth } from "@/lib/courier-auth";
import { useFilter } from "@/lib/filter-context";
import { sortTasks } from "@/lib/task-sorting";
import { trpc } from "@/lib/trpc";
import { type TaskStatus } from "@/shared/types";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier } = useCourierAuth();
  const { filterMode, setFilterMode } = useFilter();
  const { isOnline } = useNetworkStatus();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: tasksData,
    isLoading,
    refetch,
    isRefetching: isRefetchingQuery,
  } = trpc.tasks.all.useQuery(token ? { token } : skipToken, {
    enabled: !!token,
  });

  useMobileLiveSync({
    enabled: !!token,
    onSync: useCallback(() => refetch(), [refetch]),
  });

  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const filteredTasks = useMemo(() => {
    if (!tasksData) return [];
    if (filterMode === "mine") {
      return tasksData.filter((task) => task.courierName === courier?.name);
    }
    return tasksData;
  }, [tasksData, filterMode, courier?.name]);

  const sortedTasks = useMemo(
    () =>
      sortTasks(
        filteredTasks,
        courier?.urgencyThresholdOrange ?? 60,
        courier?.urgencyThresholdRed ?? 30,
      ),
    [filteredTasks, courier?.urgencyThresholdOrange, courier?.urgencyThresholdRed],
  );

  const myTasksCount = useMemo(() => {
    if (!tasksData || !courier?.name) return 0;
    return tasksData.filter((task) => task.courierName === courier.name).length;
  }, [tasksData, courier?.name]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const handleDateChange = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const calendarGrid = [];
    let week = [];

    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={{ flex: 1 }} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === new Date().getMonth();
      week.push(
        <TouchableOpacity
          key={day}
          onPress={() => handleDateChange(day)}
          style={{
            flex: 1,
            aspectRatio: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: isSelected ? colors.primary : "transparent",
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              color: isSelected ? "#fff" : colors.foreground,
              fontWeight: isSelected ? "800" : "600",
              fontSize: 14,
            }}
          >
            {day}
          </Text>
        </TouchableOpacity>,
      );

      if (week.length === 7) {
        calendarGrid.push(
          <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {week}
          </View>,
        );
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) {
        week.push(<View key={`empty-end-${week.length}`} style={{ flex: 1 }} />);
      }
      calendarGrid.push(
        <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {week}
        </View>,
      );
    }

    return calendarGrid;
  };

  if (!token) {
    return (
      <ScreenContainer className="p-6">
        <NetworkBanner visible={!isOnline} />
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📦</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Войдите в аккаунт</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Перейдите на вкладку «Профиль» и введите логин и пароль</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <HeaderBarV2
        onProfilePress={() => router.push("/profile" as never)}
        onFilterToggle={setFilterMode}
        filterMode={filterMode}
        selectedDate={selectedDate}
        onDatePress={() => setShowDatePicker(true)}
        myTasksCount={myTasksCount}
      />

      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowDatePicker(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>Выбор даты</Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>Выберите дату для просмотра заявок</Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "800" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "800" }}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", marginBottom: 8, gap: 8 }}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.muted }}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginBottom: 16 }}>{renderCalendar()}</View>

            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, fontWeight: "700" }}>Выбранная дата:</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 13, backgroundColor: colors.border, borderRadius: 14, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 13, backgroundColor: colors.primary, borderRadius: 14, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ flex: 1, paddingHorizontal: 0, paddingVertical: 0, backgroundColor: colors.background }}>
        {isLoading && sortedTasks.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={sortedTasks}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={isRefetchingQuery || refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  refetch().finally(() => setRefreshing(false));
                }}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={{ fontSize: 48 }}>📋</Text>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{isToday ? "Нет заявок" : "Нет заявок на эту дату"}</Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>{isToday ? "Заявки появятся здесь автоматически" : "Выберите другую дату"}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const cardData: TaskCardData = {
                id: item.id,
                recipientName: item.recipientName,
                deliveryAddress: item.deliveryAddress,
                deliveryCity: item.deliveryCity,
                recipientAddress: item.recipientAddress,
                senderName: item.senderName,
                senderAddress: item.senderAddress,
                status: item.status as TaskStatus,
                placesCount: item.placesCount,
                deliveryTimeFrom: item.deliveryTimeFrom,
                deliveryTimeTo: item.deliveryTimeTo,
                courierName: (item as any).courierName || "",
                taskType: item.taskType as "regular" | "warehouse_pickup" | "courier_call" | undefined,
                requestType: (item as any).requestType,
                comments: (item as any).comments,
                specialInstructions: (item as any).specialInstructions,
                packageDescription: (item as any).packageDescription,
                items: (item as any).items,
                createdAt: (item as any).createdAt,
                scheduledAt: (item as any).scheduledAt,
              };
              return <TaskCard task={cardData} onPress={() => router.push(`/task/${item.id}` as never)} />;
            }}
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  list: { paddingTop: 4, flexGrow: 1, paddingBottom: 122 },
  emptyTitle: { fontSize: 18, fontWeight: "800", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
