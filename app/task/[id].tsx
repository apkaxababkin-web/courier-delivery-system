"use client";

import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";

import { skipToken } from "@tanstack/react-query";
import { useState } from "react";

import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import type { TaskStatus } from "@/shared/types";

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { token } = useCourierAuth();
  const taskId = parseInt(id ?? "0", 10);

  const [courierPickerVisible, setCourierPickerVisible] = useState(false);
  const [placesModalVisible, setPlacesModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [placesInput, setPlacesInput] = useState("");
  const [commentsInput, setCommentsInput] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const utils = trpc.useUtils();

  const { data: task, isLoading } = trpc.tasks.byId.useQuery(
    token ? { token, id: taskId } : skipToken
  );

  const { data: couriersList } = trpc.couriers.list.useQuery(
    token ? { token } : skipToken
  );

  const assignMutation = trpc.tasks.assignCourier.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const statusMutation = trpc.tasks.setStatus.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      utils.tasks.history.invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const placesMutation = trpc.tasks.updatePlaces.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      setPlacesModalVisible(false);
      setPlacesInput("");
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const commentsMutation = trpc.tasks.updateComments.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      setCommentsModalVisible(false);
      setCommentsInput("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const rescheduleMutation = trpc.tasks.rescheduleTask.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      utils.tasks.history.invalidate();
      setDatePickerVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Успешно", `Задание перенесено на ${selectedDate.toLocaleDateString("ru-RU")}`);
      router.back();
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const handleOpenMap = (address: string | null | undefined) => {
    if (!address) return;
    // Copy address to clipboard
    Clipboard.setStringAsync(address);
    // Open 2GIS with search focused (second variant)
    // Try different URL formats for 2GIS
    const encodedAddress = encodeURIComponent(address);
    const twoGisUrl = `https://2gis.ru/search?q=${encodedAddress}`;
    Linking.openURL(twoGisUrl);
  };

  const handleCallPhone = (phone: string | null | undefined) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s|\(|\)|-/g, "")}`);
  };

  const handleSetStatus = (newStatus: "in_progress" | "completed" | "cancelled" | "pending") => {
    // Toggle: if already in this status, revert to 'assigned'
    const statusToSet = task?.status === newStatus ? "assigned" : newStatus;
    statusMutation.mutate({ token: token!, taskId, status: statusToSet });
  };

  const handleSavePlaces = () => {
    const places = parseInt(placesInput, 10);
    if (isNaN(places) || places < 0) {
      Alert.alert("Ошибка", "Введите корректное количество мест");
      return;
    }
    placesMutation.mutate({ token: token!, taskId, placesCount: places });
  };

  const handleSaveComments = () => {
    if (!commentsInput.trim()) {
      Alert.alert("Ошибка", "Напишите комментарий");
      return;
    }
    commentsMutation.mutate({ token: token!, taskId, courierComments: commentsInput });
  };

  const handleAssignCourier = (courierId: number | null) => {
    setCourierPickerVisible(false);
    assignMutation.mutate({ token: token!, taskId, courierId });
  };

  const handleDateChange = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    // Convert from JS format (0=Sunday) to Russian format (0=Monday)
    return day === 0 ? 6 : day - 1;
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
      const isSelected = selectedDate.getDate() === day;
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

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-foreground">Заявка не найдена</Text>
      </ScreenContainer>
    );
  }

  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isInProgress = task.status === "in_progress";

  return (
    <ScreenContainer className="p-0">
      {/* Header */}
      <View style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>Заявка #{task.id}</Text>
        <StatusBadge status={task.status} />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 8 }} showsVerticalScrollIndicator={false}>

        {/* ОТПРАВИТЕЛЬ */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Отправитель</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{task.senderName}</Text>
          <TouchableOpacity onPress={() => handleOpenMap(task.senderAddress)}>
            <Text style={{ fontSize: 13, color: colors.primary, marginBottom: 4 }}>📍 {task.senderAddress}</Text>
          </TouchableOpacity>
          {task.senderPhone && (
            <TouchableOpacity onPress={() => handleCallPhone(task.senderPhone)}>
              <Text style={{ fontSize: 13, color: colors.primary }}>📞 {task.senderPhone}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ПОЛУЧАТЕЛЬ */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Получатель</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 6 }}>{task.recipientName}</Text>
          <TouchableOpacity onPress={() => handleOpenMap(task.deliveryAddress)}>
            <Text style={{ fontSize: 13, color: colors.primary, marginBottom: 4 }}>📍 {task.deliveryAddress}</Text>
          </TouchableOpacity>
          {task.recipientPhone && (
            <TouchableOpacity onPress={() => handleCallPhone(task.recipientPhone)}>
              <Text style={{ fontSize: 13, color: colors.primary }}>📞 {task.recipientPhone}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ВРЕМЯ ДОСТАВКИ */}
        {(task.deliveryTimeFrom || task.deliveryTimeTo) && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Время доставки</Text>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{task.deliveryTimeFrom} - {task.deliveryTimeTo}</Text>
          </View>
        )}

        {/* КОММЕНТАРИИ */}
        {task.comments && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Комментарии</Text>
            <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 18 }}>{task.comments}</Text>
          </View>
        )}

        {/* МЕСТА И КОММЕНТАРИИ */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12, gap: 8 }}>
          {/* Места */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Введите количество мест</Text>
            <TouchableOpacity
              onPress={() => { setPlacesInput(task.placesCount?.toString() || ""); setPlacesModalVisible(true); }}
              style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>{task.placesCount || 0}</Text>
            </TouchableOpacity>
          </View>
          
          {/* Комментарии */}
          <View>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>💬 Комментарий курьера</Text>
            <TouchableOpacity
              onPress={() => { setCommentsInput(task.courierComments || ""); setCommentsModalVisible(true); }}
              style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, alignItems: "flex-start" }}
            >
              <Text style={{ fontSize: 14, color: task.courierComments ? colors.foreground : colors.muted }}>
                {task.courierComments || "Добавить комментарий..."}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* СТАТУС КНОПКИ 2x2 */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <StatusButton
              label="В работе"
              isActive={isInProgress}
              onPress={() => handleSetStatus("in_progress")}
              color="#F59E0B"
              disabled={isCompleted || isCancelled}
            />
            <StatusButton
              label="Выполнено"
              isActive={isCompleted}
              onPress={() => handleSetStatus("completed")}
              color="#22C55E"
              disabled={isCancelled}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatusButton
              label="Отмена"
              isActive={isCancelled}
              onPress={() => handleSetStatus("cancelled")}
              color="#EF4444"
              disabled={isCompleted}
            />
            <StatusButton
              label="Перенос заявки"
              isActive={false}
              onPress={() => setDatePickerVisible(true)}
              color="#3B82F6"
              disabled={false}
            />
          </View>
        </View>

        {/* КУРЬЕР */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <TouchableOpacity onPress={() => setCourierPickerVisible(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E" }} />
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{task.courierName || "Не назначен"}</Text>
            </View>
            <Text style={{ fontSize: 20, color: colors.muted }}>›</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* Courier Picker Modal */}
      <Modal visible={courierPickerVisible} transparent animationType="slide" onRequestClose={() => setCourierPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 16 }}>Выбрать курьера</Text>
            <ScrollView>
              <TouchableOpacity onPress={() => handleAssignCourier(null)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.foreground }}>Не назначен</Text>
              </TouchableOpacity>
              {couriersList?.map((courier) => (
                <TouchableOpacity key={courier.id} onPress={() => handleAssignCourier(courier.id)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.foreground }}>{courier.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setCourierPickerVisible(false)} style={{ marginTop: 16, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Places Input Modal */}
      <Modal visible={placesModalVisible} transparent animationType="slide" onRequestClose={() => setPlacesModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Введите количество мест</Text>
              <TextInput
                autoFocus
                editable={true}
                selectTextOnFocus
                value={placesInput}
                onChangeText={setPlacesInput}
                placeholder="место"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={3}
                style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 16, fontWeight: "600" }}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => { setPlacesModalVisible(false); setPlacesInput(""); }} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSavePlaces} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Сохранить</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comments Input Modal */}
      <Modal visible={commentsModalVisible} transparent animationType="slide" onRequestClose={() => setCommentsModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Комментарий курьера</Text>
              <TextInput
                autoFocus
                editable={true}
                multiline
                value={commentsInput}
                onChangeText={setCommentsInput}
                placeholder="Напишите ваш комментарий..."
                placeholderTextColor={colors.muted}
                maxLength={1000}
                style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 14, minHeight: 100, textAlignVertical: "top" }}
              />
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => { setCommentsModalVisible(false); setCommentsInput(""); }} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSaveComments} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Сохранить</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Calendar Date Picker Modal */}
      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>Перенос заявки</Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16 }}>Выберите новую дату доставки</Text>

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
              <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (task && token) {
                  rescheduleMutation.mutate({
                    token,
                    taskId: task.id,
                    newDate: selectedDate,
                  });
                }
              }} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

interface StatusButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}

function StatusButton({ label, isActive, onPress, color, disabled }: StatusButtonProps) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      onPress={() => {
        setIsPressed(true);
        onPress();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => setIsPressed(false), 150);
      }}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: isActive || isPressed ? color : "transparent",
        borderColor: color,
        borderWidth: 2,
        borderRadius: 8,
        paddingVertical: 11,
        alignItems: "center" as const,
        opacity: disabled ? 0.5 : pressed || isPressed ? 0.85 : 1,
        transform: [{ scale: pressed || isPressed ? 0.96 : 1 }],
      })}
    >
      <Text style={{ color: isActive || isPressed ? "#fff" : color, fontWeight: "600", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
