import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { type TaskStatus } from "@/shared/types";
import { useColors } from "@/hooks/use-colors";

const STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: "Ожидает",
  in_progress: "В работе",
  completed: "Выполнена",
  cancelled: "Отменена",
};

const STATUS_COLORS: Record<TaskStatus, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
  assigned: { bg: "#EAF2FF", fg: "#1D6FF2", darkBg: "rgba(59,130,246,0.18)", darkFg: "#7DB2FF" },
  in_progress: { bg: "#EAF2FF", fg: "#1D6FF2", darkBg: "rgba(59,130,246,0.18)", darkFg: "#7DB2FF" },
  completed: { bg: "#DCFCE7", fg: "#15803D", darkBg: "rgba(34,197,94,0.16)", darkFg: "#86EFAC" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C", darkBg: "rgba(248,113,113,0.16)", darkFg: "#FCA5A5" },
};

type RequestType = "delivery" | "movement" | "nuts" | "courier_call" | "pickup_from_tc" | "simple";
type TaskType = "regular" | "warehouse_pickup" | "courier_call";

type CardKind = "delivery" | "movement" | "courier_call" | "tc" | "nuts" | "simple";

type CardPalette = {
  card: string;
  elevated: string;
  border: string;
  divider: string;
  title: string;
  text: string;
  muted: string;
  subtext: string;
  iconBg: string;
  iconColor: string;
  accent: string;
  shadow: string;
  qtyBg: string;
  statusBg: string;
  statusFg: string;
};

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

function splitItems(items: ItemLine[]): [ItemLine[], ItemLine[]] {
  if (items.length <= 4) return [items, []];
  const firstColumnCount = Math.ceil(items.length / 2);
  return [items.slice(0, firstColumnCount), items.slice(firstColumnCount)];
}

function getPalette(colors: ReturnType<typeof useColors>, status: TaskStatus): CardPalette {
  const isDark = colors.background.toLowerCase() !== "#f5f3ef" && colors.background.toLowerCase() !== "#ffffff";
  const statusColors = STATUS_COLORS[status] ?? STATUS_COLORS.assigned;

  if (isDark) {
    return {
      card: colors.surface,
      elevated: "rgba(59,130,246,0.10)",
      border: "rgba(148,163,184,0.22)",
      divider: "rgba(148,163,184,0.18)",
      title: colors.primary,
      text: colors.foreground,
      muted: colors.muted,
      subtext: "#CBD5E1",
      iconBg: "rgba(59,130,246,0.14)",
      iconColor: "#7DB2FF",
      accent: colors.primary,
      shadow: "#020617",
      qtyBg: "rgba(59,130,246,0.14)",
      statusBg: statusColors.darkBg,
      statusFg: statusColors.darkFg,
    };
  }

  return {
    card: colors.surface,
    elevated: "#F0F6FF",
    border: colors.border,
    divider: "#E2E8F0",
    title: colors.primary,
    text: colors.foreground,
    muted: colors.muted,
    subtext: "#475569",
    iconBg: "#EAF2FF",
    iconColor: "#1D6FF2",
    accent: colors.primary,
    shadow: "#94A3B8",
    qtyBg: "#EAF2FF",
    statusBg: statusColors.bg,
    statusFg: statusColors.fg,
  };
}

function Field({ label, value, subvalue, palette }: { label: string; value: string; subvalue?: string; palette: CardPalette }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.fieldValue, { color: palette.text }]}>{value}</Text>
      {!!subvalue && <Text numberOfLines={2} style={[styles.fieldSubvalue, { color: palette.subtext }]}>{subvalue}</Text>}
    </View>
  );
}

