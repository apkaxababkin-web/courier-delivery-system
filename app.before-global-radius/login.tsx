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

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setSession } = useCourierAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.courierAuth.login.useMutation();

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
            borderRadius: 12,
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
            borderRadius: 12,
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
          disabled={loginMutation.isPending}
          style={({ pressed }) => ({
            height: 52,
            borderRadius: 12,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: loginMutation.isPending || pressed ? 0.75 : 1,
            marginTop: 4,
          })}
        >
          {loginMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>Войти</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
