import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";
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

export default function ProfileScreen() {
  const colors = useColors();
  const { user, isAuthenticated, loading, logout } = useAuth();

  const { data: courier } = trpc.courier.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: activeTasks } = trpc.tasks.myActive.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: historyTasks } = trpc.tasks.myHistory.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const completedCount = (historyTasks ?? []).filter((t) => t.status === "completed").length;
  const activeCount = (activeTasks ?? []).length;

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="p-6">
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Профиль</Text>
        </View>
        <View style={styles.loginContainer}>
          <Text style={styles.loginIcon}>🚴</Text>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>
            Добро пожаловать в КурьерПро
          </Text>
          <Text style={[styles.loginSubtitle, { color: colors.muted }]}>
            Войдите в аккаунт, чтобы получать и выполнять задания доставки
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={startOAuthLogin}
          >
            <Text style={styles.loginBtnText}>Войти в аккаунт</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const VEHICLE_LABELS: Record<string, string> = {
    bicycle: "Велосипед",
    scooter: "Скутер",
    car: "Автомобиль",
    foot: "Пешком",
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
              {(user?.name ?? "К").charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.name ?? "Курьер"}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.muted }]}>
              {user?.email ?? ""}
            </Text>
            {courier ? (
              <Text style={[styles.profileVehicle, { color: colors.primary }]}>
                {courier.vehicleType ? (VEHICLE_LABELS[courier.vehicleType] ?? courier.vehicleType) : ""}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard value={activeCount} label="Активных" color={colors.primary} />
          <StatCard value={completedCount} label="Выполнено" color={colors.success} />
          <StatCard
            value={courier?.totalDeliveries ?? 0}
            label="Всего"
            color={colors.warning}
          />
        </View>

        {/* Info section */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoSectionTitle, { color: colors.muted }]}>ИНФОРМАЦИЯ</Text>

          <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Статус</Text>
            <View style={[styles.statusDot, { backgroundColor: courier?.isActive ? colors.success : colors.error }]} />
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              {courier?.isActive ? "Активен" : "Неактивен"}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>Роль</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>
              Курьер
            </Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.error }]}
          onPress={logout}
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
    paddingHorizontal: 32,
    gap: 12,
  },
  loginIcon: {
    fontSize: 72,
    marginBottom: 8,
  },
  loginTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    textAlign: "center",
  },
  loginSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 4,
  },
  loginBtn: {
    marginTop: 20,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
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
  profileEmail: {
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
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
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
    gap: 0,
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
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
