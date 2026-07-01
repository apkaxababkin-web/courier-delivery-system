"use client";

import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { skipToken } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "react-native-toast-notifications";

import { ScreenContainer } from "@/components/screen-container";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBadge } from "@/components/status-badge";
import { useColors } from "@/hooks/use-colors";
import { useCourierAuth } from "@/lib/courier-auth";
import { trpc } from "@/lib/trpc";
import { performImpact, performSuccessHaptic } from "@/lib/vibration-preference";
import { getDisplayRequestId } from "@/shared/request-number";
import { DESIGN_PREVIEW_TOKEN, designPreviewTasks } from "@/lib/design-preview";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  CreditCard,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Plus,
  UserRound,
  XCircle,
} from "lucide-react-native";
import EventSource from "react-native-sse";
import { getApiBaseUrl } from "@/constants/oauth";

type Palette = {
  border: string;
  soft: string;
  shadow: string;
};

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function formatCreatedAt(value?: string | Date | null) {
  if (!value) return "Создана: —";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Создана: —";
  return `Создана: ${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatPaymentValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    paid: "Оплачено",
    transfer: "Перевод",
    cash: "Наличные",
    terminal: "Терминал",
    qr: "QR-код",
    unpaid: "Не оплачено",
    not_paid: "Не оплачено",
    pending: "Не оплачено",
  };

  return labels[normalized] || value.trim();
}

function splitTaskComment(comments?: string | null, specialInstructions?: string | null) {
  const lines = (comments || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let paymentMethod = "";
  let paymentAmount = "";
  const visibleLines: string[] = [];

  for (const line of lines) {
    if (/^\[request:\d+\]$/i.test(line)) continue;
    if (/^Тип заявки:/i.test(line)) continue;

    const paymentMatch = line.match(/^Оплата:\s*(.+)$/i);
    if (paymentMatch) {
      paymentMethod = paymentMatch[1].trim();
      continue;
    }

    const amountMatch = line.match(/^Сумма:\s*(.+)$/i);
    if (amountMatch) {
      paymentAmount = amountMatch[1].trim();
      continue;
    }

    visibleLines.push(line);
  }

  const comment = visibleLines.join("\n").trim() || (specialInstructions || "").trim();
  const paymentLabel = paymentMethod
    ? [formatPaymentValue(paymentMethod), paymentAmount].filter(Boolean).join(" · ")
    : "";

  return { comment, paymentLabel };
}

function getTaskTypeLabel(task: any) {
  const type = task?.requestType || task?.taskType;
  if (type === "delivery") return "Доставка";
  if (type === "movement") return "Перемещение";
  if (type === "nuts" || type === "warehouse_pickup") return "Орехи";
  if (type === "courier_call") return "Вызов курьера";
  if (type === "pickup_from_tc") return "Получение в ТК";
  if (type === "simple") return "Заявка";
  return "Заявка";
}

function DetailStatusIcon({ status, colors }: { status?: string; colors: ReturnType<typeof useColors> }) {
  if (status === "completed") return <CheckCircle2 size={21} color={colors.success} strokeWidth={2.4} />;
  if (status === "cancelled") return <XCircle size={21} color={colors.error} strokeWidth={2.4} />;
  if (status === "in_progress") return <Clock3 size={21} color={colors.warning} strokeWidth={2.4} />;
  if (status === "new") return <Plus size={21} color={colors.primary} strokeWidth={2.6} />;
  return <CircleDot size={21} color={colors.primary} strokeWidth={2.4} />;
}

function GlassCard({ children, palette, colors, style }: { children: ReactNode; palette: Palette; colors: ReturnType<typeof useColors>; style?: object }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.border,
        shadowColor: palette.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 18,
        elevation: 4,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function SectionTitle({ children, colors }: { children: ReactNode; colors: ReturnType<typeof useColors> }) {
  return <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "800", marginBottom: 6 }}>{children}</Text>;
}

function ClickableLine({ value, onPress, muted = false }: { value?: string | null; onPress?: () => void; muted?: boolean }) {
  const colors = useColors();
  if (!value) return <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>—</Text>;
  return (
    <TouchableOpacity activeOpacity={0.72} onPress={onPress} disabled={!onPress}>
      <Text style={{ color: muted ? colors.muted : colors.foreground, fontSize: 12, lineHeight: 19, fontWeight: "700" }}>{value}</Text>
    </TouchableOpacity>
  );
}

export default function TaskDetailScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number?: string }>();
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const dark = isDarkBackground(colors.background);
  const palette: Palette = {
    border: dark ? "rgba(148,163,184,0.18)" : colors.border,
    soft: dark ? "rgba(148,163,184,0.07)" : "#F8FAFC",
    shadow: dark ? "#020617" : "#94A3B8",
  };
  const { token } = useCourierAuth();
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const taskId = parseInt(id ?? "0", 10);
  const toast = useToast();

  const [courierPickerVisible, setCourierPickerVisible] = useState(false);
  const [placesModalVisible, setPlacesModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [placesInput, setPlacesInput] = useState("");
  const [commentsInput, setCommentsInput] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());

  const utils = trpc.useUtils();

  const { data: taskRaw, isLoading } = trpc.tasks.byId.useQuery(token && !isDesignPreview ? { token, id: taskId } : skipToken);
  const task = isDesignPreview ? designPreviewTasks.find((item) => item.id === taskId) : taskRaw;
  const { data: couriersList } = trpc.couriers.list.useQuery(token && !isDesignPreview ? { token } : skipToken);

  useEffect(() => {
    if (!token || isDesignPreview || !taskId) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const refreshTask = () => {
      void utils.tasks.byId.invalidate();
      void utils.tasks.all.invalidate();
      void utils.tasks.history.invalidate();
    };

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource(`${getApiBaseUrl()}/api/live`, {
          pollingInterval: 0,
        } as any);

        eventSource.addEventListener("connected", () => {
          console.log("[TaskDetailLiveSync] connected");
        });

        eventSource.addEventListener("tasks_changed", () => {
          console.log("[TaskDetailLiveSync] tasks_changed");
          refreshTask();
        });

        eventSource.addEventListener("requests_changed", () => {
          console.log("[TaskDetailLiveSync] requests_changed");
          refreshTask();
        });

        eventSource.addEventListener("data_changed", () => {
          console.log("[TaskDetailLiveSync] data_changed");
          refreshTask();
        });

        eventSource.addEventListener("error", (error: unknown) => {
          console.warn("[TaskDetailLiveSync] error:", error);

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        });
      } catch (error) {
        console.warn("[TaskDetailLiveSync] connect failed:", error);

        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      closed = true;

      if (reconnectTimer) clearTimeout(reconnectTimer);

      try {
        eventSource?.close();
      } catch {}
    };
  }, [token, isDesignPreview, taskId, utils]);

  const assignMutation = trpc.tasks.assignCourier.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      performSuccessHaptic().catch(() => undefined);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const statusMutation = trpc.tasks.setStatus.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      utils.tasks.history.invalidate();
      performSuccessHaptic().catch(() => undefined);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const placesMutation = trpc.tasks.updatePlaces.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      setPlacesModalVisible(false);
      setPlacesInput("");
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const commentsMutation = trpc.tasks.updateComments.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      setCommentsModalVisible(false);
      setCommentsInput("");
      performSuccessHaptic().catch(() => undefined);
    },
    onError: (e: { message: string }) => Alert.alert("Ошибка", e.message),
  });

  const rescheduleMutation = trpc.tasks.rescheduleTask.useMutation({
    onSuccess: () => {
      utils.tasks.byId.invalidate();
      utils.tasks.all.invalidate();
      utils.tasks.history.invalidate();
      setDatePickerVisible(false);
      performSuccessHaptic().catch(() => undefined);
      toast.show(`✓ Задание перенесено на ${selectedDate.toLocaleDateString("ru-RU")}`, { duration: 2000, placement: "top" });
      router.back();
    },
    onError: (e: { message: string }) => toast.show(`✗ ${e.message}`, { duration: 2000, placement: "top" }),
  });

  const handleOpenMap = (address: string | null | undefined) => {
    if (!address) return;
    Clipboard.setStringAsync(address);
    Linking.openURL(`https://2gis.ru/search?q=${encodeURIComponent(address)}`);
  };

  const handleCallPhone = (phone: string | null | undefined) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s|\(|\)|-/g, "")}`);
  };

  const handleSetStatus = (newStatus: "in_progress" | "completed" | "cancelled") => {
    if (isDesignPreview) return;
    const statusToSet = task?.status === newStatus ? "assigned" : newStatus;
    statusMutation.mutate({ token: token!, taskId, status: statusToSet });
  };

  const handleSavePlaces = () => {
    if (isDesignPreview) {
      setPlacesModalVisible(false);
      return;
    }
    const places = parseInt(placesInput, 10);
    if (isNaN(places) || places < 0) {
      Alert.alert("Ошибка", "Введите корректное количество мест");
      return;
    }
    placesMutation.mutate({ token: token!, taskId, placesCount: places });
  };

  const handleSaveComments = () => {
    if (isDesignPreview) {
      setCommentsModalVisible(false);
      return;
    }
    if (!commentsInput.trim()) {
      Alert.alert("Ошибка", "Напишите комментарий");
      return;
    }
    commentsMutation.mutate({ token: token!, taskId, courierComments: commentsInput.trim() });
  };

  const handleAssignCourier = (courierId: number | null) => {
    setCourierPickerVisible(false);
    if (isDesignPreview) return;
    assignMutation.mutate({ token: token!, taskId, courierId });
  };

  const handleDateChange = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const calendarGrid = [];
    let week = [];

    for (let i = 0; i < firstDay; i++) week.push(<View key={`empty-${i}`} style={{ flex: 1 }} />);

    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selectedDate.getDate() === day;
      week.push(
        <TouchableOpacity key={day} onPress={() => handleDateChange(day)} style={{ flex: 1, aspectRatio: 1, justifyContent: "center", alignItems: "center", backgroundColor: isSelected ? colors.primary : "transparent", borderRadius: 10 }}>
          <Text style={{ color: isSelected ? "#fff" : colors.foreground, fontWeight: isSelected ? "900" : "700", fontSize: 12 }}>{day}</Text>
        </TouchableOpacity>
      );

      if (week.length === 7) {
        calendarGrid.push(<View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{week}</View>);
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) week.push(<View key={`empty-end-${week.length}`} style={{ flex: 1 }} />);
      calendarGrid.push(<View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>{week}</View>);
    }

    return calendarGrid;
  };

  if (isLoading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!task) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text className="text-foreground">Заявка не найдена</Text>
      </ScreenContainer>
    );
  }

  const isCompleted = task.status === "completed";
  const isCancelled = task.status === "cancelled";
  const isInProgress = task.status === "in_progress";
  const parsedTaskInfo = splitTaskComment(task.comments, task.specialInstructions);
  const taskComment = parsedTaskInfo.comment || "—";
  const paymentStatusLabel = parsedTaskInfo.paymentLabel;
  const courierComment = task.courierComments || "";
  const taskType = task.requestType || task.taskType;
  const isCourierCall = taskType === "courier_call";
  const isSimpleRequest = taskType === "simple";
  const simpleRequestName =
    task.senderName ||
    task.recipientName ||
    task.senderCompany ||
    task.recipientCompany ||
    "Заявка";
  const simpleRequestAddress =
    task.senderAddress ||
    task.deliveryAddress ||
    task.recipientAddress ||
    "";
  const simpleRequestPhone =
    task.senderPhone ||
    task.recipientPhone ||
    "";
  const visibleRequestNumber =
    typeof number === "string" && number.trim()
      ? number.trim()
      : getDisplayRequestId(task);
  const customerCompany =
    task.senderCompany ||
    task.recipientCompany ||
    task.senderName ||
    task.recipientName ||
    "Заказчик";
  const customerAddress =
    task.senderAddress ||
    task.deliveryAddress ||
    task.recipientAddress ||
    "";
  const customerPhone =
    task.senderPhone ||
    task.recipientPhone ||
    "";

  const firstPartyName = isCourierCall ? customerCompany : task.senderName || task.senderCompany || "—";
  const firstPartyAddress = isCourierCall ? customerAddress : task.senderAddress;
  const firstPartyPhone = isCourierCall ? customerPhone : task.senderPhone;

  const secondPartyName = task.recipientName || task.recipientCompany || "—";
  const secondPartyAddress = task.deliveryAddress;
  const secondPartyPhone = task.recipientPhone;

  const normalizeDetailText = (value?: string | null) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const detailPartiesAreSame =
    !!normalizeDetailText(firstPartyName) &&
    !!normalizeDetailText(secondPartyName) &&
    normalizeDetailText(firstPartyName) === normalizeDetailText(secondPartyName) &&
    normalizeDetailText(firstPartyAddress || "") === normalizeDetailText(secondPartyAddress || "");


  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 12, paddingVertical: 9 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <ArrowLeft size={25} color={colors.foreground} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>Заявка №{visibleRequestNumber}</Text>
            <Text style={{ color: colors.primary, fontSize: 11.5, fontWeight: "500", marginTop: 2 }}>{getTaskTypeLabel(task)}</Text>
          </View>
          <View style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <DetailStatusIcon status={task.status} colors={colors} />
          </View>
        </View>
      </View>


        {(isSimpleRequest
          ? [
              {
                label: "ГДЕ ЗАБРАТЬ",
                name: simpleRequestName,
                address: simpleRequestAddress,
                phone: simpleRequestPhone,
              },
            ]
          : [
              {
                label: isCourierCall ? "ЗАКАЗЧИК" : "ОТПРАВИТЕЛЬ",
                name: isCourierCall ? customerCompany : task.senderName || task.senderCompany || "—",
                address: isCourierCall ? customerAddress : task.senderAddress,
                phone: isCourierCall ? customerPhone : task.senderPhone,
              },
              {
                label: "ПОЛУЧАТЕЛЬ",
                name: task.recipientName || task.recipientCompany || "—",
                address: task.deliveryAddress,
                phone: task.recipientPhone,
              },
            ]
        ).map((party) => (
          <View key={party.label} style={{ paddingHorizontal: 16, paddingTop: 15, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "600", marginBottom: 10 }}>{party.label}</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", marginBottom: 7 }}>{party.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 38 }}>
              <Text numberOfLines={2} style={{ flex: 1, color: colors.muted, fontSize: 12.5, lineHeight: 18 }}>{party.address || "Адрес не указан"}</Text>
              {party.address ? (
                <TouchableOpacity onPress={() => handleOpenMap(party.address)} style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={18} color={colors.muted} strokeWidth={2} />
                </TouchableOpacity>
              ) : null}
            </View>
            {party.phone ? (
              <View style={{ flexDirection: "row", alignItems: "center", minHeight: 42, marginTop: 2, borderTopWidth: 1, borderTopColor: palette.border }}>
                <Text style={{ flex: 1, color: colors.muted, fontSize: 12.5 }}>{party.phone}</Text>
                <TouchableOpacity onPress={() => handleCallPhone(party.phone)} style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center" }}>
                  <Phone size={18} color={colors.muted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ) : <View style={{ height: 10 }} />}
          </View>
        ))}

        <View style={{ flexDirection: "row", minHeight: 54, borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <TouchableOpacity
            onPress={() => { setPlacesInput(task.placesCount?.toString() || ""); setPlacesModalVisible(true); }}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderRightWidth: 1, borderRightColor: palette.border }}
          >
            <Package size={18} color={colors.muted} strokeWidth={2} />
            <Text style={{ color: colors.foreground, fontSize: 12.5, marginLeft: 9, flex: 1 }}>{task.placesCount || 0} {task.placesCount === 1 ? "место" : "мест"}</Text>
            <ChevronRight size={17} color={colors.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCourierPickerVisible(true)} style={{ flex: 1.15, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 }}>
            <UserRound size={18} color={colors.muted} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12.5, marginLeft: 9, flex: 1 }}>{task.courierName || "Не назначен"}</Text>
            <ChevronRight size={17} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <MessageSquare size={18} color={colors.muted} strokeWidth={2} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginBottom: 3 }}>Комментарий к заявке</Text>
            <Text numberOfLines={2} style={{ color: taskComment === "—" ? colors.muted : colors.foreground, fontSize: 12.5, lineHeight: 17 }}>{taskComment}</Text>
          </View>
          <ChevronRight size={17} color={colors.muted} />
        </TouchableOpacity>

        {paymentStatusLabel ? (
          <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <CreditCard size={18} color={colors.muted} strokeWidth={2} />
            <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12.5, marginLeft: 10, flex: 1 }}>Оплата  ·  {paymentStatusLabel}</Text>
            <ChevronRight size={17} color={colors.muted} />
          </View>
        ) : null}

        <View style={{ borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <Text style={{ color: colors.muted, fontSize: 10.5, fontWeight: "600", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>КОММЕНТАРИИ КУРЬЕРОВ</Text>
          {courierComment ? courierComment.split("\n").filter(Boolean).map((line: string, index: number) => (
            <View key={`${line}-${index}`} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                <UserRound size={14} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 10.5, marginLeft: 6 }}>{task.courierName || "Курьер"}</Text>
              </View>
              <Text style={{ color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}>{line}</Text>
            </View>
          )) : null}
          <TouchableOpacity onPress={() => { setCommentsInput(courierComment); setCommentsModalVisible(true); }} style={{ minHeight: 46, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderTopWidth: courierComment ? 1 : 0, borderTopColor: palette.border }}>
            <MessageSquare size={17} color={colors.primary} strokeWidth={2} />
            <Text style={{ color: colors.primary, fontSize: 12.5, fontWeight: "500", marginLeft: 10, flex: 1 }}>Добавить комментарий</Text>
            <ChevronRight size={17} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Clock3 size={15} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 10.5, marginLeft: 6 }}>{formatCreatedAt((task as any).createdAt)}</Text>
          </View>
        </View>
        <View style={{ flexGrow: 1, minHeight: 12 }} />

      <View
        style={{
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 34,
        }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <ActionButton label="Отменить" icon="cancel" onPress={() => handleSetStatus("cancelled")} disabled={isCompleted} muted active={isCancelled} />
          <ActionButton label="Перенести" icon="calendar" onPress={() => setDatePickerVisible(true)} muted />
          <ActionButton label="В работе" icon="clock" onPress={() => handleSetStatus("in_progress")} disabled={isCompleted || isCancelled} muted active={isInProgress} />
        </View>
        <View style={{ height: 7 }} />
        <ActionButton label="Выполнено" icon="done" onPress={() => handleSetStatus("completed")} disabled={isCancelled} done active={isCompleted} />
      </View>
      </ScrollView>

      <Modal visible={courierPickerVisible} transparent animationType="slide" onRequestClose={() => setCourierPickerVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, maxHeight: 420 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>Выбрать курьера</Text>
            <ScrollView>
              <TouchableOpacity onPress={() => handleAssignCourier(null)} style={{ paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>Не назначен</Text>
              </TouchableOpacity>
              {couriersList?.map((courier) => (
                <TouchableOpacity key={courier.id} onPress={() => handleAssignCourier(courier.id)} style={{ paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
                  <Text style={{ color: colors.foreground, fontWeight: "800" }}>{courier.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setCourierPickerVisible(false)} style={{ marginTop: 16, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "900" }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <InputModal visible={placesModalVisible} title="Количество мест" colors={colors} palette={palette} onClose={() => { setPlacesModalVisible(false); setPlacesInput(""); }} onSave={handleSavePlaces}>
        <TextInput autoFocus editable selectTextOnFocus value={placesInput} onChangeText={setPlacesInput} placeholder="мест" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={3} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 10, padding: 13, color: colors.foreground, fontSize: 12, fontWeight: "900" }} />
      </InputModal>

      <InputModal visible={commentsModalVisible} title="Комментарий курьера" colors={colors} palette={palette} onClose={() => { setCommentsModalVisible(false); setCommentsInput(""); }} onSave={handleSaveComments}>
        <TextInput autoFocus editable multiline value={commentsInput} onChangeText={setCommentsInput} placeholder="Напишите ваш комментарий..." placeholderTextColor={colors.muted} maxLength={1000} style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: colors.surface, borderRadius: 10, padding: 13, color: colors.foreground, fontSize: 12, minHeight: 110, textAlignVertical: "top", fontWeight: "700" }} />
      </InputModal>

      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setDatePickerVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, marginBottom: 4 }}>Перенос заявки</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16, fontWeight: "700" }}>Выберите новую дату доставки</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "900" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, fontWeight: "900", color: colors.foreground }}>
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "900" }}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 8, gap: 8 }}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: colors.muted }}>{day}</Text>
                </View>
              ))}
            </View>
            <View style={{ marginBottom: 16 }}>{renderCalendar()}</View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (task && token) rescheduleMutation.mutate({ token, taskId: task.id, newDate: selectedDate });
              }} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InputModal({ visible, title, children, colors, palette, onClose, onSave }: { visible: boolean; title: string; children: ReactNode; colors: ReturnType<typeof useColors>; palette: Palette; onClose: () => void; onSave: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{title}</Text>
            {children}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={onClose} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.surface, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: palette.border }}>
                <Text style={{ color: colors.foreground, fontWeight: "900" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onSave} style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionButton({ label, icon, onPress, disabled, muted, done, active }: { label: string; icon?: "cancel" | "calendar" | "clock" | "done"; onPress: () => void; disabled?: boolean; muted?: boolean; done?: boolean; active?: boolean }) {
  const colors = useColors();
  const backgroundColor = done ? "#4B8B3B" : active ? "rgba(59,130,246,0.22)" : muted ? "rgba(148,163,184,0.12)" : colors.primary;
  const borderColor = done ? "rgba(74,139,59,0.9)" : active ? "rgba(125,178,255,0.34)" : "rgba(148,163,184,0.18)";
  const textColor = done ? "#fff" : active ? "#BFD5FF" : colors.foreground;
  const iconColor = icon === "cancel" ? colors.error : icon === "clock" ? colors.warning : done ? "#fff" : colors.muted;
  const Icon = icon === "cancel" ? XCircle : icon === "calendar" ? CalendarDays : icon === "clock" ? Clock3 : CheckCircle2;

  return (
    <Pressable
      onPress={() => {
        onPress();
        performImpact().catch(() => undefined);
      }}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor,
        borderColor,
        borderWidth: 1,
        borderRadius: 10,
        minHeight: done ? 44 : 36,
        paddingVertical: done ? 9 : 8,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        flexDirection: "row" as const,
        gap: 7,
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
      })}
    >
      <Icon size={done ? 20 : 18} color={iconColor} strokeWidth={2.2} />
      <Text numberOfLines={1} style={{ color: textColor, fontWeight: "700", fontSize: done ? 14 : 11.5, lineHeight: done ? 18 : 15, includeFontPadding: true }}>{label}</Text>
    </Pressable>
  );
}
