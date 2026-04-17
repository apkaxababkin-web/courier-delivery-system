import { Linking, Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

interface AddressWithMapProps {
  address: string;
  label?: string;
}

export function AddressWithMap({ address, label }: AddressWithMapProps) {
  const colors = useColors();

  const handleOpenMap = async () => {
    // 2GIS deep link format: dgis://search?query=<address>
    const encodedAddress = encodeURIComponent(address);
    const dgisUrl = `dgis://search?query=${encodedAddress}`;
    
    try {
      const canOpen = await Linking.canOpenURL(dgisUrl);
      if (canOpen) {
        await Linking.openURL(dgisUrl);
      } else {
        // Fallback to Google Maps if 2GIS is not installed
        const googleMapsUrl = `https://maps.google.com/?q=${encodedAddress}`;
        await Linking.openURL(googleMapsUrl);
      }
    } catch (error) {
      console.error("Error opening map:", error);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      {label && (
        <Text style={{ fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" }}>
          {label}
        </Text>
      )}
      <Pressable
        onPress={handleOpenMap}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <MaterialIcons name="location-on" size={18} color={colors.primary} style={{ marginTop: 2 }} />
          <Text style={{ color: colors.foreground, fontSize: 14, flex: 1, lineHeight: 20 }}>
            {address}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
