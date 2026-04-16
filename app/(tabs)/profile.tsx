import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";

function StatCard({ value, label, color }: { value: string | number; label: string; color: string }) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function LoginForm() {
  const colors = useColors();
  const { setSession } = useCourierAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loginMutation = trpc.courierAuth.login.useMutation({
    onSuccess: async (data) => {
      await setSession(data.token, data.courier);
    },
    onError: (error) => {
      Alert.alert("Ошибка входа", error.message);
    },
  });

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Ошибка", "Введите логин и пароль");
      return;
    }
    loginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View style={styles.loginContainer}>
        <Text style={styles.loginIcon}>🚴</Text>
        <Text style={[styles.loginTitle, { color: colors.foreground }]}>
          Вход в КурьерПро
        </Text>
        <Text style={[styles.loginSubtitle, { color: colors.muted }]}>
          Введите логин и пароль, выданные менеджером
        </Text>

        <View style={styles.formContainer}>
          {/* Username */}
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.inputLabel, { color: colors.muted }]}>Логин</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              value={username}
              onChangeText={setUsername}
              placeholder="Введите логин"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrapper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.inputLabel, { color: colors.muted }]}>Пароль</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Введите пароль"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Text style={{ color: colors.muted, fontSize: 18 }}>
                  {showPassword ? "🙈" : "👁"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }, loginMutation.isPending && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Войти</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { courier, isAuthenticated, loading, logout } = useCourierAuth();

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated || !courier) {
    return (
      <ScreenContainer>
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Профиль</Text>
        </View>
        <LoginForm />
      </ScreenContainer>
    );
  }

  const VEHICLE_LABELS: Record<string, string> = {
    bicycle: "🚲 Велосипед",
    scooter: "🛵 Скутер",
    car: "🚗 Автомобиль",
    foot: "🚶 Пешком",
  };

  return (
    <ScreenContainer>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Профиль</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar + name */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {(courier.name ?? "К").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {courier.name}
            </Text>
            <Text style={[styles.profileUsername, { color: colors.muted }]}>
              @{courier.username}
            </Text>
            {courier.vehicleType ? (
              <Text style={[styles.profileVehicle, { color: colors.primary }]}>
                {VEHICLE_LABELS[courier.vehicleType] ?? courier.vehicleType}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard value={courier.totalDeliveries} label="Всего" color={colors.warning} />
          <StatCard
            value={courier.isActive ? "Активен" : "Неактивен"}
            label="Статус"
            color={courier.isActive ? colors.success : colors.error}
          />
        </View>

        {/* Info */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoSectionTitle, { color: colors.muted }]}>ИНФОРМАЦИЯ</Text>

          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Логин</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {courier.username}
            </Text>
          </View>

          {courier.phone ? (
            <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>Телефон</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {courier.phone}
              </Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Транспорт</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {courier.vehicleType ? (VEHICLE_LABELS[courier.vehicleType] ?? courier.vehicleType) : "—"}
            </Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.error }]}
          onPress={() => {
            Alert.alert("Выйти?", "Вы уверены, что хотите выйти из аккаунта?", [
              { text: "Отмена", style: "cancel" },
              { text: "Выйти", style: "destructive", onPress: logout },
            ]);
          }}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loginContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  loginIcon: {
    fontSize: 72,
    marginBottom: 4,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    textAlign: "center",
  },
  loginSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 8,
  },
  formContainer: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
  },
  eyeBtn: {
    padding: 4,
  },
  loginBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
  },
  profileUsername: {
    fontSize: 13,
    lineHeight: 18,
  },
  profileVehicle: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  infoSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  infoLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 20,
  },
  logoutBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
