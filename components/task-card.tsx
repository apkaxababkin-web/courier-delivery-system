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
  assigned: { bg: "#EAF2FF", fg: "#0B7CFF", darkBg: "rgba(59,130,246,0.18)", darkFg: "#7DB2FF" },
  in_progress: { bg: "#EAF2FF", fg: "#0B7CFF", darkBg: "rgba(59,130,246,0.18)", darkFg: "#7DB2FF" },
  completed: { bg: "#DCFCE7", fg: "#15803D", darkBg: "rgba(34,197,94,0.16)", darkFg: "#86EFAC" },
  cancelled: { bg: "#FEE2E2", fg: "#B91C1C", darkBg: "rgba(248,113,113,0.16)", darkFg: "#FCA5A5" },
};

type RequestType = "delivery" | "movement" | "nuts" | "courier_call" | "pickup_from_tc" | "simple";
type TaskType = "regular" | "warehouse_pickup" | "courier_call";
type CardKind = "delivery" | "movement" | "courier_call" | "tc" | "nuts" | "simple";

type CardPalette = {
  card: string;
  border: string;
  divider: string;
  title: string;
  text: string;
  muted: string;
  subtext: string;
  accent: string;
  shadow: string;
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

type ItemLine = { label: string; quantity: number };
type MainField = { label: string; value: string; subvalue?: string; wide?: boolean };

function compact(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function firstPresent(...values: Array<string | null | undefined>) {
  return values.map(compact).find(Boolean) ?? "—";
}

function optionalFirstPresent(...values: Array<string | null | undefined>) {
  return values.map(compact).find(Boolean) ?? "";
}

function formatDate(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
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
  return to || from || formatTime(task.scheduledAt);
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
      return { title: "Перемещение", subtitle: "", icon: "↔" };
    case "courier_call":
      return { title: "Вызов курьера", subtitle: "", icon: "♙" };
    case "tc":
      return { title: "Получение груза", subtitle: "с транспортной компании", icon: "🚚" };
    case "nuts":
      return { title: "Орехи", subtitle: "", icon: "◖" };
    case "simple":
      return { title: "Заявка", subtitle: "", icon: "□" };
    case "delivery":
    default:
      return { title: "Доставка", subtitle: "", icon: "▣" };
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
  if (normalized.includes("1000") || normalized.includes("1 кг")) return "1 кг (1000 г)";
  return name;
}

function getPalette(colors: ReturnType<typeof useColors>, status: TaskStatus): CardPalette {
  const isDark = colors.background.toLowerCase() !== "#f5f3ef" && colors.background.toLowerCase() !== "#ffffff";
  const statusColors = STATUS_COLORS[status] ?? STATUS_COLORS.assigned;
  return {
    card: colors.surface,
    border: isDark ? "rgba(148,163,184,0.22)" : colors.border,
    divider: isDark ? "rgba(148,163,184,0.18)" : "#E2E8F0",
    title: colors.primary,
    text: colors.foreground,
    muted: colors.muted,
    subtext: isDark ? "#CBD5E1" : "#64748B",
    accent: colors.primary,
    shadow: isDark ? "#020617" : "#94A3B8",
    statusBg: isDark ? statusColors.darkBg : statusColors.bg,
    statusFg: isDark ? statusColors.darkFg : statusColors.fg,
  };
}

function placesText(count?: number | null) {
  if (count == null || !Number.isFinite(Number(count)) || Number(count) <= 0) return "";
  const n = Number(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} место`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} места`;
  return `${n} мест`;
}

function Field({ label, value, subvalue, palette, wide }: MainField & { palette: CardPalette }) {
  return (
    <View style={[styles.field, wide && styles.fieldWide]}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.fieldValue, { color: palette.text }]}>{value}</Text>
      {!!subvalue && <Text numberOfLines={2} style={[styles.fieldSubvalue, { color: palette.subtext }]}>{subvalue}</Text>}
    </View>
  );
}

function buildFields(kind: CardKind, task: TaskCardData): MainField[] {
  const time = formatTaskTime(task);
  const date = formatTaskDate(task);
  const timeSubvalue = time ? date : undefined;

  if (kind === "courier_call") {
    const fields: MainField[] = [{ label: "Адрес забора", value: firstPresent(task.senderAddress, task.deliveryAddress) }];
    if (time) fields.push({ label: "Время забора", value: time, subvalue: timeSubvalue });
    const note = optionalFirstPresent(task.specialInstructions, task.packageDescription, task.comments);
    if (note) fields.push({ label: "Комментарий", value: note });
    return fields;
  }

  if (kind === "tc") {
    const fields: MainField[] = [
      { label: "Откуда забираем", value: firstPresent(task.senderName, task.senderAddress), subvalue: compact(task.senderName) ? task.senderAddress ?? undefined : undefined },
      { label: "Куда доставляем", value: firstPresent(task.recipientName, task.deliveryAddress), subvalue: compact(task.recipientName) ? task.deliveryAddress : undefined },
    ];
    if (time) fields.push({ label: "Время", value: time, subvalue: timeSubvalue });
    return fields;
  }

  if (kind === "movement") {
    const fields: MainField[] = [
      { label: "Откуда", value: firstPresent(task.senderAddress, task.senderName) },
      { label: "Куда", value: firstPresent(task.deliveryAddress, task.recipientAddress) },
    ];
    if (time) fields.push({ label: "Время перемещения", value: time, subvalue: timeSubvalue });
    return fields;
  }

  if (kind === "nuts") {
    const items = parseItems(task.items);
    const itemValue = items.length > 0 ? items.map((item) => `${item.quantity} шт. ${item.label}`).join("\n") : optionalFirstPresent(task.packageDescription, task.comments);
    const fields: MainField[] = [{ label: "Адрес", value: firstPresent(task.deliveryAddress, task.recipientAddress), subvalue: task.deliveryCity ?? undefined }];
    if (itemValue) fields.push({ label: "Состав", value: itemValue, wide: true });
    return fields;
  }

  if (kind === "simple") {
    const fields: MainField[] = [{ label: "Адрес", value: firstPresent(task.senderAddress, task.deliveryAddress) }];
    if (time) fields.push({ label: "Время", value: time, subvalue: timeSubvalue });
    const note = optionalFirstPresent(task.specialInstructions, task.packageDescription, task.comments);
    if (note) fields.push({ label: "Комментарий", value: note });
    return fields;
  }

  const fields: MainField[] = [
    { label: "Отправитель", value: firstPresent(task.senderName, "Отправитель"), subvalue: task.senderAddress ?? undefined },
    { label: "Получатель", value: firstPresent(task.recipientName), subvalue: firstPresent(task.deliveryAddress, task.recipientAddress) },
  ];
  if (time) fields.push({ label: "Время доставки", value: time, subvalue: timeSubvalue });
  return fields;
}

