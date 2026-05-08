import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";

export default function LoginScreen() {
  const colors = useColors();
  const { setSession } = useCourierAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = trpc.courierAuth.login.useMutation({
    onSuccess: async (data) => {
      setError(null);
      await setSession(data.token, {
        id: data.courier.id,
        name: data.courier.name,
        username: data.courier.username,
        phone: data.courier.phone,
        vehicleType: data.courier.vehicleType,
        isActive: data.courier.isActive,
        totalDeliveries: data.courier.totalDeliveries,
      });
    },
    onError: (err) => {
      setError(err.message || "Неверный логин или пароль");
    },
  });

  const handleLogin = () => {
    if (!username.trim()) {
      setError("Введите логин");
      return;
    }
    if (!password.trim()) {
      setError("Введите пароль");
      return;
    }
    setError(null);
    loginMutation.mutate({ username: username.trim(), password: password.trim() });
  };

  const isLoading = loginMutation.isPending;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.logo, { color: colors.primary }]}>📦</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Курьер</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Войдите в свой аккаунт</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.muted }]}>Логин</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="Введите логин"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="next"
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.muted }]}>Пароль</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="Введите пароль"
              placeholderTextColor={colors.muted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isLoading}
            />
          </View>

          {error ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.error + "15", borderColor: colors.error },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleLogin}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.loginButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
              isLoading && { opacity: 0.6 },
            ]}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Войти</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logo: {
    fontSize: 64,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loginButton: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});
