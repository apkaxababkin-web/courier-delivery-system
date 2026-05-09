import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";

import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";

export default function ProfileModal() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { token, courier, setSession, logout, isAuthenticated } = useCourierAuth();
  const { colorScheme, setColorScheme } = useThemeContext();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationTypes, setNotificationTypes] = useState({
    newTasks: true,
    statusChanges: true,
    messages: true,
  });

  const loginMutation = trpc.courierAuth.login.useMutation();
  const registerPushTokenMutation = trpc.couriers.registerPushToken.useMutation();
  const isDarkMode = colorScheme === "dark";

  const inputStyle = {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: colors.foreground,
    backgroundColor: colors.surface,
  };

  useEffect(() => {
    const loadSettings = async () => {
      const saved = await AsyncStorage.getItem("notificationSettings");
      if (!saved) return;

      const parsed = JSON.parse(saved);
      setNotificationsEnabled(parsed.enabled ?? true);
      setNotificationTypes(parsed.types ?? {
        newTasks: true,
        statusChanges: true,
        messages: true,
      });
    };

    loadSettings().catch((error) => console.warn("Failed to load settings", error));
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      "notificationSettings",
      JSON.stringify({ enabled: notificationsEnabled, types: notificationTypes }),
    ).catch((error) => console.warn("Failed to save settings", error));
  }, [notificationsEnabled, notificationTypes]);

  useEffect(() => {
    if (!token || !notificationsEnabled) return;

    const registerPushToken = async () => {
      try {
        const pushToken = await Notifications.getExpoPushTokenAsync();
        await AsyncStorage.setItem("pushToken", pushToken.data);
        await registerPushTokenMutation.mutateAsync({ token, pushToken: pushToken.data });
      } catch (error) {
        console.warn("Failed to register push token", error);
      }
    };

    registerPushToken();
  }, [token, notificationsEnabled]);

  const handleLogin = async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setLoginError("Введите логин и пароль");
      return;
    }

    try {
      setLoginError("");
      const result = await loginMutation.mutateAsync({ username: cleanUsername, password });
      await setSession(result.token, result.courier);
      setUsername("");
      setPassword("");
      router.replace("/");
    } catch (error) {
      console.error(error);
      setLoginError("Неверный логин или пароль");
    }
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Выйти из аккаунта курьера?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: async () => {
          await AsyncStorage.removeItem("pushToken");
          await logout();
          router.replace("/");
        },
      },
    ]);
  };

  const Header = () => (
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
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>Профиль</Text>
        <Pressable onPress={() => router.back()} style={{ padding: 8 }}>
          <Text style={{ fontSize: 24, color: colors.foreground }}>×</Text>
        </Pressable>
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header />
        <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 14 }}>
          <Text style={{ fontSize: 26, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
            Вход курьера
          </Text>

          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Логин"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Пароль"
            placeholderTextColor={colors.muted}
            style={inputStyle}
          />

          {loginError ? (
            <Text style={{ color: colors.error, textAlign: "center" }}>{loginError}</Text>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={loginMutation.isPending}
            style={{
              height: 50,
              borderRadius: 12,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              opacity: loginMutation.isPending ? 0.7 : 1,
            }}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>Войти</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ flex: 1 }}>
        <Header />

        <View style={{ paddingHorizontal: 16, paddingVertical: 24, gap: 16 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Имя</Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>{courier?.name || "—"}</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Логин</Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>@{courier?.username || "—"}</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Телефон</Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>{courier?.phone || "—"}</Text>
          </View>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>Доставки</Text>
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground }}>{courier?.totalDeliveries || 0}</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>ПАРАМЕТРЫ</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>Тёмный режим</Text>
            <Switch
              value={isDarkMode}
              onValueChange={() => setColorScheme(isDarkMode ? "light" : "dark")}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>УВЕДОМЛЕНИЯ</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>Новые заявки</Text>
            <Switch
              value={notificationsEnabled && notificationTypes.newTasks}
              onValueChange={(value) => {
                setNotificationsEnabled(value);
                setNotificationTypes({ ...notificationTypes, newTasks: value });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ paddingHorizontal: 16, paddingVertical: 24 }}>
          <Pressable
            onPress={handleLogout}
            style={{ backgroundColor: colors.error, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 }}
          >
            <Text style={{ textAlign: "center", color: "white", fontWeight: "600", fontSize: 16 }}>Выход</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
