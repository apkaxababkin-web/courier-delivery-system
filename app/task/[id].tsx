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
import { useState, type ReactNode } from "react";
import { useToast } from "react-native-toast-notifications";

import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { getDisplayRequestId } from "@/shared/request-number";

type Palette = {
  border: string;
  soft: string;
  shadow: string;
};

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function formatCreatedAt(value?: string | Date | null) {
  if (!value) return "Создана: —";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Создана: —";
  return `Создана: ${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatPaymentValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    paid: "Оплачено",
    transfer: "Перевод",
    cash: "Наличные",
    terminal: "Терминал",
    qr: "QR-код",
    unpaid: "Не оплачено",
    not_paid: "Не оплачено",
    pending: "Не оплачено",
  };

  return labels[normalized] || value.trim();
}

function splitTaskComment(comments?: string | null, specialInstructions?: string | null) {
  const lines = (comments || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let paymentMethod = "";
  let paymentAmount = "";
  const visibleLines: string[] = [];

  for (const line of lines) {
    if (/^\[request:\d+\]$/i.test(line)) continue;
    if (/^Тип заявки:/i.test(line)) continue;

    const paymentMatch = line.match(/^Оплата:\s*(.+)$/i);
    if (paymentMatch) {
      paymentMethod = paymentMatch[1].trim();
      continue;
    }

    const amountMatch = line.match(/^Сумма:\s*(.+)$/i);
    if (amountMatch) {
      paymentAmount = amountMatch[1].trim();
      continue;
    }

    visibleLines.push(line);
  }

  const comment = visibleLines.join("\n").trim() || (specialInstructions || "").trim();
  const paymentLabel = paymentMethod
    ? [formatPaymentValue(paymentMethod), paymentAmount].filter(Boolean).join(" · ")
    : "";

  return { comment, paymentLabel };
}

function GlassCard({ children, palette, colors, style }: { children: ReactNode; palette: Palette; colors: ReturnType<typeof useColors>; style?: object }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 18,
        elevation: 4,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function SectionTitle({ children, colors }: { children: ReactNode; colors: ReturnType<typeof useColors> }) {
  return <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 6 }}>{children}</Text>;
}

function ClickableLine({ value, onPress, muted = false }: { value?: string | null; onPress?: () => void; muted?: boolean }) {
  const colors = useColors();
  if (!value) return <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>—</Text>;
  return (
    <TouchableOpacity activeOpacity={0.72} onPress={onPress} disabled={!onPress}>
      <Text style={{ color: muted ? colors.muted : colors.foreground, fontSize: 12, lineHeight: 19, fontWeight: "700" }}>{value}</Text>
    </TouchableOpacity>
  );
}

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const dark = isDarkBackground(colors.background);
  const palette: Palette = {
    border: dark ? "rgba(148,163,184,0.18)" : colors.border,
    soft: dark ? "rgba(148,163,184,0.07)" : "#F8FAFC",
    shadow: dark ? "#020617" : "#94A3B8",
  };
  const { token } = useCourierAuth();
  const taskId = parseInt(id ?? "0", 10);
  const toast = useToast();

  const [courierPickerVisible, setCourierPickerVisible] = useState(false);
  const [placesModalVisible, setPlacesModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [placesInput, setPlacesInput] = useState("");
  const [commentsInput, setCommentsInput] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const utils = trpc.useUtils();

  const { data: task, isLoading } = trpc.tasks.byId.useQuery(token ? { token, id: taskId } : skipToken);
  const { data: couriersList } = trpc.couriers.list.useQuery(token ? { token } : skipToken);

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
      toast.show(`✓ Задание перенесено на ${selectedDate.toLocaleDateString("ru-RU")}`, { duration: 2000, placement: "top" });
      router.back();
    },
    onError: (e: { message: string }) => toast.show(`✗ ${e.message}`, { duration: 2000, placement: "top" }),
  });

  const handleOpenMap = (address: string | null | undefined) => {
    if (!address) return;
    Clipboard.setStringAsync(address);
    Linking.openURL(`https://2gis.ru/search?q=${encodeURIComponent(address)}`);
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
    commentsMutation.mutate({ token: token!, taskId, courierComments: commentsInput.trim() });
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

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const calendarGrid = [];
    let week = [];

    for (let i = 0; i < firstDay; i++) week.push(<View key={`empty-${i}`} style={{ flex: 1 }} />);

    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selectedDate.getDate() === day;
      week.push(
        <TouchableOpacity key={day} onPress={() => handleDateChange(day)} style={{ flex: 1, aspectRatio: 1, justifyContent: "center", alignItems: "center", backgroundColor: isSelected ? colors.primary : "transparent", borderRadius: 10 }}>
          <Text style={{ color: isSelected ? "#fff" : colors.foreground, fontWeight: isSelected ? "900" : "700", fontSize: 12 }}>{day}</Text>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        calendarGrid.push(<View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{week}</View>);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(<View key={`empty-end-${week.length}`} style={{ flex: 1 }} />);
      calendarGrid.push(<View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{week}</View>);
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
  const parsedTaskInfo = splitTaskComment(task.comments, task.specialInstructions);
  const taskComment = parsedTaskInfo.comment || "—";
  const paymentStatusLabel = parsedTaskInfo.paymentLabel;
  const courierComment = task.courierComments || "";

  return (
    <ScreenContainer className="p-0">
      <View style={{ backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ width: 54, height: 48, alignItems: "center", justifyContent: "center", marginLeft: -8 }}>
            <Text style={{ color: colors.foreground, fontSize: 26, fontWeight: "900" }}>←</Text>
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>#{getDisplayRequestId(task)}</Text>
          </View>
          <StatusBadge status={task.status} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 24, gap: 10, backgroundColor: colors.background }} showsVerticalScrollIndicator={false}>
        <GlassCard palette={palette} colors={colors} style={{ padding: 10 }}>
          <SectionTitle colors={colors}>Отправитель</SectionTitle>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginBottom: 3 }}>{task.senderName || "—"}</Text>
          <ClickableLine value={task.senderAddress} onPress={() => handleOpenMap(task.senderAddress)} />
          <View style={{ height: 3 }} />
          <ClickableLine value={task.senderPhone} onPress={() => handleCallPhone(task.senderPhone)} muted />
        </GlassCard>

        <GlassCard palette={palette} colors={colors} style={{ padding: 10 }}>
          <SectionTitle colors={colors}>Получатель</SectionTitle>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", marginBottom: 3 }}>{task.recipientName || "—"}</Text>
          <ClickableLine value={task.deliveryAddress} onPress={() => handleOpenMap(task.deliveryAddress)} />
          <View style={{ height: 3 }} />
          <ClickableLine value={task.recipientPhone} onPress={() => handleCallPhone(task.recipientPhone)} muted />
        </GlassCard>

        <GlassCard palette={palette} colors={colors} style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => { setPlacesInput(task.placesCount?.toString() || ""); setPlacesModalVisible(true); }}
              activeOpacity={0.75}
              style={{ flex: 0.82 }}
            >
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "900" }}>
                📦 Мест: {task.placesCount || 0} ›
              </Text>
            </TouchableOpacity>

            <View style={{ width: 1, height: 20, backgroundColor: palette.border }} />

            <TouchableOpacity
              onPress={() => setCourierPickerVisible(true)}
              activeOpacity={0.75}
              style={{ flex: 1.18 }}
            >
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: "right" }}>
                👤 Курьер: {task.courierName || "Не назначен"} ›
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        <GlassCard palette={palette} colors={colors} style={{ padding: 10 }}>
          <SectionTitle colors={colors}>Комментарий заявки</SectionTitle>
          <Text numberOfLines={3} style={{ color: taskComment === "—" ? colors.muted : colors.foreground, fontSize: 12, lineHeight: 16, fontWeight: "700" }}>{taskComment}</Text>
        </GlassCard>

        {paymentStatusLabel ? (
          <GlassCard palette={palette} colors={colors} style={{ padding: 10 }}>
            <SectionTitle colors={colors}>Статус оплаты</SectionTitle>
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, lineHeight: 16, fontWeight: "800" }}>{paymentStatusLabel}</Text>
          </GlassCard>
        ) : null}

        <GlassCard palette={palette} colors={colors} style={{ padding: 10 }}>
          <SectionTitle colors={colors}>Комментарий курьера</SectionTitle>
          {courierComment ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {courierComment.split("\n").filter(Boolean).map((line, index) => (
                <View key={`${line}-${index}`} style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: 10 }}>
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", marginBottom: 3 }}>Курьер</Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 16, fontWeight: "700" }}>{line}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => { setCommentsInput(courierComment); setCommentsModalVisible(true); }}
            style={{ backgroundColor: palette.soft, borderRadius: 10, borderWidth: 1, borderColor: palette.border, paddingVertical: 9, paddingHorizontal: 10 }}
          >
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800" }}>Добавить свой комментарий курьеру</Text>
          </TouchableOpacity>
        </GlassCard>

        <View style={{ gap: 8, marginTop: 2 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton label="Отмена" onPress={() => handleSetStatus("cancelled")} disabled={isCompleted} muted active={isCancelled} />
            <ActionButton label="Перенос" onPress={() => setDatePickerVisible(true)} muted />
            <ActionButton label="В работе" onPress={() => handleSetStatus("in_progress")} disabled={isCompleted || isCancelled} muted active={isInProgress} />
          </View>
          <ActionButton label="Выполнено" onPress={() => handleSetStatus("completed")} disabled={isCancelled} done active={isCompleted} />
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: 2 }}>
            {formatCreatedAt((task as any).createdAt)}
          </Text>
        </View>
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
            <TouchableOpacity onPress={() => setCourierPickerVisible(false)} style={{ marginTop: 16, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InputModal visible={placesModalVisible} title="Количество мест" colors={colors} palette={palette} onClose={() => { setPlacesModalVisible(false); setPlacesInput(""); }} onSave={handleSavePlaces}>
        <TextInput autoFocus editable selectTextOnFocus value={placesInput} onChangeText={setPlacesInput} placeholder="мест" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={3} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 10, padding: 13, color: colors.foreground, fontSize: 12, fontWeight: "900" }} />
      </InputModal>

      <InputModal visible={commentsModalVisible} title="Комментарий курьера" colors={colors} palette={palette} onClose={() => { setCommentsModalVisible(false); setCommentsInput(""); }} onSave={handleSaveComments}>
        <TextInput autoFocus editable multiline value={commentsInput} onChangeText={setCommentsInput} placeholder="Напишите ваш комментарий..." placeholderTextColor={colors.muted} maxLength={1000} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 10, padding: 13, color: colors.foreground, fontSize: 12, minHeight: 110, textAlignVertical: "top", fontWeight: "700" }} />
      </InputModal>

      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setDatePickerVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 4 }}>Перенос заявки</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16, fontWeight: "700" }}>Выберите новую дату доставки</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "900" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>
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
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (task && token) rescheduleMutation.mutate({ token, taskId: task.id, newDate: selectedDate });
              }} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function InputModal({ visible, title, children, colors, palette, onClose, onSave }: { visible: boolean; title: string; children: ReactNode; colors: ReturnType<typeof useColors>; palette: Palette; onClose: () => void; onSave: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{title}</Text>
            {children}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionButton({ label, onPress, disabled, muted, done, active }: { label: string; onPress: () => void; disabled?: boolean; muted?: boolean; done?: boolean; active?: boolean }) {
  const colors = useColors();
  const backgroundColor = done ? "#4B8B3B" : active ? "rgba(59,130,246,0.22)" : muted ? "rgba(148,163,184,0.12)" : colors.primary;
  const borderColor = done ? "rgba(74,139,59,0.9)" : active ? "rgba(125,178,255,0.34)" : "rgba(148,163,184,0.18)";
  const textColor = done ? "#fff" : active ? "#BFD5FF" : colors.foreground;

  return (
    <Pressable
      onPress={() => {
        onPress();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor,
        borderColor,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: done ? 14 : 12,
        alignItems: "center" as const,
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
      })}
    >
      <Text style={{ color: textColor, fontWeight: "900", fontSize: done ? 15 : 13 }}>{label}</Text>
    </Pressable>
  );
}