function DetailsGrid({ kind, task, palette }: { kind: CardKind; task: TaskCardData; palette: CardPalette }) {
  const fields = buildFields(kind, task);
  if (fields.length === 0) return null;
  const showArrow = kind === "delivery" && fields.length >= 2;

  return (
    <View style={styles.fieldsRow}>
      {fields.map((field, index) => (
        <View key={`${field.label}-${index}`} style={[styles.fieldWrap, field.wide && styles.fieldWrapWide]}>
          {showArrow && index === 1 && <Text style={[styles.arrow, { color: palette.text }]}>→</Text>}
          <Field {...field} palette={palette} />
        </View>
      ))}
    </View>
  );
}

function FooterInfo({ icon, label, value, palette, flex = 1 }: { icon: string; label: string; value: string; palette: CardPalette; flex?: number }) {
  return (
    <View style={[styles.footerInfo, { flex }]}> 
      <Text style={[styles.footerIcon, { color: palette.accent }]}>{icon}</Text>
      <View style={styles.footerTextWrap}>
        <Text style={[styles.footerLabel, { color: palette.muted }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.footerValue, { color: palette.text }]}>{value}</Text>
      </View>
    </View>
  );
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  const colors = useColors();
  const kind = getCardKind(task);
  const meta = getCardMeta(kind);
  const palette = getPalette(colors, task.status);
  const countLabel = placesText(task.placesCount);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border, shadowColor: palette.shadow }]}
      onPress={() => onPress(task)}
      activeOpacity={0.76}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.titleLine}>
            <Text style={[styles.leadingIcon, { color: palette.accent }]}>{meta.icon}</Text>
            <Text numberOfLines={2} style={[styles.title, { color: palette.title }]}>{meta.title}</Text>
          </View>
          {!!meta.subtitle && <Text numberOfLines={1} style={[styles.subtitle, { color: palette.muted }]}>{meta.subtitle}</Text>}
          <Text style={[styles.idText, { color: palette.subtext }]}>#{task.id}</Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: palette.statusBg }]}> 
          <Text style={[styles.statusText, { color: palette.statusFg }]}>{STATUS_LABELS[task.status] ?? "Статус"}</Text>
        </View>
      </View>

      <DetailsGrid kind={kind} task={task} palette={palette} />

      <View style={[styles.footerRow, { borderTopColor: palette.divider }]}> 
        <FooterInfo icon="♙" label="Курьер" value={task.courierName || "не назначен"} palette={palette} flex={1.08} />
        {!!countLabel && <FooterInfo icon="▧" label="Количество мест" value={countLabel} palette={palette} flex={1} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 17,
  },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  leadingIcon: { width: 22, fontSize: 18, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  title: { flex: 1, fontSize: 22, lineHeight: 27, fontWeight: "900" },
  subtitle: { marginLeft: 31, fontSize: 15, lineHeight: 18, fontWeight: "800" },
  idText: { marginLeft: 31, marginTop: 4, fontSize: 16, lineHeight: 20, fontWeight: "800" },
  statusPill: { borderRadius: 12, paddingHorizontal: 13, paddingVertical: 8, alignItems: "center", justifyContent: "center", minWidth: 92 },
  statusText: { fontSize: 14, lineHeight: 18, fontWeight: "900" },
  fieldsRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  fieldWrap: { flex: 1, minWidth: 0, position: "relative" },
  fieldWrapWide: { flex: 1.55 },
  field: { minWidth: 0 },
  fieldWide: { flex: 1.35 },
  fieldLabel: { fontSize: 14, lineHeight: 18, fontWeight: "900", marginBottom: 6 },
  fieldValue: { fontSize: 18, lineHeight: 22, fontWeight: "900" },
  fieldSubvalue: { fontSize: 17, lineHeight: 21, fontWeight: "800", marginTop: 5 },
  arrow: { position: "absolute", left: -18, top: 30, fontSize: 20, lineHeight: 22, fontWeight: "900" },
  footerRow: {
    marginTop: 15,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  footerInfo: { flexDirection: "row", alignItems: "flex-start", gap: 9, minWidth: 0 },
  footerIcon: { width: 22, fontSize: 18, lineHeight: 24, fontWeight: "900", textAlign: "center" },
  footerTextWrap: { flex: 1, minWidth: 0 },
  footerLabel: { fontSize: 14, lineHeight: 18, fontWeight: "800", marginBottom: 3 },
  footerValue: { fontSize: 17, lineHeight: 22, fontWeight: "900" },
});
