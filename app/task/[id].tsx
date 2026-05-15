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
import { useToast } from "react-native-toast-notifications";

import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";

type Palette = {
  border: string;
  soft: string;
  shadow: string;
  mutedText: string;
};

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function DetailSection({
  title,
  children,
  palette,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  palette: Palette;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 4,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "900",
          color: colors.muted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function DetailValue({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 7 }}>{children}</Text>;
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const dark = isDarkBackground(colors.background);
  const palette: Palette = {
    border: dark ? "rgba(148,163,184,0.20)" : colors.border,
    soft: dark ? "rgba(148,163,184,0.08)" : "#F8FAFC",
    shadow: dark ? "#020617" : "#94A3B8",
    mutedText: colors.muted,
  };
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

  const toast = useToast();

  const rescheduleMutation = trpc.tasks.rescheduleTask.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      utils.tasks.history.invalidate();
      setDatePickerVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`✓ Задание перенесено на ${selectedDate.toLocaleDateString("ru-RU")}`, {
        duration: 2000,
        placement: "top",
      });
      router.back();
    },
    onError: (e: { message: string }) => {
      toast.show(`✗ ${e.message}`, {
        duration: 2000,
        placement: "top",
      });
    },
  });

  const handleOpenMap = (address: string | null | undefined) => {
    if (!address) return;
    Clipboard.setStringAsync(address);
    const encodedAddress = encodeURIComponent(address);
    const twoGisUrl = `https://2gis.ru/search?q=${encodedAddress}`;
    Linking.openURL(twoGisUrl);
  };

  const handleCallPhone = (phone: string | null | undefined) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s|\(|\)|-/g, "")}`);
  };

  const handleSetStatus = (newStatus: "in_progress" | "completed" | "cancelled") => {
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
    return day === 0 ? 6 : day - 1;
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
            borderRadius: 10,
          }}
        >
          <Text style={{ color: isSelected ? "#fff" : colors.foreground, fontWeight: isSelected ? "900" : "700", fontSize: 14 }}>
            {day}
          </Text>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        calendarGrid.push(
          <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {week}
          </View>
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
      <View style={{ backgroundColor: colors.background, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 24, borderWidth: 1, borderColor: palette.border }}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: palette.soft, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.primary, fontSize: 22, fontWeight: "900" }}>←</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>Заявка #{task.id}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginTop: 2 }}>Карточка доставки</Text>
          </View>
          <StatusBadge status={task.status} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 18, gap: 10, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        <DetailSection title="Отправитель" colors={colors} palette={palette}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 7 }}>{task.senderName || "—"}</Text>
          <TouchableOpacity onPress={() => handleOpenMap(task.senderAddress)}>
            <Text style={{ fontSize: 14, color: colors.primary, marginBottom: 5, fontWeight: "800", lineHeight: 19 }}>📍 {task.senderAddress || "—"}</Text>
          </TouchableOpacity>
          {task.senderPhone && (
            <TouchableOpacity onPress={() => handleCallPhone(task.senderPhone)}>
              <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "800" }}>📞 {task.senderPhone}</Text>
            </TouchableOpacity>
          )}
        </DetailSection>

        <DetailSection title="Получатель" colors={colors} palette={palette}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground, marginBottom: 7 }}>{task.recipientName || "—"}</Text>
          <TouchableOpacity onPress={() => handleOpenMap(task.deliveryAddress)}>
            <Text style={{ fontSize: 14, color: colors.primary, marginBottom: 5, fontWeight: "800", lineHeight: 19 }}>📍 {task.deliveryAddress || "—"}</Text>
          </TouchableOpacity>
          {task.recipientPhone && (
            <TouchableOpacity onPress={() => handleCallPhone(task.recipientPhone)}>
              <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "800" }}>📞 {task.recipientPhone}</Text>
            </TouchableOpacity>
          )}
        </DetailSection>

        {(task.deliveryTimeFrom || task.deliveryTimeTo) && (
          <DetailSection title="Время доставки" colors={colors} palette={palette}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>{task.deliveryTimeFrom} - {task.deliveryTimeTo}</Text>
          </DetailSection>
        )}

        {task.comments && (
          <DetailSection title="Комментарии" colors={colors} palette={palette}>
            <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20, fontWeight: "700" }}>{task.comments}</Text>
          </DetailSection>
        )}

        <DetailSection title="Места и комментарий курьера" colors={colors} palette={palette}>
          <View style={{ gap: 12 }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted, marginBottom: 7 }}>Количество мест</Text>
              <TouchableOpacity
                onPress={() => { setPlacesInput(task.placesCount?.toString() || ""); setPlacesModalVisible(true); }}
                style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft, borderRadius: 16, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>{task.placesCount || 0}</Text>
              </TouchableOpacity>
            </View>

            <View>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted, marginBottom: 7 }}>Комментарий курьера</Text>
              <TouchableOpacity
                onPress={() => { setCommentsInput(task.courierComments || ""); setCommentsModalVisible(true); }}
                style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 12, alignItems: "flex-start" }}
              >
                <Text style={{ fontSize: 14, color: task.courierComments ? colors.foreground : colors.muted, fontWeight: "700", lineHeight: 19 }}>
                  {task.courierComments || "Добавить комментарий..."}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </DetailSection>

        <DetailSection title="Статус заявки" colors={colors} palette={palette}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <StatusButton label="В работе" isActive={isInProgress} onPress={() => handleSetStatus("in_progress")} color="#F59E0B" disabled={isCompleted || isCancelled} />
            <StatusButton label="Выполнено" isActive={isCompleted} onPress={() => handleSetStatus("completed")} color="#22C55E" disabled={isCancelled} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatusButton label="Отмена" isActive={isCancelled} onPress={() => handleSetStatus("cancelled")} color="#EF4444" disabled={isCompleted} />
            <StatusButton label="Перенос" isActive={false} onPress={() => setDatePickerVisible(true)} color="#3B82F6" disabled={false} />
          </View>
        </DetailSection>

        <DetailSection title="Курьер" colors={colors} palette={palette}>
          <TouchableOpacity onPress={() => setCourierPickerVisible(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: palette.soft, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E" }} />
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>{task.courierName || "Не назначен"}</Text>
              {(task as any).paymentAmount && (task as any).paymentAmount > 0 && (
                <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>₽</Text>
              )}
            </View>
            <Text style={{ fontSize: 22, color: colors.muted }}>›</Text>
          </TouchableOpacity>
        </DetailSection>
      </ScrollView>

      <Modal visible={courierPickerVisible} transparent animationType="slide" onRequestClose={() => setCourierPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, maxHeight: 420 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>Выбрать курьера</Text>
            <ScrollView>
              <TouchableOpacity onPress={() => handleAssignCourier(null)} style={{ paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>Не назначен</Text>
              </TouchableOpacity>
              {couriersList?.map((courier) => (
                <TouchableOpacity key={courier.id} onPress={() => handleAssignCourier(courier.id)} style={{ paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
                  <Text style={{ color: colors.foreground, fontWeight: "800" }}>{courier.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setCourierPickerVisible(false)} style={{ marginTop: 16, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 16, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InputModal visible={placesModalVisible} title="Введите количество мест" colors={colors} palette={palette} onClose={() => { setPlacesModalVisible(false); setPlacesInput(""); }} onSave={handleSavePlaces}>
        <TextInput autoFocus editable selectTextOnFocus value={placesInput} onChangeText={setPlacesInput} placeholder="место" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={3} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 16, padding: 13, color: colors.foreground, fontSize: 16, fontWeight: "800" }} />
      </InputModal>

      <InputModal visible={commentsModalVisible} title="Комментарий курьера" colors={colors} palette={palette} onClose={() => { setCommentsModalVisible(false); setCommentsInput(""); }} onSave={handleSaveComments}>
        <TextInput autoFocus editable multiline value={commentsInput} onChangeText={setCommentsInput} placeholder="Напишите ваш комментарий..." placeholderTextColor={colors.muted} maxLength={1000} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 16, padding: 13, color: colors.foreground, fontSize: 14, minHeight: 110, textAlignVertical: "top", fontWeight: "700" }} />
      </InputModal>

      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setDatePickerVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 4 }}>Перенос заявки</Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 16, fontWeight: "700" }}>Выберите новую дату доставки</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "900" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "900" }}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 8, gap: 8 }}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted }}>{day}</Text>
                </View>
              ))}
            </View>
            <View style={{ marginBottom: 16 }}>{renderCalendar()}</View>
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: palette.border }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, fontWeight: "800" }}>Выбранная дата:</Text>
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 16, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (task && token) {
                  rescheduleMutation.mutate({ token, taskId: task.id, newDate: selectedDate });
                }
              }} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 16, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function InputModal({
  visible,
  title,
  children,
  colors,
  palette,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  palette: Palette;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{title}</Text>
            {children}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 16, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 16, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
        backgroundColor: isActive || isPressed ? color : `${color}18`,
        borderColor: isActive || isPressed ? color : `${color}66`,
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 13,
        alignItems: "center" as const,
        opacity: disabled ? 0.5 : pressed || isPressed ? 0.85 : 1,
        transform: [{ scale: pressed || isPressed ? 0.97 : 1 }],
      })}
    >
      <Text style={{ color: isActive || isPressed ? "#fff" : color, fontWeight: "900", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
