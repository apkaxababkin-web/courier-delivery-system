import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
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

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { token } = useCourierAuth();
  const taskId = parseInt(id ?? "0", 10);

  const [courierPickerVisible, setCourierPickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [placesInputVisible, setPlacesInputVisible] = useState(false);
  const [placesInput, setPlacesInput] = useState("");

  const utils = trpc.useUtils();

  const { data: task, isLoading } = trpc.tasks.byId.useQuery(
    token ? { token, id: taskId } : skipToken
  );

  const { data: couriersList } = trpc.couriers.list.useQuery(
    token ? { token } : skipToken
  );

  const statusMutation = trpc.tasks.setStatus.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const assignMutation = trpc.tasks.assignCourier.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const placesMutation = trpc.tasks.updatePlaces.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const handleSetStatus = (newStatus: "in_progress" | "completed" | "cancelled") => {
    const currentStatus = task?.status as string;
    const finalStatus = currentStatus === newStatus ? "pending" : newStatus;
    const labels: Record<string, string> = {
      pending: "Не назначен",
      in_progress: "В работе",
      completed: "Выполнено",
      cancelled: "Отменено",
    };
    Alert.alert(
      "Изменить статус",
      `Перевести заявку в статус «${labels[finalStatus]}»?`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Да",
          style: finalStatus === "cancelled" ? "destructive" : "default",
          onPress: () => statusMutation.mutate({ token: token!, taskId, status: finalStatus as any }),
        },
      ]
    );
  };

  const handleAssignCourier = (courierId: number | null) => {
    setCourierPickerVisible(false);
    assignMutation.mutate({ token: token!, taskId, courierId });
  };

  const handleChangePlaces = (delta: number) => {
    const current = task?.placesCount ?? 1;
    const newVal = Math.max(1, Math.min(999, current + delta));
    if (newVal === current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    placesMutation.mutate({ token: token!, taskId, placesCount: newVal });
  };

  const timeIntervalMutation = trpc.tasks.updateTimeInterval.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      setTimePickerVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const handleSaveTimeInterval = () => {
    timeIntervalMutation.mutate({
      token: token!,
      taskId,
      deliveryTimeFrom: timeFrom.trim() || null,
      deliveryTimeTo: timeTo.trim() || null,
    });
  };

  const handleCallPhone = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleOpenMap = (address: string, city?: string) => {
    const fullAddress = city ? `${address}, ${city}` : address;
    const encodedAddress = encodeURIComponent(fullAddress);
    const dgisUrl = `dgis://2gis.com/search?q=${encodedAddress}`;
    const googleMapsUrl = `https://www.google.com/maps/search/${encodedAddress}`;
    
    Linking.canOpenURL(dgisUrl).then((supported) => {
      if (supported) {
        Linking.openURL(dgisUrl);
      } else {
        Linking.openURL(googleMapsUrl);
      }
    });
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.error }]}>Заявка не найдена</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.primary }]}>← Назад</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const status = task.status as TaskStatus;
  const statusStr = status as string;
  const isFinished = statusStr === "completed" || statusStr === "cancelled";
  const places = task.placesCount ?? 1;
  const isMutating = statusMutation.isPending || assignMutation.isPending || placesMutation.isPending || timeIntervalMutation.isPending;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.navHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name={icon("chevron.left")} size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Заявка #{task.id}</Text>
        <StatusBadge status={status} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Status buttons ── */}
        {!isFinished && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>СТАТУС ЗАЯВКИ</Text>
            <View style={styles.statusBtns}>
              {/* В работе */}
              <TouchableOpacity
                style={[
                  styles.statusBtn,
                  status === "in_progress"
                    ? { borderColor: colors.warning, backgroundColor: colors.warning, borderWidth: 2 }
                    : { borderColor: colors.warning, backgroundColor: "transparent" },
                ]}
                onPress={() => handleSetStatus("in_progress")}
                disabled={isMutating}
              >
                <Text style={[styles.statusBtnText, { color: status === "in_progress" ? "#fff" : colors.warning }]}>🚴 В работе</Text>
              </TouchableOpacity>

              {/* Выполнено */}
              <TouchableOpacity
                style={[
                  styles.statusBtn,
                  status === "completed"
                    ? { borderColor: colors.success, backgroundColor: colors.success, borderWidth: 2 }
                    : { borderColor: colors.success, backgroundColor: "transparent" },
                ]}
                onPress={() => handleSetStatus("completed")}
                disabled={isMutating}
              >
                <Text style={[styles.statusBtnText, { color: status === "completed" ? "#fff" : colors.success }]}>✓ Выполнено</Text>
              </TouchableOpacity>

              {/* Отменено */}
              <TouchableOpacity
                style={[
                  styles.statusBtn,
                  status === "cancelled"
                    ? { borderColor: colors.error, backgroundColor: colors.error, borderWidth: 2 }
                    : { borderColor: colors.error, backgroundColor: "transparent" },
                ]}
                onPress={() => handleSetStatus("cancelled")}
                disabled={isMutating}
              >
                <Text style={[styles.statusBtnText, { color: status === "cancelled" ? "#fff" : colors.error }]}>✕ Отменено</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Finished banner */}
        {isFinished && (
          <View style={[
            styles.doneBanner,
            {
              backgroundColor: status === "completed" ? colors.success + "18" : colors.muted + "18",
              borderColor: status === "completed" ? colors.success + "55" : colors.muted + "55",
            }
          ]}>
            <Text style={{ fontSize: 28 }}>{status === "completed" ? "✅" : "❌"}</Text>
            <Text style={[styles.doneText, { color: status === "completed" ? colors.success : colors.muted }]}>
              {status === "completed" ? "Доставка выполнена" : "Заявка отменена"}
            </Text>
          </View>
        )}

        {/* ── Courier assignment ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>КУРЬЕР</Text>
          <View style={styles.courierRow}>
            <Text style={[
              styles.courierNameText,
              { color: task.courierName ? colors.foreground : colors.warning },
            ]}>
              {task.courierName ?? "Не назначен"}
            </Text>
            {!isFinished && (
              <TouchableOpacity
                style={[styles.assignBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                onPress={() => setCourierPickerVisible(true)}
                disabled={assignMutation.isPending}
              >
                <Text style={[styles.assignBtnText, { color: colors.primary }]}>
                  {assignMutation.isPending ? "..." : task.courierId ? "Изменить" : "Назначить"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Places ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>МЕСТО</Text>
          {!isFinished ? (
            <TouchableOpacity
              style={[styles.assignBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
              onPress={() => {
                setPlacesInput(places.toString());
                setPlacesInputVisible(true);
              }}
              disabled={placesMutation.isPending}
            >
              <Text style={[styles.placesValueText, { color: colors.foreground, textAlign: "center", fontSize: 18, fontWeight: "bold" }]}>{places}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.placesValueText, { color: colors.foreground }]}>
              📦 {places} {places === 1 ? "место" : places < 5 ? "места" : "мест"}
            </Text>
          )}
        </View>

        {/* ── Sender ── */}
        {(task.senderName || task.senderAddress || task.senderPhone) && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>ОТПРАВИТЕЛЬ</Text>
            {task.senderName && (
              <Text style={[styles.recipientName, { color: colors.foreground }]}>{task.senderName}</Text>
            )}
            {task.senderPhone && (
              <TouchableOpacity style={styles.phoneRow} onPress={() => handleCallPhone(task.senderPhone || "")}>
                <IconSymbol name={icon("phone.fill")} size={16} color={colors.primary} />
                <Text style={[styles.phone, { color: colors.primary }]}>{task.senderPhone}</Text>
                <Text style={[styles.callHint, { color: colors.muted }]}>Нажмите для звонка</Text>
              </TouchableOpacity>
            )}
            {task.senderAddress && (
              <TouchableOpacity 
                style={styles.addressRow}
                onPress={() => handleOpenMap(task.senderAddress || "", task.deliveryCity || undefined)}
              >
                <IconSymbol name={icon("mappin.fill")} size={18} color={colors.error} />
                <Text style={[styles.address, { color: colors.foreground }]}>
                  {task.senderAddress}
                </Text>
                <IconSymbol name={icon("mappin.fill")} size={14} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Recipient ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>ПОЛУЧАТЕЛЬ</Text>
          <Text style={[styles.recipientName, { color: colors.foreground }]}>{task.recipientName}</Text>
          {task.recipientPhone && (
            <TouchableOpacity style={styles.phoneRow} onPress={() => handleCallPhone(task.recipientPhone || "")}>
              <IconSymbol name={icon("phone.fill")} size={16} color={colors.primary} />
              <Text style={[styles.phone, { color: colors.primary }]}>{task.recipientPhone}</Text>
              <Text style={[styles.callHint, { color: colors.muted }]}>Нажмите для звонка</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={styles.addressRow}
            onPress={() => handleOpenMap(task.deliveryAddress || "", task.deliveryCity || undefined)}
          >
            <IconSymbol name={icon("mappin.fill")} size={18} color={colors.error} />
            <Text style={[styles.address, { color: colors.foreground }]}>
              {task.deliveryAddress}{task.deliveryCity ? `, ${task.deliveryCity}` : ""}
            </Text>
            <IconSymbol name={icon("mappin.fill")} size={14} color={colors.primary} />
          </TouchableOpacity>
          {task.estimatedMinutes ? (
            <View style={styles.estimateRow}>
              <IconSymbol name={icon("clock")} size={14} color={colors.muted} />
              <Text style={[styles.estimate, { color: colors.muted }]}>
                Примерное время: ~{task.estimatedMinutes} мин
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Comments ── */}
        {task.comments && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.error + "44", borderWidth: 1.5 }]}>
            <Text style={[styles.sectionTitle, { color: colors.muted }]}>КОММЕНТАРИИ</Text>
            <Text style={[styles.commentsText, { color: colors.foreground }]}>{task.comments || ""}</Text>
          </View>
        )}

        {/* ── Time interval ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>ВРЕМЕННОЙ ИНТЕРВАЛ</Text>
          <View style={styles.courierRow}>
            {(task.deliveryTimeFrom || task.deliveryTimeTo) ? (
              <View style={styles.addressRow}>
                <IconSymbol name={icon("clock")} size={16} color={colors.primary} />
                <Text style={[styles.address, { color: colors.foreground }]}>
                  {task.deliveryTimeFrom} - {task.deliveryTimeTo}
                </Text>
              </View>
            ) : (
              <Text style={[styles.address, { color: colors.muted }]}>Не указан</Text>
            )}
            {!isFinished && (
              <TouchableOpacity
                style={[styles.assignBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                onPress={() => {
                  setTimeFrom(task.deliveryTimeFrom || "");
                  setTimeTo(task.deliveryTimeTo || "");
                  setTimePickerVisible(true);
                }}
                disabled={timeIntervalMutation.isPending}
              >
                <Text style={[styles.assignBtnText, { color: colors.primary }]}>
                  {timeIntervalMutation.isPending ? "..." : "Указать"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

      </ScrollView>

      {/* ── Time picker modal ── */}
      <Modal
        visible={timePickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Временной интервал</Text>
              <TouchableOpacity onPress={() => setTimePickerVisible(false)}>
                <Text style={[styles.modalClose, { color: colors.muted }]}>Закрыть</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 16 }}>
              <View style={{ gap: 6 }}>
                <Text style={[{ fontSize: 13, fontWeight: "600", color: colors.muted }]}>ОТ (например: 10:00)</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
                  value={timeFrom}
                  onChangeText={setTimeFrom}
                  placeholder="10:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[{ fontSize: 13, fontWeight: "600", color: colors.muted }]}>ДО (например: 14:00)</Text>
                <TextInput
                  style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
                  value={timeTo}
                  onChangeText={setTimeTo}
                  placeholder="14:00"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  onSubmitEditing={handleSaveTimeInterval}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveTimeBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveTimeInterval}
                disabled={timeIntervalMutation.isPending}
              >
                <Text style={styles.saveTimeBtnText}>
                  {timeIntervalMutation.isPending ? "Сохраняю..." : "Сохранить"}
                </Text>
              </TouchableOpacity>
              {(task.deliveryTimeFrom || task.deliveryTimeTo) && (
                <TouchableOpacity
                  style={[styles.clearTimeBtn, { borderColor: colors.error }]}
                  onPress={() => {
                    setTimeFrom("");
                    setTimeTo("");
                    timeIntervalMutation.mutate({ token: token!, taskId, deliveryTimeFrom: null, deliveryTimeTo: null });
                  }}
                  disabled={timeIntervalMutation.isPending}
                >
                  <Text style={[styles.clearTimeBtnText, { color: colors.error }]}>Убрать интервал</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Courier picker modal ── */}
      <Modal
        visible={courierPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCourierPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Выбрать курьера</Text>
              <TouchableOpacity onPress={() => setCourierPickerVisible(false)}>
                <Text style={[styles.modalClose, { color: colors.primary }]}>Закрыть</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {task.courierId && (
                <TouchableOpacity
                  style={[styles.courierOption, { borderBottomColor: colors.border }]}
                  onPress={() => handleAssignCourier(null)}
                >
                  <Text style={[styles.courierOptionText, { color: colors.error }]}>— Снять курьера</Text>
                </TouchableOpacity>
              )}

              {couriersList?.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.courierOption,
                    { borderBottomColor: colors.border },
                    task.courierId === c.id && { backgroundColor: colors.primary + "12" },
                  ]}
                  onPress={() => handleAssignCourier(c.id)}
                >
                  <Text style={[
                    styles.courierOptionText,
                    { color: task.courierId === c.id ? colors.primary : colors.foreground },
                  ]}>
                    {task.courierId === c.id ? "✓ " : ""}{c.name}
                  </Text>
                  <Text style={[styles.courierOptionSub, { color: colors.muted }]}>@{c.username}</Text>
                </TouchableOpacity>
              ))}

              {(!couriersList || couriersList.length === 0) && (
                <View style={[styles.center, { padding: 32 }]}>
                  <Text style={[{ color: colors.muted, fontSize: 15 }]}>Нет доступных курьеров</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Places input modal ── */}
      <Modal
        visible={placesInputVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPlacesInputVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.background, maxHeight: "60%" }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Количество мест</Text>
              <TouchableOpacity onPress={() => setPlacesInputVisible(false)}>
                <Text style={[styles.modalClose, { color: colors.muted }]}>Закрыть</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20, gap: 16 }}>
              <TextInput
                style={[styles.timeInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface, fontSize: 32, textAlign: "center", fontWeight: "bold" }]}
                value={placesInput}
                onChangeText={setPlacesInput}
                placeholder="0"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const num = parseInt(placesInput, 10);
                  if (!isNaN(num) && num > 0 && num <= 999) {
                    placesMutation.mutate({ token: token!, taskId, placesCount: num });
                    setPlacesInputVisible(false);
                  }
                }}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.saveTimeBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const num = parseInt(placesInput, 10);
                  if (!isNaN(num) && num > 0 && num <= 999) {
                    placesMutation.mutate({ token: token!, taskId, placesCount: num });
                    setPlacesInputVisible(false);
                  }
                }}
                disabled={placesMutation.isPending}
              >
                <Text style={styles.saveTimeBtnText}>
                  {placesMutation.isPending ? "Сохраняю..." : "Сохранить"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  navHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 12 },
  navTitle: { flex: 1, fontSize: 18, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  card: {
    borderRadius: 12, borderWidth: 1, padding: 16, gap: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  statusBtns: { flexDirection: "row", gap: 8 },
  statusBtn: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8,
    borderWidth: 2, alignItems: "center", justifyContent: "center",
  },
  statusBtnText: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  doneBanner: {
    borderRadius: 12, borderWidth: 1, padding: 16,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  doneText: { fontSize: 16, fontWeight: "600" },
  courierRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  courierNameText: { fontSize: 16, fontWeight: "600", flex: 1 },
  assignBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6,
    borderWidth: 1,
  },
  assignBtnText: { fontSize: 13, fontWeight: "600" },
  placesValueText: { fontSize: 16, fontWeight: "600" },
  placesUnit: { fontSize: 12 },
  placesRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  placesBtn: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  placesBtnText: { fontSize: 20, fontWeight: "600" },
  placesValue: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 8, borderWidth: 1 },
  recipientName: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  phone: { fontSize: 14, fontWeight: "600", flex: 1 },
  callHint: { fontSize: 12 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  address: { fontSize: 14, fontWeight: "500", flex: 1 },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  estimate: { fontSize: 12 },
  commentsText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 16, fontWeight: "600" },
  backLink: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: "#00000055", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: "600" },
  modalClose: { fontSize: 14, fontWeight: "600" },
  timeInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  saveTimeBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  saveTimeBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  clearTimeBtn: { paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1 },
  clearTimeBtnText: { fontSize: 14, fontWeight: "600" },
  courierOption: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  courierOptionText: { fontSize: 15, fontWeight: "500" },
  courierOptionSub: { fontSize: 12, marginTop: 4 },
});
