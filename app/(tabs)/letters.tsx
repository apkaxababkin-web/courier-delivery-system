import { Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function LettersScreen() {
  return (
    <ScreenContainer className="p-4">
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-foreground">Письма</Text>
        <Text className="mt-2 text-muted">Письма - в разработке</Text>
      </View>
    </ScreenContainer>
  );
}
