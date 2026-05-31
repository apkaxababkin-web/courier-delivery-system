import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";

async function getMobilePushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "МИГ Courier",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0A7EA4",
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const permission = await Notifications.requestPermissionsAsync();
  console.log("[CourierLogin] push permission", permission.status);
  if (permission.status !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;

  console.log("[CourierLogin] push projectId", projectId ? "present" : "missing");
  if (!projectId) return null;

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  console.log("[CourierLogin] Expo push token received");
  return pushToken.data;
}

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setSession } = useCourierAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.courierAuth.login.useMutation();
  const registerPushTokenMutation = trpc.couriers.registerPushToken.useMutation();

  const handleLogin = async () => {
    setError("");
    const clean = username.trim();
    if (!clean || !password) {
      setError("Введите логин и пароль");
      return;
    }
    try {
      const result = await loginMutation.mutateAsync({ username: clean, password });
      if (result?.token && result?.courier) {
        console.log("[CourierLogin] success", !!result.token, result.courier?.id);
        await setSession(result.token, result.courier);
        console.log("[CourierLogin] session saved");

        try {
          const pushToken = await getMobilePushToken();
          if (pushToken) {
            await registerPushTokenMutation.mutateAsync({ token: result.token, pushToken });
            console.log("[CourierLogin] push token registered");
          } else {
            console.log("[CourierLogin] push token skipped");
          }
        } catch (pushError) {
          console.warn("[CourierLogin] failed to register push token", pushError);
        }

        router.replace("/(tabs)" as never);
      } else {
        setError("Неверный логин или пароль");
      }
    } catch (e: any) {
      setError(e?.message ?? "Ошибка входа");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "700",
            color: colors.foreground,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Вход курьера
        </Text>

        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Логин"
          placeholderTextColor={colors.muted}
          returnKeyType="next"
          style={{
            height: 50,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 16,
            color: colors.foreground,
            backgroundColor: colors.surface,
            fontSize: 12,
          }}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Пароль"
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          style={{
            height: 50,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 16,
            color: colors.foreground,
            backgroundColor: colors.surface,
            fontSize: 12,
          }}
        />

        {error ? (
          <Text style={{ color: colors.error, textAlign: "center", fontSize: 12 }}>{error}</Text>
        ) : null}

        <Pressable
          onPress={handleLogin}
          disabled={loginMutation.isPending || registerPushTokenMutation.isPending}
          style={({ pressed }) => ({
            height: 52,
            borderRadius: 10,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: loginMutation.isPending || registerPushTokenMutation.isPending || pressed ? 0.75 : 1,
            marginTop: 4,
          })}
        >
          {loginMutation.isPending || registerPushTokenMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>Войти</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
