import { StyleSheet, Text, View } from "react-native";
import { CourierIcon } from "./courier-icon";

interface CourierBadgeProps {
  name: string;
  color: string;
  icon?: string | null;
  size?: "sm" | "md";
}

export function CourierBadge({
  name,
  color,
  icon,
  size = "md",
}: CourierBadgeProps) {
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: color + "22", borderColor: color + "55" },
        isSmall && styles.badgeSm,
      ]}
    >
      <CourierIcon
        icon={icon}
        color={color}
        size={isSmall ? 12 : 14}
      />

      <Text
        style={[
          styles.text,
          { color },
          isSmall && styles.textSm,
        ]}
      >
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  text: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },

  textSm: {
    fontSize: 11,
    lineHeight: 16,
  },
});
