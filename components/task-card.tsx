import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { type TaskStatus } from "@/shared/types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: "Ожидает",
  in_progress: "В работе",
  completed: "Выполнена",
  cancelled: "Отменена",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  assigned: { bg: "#EAF2FF", fg: "#0B7CFF" },
  in_progress: { bg: "#EAF2FF", fg: "#0B7CFF" },
  completed: { bg: "#DCFCE7", fg: "#15803D" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C" },
};

type RequestType = "delivery" | "movement" | "nuts" | "courier_call" | "pickup_from_tc" | "simple";
type TaskType = "regular" | "warehouse_pickup" | "courier_call";

export interface TaskCardData {
  id: number;
  recipientName: string;
  deliveryAddress: string;
  deliveryCity?: string | null;
  recipientAddress?: string | null;
  senderName?: string | null;
  senderAddress?: string | null;
  status: TaskStatus;
  placesCount?: number | null;
  deliveryTimeFrom?: string | null;
  deliveryTimeTo?: string | null;
  courierName?: string | null;
  taskType?: TaskType | RequestType;
  requestType?: RequestType | null;
  comments?: string | null;
  specialInstructions?: string | null;
  packageDescription?: string | null;
  items?: string | null;
  createdAt?: string | Date | null;
  scheduledAt?: string | Date | null;
}

interface TaskCardProps {
  task: TaskCardData;
  onPress: (task: TaskCardData) => void;
}

function clean(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function first(...values: Array<string | null | undefined>) {
  return values.map(clean).find(Boolean) || "—";
}

function getTime(task: TaskCardData) {
  const from = clean(task.deliveryTimeFrom);
  const to = clean(task.deliveryTimeTo);
  if (from && to && from !== to) return `${from}–${to}`;
  return from || to;
}

function getType(task: TaskCardData): RequestType {
  if (task.requestType) return task.requestType;
  const comments = clean(task.comments).toLowerCase();
  const marker = comments.match(/тип\s+заявки\s*:\s*(delivery|movement|nuts|courier_call|pickup_from_tc|simple)/i);
  if (marker?.[1]) return marker[1] as RequestType;
  if (task.taskType === "courier_call") return "courier_call";
  if (task.taskType === "warehouse_pickup") return "nuts";
  if (comments.includes("орех")) return "nuts";
  if (comments.includes("перемещ")) return "movement";
  if (comments.includes("тк") || comments.includes("транспортн")) return "pickup_from_tc";
  if (comments.includes("вызов курьера")) return "courier_call";
  return "delivery";
}

function getTitle(task: TaskCardData) {
  const type = getType(task);
  const comments = clean(task.comments).toLowerCase();
  if (type === "pickup_from_tc" && comments.includes("получатель")) return "Увоз груза";
  if (type === "pickup_from_tc") return "Получение груза";
  if (type === "courier_call") return "Вызов курьера";
  if (type === "movement") return "Перемещение";
  if (type === "nuts") return "Орехи";
  if (type === "simple") return "Простая заявка";
  return "Доставка";
}

function getPlaces(count?: number | null) {
  if (!count || count <= 0) return "";
  if (count === 1) return "1 место";
  if (count >= 2 && count <= 4) return `${count} места`;
  return `${count} мест`;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!clean(value)) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={3} style={styles.value}>{value}</Text>
    </View>
  );
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const type = getType(task);
  const status = STATUS_COLORS[task.status] || STATUS_COLORS.assigned;
  const taskTime = getTime(task);
  const taskPlaces = getPlaces(task.placesCount);

  return (
    <TouchableOpacity activeOpacity={0.78} onPress={() => onPress(task)} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleBox}>
          <Text numberOfLines={2} style={styles.title}>{getTitle(task)}</Text>
          <Text style={styles.id}>#{task.id}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={[styles.badgeText, { color: status.fg }]}>{STATUS_LABELS[task.status] || "Статус"}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {type === "delivery" && <><Field label="Отправитель" value={first(task.senderName, task.senderAddress)} /><Field label="Получатель" value={first(task.recipientName, task.deliveryAddress, task.recipientAddress)} /></>}
        {type === "movement" && <><Field label="Откуда" value={first(task.senderAddress, task.senderName)} /><Field label="Куда" value={first(task.deliveryAddress, task.recipientAddress)} /></>}
        {type === "courier_call" && <><Field label="Адрес" value={first(task.senderAddress, task.deliveryAddress)} /><Field label="Комментарий" value={first(task.specialInstructions, task.packageDescription)} /></>}
        {type === "pickup_from_tc" && <><Field label="Откуда" value={first(task.senderName, task.senderAddress)} /><Field label="Куда" value={first(task.recipientName, task.deliveryAddress)} /></>}
        {type === "nuts" && <><Field label="Адрес" value={first(task.deliveryAddress, task.recipientAddress)} /><Field label="Состав" value={first(task.items, task.packageDescription)} /></>}
        {type === "simple" && <Field label="Адрес" value={first(task.senderAddress, task.deliveryAddress)} />}
        {!!taskTime && <Field label="Время" value={taskTime} />}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Курьер</Text>
          <Text numberOfLines={2} style={styles.footerValue}>{task.courierName || "не назначен"}</Text>
        </View>
        {!!taskPlaces && <View style={styles.footerItem}><Text style={styles.footerLabel}>Количество мест</Text><Text style={styles.footerValue}>{taskPlaces}</Text></View>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, borderRadius: 20, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 16, shadowColor: "#94A3B8", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 4 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  titleBox: { flex: 1, minWidth: 0 },
  title: { color: "#0B7CFF", fontSize: 22, lineHeight: 27, fontWeight: "900" },
  id: { marginTop: 4, color: "#64748B", fontSize: 14, fontWeight: "800" },
  badge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, minWidth: 88, alignItems: "center" },
  badgeText: { fontSize: 13, lineHeight: 17, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  field: { flexGrow: 1, flexBasis: "30%", minWidth: 96 },
  label: { color: "#64748B", fontSize: 13, lineHeight: 17, fontWeight: "900", marginBottom: 5 },
  value: { color: "#0F172A", fontSize: 17, lineHeight: 22, fontWeight: "900" },
  footer: { marginTop: 15, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0", flexDirection: "row", gap: 14 },
  footerItem: { flex: 1, minWidth: 0 },
  footerLabel: { color: "#64748B", fontSize: 13, lineHeight: 17, fontWeight: "800", marginBottom: 3 },
  footerValue: { color: "#0F172A", fontSize: 16, lineHeight: 21, fontWeight: "900" },
});
