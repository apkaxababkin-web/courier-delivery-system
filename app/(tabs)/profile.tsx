import { ScrollView, Text, View, Pressable, Switch, Alert } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useColors();
  const { courier, logout } = useCourierAuth();
  const { colorScheme, setColorScheme } = useThemeContext();

  const isDarkMode = colorScheme === "dark";

  const handleToggleTheme = () => {
    const newScheme = isDarkMode ? "light" : "dark";
    setColorScheme(newScheme);
  };

  const handleLogout = () => {
    Alert.alert("Выход", "Вы уверены, что хотите выйти?", [
      { text: "Отмена", onPress: () => {}, style: "cancel" },
      {
        text: "Выход",
        onPress: () => {
          logout();
          router.replace("/");
        },
        style: "destructive",
      },
    ]);
  };

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Header */}
        <View className="bg-surface border-b border-border px-6 py-4">
          <Text className="text-2xl font-bold text-foreground">Профиль</Text>
        </View>

        {/* Profile Info */}
        <View className="px-6 py-6 gap-4">
          {/* Courier Name */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs text-muted mb-1">Имя курьера</Text>
            <Text className="text-lg font-semibold text-foreground">
              {courier?.name || "Не загружено"}
            </Text>
          </View>

          {/* Username */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs text-muted mb-1">Логин</Text>
            <Text className="text-lg font-semibold text-foreground">
              {courier?.username || "—"}
            </Text>
          </View>

          {/* Phone */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs text-muted mb-1">Телефон</Text>
            <Text className="text-lg font-semibold text-foreground">
              {courier?.phone || "—"}
            </Text>
          </View>

          {/* Vehicle Type */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs text-muted mb-1">Транспорт</Text>
            <Text className="text-lg font-semibold text-foreground">
              {getVehicleLabel(courier?.vehicleType)}
            </Text>
          </View>

          {/* Total Deliveries */}
          <View className="bg-surface rounded-lg p-4 border border-border">
            <Text className="text-xs text-muted mb-1">Всего доставок</Text>
            <Text className="text-lg font-semibold text-foreground">
              {courier?.totalDeliveries || 0}
            </Text>
          </View>
        </View>

        {/* Settings Section */}
        <View className="px-6 py-4 gap-4">
          <Text className="text-sm font-semibold text-muted">ПАРАМЕТРЫ</Text>

          {/* Dark Mode Toggle */}
          <View className="bg-surface rounded-lg p-4 border border-border flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                Тёмный режим
              </Text>
              <Text className="text-xs text-muted mt-1">
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

        {/* Spacer */}
        <View className="flex-1" />

        {/* Logout Button */}
        <View className="px-6 py-6">
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              {
                backgroundColor: colors.error,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 8,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text className="text-center text-white font-semibold text-base">
              Выход
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function getVehicleLabel(vehicleType?: string): string {
  const labels: Record<string, string> = {
    bicycle: "Велосипед",
    scooter: "Самокат",
    car: "Автомобиль",
    foot: "Пешком",
  };
  return labels[vehicleType || ""] || "—";
}
