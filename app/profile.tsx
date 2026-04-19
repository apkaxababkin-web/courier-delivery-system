import { ScrollView, Text, View, Pressable, Switch, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { useThemeContext } from "@/lib/theme-provider";
import { useFontSize, type FontSizeScale } from "@/lib/font-size-provider";

export default function ProfileModal() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { courier, logout } = useCourierAuth();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { fontSizeScale, setFontSizeScale } = useFontSize();

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

          {/* Font Size Selector */}
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, marginBottom: 12 }}>
              Размер шрифта
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["normal", "large", "xlarge"] as FontSizeScale[]).map((scale) => (
                <Pressable
                  key={scale}
                  onPress={() => setFontSizeScale(scale)}
                  style={({ pressed }) => ({
                    flex: 1,
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor:
                      fontSizeScale === scale ? colors.primary : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: scale === "normal" ? 12 : scale === "large" ? 14 : 16,
                      fontWeight: "600",
                      color: fontSizeScale === scale ? "white" : colors.foreground,
                    }}
                  >
                    {scale === "normal" ? "Обычный" : scale === "large" ? "Большой" : "Очень большой"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
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

