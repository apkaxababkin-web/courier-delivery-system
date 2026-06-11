import Constants from "expo-constants";
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
import { ArrowLeft, Bell, LogOut, Moon, Phone, Route, UserRound, Vibrate } from "lucide-react-native";

import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { isVibrationEnabled, setVibrationEnabled as saveVibrationEnabled } from "@/lib/vibration-preference";
import { trpc } from "@/lib/trpc";
import { DESIGN_PREVIEW_TOKEN } from "@/lib/design-preview";

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
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
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
      const [saved, savedVibrationEnabled] = await Promise.all([
        AsyncStorage.getItem("notificationSettings"),
        isVibrationEnabled(),
      ]);

      setVibrationEnabled(savedVibrationEnabled);
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
    if (!token || token === DESIGN_PREVIEW_TOKEN || !notificationsEnabled || Platform.OS === "web") return;

    const registerPushToken = async () => {
      try {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.status !== "granted") return;

        const projectId =
          Constants.easConfig?.projectId ??
          Constants.expoConfig?.extra?.eas?.projectId;

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

  const handleVibrationChange = async (enabled: boolean) => {
    setVibrationEnabled(enabled);
    await saveVibrationEnabled(enabled);
  };

  const performLogout = async () => {
    await AsyncStorage.removeItem("pushToken");
    await logout();
    router.replace("/");
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      performLogout().catch((error) => console.warn("Failed to logout", error));
      return;
    }

    Alert.alert("Выход", "Выйти из аккаунта курьера?", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Выйти",
        style: "destructive",
        onPress: () => {
          performLogout().catch((error) => console.warn("Failed to logout", error));
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
        paddingTop: insets.top,
        height: insets.top + 64,
        paddingHorizontal: 8,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: cardBorder,
        justifyContent: "flex-end",
      }}
    >
      <View style={{ height: 64, flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, width: 44, height: 44, alignItems: "center", justifyContent: "center" })}>
          <ArrowLeft size={23} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, lineHeight: 20, fontWeight: "600", color: colors.foreground }}>Профиль</Text>
        <View style={{ width: 44 }} />
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
      <Header />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }} style={{ flex: 1 }}>

        <View style={{ minHeight: 94, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: cardBorder }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
            <UserRound size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 13 }}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: "600", color: colors.foreground }}>{courier?.name || "—"}</Text>
            <Text style={{ fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 2 }}>@{courier?.username || "—"}</Text>
          </View>
        </View>

        <ProfileInfoRow icon={<Phone size={19} color={colors.muted} />} label="Телефон" value={courier?.phone || "—"} colors={colors} border={cardBorder} />
        <ProfileInfoRow icon={<Route size={19} color={colors.muted} />} label="Выполнено доставок" value={String(courier?.totalDeliveries || 0)} colors={colors} border={cardBorder} />

        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600", paddingHorizontal: 16, paddingTop: 17, paddingBottom: 8 }}>НАСТРОЙКИ</Text>

        <SettingRow icon={<Moon size={19} color={colors.muted} />} title="Тёмная тема" subtitle="Оформление приложения" border={cardBorder} colors={colors}>
            <Switch
              value={isDarkMode}
              onValueChange={() => setColorScheme(isDarkMode ? "light" : "dark")}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
        </SettingRow>

        <SettingRow icon={<Vibrate size={19} color={colors.muted} />} title="Вибрация" subtitle="Отклик при действиях" border={cardBorder} colors={colors}>
            <Switch
              value={vibrationEnabled}
              onValueChange={handleVibrationChange}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
        </SettingRow>

        <SettingRow icon={<Bell size={19} color={colors.muted} />} title="Уведомления" subtitle="Новые заявки и изменения" border={cardBorder} colors={colors}>
            <Switch
              value={notificationsEnabled && notificationTypes.newTasks}
              onValueChange={(value) => {
                setNotificationsEnabled(value);
                setNotificationTypes({ ...notificationTypes, newTasks: value });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
        </SettingRow>

        <View style={{ flex: 1 }} />

        <View style={{ borderTopWidth: 1, borderTopColor: cardBorder }}>
          <Pressable onPress={handleLogout} style={({ pressed }) => ({ minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, opacity: pressed ? 0.65 : 1 })}>
            <LogOut size={19} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 13, fontWeight: "600", marginLeft: 12 }}>Выйти из аккаунта</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function ProfileInfoRow({ icon, label, value, colors, border }: { icon: React.ReactNode; label: string; value: string; colors: ReturnType<typeof useColors>; border: string }) {
  return (
    <View style={{ minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: border }}>
      <View style={{ width: 28, alignItems: "flex-start" }}>{icon}</View>
      <Text style={{ flex: 1, color: colors.foreground, fontSize: 12, fontWeight: "400" }}>{label}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "400" }}>{value}</Text>
    </View>
  );
}

function SettingRow({ icon, title, subtitle, border, colors, children }: { icon: React.ReactNode; title: string; subtitle: string; border: string; colors: ReturnType<typeof useColors>; children: React.ReactNode }) {
  return (
    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: border }}>
      <View style={{ width: 28, alignItems: "flex-start" }}>{icon}</View>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 12.5, lineHeight: 18, fontWeight: "600" }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: "400", marginTop: 1 }}>{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}
