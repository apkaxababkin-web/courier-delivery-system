import { StyleSheet, Text, View } from "react-native";
import { TASK_STATUS_META, type TaskStatus } from "@/shared/types";

interface StatusBadgeProps {
  status: TaskStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const meta = TASK_STATUS_META[status] ?? { label: status, color: "#6B7280" };
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: meta.color + "22", borderColor: meta.color + "55" },
        isSmall && styles.badgeSm,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: meta.color },
          isSmall && styles.textSm,
        ]}
      >
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
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
