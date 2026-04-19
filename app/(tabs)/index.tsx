import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { useNavigation } from "@/lib/navigation-provider";
import { type TaskStatus } from "@/shared/types";
import { sortTasks } from "@/lib/task-sorting";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState, useMemo } from "react";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useFilter } from "@/lib/filter";

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier } = useCourierAuth();
  const [filterMode, setFilterMode] = useState<"all" | "mine">("all");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { mutate: seedDemo } = trpc.courierAuth.seedDemo.useMutation();
  const { mutate: seedCourier } = trpc.courierAuth.seedDemoCourier.useMutation();
  const { navigateToProfile, navigateToTaskDetail } = useNavigation();
  const [refreshing, setRefreshing] = useState(false);

  const handleLoadDemoData = () => {
    seedCourier(undefined, {
      onSuccess: (data) => {
        seedDemo({ token: data.token });
      },
    });
  };

  // Load tasks for selected date
  const {
    data: tasksData,
    isLoading,
    refetch,
    isRefetching: isRefetchingQuery,
  } = trpc.tasks.all.useQuery(token ? { token, date: selectedDate } : skipToken, {
    refetchInterval: 10000,
  });

  const tasks = useMemo(() => {
    if (!tasksData) return [];
    const filtered = filterMode === "mine" ? tasksData.filter((t) => t.courierId === courier?.id) : tasksData;
    return sortTasks(filtered);
  }, [tasksData, filterMode, courier?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const generateCalendarGrid = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const calendarGrid = [];
    let week = new Array(startingDayOfWeek).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        calendarGrid.push(week);
        week = [];
      }
    }

    if (week.length > 0) {
      week = [...week, ...new Array(7 - week.length).fill(null)];
      calendarGrid.push(week);
    }

    return calendarGrid;
  };

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

  if (tasks.length === 0) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Нет заявок</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            Загрузите демо-данные для тестирования
          </Text>
          <TouchableOpacity
            style={[
              styles.demoButton,
              { backgroundColor: colors.primary, marginTop: 20 },
            ]}
            onPress={handleLoadDemoData}
          >
            <Text style={{ color: colors.background, fontWeight: "600", fontSize: 16 }}>
              Загрузить демо-данные
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0">
      {/* New minimalist header bar */}
      <HeaderBarV2
        onProfilePress={navigateToProfile}
        onFilterToggle={setFilterMode}
        filterMode={filterMode}
        selectedDate={selectedDate}
        onDatePress={() => setShowDatePicker(true)}
      />

      {/* Date Picker Modal - Beautiful Calendar */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.background }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={[styles.modalHeaderText, { color: colors.primary }]}>Отмена</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={[styles.modalHeaderText, { color: colors.primary }]}>Готово</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <Text key={day} style={[styles.dayHeader, { color: colors.muted }]}>
                  {day}
                </Text>
              ))}

              {generateCalendarGrid().map((week, weekIndex) =>
                week.map((day, dayIndex) => (
                  <TouchableOpacity
                    key={`${weekIndex}-${dayIndex}`}
                    onPress={() => {
                      if (day) {
                        const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                        setSelectedDate(newDate);
                        setShowDatePicker(false);
                      }
                    }}
                    style={[
                      styles.calendarDay,
                      day === selectedDate.getDate() && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        {
                          color: day === selectedDate.getDate() ? colors.background : colors.foreground,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Task List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const cardData: TaskCardData = {
              id: item.id,
              senderName: item.senderName,
              senderAddress: item.senderAddress,
              recipientName: item.recipientName,
              recipientAddress: item.recipientAddress,
              deliveryAddress: item.deliveryAddress,
              deliveryCity: item.deliveryCity,
              deliveryTimeFrom: item.deliveryTimeFrom,
              deliveryTimeTo: item.deliveryTimeTo,
              status: item.status as TaskStatus,
              courierName: item.courierName,
              placesCount: item.placesCount,
              taskType: item.taskType as "regular" | "warehouse_pickup" | "courier_call",
              items: item.items,
            };
            const handleTaskPress = (task: TaskCardData) => {
              navigateToTaskDetail(task.id);
            };
            return (
              <TaskCard
                task={cardData}
                onPress={handleTaskPress}
              />
            );
          }}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing || isRefetchingQuery} onRefresh={onRefresh} />}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  demoButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 120,
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalHeaderText: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  calendarGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  dayHeader: {
    width: "14.28%",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
  },
  calendarDay: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
