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
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { type TaskStatus } from "@/shared/types";

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { token } = useCourierAuth();
  const taskId = parseInt(id ?? "0", 10);

  const [courierPickerVisible, setCourierPickerVisible] = useState(false);
  const [placesModalVisible, setPlacesModalVisible] = useState(false);
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
    if (!address) {
      Alert.alert("Ошибка", "Адрес не указан");
      return;
    }
    const encodedAddress = encodeURIComponent(address);
    const dgisUrl = `dgis://search?q=${encodedAddress}`;
    const webUrl = `https://2gis.ru/search?q=${encodedAddress}`;
    
    Linking.canOpenURL(dgisUrl).then((supported) => {
      if (supported) {
        Linking.openURL(dgisUrl);
      } else {
        Linking.openURL(webUrl);
      }
    });
  };

  const handleCallPhone = (phone: string | null | undefined) => {
    if (!phone) {
      Alert.alert("Ошибка", "Номер телефона не указан");
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleToggleStatus = (status: "in_progress" | "completed" | "cancelled") => {
    const isActive = activeStatusButtons.has(status);
    const newActive = new Set(activeStatusButtons);
    
    if (isActive) {
      newActive.delete(status);
      statusMutation.mutate({ token: token!, taskId, status: "pending" as any });
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
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="bg-surface px-4 py-3 flex-row items-center justify-between border-b border-border">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-primary text-lg">←</Text>
          </TouchableOpacity>
          <Text className="text-lg font-bold text-foreground">Заявка #{task.id}</Text>
          <StatusBadge status={task.status} />
        </View>

        <View className="px-4 py-4 gap-3">
          {/* STATUS BUTTONS */}
          <View className="bg-surface rounded-xl p-4 gap-2">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Статус заявки
            </Text>
            <View className="flex-row gap-2">
              <StatusButton
                label="В работе"
                isActive={activeStatusButtons.has("in_progress")}
                onPress={() => handleToggleStatus("in_progress")}
                color="#F59E0B"
              />
              <StatusButton
                label="Выполнено"
                isActive={activeStatusButtons.has("completed")}
                onPress={() => handleToggleStatus("completed")}
                color="#22C55E"
              />
              <StatusButton
                label="Отмена"
                isActive={activeStatusButtons.has("cancelled")}
                onPress={() => handleToggleStatus("cancelled")}
                color="#EF4444"
              />
            </View>
          </View>

          {/* COURIER */}
          <View className="bg-surface rounded-xl p-4">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Курьер
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-foreground">
                {task.courierName || "Не назначен"}
              </Text>
              <TouchableOpacity
                onPress={() => setCourierPickerVisible(true)}
                className="px-3 py-1.5 border border-primary rounded-lg"
              >
                <Text className="text-primary text-xs font-semibold">Изменить</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* PLACE */}
          <View className="bg-surface rounded-xl p-4">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Место
            </Text>
            <TouchableOpacity
              onPress={() => {
                setPlacesInput(task.placesCount?.toString() || "");
                setPlacesModalVisible(true);
              }}
              className="border border-primary rounded-lg py-3 items-center"
            >
              <Text className="text-xl font-bold text-foreground">
                {task.placesCount || 0}
              </Text>
            </TouchableOpacity>
          </View>

          {/* SENDER */}
          <View className="bg-surface rounded-xl p-4 gap-2">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wide">
              Отправитель
            </Text>
            <Text className="text-base font-semibold text-foreground">{task.senderName}</Text>
            
            {/* Sender Address with Map Icon */}
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-sm text-foreground flex-1">{task.senderAddress}</Text>
              <TouchableOpacity
                onPress={() => handleOpenMap(task.senderAddress)}
                className="p-2"
              >
                <IconSymbol name="paperplane.fill" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Sender Phone */}
            {task.senderPhone && (
              <TouchableOpacity
                onPress={() => handleCallPhone(task.senderPhone)}
                className="flex-row items-center gap-2"
              >
                <IconSymbol name="paperplane.fill" size={16} color={colors.primary} />
                <Text className="text-sm text-primary font-medium">{task.senderPhone}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* RECIPIENT */}
          <View className="bg-surface rounded-xl p-4 gap-2">
            <Text className="text-xs font-semibold text-muted uppercase tracking-wide">
              Получатель
            </Text>
            <Text className="text-base font-semibold text-foreground">{task.recipientName}</Text>
            
            {/* Recipient Address with Map Icon */}
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-sm text-foreground flex-1">{task.deliveryAddress}</Text>
              <TouchableOpacity
                onPress={() => handleOpenMap(task.deliveryAddress)}
                className="p-2"
              >
                <IconSymbol name="paperplane.fill" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Recipient Phone */}
            {task.recipientPhone && (
              <TouchableOpacity
                onPress={() => handleCallPhone(task.recipientPhone)}
                className="flex-row items-center gap-2"
              >
                <IconSymbol name="paperplane.fill" size={16} color={colors.primary} />
                <Text className="text-sm text-primary font-medium">{task.recipientPhone}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* TIME INTERVAL */}
          {(task.deliveryTimeFrom || task.deliveryTimeTo) && (
            <View className="bg-surface rounded-xl p-4">
              <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Временной интервал
              </Text>
              <Text className="text-base font-semibold text-foreground">
                {task.deliveryTimeFrom} - {task.deliveryTimeTo}
              </Text>
            </View>
          )}

          {/* COMMENTS */}
          {task.comments && (
            <View className="bg-surface rounded-xl p-4">
              <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                Посылка
              </Text>
              <Text className="text-sm text-foreground leading-relaxed">{task.comments}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Courier Picker Modal */}
      <Modal
        visible={courierPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCourierPickerVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-2xl p-4 max-h-96">
            <Text className="text-lg font-bold text-foreground mb-4">Выбрать курьера</Text>
            <ScrollView>
              <TouchableOpacity
                onPress={() => handleAssignCourier(null)}
                className="py-3 border-b border-border"
              >
                <Text className="text-foreground">Не назначен</Text>
              </TouchableOpacity>
              {couriersList?.map((courier) => (
                <TouchableOpacity
                  key={courier.id}
                  onPress={() => handleAssignCourier(courier.id)}
                  className="py-3 border-b border-border"
                >
                  <Text className="text-foreground">{courier.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setCourierPickerVisible(false)}
              className="mt-4 py-3 bg-primary rounded-lg items-center"
            >
              <Text className="text-background font-semibold">Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Places Input Modal */}
      <Modal
        visible={placesModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPlacesModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-2xl p-4 gap-4">
            <Text className="text-lg font-bold text-foreground">Количество мест</Text>
            <TextInput
              value={placesInput}
              onChangeText={setPlacesInput}
              placeholder="Введите количество"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              className="border border-border rounded-lg p-3 text-foreground"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setPlacesModalVisible(false)}
                className="flex-1 py-3 bg-border rounded-lg items-center"
              >
                <Text className="text-foreground font-semibold">Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePlaces}
                className="flex-1 py-3 bg-primary rounded-lg items-center"
              >
                <Text className="text-background font-semibold">Сохранить</Text>
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
}

function StatusButton({ label, isActive, onPress, color }: StatusButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          backgroundColor: isActive ? color : "transparent",
          borderColor: color,
          borderWidth: 2,
          borderRadius: 8,
          paddingVertical: 10,
          paddingHorizontal: 8,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: isActive ? "#ffffff" : color,
          fontWeight: "600",
          textAlign: "center",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
