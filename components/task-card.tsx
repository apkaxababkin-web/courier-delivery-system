import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";

const STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: "Ожидает",
  in_progress: "В работе",
  completed: "Выполнена",
  cancelled: "Отменена",
};

const STATUS_COLORS: Record<TaskStatus, { bg: string; fg: string }> = {
  assigned: { bg: "#EAF2FF", fg: "#0B72F0" },
  in_progress: { bg: "#EAF2FF", fg: "#0B72F0" },
  completed: { bg: "#DCFCE7", fg: "#15803D" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C" },
};

type RequestType = "delivery" | "movement" | "nuts" | "courier_call" | "pickup_from_tc" | "simple";
type TaskType = "regular" | "warehouse_pickup" | "courier_call";

type CardKind = "delivery" | "movement" | "courier_call" | "tc" | "nuts" | "simple";

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

type ItemLine = {
  label: string;
  quantity: number;
};

function compact(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.map(compact).find(Boolean) ?? "—";
}

function formatDate(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function formatTime(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatTaskTime(task: TaskCardData) {
  const from = compact(task.deliveryTimeFrom);
  const to = compact(task.deliveryTimeTo);

  if (from && to && from !== to) return `${from}–${to}`;
  return to || from || formatTime(task.scheduledAt) || "—";
}

function formatTaskDate(task: TaskCardData) {
  return formatDate(task.scheduledAt) || formatDate(task.createdAt);
}

function requestTypeFromComments(comments?: string | null): RequestType | null {
  const value = compact(comments).toLowerCase();
  if (!value) return null;

  const match = value.match(/(?:тип|requesttype|request_type)\s*:?\s*(delivery|movement|nuts|courier_call|pickup_from_tc|simple)/i);
  if (match?.[1]) return match[1] as RequestType;

  if (value.includes("орех")) return "nuts";
  if (value.includes("перемещ")) return "movement";
  if (value.includes("транспортн") || value.includes("тк")) return "pickup_from_tc";
  if (value.includes("вызов курьера")) return "courier_call";

  return null;
}

function getCardKind(task: TaskCardData): CardKind {
  const explicitType = task.requestType ?? requestTypeFromComments(task.comments);

  if (explicitType === "delivery") return "delivery";
  if (explicitType === "movement") return "movement";
  if (explicitType === "nuts") return "nuts";
  if (explicitType === "courier_call") return "courier_call";
  if (explicitType === "pickup_from_tc") return "tc";
  if (explicitType === "simple") return "simple";

  if (task.taskType === "courier_call") return "courier_call";
  if (task.taskType === "warehouse_pickup") return "nuts";

  return "delivery";
}

function getCardMeta(kind: CardKind) {
  switch (kind) {
    case "movement":
      return { title: "Перемещение", icon: "↔" };
    case "courier_call":
      return { title: "Вызов курьера", icon: "♙" };
    case "tc":
      return { title: "ТК", icon: "ТК" };
    case "nuts":
      return { title: "Орехи", icon: "◖" };
    case "simple":
      return { title: "Заявка", icon: "□" };
    case "delivery":
    default:
      return { title: "Доставка", icon: "▣" };
  }
}

function parseItems(raw?: string | null): ItemLine[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any): ItemLine | null => {
        const quantity = Number(item.quantity ?? item.count ?? item.qty ?? 0);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;

        const name = compact(item.name ?? item.label ?? item.title ?? item.category);
        if (!name) return null;

        return { label: formatNutLabel(name), quantity };
      })
      .filter(Boolean) as ItemLine[];
  } catch {
    return [];
  }
}

function formatNutLabel(name: string) {
  const normalized = name.toLowerCase().replace(",", ".");
  if (normalized.includes("масл")) return "Кедровое масло";
  if (normalized.includes("0.1") || normalized.includes("0,1") || normalized.includes("100")) return "0,1 кг (100 г)";
  if (normalized.includes("0.2") || normalized.includes("0,2") || normalized.includes("200")) return "0,2 кг (200 г)";
  if (normalized.includes("0.3") || normalized.includes("0,3") || normalized.includes("300")) return "0,3 кг (300 г)";
  if (normalized.includes("0.5") || normalized.includes("0,5") || normalized.includes("500")) return "0,5 кг (500 г)";
  if (normalized.includes("1") || normalized.includes("1000")) return "1 кг (1000 г)";
  return name;
}

function splitItems(items: ItemLine[]) {
  if (items.length <= 4) return [items, []] as const;
  const firstColumnCount = Math.ceil(items.length / 2);
  return [items.slice(0, firstColumnCount), items.slice(firstColumnCount)] as const;
}

function Field({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.fieldValue}>{value}</Text>
      {!!subvalue && <Text numberOfLines={2} style={styles.fieldSubvalue}>{subvalue}</Text>}
    </View>
  );
}

