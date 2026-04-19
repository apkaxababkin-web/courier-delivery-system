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
import { type TaskStatus } from "@/shared/types";
import { sortTasks } from "@/lib/task-sorting";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState, useMemo } from "react";

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier } = useCourierAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load tasks for selected date
  const {
    data: tasksData,
    isLoading,
    refetch,
    isRefetching: isRefetchingQuery,
  } = trpc.tasks.all.useQuery(token ? { token, date: selectedDate } : skipToken, {
    placeholderData: (previousData) => previousData,
    enabled: !!token,
  });

  const seedMutation = trpc.tasks.seedDemo.useMutation({
    onSuccess: () => { refetch(); },
  });

  // Sort tasks by status and urgency
    // Check if selected date is today
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const sortedTasks = useMemo(
    () => sortTasks(tasksData ?? [], courier?.urgencyThresholdOrange ?? 60, courier?.urgencyThresholdRed ?? 30),
    [tasksData, courier?.urgencyThresholdOrange, courier?.urgencyThresholdRed]
  );

  // Refetch tasks when returning to screen
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    // getDay() returns 0 for Sunday, we need Monday=0 for calendar grid
    // So we adjust: if Sunday (0), make it 6; otherwise subtract 1
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

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={{ flex: 1 }} />);
    }

    // Days of month
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
            borderRadius: 8,
          }}
        >
          <Text style={{ color: isSelected ? "#fff" : colors.foreground, fontWeight: isSelected ? "700" : "500", fontSize: 14 }}>
            {day}
          </Text>
        </TouchableOpacity>
      );

      // Push week to grid when it has 7 days
      if (week.length === 7) {
        calendarGrid.push(
          <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {week}
          </View>
        );
        week = [];
      }
    }

    // Push remaining days if any
    if (week.length > 0) {
      while (week.length < 7) {
        week.push(<View key={`empty-end-${week.length}`} style={{ flex: 1 }} />);
      }
      calendarGrid.push(
        <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {week}
        </View>
      );
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

  return (
    <ScreenContainer>
      {/* New Header: Profile | Date | Logo */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push("/profile" as never)}>
          <Text style={styles.headerIcon}>👤</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={[styles.dateText, { color: colors.foreground }]}>
            {formatDate(selectedDate)}
          </Text>
        </TouchableOpacity>

        {/* TODO: Remove this seed function before beta release */}
        <TouchableOpacity onPress={() => seedMutation.mutate()}>
          <Text style={styles.logo}>🚚</Text>
        </TouchableOpacity>
      </View>

      {/* Date Picker Modal - Beautiful Calendar */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Выбор даты</Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>Выберите дату для просмотра заявок</Text>

            {/* Month/Year Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 20, color: colors.primary }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}>
                <Text style={{ fontSize: 20, color: colors.primary }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Headers */}
            <View style={{ flexDirection: "row", marginBottom: 8, gap: 8 }}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={{ marginBottom: 16 }}>
              {renderCalendar()}
            </View>

            {/* Selected Date Display */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Выбранная дата:</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
              refreshing={isRefetchingQuery} 
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
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {isToday ? "Нет заявок" : "Нет заявок на эту дату"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {isToday ? "Нажмите на логотип или дату для загрузки демо-данных" : "Выберите другую дату"}
              </Text>
              {isToday && (
                <TouchableOpacity
                  style={[styles.seedButton, { backgroundColor: colors.primary }]}
                  onPress={() => seedMutation.mutate()}
                >
                  <Text style={styles.seedButtonText}>
                    {seedMutation.isPending ? "Загрузка..." : "Загрузить демо-данные"}
                  </Text>
                </TouchableOpacity>
              )}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  headerIcon: { fontSize: 24 },
  dateButton: { paddingHorizontal: 12, paddingVertical: 6 },
  dateText: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  logo: { fontSize: 20 },
  list: { padding: 12, flexGrow: 1, paddingBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  seedButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 },
  seedButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },
});
