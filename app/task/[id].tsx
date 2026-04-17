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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
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
  const [placesInput, setPlacesInput] = useState("");
  const [activeStatusButtons, setActiveStatusButtons] = useState<Set<string>>(new Set());

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

  const handleOpenMap = (address: string | null | undefined) => {
    if (!address) return;
    const q = encodeURIComponent(address);
    // Try 2GIS deep link with search query, fallback to web
    const dgisDeep = `dgis://2gis.ru/search/${q}`;
    const dgisWeb = `https://2gis.ru/search?q=${q}`;
    Linking.canOpenURL(dgisDeep).then((ok) => {
      Linking.openURL(ok ? dgisDeep : dgisWeb);
    });
  };

  const handleCallPhone = (phone: string | null | undefined) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s|\(|\)|-/g, "")}`);
  };

  const handleToggleStatus = (status: "in_progress" | "completed" | "cancelled") => {
    const isActive = activeStatusButtons.has(status);
    const newActive = new Set(activeStatusButtons);
    if (isActive) {
      newActive.delete(status);
      statusMutation.mutate({ token: token!, taskId, status: "pending" as TaskStatus as any });
    } else {
      newActive.clear();
      newActive.add(status);
      statusMutation.mutate({ token: token!, taskId, status });
    }
    setActiveStatusButtons(newActive);
  };

  const handleSavePlaces = () => {
    const places = parseInt(placesInput, 10);
    if (isNaN(places) || places < 0) {
      Alert.alert("Ошибка", "Введите корректное количество мест");
      return;
    }
    placesMutation.mutate({ token: token!, taskId, placesCount: places });
  };

  const handleAssignCourier = (courierId: number | null) => {
    setCourierPickerVisible(false);
    assignMutation.mutate({ token: token!, taskId, courierId });
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

        {/* МЕСТО */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Место</Text>
          <TouchableOpacity
            onPress={() => { setPlacesInput(task.placesCount?.toString() || ""); setPlacesModalVisible(true); }}
            style={{ borderWidth: 2, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}
          >
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground }}>{task.placesCount || 0}</Text>
          </TouchableOpacity>
        </View>

        {/* СТАТУС КНОПКИ 2x2 */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 12 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            <StatusButton label="В работе" isActive={activeStatusButtons.has("in_progress")} onPress={() => handleToggleStatus("in_progress")} color="#F59E0B" />
            <StatusButton label="Выполнено" isActive={activeStatusButtons.has("completed")} onPress={() => handleToggleStatus("completed")} color="#22C55E" />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatusButton label="Отмена" isActive={activeStatusButtons.has("cancelled")} onPress={() => handleToggleStatus("cancelled")} color="#EF4444" />
            <StatusButton label="Перенос даты" isActive={false} onPress={() => setDatePickerVisible(true)} color="#3B82F6" />
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
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Количество мест</Text>
            <TextInput
              value={placesInput}
              onChangeText={setPlacesInput}
              placeholder="Введите количество"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, color: colors.foreground, fontSize: 16 }}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setPlacesModalVisible(false)} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSavePlaces} style={{ flex: 1, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>Перенос даты</Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>Выберите новую дату доставки</Text>
            <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={{ paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Закрыть</Text>
            </TouchableOpacity>
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
}

function StatusButton({ label, isActive, onPress, color }: StatusButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: isActive ? color : "transparent",
        borderColor: color,
        borderWidth: 2,
        borderRadius: 8,
        paddingVertical: 11,
        alignItems: "center" as const,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: isActive ? "#fff" : color, fontWeight: "600", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
