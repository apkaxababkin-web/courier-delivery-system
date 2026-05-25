import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Platform,
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

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

export default function ProfileModal() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const dark = isDarkBackground(colors.background);
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

  const cardBorder = dark ? "rgba(148,163,184,0.20)" : colors.border;
  const softSurface = dark ? "rgba(148,163,184,0.08)" : "#F8FAFC";

  const inputStyle = {
    height: 52,
    borderWidth: 1,
    borderColor: cardBorder,
    borderRadius: 10,
    paddingHorizontal: 16,
    color: colors.foreground,
    backgroundColor: colors.surface,
    fontSize: 12,
    fontWeight: "600" as const,
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
    if (!token || !notificationsEnabled || Platform.OS === "web") return;

    const registerPushToken = async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") return;

        const projectId =
          (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_APP_ID) ||
          undefined;

        if (!projectId) {
          console.log("[Profile] Push token skipped: no projectId configured");
          return;
        }

        const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
        await AsyncStorage.setItem("pushToken", pushToken.data);
        await registerPushTokenMutation.mutateAsync({ token, pushToken: pushToken.data });
      } catch (error) {
        console.warn("Failed to register push token", error);
      }
    };

    registerPushToken();
  }, [token, notificationsEnabled, registerPushTokenMutation]);

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

  const InfoCard = ({ label, value }: { label: string; value: string | number }) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: cardBorder }}>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>{value}</Text>
    </View>
  );

  const Header = () => (
    <View
      style={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: colors.background,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: cardBorder, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>Профиль</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: "700" }}>{isAuthenticated ? "Настройки курьера" : "Вход в приложение"}</Text>
        </View>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 42, height: 42, borderRadius: 10, backgroundColor: softSurface, alignItems: "center", justifyContent: "center" })}>
          <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 28 }}>×</Text>
        </Pressable>
      </View>
    </View>
  );

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header />
        <View style={{ flex: 1, padding: 18, justifyContent: "center", gap: 14 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 18, gap: 14, borderWidth: 1, borderColor: cardBorder, shadowColor: dark ? "#020617" : "#94A3B8", shadowOpacity: dark ? 0.28 : 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground, textAlign: "center" }}>
              Вход курьера
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 20, marginBottom: 4 }}>
              Введите логин и пароль, чтобы открыть заявки
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

            {loginError ? <Text style={{ color: colors.error, textAlign: "center", fontWeight: "800" }}>{loginError}</Text> : null}

            <Pressable
              onPress={handleLogin}
              disabled={loginMutation.isPending}
              style={{
                height: 54,
                borderRadius: 10,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: loginMutation.isPending ? 0.7 : 1,
                marginTop: 2,
              }}
            >
              {loginMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "white", fontSize: 17, fontWeight: "900" }}>Войти</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 122 }} style={{ flex: 1 }}>
        <Header />

        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 14 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 18, borderWidth: 1, borderColor: cardBorder }}>
            <Text style={{ fontSize: 13, color: colors.muted, fontWeight: "800", marginBottom: 6 }}>Курьер</Text>
            <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>{courier?.name || "—"}</Text>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800", marginTop: 4 }}>@{courier?.username || "—"}</Text>
          </View>

          <View style={{ gap: 12 }}>
            <InfoCard label="Телефон" value={courier?.phone || "—"} />
            <InfoCard label="Доставки" value={courier?.totalDeliveries || 0} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted, letterSpacing: 0.6 }}>ПАРАМЕТРЫ</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: cardBorder, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>Тёмный режим</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>Переключение темы приложения</Text>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={() => setColorScheme(isDarkMode ? "light" : "dark")}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted, letterSpacing: 0.6 }}>УВЕДОМЛЕНИЯ</Text>

          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: cardBorder, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>Новые заявки</Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>Push-уведомления курьеру</Text>
            </View>
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

        <View style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12 }}>
          <Pressable onPress={handleLogout} style={{ backgroundColor: colors.error, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 }}>
            <Text style={{ textAlign: "center", color: "white", fontWeight: "900", fontSize: 12 }}>Выйти</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
