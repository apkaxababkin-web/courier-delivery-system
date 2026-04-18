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
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState, useMemo } from "react";

export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier } = useCourierAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const {
    data: activeTasks,
    isLoading: loadingActive,
    refetch: refetchActive,
    isRefetching: refreshingActive,
  } = trpc.tasks.all.useQuery(token ? { token } : skipToken, {
    placeholderData: (previousData) => previousData,
  });

  const {
    data: historyTasks,
    isLoading: loadingHistory,
    refetch: refetchHistory,
    isRefetching: refreshingHistory,
  } = trpc.tasks.history.useQuery(token ? { token } : skipToken, {
    placeholderData: (previousData) => previousData,
  });

  const seedMutation = trpc.tasks.seedDemo.useMutation({
    onSuccess: () => { refetchActive(); refetchHistory(); },
  });

  // Filter tasks by selected date
  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const tasks = isToday ? (activeTasks ?? []) : (historyTasks ?? []);
  const isLoading = isToday ? loadingActive : loadingHistory;
  const isRefreshing = isToday ? refreshingActive : refreshingHistory;
  const refetch = isToday ? refetchActive : refetchHistory;

  // Prevent showing loading spinner when returning from task detail
  useFocusEffect(
    useCallback(() => {
      if (!tasks || tasks.length === 0) {
        refetch();
      }
    }, [tasks, refetch])
  );

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const generateDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = -30; i <= 0; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
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

        <Text style={styles.logo}>🚚</Text>
      </View>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Выберите дату</Text>

            <View style={styles.dateGrid}>
              {generateDateOptions().map((date, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dateGridButton,
                    {
                      backgroundColor:
                        date.toDateString() === selectedDate.toDateString()
                          ? colors.primary
                          : colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedDate(date);
                    setShowDatePicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dateGridButtonText,
                      {
                        color:
                          date.toDateString() === selectedDate.toDateString()
                            ? "white"
                            : colors.foreground,
                      },
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {isLoading && tasks.length === 0 ? (
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
                {isToday ? "Нет активных заявок" : "История пуста"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {isToday ? "Нажмите на дату для выбора другого дня" : "Выполненные заявки появятся здесь"}
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
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center" },
  modalContent: { borderRadius: 12, padding: 20, width: "85%", maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 16, textAlign: "center" },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    marginBottom: 16,
    gap: 8,
  },
  dateGridButton: {
    width: "22%",
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dateGridButtonText: { fontSize: 14, fontWeight: "600" },
  closeButton: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  closeButtonText: { color: "white", fontSize: 16, fontWeight: "600" },
  list: { padding: 12, flexGrow: 1, paddingBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  seedButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 },
  seedButtonText: { color: "white", fontSize: 16, fontWeight: "600", textAlign: "center" },
});
