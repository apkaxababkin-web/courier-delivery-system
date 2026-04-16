import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ScreenContainer } from "@/components/screen-container";
import { StatusBadge } from "@/components/status-badge";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { PACKAGE_TYPE_LABELS, type PackageType, type TaskStatus } from "@/shared/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const taskId = parseInt(id ?? "0", 10);

  const { data: task, isLoading, refetch } = trpc.tasks.byId.useQuery({ id: taskId });

  const acceptMutation = trpc.tasks.accept.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
    },
  });

  const rejectMutation = trpc.tasks.reject.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      refetch();
    },
  });

  const startMutation = trpc.tasks.startDelivery.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
    },
  });

  const completeMutation = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Доставка выполнена!", "Задание успешно завершено.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
  });

  const handleAccept = () => {
    Alert.alert("Принять задание?", "Вы подтверждаете принятие этого задания?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Принять",
        onPress: () => acceptMutation.mutate({ taskId }),
      },
    ]);
  };

  const handleReject = () => {
    Alert.alert("Отклонить задание?", "Вы уверены, что хотите отклонить это задание?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Отклонить",
        style: "destructive",
        onPress: () => rejectMutation.mutate({ taskId, reason: "Курьер отклонил задание" }),
      },
    ]);
  };

  const handleCall = () => {
    if (task?.recipientPhone) {
      Linking.openURL(`tel:${task.recipientPhone}`);
    }
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
          <Text style={[styles.errorText, { color: colors.error }]}>Задание не найдено</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.backLink, { color: colors.primary }]}>← Назад</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const status = task.status as TaskStatus;
  const canAccept = status === "assigned";
  const canReject = status === "assigned" || status === "accepted";
  const canStart = status === "accepted";
  const canComplete = status === "in_progress";
  const isLoading2 =
    acceptMutation.isPending ||
    rejectMutation.isPending ||
    startMutation.isPending ||
    completeMutation.isPending;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.navHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name={icon("arrow.left")} size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>
          Задание #{task.id}
        </Text>
        <StatusBadge status={status} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Recipient card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>ПОЛУЧАТЕЛЬ</Text>
          <Text style={[styles.recipientName, { color: colors.foreground }]}>
            {task.recipientName}
          </Text>
          {task.recipientPhone ? (
            <TouchableOpacity style={styles.phoneRow} onPress={handleCall}>
              <IconSymbol name={icon("phone.fill")} size={16} color={colors.primary} />
              <Text style={[styles.phone, { color: colors.primary }]}>
                {task.recipientPhone}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Address card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>АДРЕС ДОСТАВКИ</Text>
          <View style={styles.addressRow}>
            <IconSymbol name={icon("mappin.fill")} size={18} color={colors.error} />
            <Text style={[styles.address, { color: colors.foreground }]}>
              {task.deliveryAddress}
              {task.deliveryCity ? `, ${task.deliveryCity}` : ""}
            </Text>
          </View>
          {task.estimatedMinutes ? (
            <View style={styles.estimateRow}>
              <IconSymbol name={icon("clock")} size={14} color={colors.muted} />
              <Text style={[styles.estimate, { color: colors.muted }]}>
                Примерное время: ~{task.estimatedMinutes} мин
              </Text>
            </View>
          ) : null}
        </View>

        {/* Package card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>ПОСЫЛКА</Text>
          <View style={styles.packageRow}>
            <IconSymbol name={icon("shippingbox.fill")} size={16} color={colors.primary} />
            <Text style={[styles.packageType, { color: colors.foreground }]}>
              {PACKAGE_TYPE_LABELS[task.packageType as PackageType] ?? task.packageType}
            </Text>
          </View>
          {task.packageDescription ? (
            <Text style={[styles.packageDesc, { color: colors.muted }]}>
              {task.packageDescription}
            </Text>
          ) : null}
        </View>

        {/* Special instructions */}
        {task.specialInstructions ? (
          <View style={[styles.card, styles.warningCard, { borderColor: colors.warning + "55" }]}>
            <View style={styles.warningHeader}>
              <IconSymbol name={icon("exclamationmark.triangle.fill")} size={16} color={colors.warning} />
              <Text style={[styles.sectionTitle, { color: colors.warning }]}>ОСОБЫЕ УКАЗАНИЯ</Text>
            </View>
            <Text style={[styles.instructions, { color: colors.foreground }]}>
              {task.specialInstructions}
            </Text>
          </View>
        ) : null}

        {/* Rejection reason */}
        {task.rejectionReason ? (
          <View style={[styles.card, { backgroundColor: colors.error + "11", borderColor: colors.error + "33" }]}>
            <Text style={[styles.sectionTitle, { color: colors.error }]}>ПРИЧИНА ОТКЛОНЕНИЯ</Text>
            <Text style={[styles.instructions, { color: colors.foreground }]}>
              {task.rejectionReason}
            </Text>
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actions}>
          {canAccept && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              onPress={handleAccept}
              disabled={isLoading2}
            >
              {isLoading2 ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>✓ Принять задание</Text>
              )}
            </TouchableOpacity>
          )}

          {canStart && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={() => startMutation.mutate({ taskId })}
              disabled={isLoading2}
            >
              {isLoading2 ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>🚀 Забрал посылку — в путь!</Text>
              )}
            </TouchableOpacity>
          )}

          {canComplete && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              onPress={() => completeMutation.mutate({ taskId })}
              disabled={isLoading2}
            >
              {isLoading2 ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionBtnText}>✓ Подтвердить доставку</Text>
              )}
            </TouchableOpacity>
          )}

          {canReject && (
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.error }]}
              onPress={handleReject}
              disabled={isLoading2}
            >
              <Text style={[styles.actionBtnOutlineText, { color: colors.error }]}>
                ✕ Отклонить задание
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  navTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  warningCard: {
    backgroundColor: "#FFFBEB",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  recipientName: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  phone: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  address: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
  },
  estimateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  estimate: {
    fontSize: 13,
    lineHeight: 18,
  },
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  packageType: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  packageDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  instructions: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
    marginTop: 8,
    marginBottom: 24,
  },
  actionBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  actionBtnOutline: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnOutlineText: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
  errorText: {
    fontSize: 16,
    fontWeight: "600",
  },
  backLink: {
    fontSize: 15,
    fontWeight: "500",
  },
});
