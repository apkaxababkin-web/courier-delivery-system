import { useState, useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, Alert, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";
import type { Mail } from "@/shared/types";

export default function MailDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { waybill } = useLocalSearchParams<{ waybill: string }>();
  const [token] = useState("demo_token"); // TODO: Get from auth context
  const [signature, setSignature] = useState("");
  const [deliveryTime, setDeliveryTime] = useState(new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch mail details
  const { data: mail, isLoading } = trpc.mails.getByWaybill.useQuery(
    { token, waybillNumber: waybill || "" },
    { enabled: !!token && !!waybill }
  );

  // Mark as delivered mutation
  const markDeliveredMutation = trpc.mails.markDelivered.useMutation();

  const handleCallRecipient = () => {
    if (mail?.recipientPhone) {
      Linking.openURL(`tel:${mail.recipientPhone}`);
    }
  };

  const handleMarkDelivered = async () => {
    if (!signature.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, введите подпись получателя");
      return;
    }

    setIsSubmitting(true);
    try {
      await markDeliveredMutation.mutateAsync({
        token,
        waybillNumber: waybill || "",
        recipientSignature: signature,
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Успешно", "Письмо отмечено как доставленное");
      router.back();
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Ошибка", "Не удалось отметить письмо как доставленное");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <ScreenContainer>
        <Text style={{ color: colors.muted }}>Загрузка...</Text>
      </ScreenContainer>
    );
  }

  if (!mail) {
    return (
      <ScreenContainer>
        <Text style={{ color: colors.muted }}>Письмо не найдено</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-4" edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>← Назад</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Письмо</Text>
      </View>

      {/* Waybill Number */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Номер накладной</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>{mail.waybillNumber}</Text>
      </View>

      {/* Recipient Info */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Получатель</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>
          {mail.recipientName || "Не указано"}
        </Text>
      </View>

      {/* Delivery Address */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Адрес доставки</Text>
        <Text style={[styles.value, { color: colors.foreground }]}>{mail.deliveryAddress}</Text>
      </View>

      {/* Phone with Call Button */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.phoneRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Телефон получателя</Text>
            <Text style={[styles.value, { color: colors.foreground }]}>{mail.recipientPhone}</Text>
          </View>
          <Pressable
            onPress={handleCallRecipient}
            style={({ pressed }) => [
              styles.callButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.callButtonText, { color: colors.background }]}>Звонок</Text>
          </Pressable>
        </View>
      </View>

      {/* Signature Input */}
      {mail.status === "not_delivered" && (
        <>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.muted }]}>Подпись получателя</Text>
            <TextInput
              style={[
                styles.signatureInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Введите подпись"
              placeholderTextColor={colors.muted}
              value={signature}
              onChangeText={setSignature}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Time Picker */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.muted }]}>Время доставки</Text>
            <TextInput
              style={[
                styles.timeInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="HH:MM"
              placeholderTextColor={colors.muted}
              value={deliveryTime}
              onChangeText={setDeliveryTime}
            />
          </View>

          {/* Submit Button */}
          <Pressable
            onPress={handleMarkDelivered}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.submitButton,
              {
                backgroundColor: colors.primary,
                opacity: pressed || isSubmitting ? 0.8 : 1,
              },
            ]}
          >
            <Text style={[styles.submitButtonText, { color: colors.background }]}>
              {isSubmitting ? "Отправка..." : "Отметить как доставленное"}
            </Text>
          </Pressable>
        </>
      )}

      {/* Delivered Status */}
      {mail.status === "delivered" && (
        <View style={[styles.card, { backgroundColor: colors.success + "22", borderColor: colors.success }]}>
          <Text style={[styles.deliveredLabel, { color: colors.success }]}>✓ Доставлено</Text>
          <Text style={[styles.deliveredSignature, { color: colors.foreground }]}>
            Подпись: {mail.recipientSignature}
          </Text>
          <Text style={[styles.deliveredTime, { color: colors.muted }]}>
            {mail.deliveredAt ? new Date(mail.deliveredAt).toLocaleString("ru-RU") : ""}
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backButton: {
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    flex: 1,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: "500",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  callButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  callButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  signatureInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  timeInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    height: 40,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  deliveredLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  deliveredSignature: {
    fontSize: 14,
    marginBottom: 4,
  },
  deliveredTime: {
    fontSize: 12,
  },
});
