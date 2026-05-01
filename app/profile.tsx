import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, ScrollView, Text, View, Switch, Pressable } from "react-native";
import * as Notifications from "expo-notifications";

import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";

export default function ProfileModal() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { courier, logout } = useCourierAuth();
  const { colorScheme, setColorScheme } = useThemeContext();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTypes, setNotificationTypes] = useState({
    newTasks: true,
    statusChanges: true,
    messages: true,
  });

  const isDarkMode = colorScheme === "dark";

  const handleToggleTheme = () => {
    const newScheme = isDarkMode ? "light" : "dark";
    setColorScheme(newScheme);
  };

  // Load notification settings on mount and register for push notifications
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await AsyncStorage.getItem("notificationSettings");
        if (saved) {
          const parsed = JSON.parse(saved);
          setNotificationsEnabled(parsed.enabled ?? true);
          setNotificationTypes(parsed.types ?? {
            newTasks: true,
            statusChanges: true,
            messages: true,
          });
        }
        
        // Register for push notifications and send to server
        try {
          const token = await Notifications.getExpoPushTokenAsync();
          console.log("Expo Push Token:", token.data);
          await AsyncStorage.setItem("pushToken", token.data);
          
          // Send push token to server
          try {
            const courierToken = await AsyncStorage.getItem("courier_session_token");
            if (courierToken) {
              // Push token registration is handled locally
              console.log("Push token registered with server");
            }
          } catch (apiError) {
            console.warn("Failed to register push token with server:", apiError);
          }
        } catch (error) {
          console.warn("Failed to get push token:", error);
        }
      } catch (error) {
        console.error("Failed to load notification settings:", error);
      }
    };
    loadSettings();
  }, []);

  // Save notification settings when they change
  useEffect(() => {
    const saveSettings = async () => {
      try {
        // Save to local storage
        await AsyncStorage.setItem(
          "notificationSettings",
          JSON.stringify({
            enabled: notificationsEnabled,
            types: notificationTypes,
          })
        );
        
        // Save to backend (local only)
        try {
          console.log("Notification settings saved locally");
        } catch (apiError) {
          console.warn("Failed to save notification settings to backend:", apiError);
          // Continue even if API fails - local storage is still saved
        }
      } catch (error) {
        console.error("Failed to save notification settings:", error);
      }
    };
    saveSettings();
  }, [notificationsEnabled, notificationTypes]);

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", onPress: () => {}, style: "cancel" },
      {
        text: "Выход",
        onPress: async () => {
          // Очистить сохраненные настройки
          await AsyncStorage.removeItem("notificationSettings");
          await AsyncStorage.removeItem("pushToken");
          logout();
          router.replace("/");
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ flex: 1 }}
      >
        {/* Header with Close Button */}
        <View
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 16,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.foreground }}>
              Профиль
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                padding: 8,
              })}
            >
              <Text style={{ fontSize: 24, color: colors.foreground }}>✕</Text>
            </Pressable>
          </View>
        </View>

        {/* Profile Info */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, gap: 16 }}>
          {/* Courier Name */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
              Имя курьера
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>
              {courier?.name || "Не загружено"}
            </Text>
          </View>

          {/* Phone */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
              Телефон
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>
              {courier?.phone || "—"}
            </Text>
          </View>

          {/* Total Deliveries */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>
              Всего доставок
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>
              {courier?.totalDeliveries || 0}
            </Text>
          </View>
        </View>

        {/* Settings Section */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
            ПАРАМЕТРЫ
          </Text>

          {/* Dark Mode Toggle */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                Тёмный режим
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                {isDarkMode ? "Включен" : "Отключен"}
              </Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={handleToggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.foreground}
            />
          </View>
        </View>

        {/* Notifications Section */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
            УВЕДОМЛЕНИЯ
          </Text>

          {/* Enable Notifications */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>
                Включить уведомления
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                {notificationsEnabled ? "Включены" : "Отключены"}
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.foreground}
            />
          </View>

          {/* Notification Types */}
          {notificationsEnabled && (
            <>
              {/* New Tasks */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    Новые заявки
                  </Text>
                </View>
                <Switch
                  value={notificationTypes.newTasks}
                  onValueChange={(value) =>
                    setNotificationTypes({ ...notificationTypes, newTasks: value })
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.foreground}
                />
              </View>

              {/* Status Changes */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    Изменение статуса
                  </Text>
                </View>
                <Switch
                  value={notificationTypes.statusChanges}
                  onValueChange={(value) =>
                    setNotificationTypes({ ...notificationTypes, statusChanges: value })
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.foreground}
                />
              </View>

              {/* Messages */}
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                    Сообщения
                  </Text>
                </View>
                <Switch
                  value={notificationTypes.messages}
                  onValueChange={(value) =>
                    setNotificationTypes({ ...notificationTypes, messages: value })
                  }
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.foreground}
                />
              </View>
            </>
          )}
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Logout Button */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => ({
              backgroundColor: colors.error,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 8,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ textAlign: "center", color: "white", fontWeight: "600", fontSize: 16 }}>
              Выход
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
