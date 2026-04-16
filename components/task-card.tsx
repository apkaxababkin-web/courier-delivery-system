import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StatusBadge } from "@/components/status-badge";
import { PACKAGE_TYPE_LABELS, type PackageType, type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const icon = (name: string) => name as any;

export interface TaskCardData {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  deliveryCity?: string | null;
  packageType: PackageType;
  status: TaskStatus;
  estimatedMinutes?: number | null;
  specialInstructions?: string | null;
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onPress(task)}
      activeOpacity={0.75}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.recipient, { color: colors.foreground }]} numberOfLines={1}>
            {task.recipientName}
          </Text>
          <Text style={[styles.taskId, { color: colors.muted }]}>
            Задание #{task.id}
          </Text>
        </View>
        <StatusBadge status={task.status} size="sm" />
      </View>

      <View style={styles.addressRow}>
        <IconSymbol name={icon("mappin.fill")} size={14} color={colors.primary} />
        <Text style={[styles.address, { color: colors.foreground }]} numberOfLines={2}>
          {task.deliveryAddress}
          {task.deliveryCity ? `, ${task.deliveryCity}` : ""}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={styles.packageRow}>
            <IconSymbol name={icon("shippingbox.fill")} size={13} color={colors.muted} />
            <Text style={[styles.packageType, { color: colors.muted }]}>
              {PACKAGE_TYPE_LABELS[task.packageType] ?? task.packageType}
            </Text>
          </View>
          {task.specialInstructions ? (
            <View style={styles.packageRow}>
              <IconSymbol name={icon("exclamationmark.triangle.fill")} size={13} color={colors.warning} />
              <Text style={[styles.packageType, { color: colors.warning }]} numberOfLines={1}>
                {task.specialInstructions}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footerRight}>
          {task.estimatedMinutes ? (
            <View style={styles.timeRow}>
              <IconSymbol name={icon("clock")} size={13} color={colors.muted} />
              <Text style={[styles.time, { color: colors.muted }]}>
                ~{task.estimatedMinutes} мин
              </Text>
            </View>
          ) : null}
          <IconSymbol name={icon("chevron.right")} size={18} color={colors.muted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    gap: 2,
  },
  recipient: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  taskId: {
    fontSize: 12,
    lineHeight: 16,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  address: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footerLeft: {
    flex: 1,
    gap: 4,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  packageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  packageType: {
    fontSize: 12,
    lineHeight: 16,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  time: {
    fontSize: 12,
    lineHeight: 16,
  },
});