function ItemColumn({ items }: { items: ItemLine[] }) {
  if (items.length === 0) return <View style={styles.itemColumn} />;

  return (
    <View style={styles.itemColumn}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.itemRow}>
          <Text style={styles.qtyPill}>{item.quantity} шт.</Text>
          <Text numberOfLines={1} style={styles.itemLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailsGrid({ kind, task }: { kind: CardKind; task: TaskCardData }) {
  const date = formatTaskDate(task);
  const time = formatTaskTime(task);

  if (kind === "nuts") {
    const items = parseItems(task.items);
    const fallbackItems = items.length > 0 ? items : [{ quantity: Math.max(task.placesCount ?? 1, 1), label: "0,1 кг (100 г)" }];
    const [leftItems, rightItems] = splitItems(fallbackItems);

    return (
      <View style={styles.gridRow}>
        <Field label="Адрес" value={firstPresent(task.deliveryAddress, task.recipientAddress)} subvalue={task.deliveryCity ?? undefined} />
        <View style={styles.divider} />
        <View style={styles.itemsGrid}>
          <ItemColumn items={leftItems} />
          {rightItems.length > 0 && <ItemColumn items={rightItems} />}
        </View>
      </View>
    );
  }

  if (kind === "courier_call") {
    return (
      <View style={styles.gridRow}>
        <Field label="Адрес" value={firstPresent(task.senderAddress, task.deliveryAddress)} subvalue={firstPresent(task.senderName, task.recipientName)} />
        <View style={styles.divider} />
        <Field label="Время вызова" value={time} subvalue={date} />
        <View style={styles.divider} />
        <Field label="Комментарий" value={firstPresent(task.specialInstructions, task.packageDescription, task.comments)} />
      </View>
    );
  }

  if (kind === "movement") {
    return (
      <View style={styles.gridRow}>
        <Field label="Откуда" value={firstPresent(task.senderAddress, task.deliveryAddress)} />
        <View style={styles.divider} />
        <Field label="Куда" value={firstPresent(task.deliveryAddress, task.recipientAddress)} />
        <View style={styles.divider} />
        <Field label="Время перемещения" value={time} subvalue={date} />
      </View>
    );
  }

  if (kind === "tc") {
    return (
      <View style={styles.gridRow}>
        <Field label="Откуда" value={firstPresent(task.senderName, task.senderAddress)} subvalue={compact(task.senderName) ? task.senderAddress ?? undefined : undefined} />
        <View style={styles.divider} />
        <Field label="Куда" value={firstPresent(task.recipientName, task.deliveryAddress)} subvalue={compact(task.recipientName) ? task.deliveryAddress : undefined} />
        <View style={styles.divider} />
        <Field label="Время доставки" value={time} subvalue={date} />
      </View>
    );
  }

  if (kind === "simple") {
    return (
      <View style={styles.gridRow}>
        <Field label="Адрес" value={firstPresent(task.senderAddress, task.deliveryAddress)} />
        <View style={styles.divider} />
        <Field label="Время" value={time} subvalue={date} />
        <View style={styles.divider} />
        <Field label="Комментарий" value={firstPresent(task.specialInstructions, task.packageDescription, task.comments)} />
      </View>
    );
  }

  return (
    <View style={styles.gridRow}>
      <Field label="Отправитель" value={firstPresent(task.senderName, "Отправитель")} subvalue={task.senderAddress ?? undefined} />
      <View style={styles.divider} />
      <Field label="Получатель" value={firstPresent(task.recipientName)} subvalue={firstPresent(task.deliveryAddress, task.recipientAddress)} />
      <View style={styles.divider} />
      <Field label="Время доставки" value={time} subvalue={date} />
    </View>
  );
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const kind = getCardKind(task);
  const meta = getCardMeta(kind);
  const statusColors = STATUS_COLORS[task.status] ?? STATUS_COLORS.assigned;
  const createdTime = formatTime(task.createdAt);
  const placesCount = task.placesCount ?? null;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => onPress(task)}
      activeOpacity={0.74}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>{meta.icon}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: colors.primary }]}>{meta.title}</Text>
        </View>

        <Text style={styles.metaText}>#{task.id}{createdTime ? `  •  ${createdTime}` : ""}</Text>

        <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusText, { color: statusColors.fg }]}>{STATUS_LABELS[task.status] ?? "Статус"}</Text>
        </View>
      </View>

      <DetailsGrid kind={kind} task={task} />

      <View style={styles.footerRow}>
        <Text numberOfLines={1} style={styles.footerText}>Курьер: <Text style={styles.footerValue}>{task.courierName || "не назначен"}</Text></Text>
        {placesCount != null && kind !== "courier_call" && (
          <Text style={styles.footerText}>Мест: <Text style={styles.footerValue}>{placesCount}</Text></Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginHorizontal: 8,
    marginBottom: 8,
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1.15,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
  },
  iconText: {
    color: "#0B72F0",
    fontSize: 15,
    fontWeight: "800",
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    flexShrink: 1,
  },
  metaText: {
    flex: 0.9,
    textAlign: "center",
    color: "#566176",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  statusPill: {
    minWidth: 76,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: "center",
  },
  statusText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "800",
  },
  gridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 58,
    gap: 10,
  },
  field: {
    flex: 1,
    justifyContent: "flex-start",
    minWidth: 0,
  },
  fieldLabel: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    marginBottom: 3,
  },
  fieldValue: {
    color: "#0F172A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  fieldSubvalue: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "#DDE6F2",
    marginVertical: 2,
  },
  itemsGrid: {
    flex: 2,
    flexDirection: "row",
    gap: 10,
    minWidth: 0,
  },
  itemColumn: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  qtyPill: {
    minWidth: 40,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "#EAF2FF",
    color: "#0B72F0",
    textAlign: "center",
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    color: "#0F172A",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DDE6F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  footerValue: {
    color: "#0F172A",
    fontWeight: "800",
  },
});
