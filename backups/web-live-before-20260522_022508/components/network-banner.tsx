import { Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

type Props = {
  visible: boolean;
};

export function NetworkBanner({ visible }: Props) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <View
      style={{
        backgroundColor: "#dc2626",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.1)",
      }}
    >
      <Text
        style={{
          color: "white",
          textAlign: "center",
          fontWeight: "700",
          fontSize: 13,
        }}
      >
        Нет подключения к интернету
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.8)",
          textAlign: "center",
          fontSize: 12,
          marginTop: 2,
        }}
      >
        Данные обновятся автоматически после восстановления сети
      </Text>
    </View>
  );
}
