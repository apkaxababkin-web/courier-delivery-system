import { Linking, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface PhoneButtonProps {
  phone: string;
  label?: string;
}

export function PhoneButton({ phone, label }: PhoneButtonProps) {
  const colors = useColors();

  const handleCall = async () => {
    const url = `tel:${phone}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error("Error opening phone:", error);
    }
  };

  return (
    <Pressable
      onPress={handleCall}
      style={({ pressed }) => ({
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialIcons name="call" size={18} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "500" }}>
          {phone}
        </Text>
      </View>
    </Pressable>
  );
}
