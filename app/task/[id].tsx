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

  const { data: task, isLoading, refetch } = trpc.tasks.byId.useQuery(
    token ? { token, id: taskId } : skipToken
  );

  const pickupMutation = trpc.tasks.pickup.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refetch();
    },
    onError: (e) => Alert.alert("Ошибка", e.message),
  });

  const completeMutation = trpc.tasks.complete.useMutation({
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Доставка выполнена! ✓", "Задание успешно завершено.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (e) => Alert.alert("Ошибка", e.message),
  });

  const handlePickup = () => {
    if (!token) return;
    Alert.alert(
      "Я заберу посылку?",
      "Подтвердите, что вы едете за посылкой.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Да, еду!",
          onPress: () => pickupMutation.mutate({ token, taskId }),
        },
      ]
    );
  };

  const handleComplete = () => {
    if (!token) return;
    Alert.alert(
      "Подтвердить доставку?",
      "Посылка передана получателю?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Доставлено ✓",
          onPress: () => completeMutation.mutate({ token, taskId }),
        },
      ]
    );
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
  const canPickup = status === "assigned";
  const canComplete = status === "in_progress";
  const isMutating = pickupMutation.isPending || completeMutation.isPending;
  const isDone = status === "completed" || status === "cancelled";

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.navHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name={icon("chevron.left")} size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>
          Задание #{task.id}
        </Text>
        <StatusBadge status={status} size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Recipient */}
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
              <Text style={[styles.callHint, { color: colors.muted }]}>Нажмите для звонка</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Address */}
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

        {/* Package */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>ПОСЫЛКА</Text>
          <View style={styles.packageRow}>
            <IconSymbol name={icon("shippingbox.fill")} size={16} color={colors.primary} />
            <Text style={[styles.packageType, { color: colors.foreground }]}>
              {task.packageType
                ? (PACKAGE_TYPE_LABELS[task.packageType as PackageType] ?? task.packageType)
                : ""}
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
          <View style={[styles.card, { backgroundColor: colors.warning + "11", borderColor: colors.warning + "55" }]}>
            <View style={styles.warningHeader}>
              <IconSymbol name={icon("exclamationmark.triangle.fill")} size={16} color={colors.warning} />
              <Text style={[styles.sectionTitle, { color: colors.warning }]}>ОСОБЫЕ УКАЗАНИЯ</Text>
            </View>
            <Text style={[styles.instructions, { color: colors.foreground }]}>
              {task.specialInstructions}
            </Text>
          </View>
        ) : null}

        {/* Completion banner */}
        {isDone && (
          <View style={[
            styles.doneBanner,
            {
              backgroundColor: status === "completed" ? colors.success + "18" : colors.muted + "18",
              borderColor: status === "completed" ? colors.success + "55" : colors.muted + "55",
            }
          ]}>
            <Text style={{ fontSize: 28 }}>
              {status === "completed" ? "✅" : "❌"}
            </Text>
            <Text style={[styles.doneText, { color: status === "completed" ? colors.success : colors.muted }]}>
              {status === "completed" ? "Доставка выполнена" : "Задание отменено"}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {!isDone && (
          <View style={styles.actions}>
            {canPickup && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }, isMutating && { opacity: 0.7 }]}
                onPress={handlePickup}
                disabled={isMutating}
              >
                {pickupMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>🚴 Я заберу</Text>
                )}
              </TouchableOpacity>
            )}

            {canComplete && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.success }, isMutating && { opacity: 0.7 }]}
                onPress={handleComplete}
                disabled={isMutating}
              >
                {completeMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>✓ Доставлено</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  navHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, gap: 12,
  },
  backBtn: { padding: 4 },
  navTitle: { flex: 1, fontSize: 18, fontWeight: "600", lineHeight: 24 },
  scrollContent: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, lineHeight: 16 },
  recipientName: { fontSize: 20, fontWeight: "700", lineHeight: 26 },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  phone: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  callHint: { fontSize: 12, lineHeight: 16 },
  addressRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  address: { flex: 1, fontSize: 16, lineHeight: 22 },
  estimateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  estimate: { fontSize: 13, lineHeight: 18 },
  packageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  packageType: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  packageDesc: { fontSize: 14, lineHeight: 20 },
  warningHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  instructions: { fontSize: 14, lineHeight: 20 },
  doneBanner: {
    borderRadius: 14, borderWidth: 1, padding: 20,
    alignItems: "center", gap: 8,
  },
  doneText: { fontSize: 17, fontWeight: "700", lineHeight: 22 },
  actions: { gap: 10, marginTop: 8, marginBottom: 24 },
  actionBtn: { height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionBtnText: { color: "#fff", fontSize: 18, fontWeight: "700", lineHeight: 24 },
  errorText: { fontSize: 16, fontWeight: "600" },
  backLink: { fontSize: 15, fontWeight: "500" },
});