function ItemColumn({ items, palette }: { items: ItemLine[]; palette: CardPalette }) {
  if (items.length === 0) return <View style={styles.itemColumn} />;

  return (
    <View style={styles.itemColumn}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.itemRow}>
          <Text style={[styles.qtyPill, { backgroundColor: palette.qtyBg, color: palette.accent }]}>{item.quantity} шт.</Text>
          <Text numberOfLines={1} style={[styles.itemLabel, { color: palette.text }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailsGrid({ kind, task, palette }: { kind: CardKind; task: TaskCardData; palette: CardPalette }) {
  const date = formatTaskDate(task);
  const time = formatTaskTime(task);

  if (kind === "nuts") {
    const items = parseItems(task.items);
    const fallbackItems = items.length > 0 ? items : [{ quantity: Math.max(task.placesCount ?? 1, 1), label: "0,1 кг (100 г)" }];
    const [leftItems, rightItems] = splitItems(fallbackItems);

    return (
      <View style={styles.gridRow}>
        <Field palette={palette} label="Адрес" value={firstPresent(task.deliveryAddress, task.recipientAddress)} subvalue={task.deliveryCity ?? undefined} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <View style={styles.itemsGrid}>
          <ItemColumn palette={palette} items={leftItems} />
          {rightItems.length > 0 && <ItemColumn palette={palette} items={rightItems} />}
        </View>
      </View>
    );
  }

  if (kind === "courier_call") {
    return (
      <View style={styles.gridRow}>
        <Field palette={palette} label="Адрес" value={firstPresent(task.senderAddress, task.deliveryAddress)} subvalue={firstPresent(task.senderName, task.recipientName)} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Время вызова" value={time} subvalue={date} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Комментарий" value={firstPresent(task.specialInstructions, task.packageDescription, task.comments)} />
      </View>
    );
  }

  if (kind === "movement") {
    return (
      <View style={styles.gridRow}>
        <Field palette={palette} label="Откуда" value={firstPresent(task.senderAddress, task.deliveryAddress)} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Куда" value={firstPresent(task.deliveryAddress, task.recipientAddress)} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Время перемещения" value={time} subvalue={date} />
      </View>
    );
  }

  if (kind === "tc") {
    return (
      <View style={styles.gridRow}>
        <Field palette={palette} label="Откуда" value={firstPresent(task.senderName, task.senderAddress)} subvalue={compact(task.senderName) ? task.senderAddress ?? undefined : undefined} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Куда" value={firstPresent(task.recipientName, task.deliveryAddress)} subvalue={compact(task.recipientName) ? task.deliveryAddress : undefined} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Время доставки" value={time} subvalue={date} />
      </View>
    );
  }

  if (kind === "simple") {
    return (
      <View style={styles.gridRow}>
        <Field palette={palette} label="Адрес" value={firstPresent(task.senderAddress, task.deliveryAddress)} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Время" value={time} subvalue={date} />
        <View style={[styles.divider, { backgroundColor: palette.divider }]} />
        <Field palette={palette} label="Комментарий" value={firstPresent(task.specialInstructions, task.packageDescription, task.comments)} />
      </View>
    );
  }

  return (
    <View style={styles.gridRow}>
      <Field palette={palette} label="Отправитель" value={firstPresent(task.senderName, "Отправитель")} subvalue={task.senderAddress ?? undefined} />
      <View style={[styles.divider, { backgroundColor: palette.divider }]} />
      <Field palette={palette} label="Получатель" value={firstPresent(task.recipientName)} subvalue={firstPresent(task.deliveryAddress, task.recipientAddress)} />
      <View style={[styles.divider, { backgroundColor: palette.divider }]} />
      <Field palette={palette} label="Время доставки" value={time} subvalue={date} />
    </View>
  );
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const kind = getCardKind(task);
  const meta = getCardMeta(kind);
  const palette = getPalette(colors, task.status);
  const createdTime = formatTime(task.createdAt);
  const placesCount = task.placesCount ?? null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: palette.card,
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
      ]}
      onPress={() => onPress(task)}
      activeOpacity={0.74}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconBox, { backgroundColor: palette.iconBg, borderColor: palette.border }]}>
            <Text style={[styles.iconText, { color: palette.iconColor }]}>{meta.icon}</Text>
          </View>
          <Text numberOfLines={1} style={[styles.title, { color: palette.title }]}>{meta.title}</Text>
        </View>

        <Text style={[styles.metaText, { color: palette.subtext }]}>#{task.id}{createdTime ? `  •  ${createdTime}` : ""}</Text>

        <View style={[styles.statusPill, { backgroundColor: palette.statusBg }]}>
          <Text style={[styles.statusText, { color: palette.statusFg }]}>{STATUS_LABELS[task.status] ?? "Статус"}</Text>
        </View>
      </View>

      <DetailsGrid kind={kind} task={task} palette={palette} />

      <View style={[styles.footerRow, { borderTopColor: palette.divider }]}> 
        <Text numberOfLines={1} style={[styles.footerText, { color: palette.muted }]}>Курьер: <Text style={[styles.footerValue, { color: palette.text }]}>{task.courierName || "не назначен"}</Text></Text>
        {placesCount != null && kind !== "courier_call" && (
          <Text style={[styles.footerText, { color: palette.muted }]}>Мест: <Text style={[styles.footerValue, { color: palette.text }]}>{placesCount}</Text></Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginHorizontal: 8,
    marginBottom: 9,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
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
    width: 35,
    height: 35,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 15,
    fontWeight: "900",
  },
  title: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
    flexShrink: 1,
  },
  metaText: {
    flex: 0.9,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  statusPill: {
    minWidth: 74,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: "center",
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
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
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    marginBottom: 3,
  },
  fieldValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  fieldSubvalue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
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
    textAlign: "center",
    paddingHorizontal: 5,
    paddingVertical: 1,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  itemLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  footerRow: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  footerValue: {
    fontWeight: "900",
  },
});
