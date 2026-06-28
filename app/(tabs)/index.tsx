import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";

import { NetworkBanner } from "@/components/network-banner";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { OperationRow } from "@/components/operation-row";
import { getApiBaseUrl } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useCourierAuth } from "@/lib/courier-auth";
import { useFilter } from "@/lib/filter-context";
import { createCourierMobileClient } from "@/shared/mobileCourierClient";
import { DESIGN_PREVIEW_TOKEN, designPreviewTasks } from "@/lib/design-preview";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  PackageOpen,
  ArrowLeftRight,
  Nut,
  Truck,
  Mail,
} from "lucide-react-native";
import { formatLocalDateWithOptions, toLocalDateKey } from "@/app/lib/local-date";


const getTaskDateKey = (task: any) => {
  const isDone = task?.status === "completed" || task?.status === "cancelled";
  const value = isDone
    ? task.completedAt || task.scheduledAt || task.createdAt
    : task.scheduledAt || task.createdAt;

  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return toLocalDateKey(date);
};

const isActiveBoardTask = (task: any) => task.status !== "completed" && task.status !== "cancelled";

const cleanCardComment = (value?: string | null) => {
  if (!value) return "";

  return value
    .split("\n")
    .map((line) => line.replace(/\[request:\d+\]\s*/gi, "").trim())
    .filter(Boolean)
    .filter((line) => !/^Тип заявки:/i.test(line))
    .filter((line) => !/^Оплата:/i.test(line))
    .filter((line) => !/^Сумма:/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

const getCardDetailLine = (task: any) => {
  const comment = cleanCardComment(task.comments) || cleanCardComment(task.specialInstructions);
  if (comment) return comment;

  return task.recipientName || task.senderName || undefined;
};


export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier, loading: authLoading } = useCourierAuth();
  const { filterMode, setFilterMode } = useFilter();
  const { isOnline } = useNetworkStatus();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const mobileClient = useMemo(() => createCourierMobileClient(getApiBaseUrl()), []);
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;

  const selectedDateKey = toLocalDateKey(selectedDate);
  const todayDateKey = toLocalDateKey(new Date());
  const isSelectedDateToday = selectedDateKey === todayDateKey;

  const {
    data: tasksDataRaw,
    isLoading,
    refetch,
    isRefetching: isRefetchingQuery,
  } = useQuery({
    queryKey: ["courier-mobile-board-tasks", token, selectedDateKey],
    enabled: !authLoading && !!token && !isDesignPreview,
    queryFn: async () => {
      if (!token) return [];

      console.log("[TasksScreen] loading selected date from server:", selectedDateKey);
      return mobileClient.tasksAll(token, selectedDateKey);
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchInterval: isSelectedDateToday ? 60_000 : false,
    placeholderData: (previousData) => previousData,
  });


  const tasksData = useMemo(() => {
    if (isDesignPreview) return designPreviewTasks;
    const next = Array.isArray(tasksDataRaw) ? (tasksDataRaw as any[]) : [];
    return next;
  }, [tasksDataRaw, authLoading, token, isLoading, isRefetchingQuery, isDesignPreview]);

  useMobileLiveSync({
    enabled: !!token && !isDesignPreview,
    onSync: useCallback(() => {
      if (!token) return;
      return refetch();
    }, [token, refetch]),
  });

  const handleRefresh = useCallback(async () => {
    if (isDesignPreview) return;

    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, isDesignPreview]);

  useEffect(() => {
    if (!token || authLoading || isDesignPreview) return;

    const timer = setTimeout(() => {
      refetch();
    }, 700);

  return () => clearTimeout(timer);
  }, [token, authLoading, selectedDate, refetch, isDesignPreview]);

  useEffect(() => {
    if (!token || isDesignPreview) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refetch();
    });

    return () => subscription.remove();
  }, [token, refetch, isDesignPreview]);


  const filteredTasks = useMemo(() => {
    if (!tasksData.length) {
      return [];
    }

    const selectedDateKey = toLocalDateKey(selectedDate);

    const tasks = tasksData.filter((task: any) => {
      const taskDateKey = getTaskDateKey(task);

      if (!isSelectedDateToday && taskDateKey !== selectedDateKey) {
        return false;
      }

      if (isSelectedDateToday && !isActiveBoardTask(task) && taskDateKey && taskDateKey !== selectedDateKey) {
        return false;
      }

      // Filter Mode ("mine" vs "all")
      if (filterMode === "mine") {
        const isUnassigned = task.courierId == null;
        const isMineById = courier?.id != null && task.courierId === courier.id;

        // Use case-insensitive name matching as a fallback
        const courierNameNormalized = courier?.name?.trim().toLowerCase();
        const taskCourierNameNormalized = task.courierName?.trim().toLowerCase();
        const isMineByName = !!courierNameNormalized && taskCourierNameNormalized === courierNameNormalized;

        return isUnassigned || isMineById || isMineByName;
      }

      return true;
    });

    return tasks;
  }, [tasksData, filterMode, courier?.id, courier?.name, selectedDate, isSelectedDateToday]);

  const sortedTasks = useMemo(() => {
    return [...(filteredTasks as any[])].sort((a: any, b: any) => {
      const aDone = a.status === "completed" || a.status === "cancelled";
      const bDone = b.status === "completed" || b.status === "cancelled";

      if (aDone !== bDone) return aDone ? 1 : -1;

      return Number(a.id) - Number(b.id);
    });
  }, [filteredTasks]);

  useEffect(() => {
    console.log("[TasksScreen] visible state", {
      tokenPresent: !!token,
      authLoading,
      isLoading,
      raw: tasksData.length,
      filtered: filteredTasks.length,
      sorted: sortedTasks.length,
      selectedDateKey,
      filterMode,
    });
  }, [
    token,
    authLoading,
    isLoading,
    tasksData.length,
    filteredTasks.length,
    sortedTasks.length,
    selectedDateKey,
    filterMode,
  ]);

  const myTasksCount = useMemo(() => {
    if (!tasksData.length) return 0;
    return tasksData.filter((task: any) => {
      const isUnassigned = task.courierId == null;
      const isMineById = courier?.id != null && task.courierId === courier.id;

      const courierNameNormalized = courier?.name?.trim().toLowerCase();
      const taskCourierNameNormalized = task.courierName?.trim().toLowerCase();
      const isMineByName = !!courierNameNormalized && taskCourierNameNormalized === courierNameNormalized;

      return isUnassigned || isMineById || isMineByName;
    }).length;
  }, [tasksData, courier?.id, courier?.name]);

  useFocusEffect(
    useCallback(() => {
      if (isDesignPreview) return;
      refetch();
    }, [refetch, isDesignPreview]),
  );

  const handleSwipeCompleteTask = useCallback(async (item: any) => {
    if (isDesignPreview) return;

    if (!token) {
      Alert.alert("Ошибка", "Нет активной сессии курьера");
      return;
    }

    if (item.status === "completed" || item.status === "cancelled") return;

    const taskId = Number(item.id);
    if (!Number.isFinite(taskId)) {
      Alert.alert("Ошибка", "Некорректный номер заявки");
      return;
    }

    try {
      setCompletingTaskId(taskId);
      await mobileClient.setTaskStatus(token, taskId, "completed");
      await refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось выполнить заявку";
      Alert.alert("Ошибка", message);
    } finally {
      setCompletingTaskId((current) => (current === taskId ? null : current));
    }
  }, [isDesignPreview, mobileClient, refetch, token]);

  const renderSwipeCompleteAction = useCallback((item: any) => {
    const taskId = Number(item.id);
    const disabled = completingTaskId === taskId;

    return (
      <View style={{ width: 112, backgroundColor: "#16A34A", justifyContent: "center" }}>
        <Pressable
          disabled={disabled}
          onPress={() => handleSwipeCompleteTask(item)}
          style={({ pressed }) => ({
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 10,
            opacity: disabled || pressed ? 0.72 : 1,
          })}
        >
          {disabled ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 12, lineHeight: 16, fontWeight: "800" }}>
              Выполнено
            </Text>
          )}
        </Pressable>
      </View>
    );
  }, [completingTaskId, handleSwipeCompleteTask]);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };


  const getTaskTypeLabel = (item: any) => {
    const type = item.requestType || item.taskType;

    if (type === "delivery") return "Доставка";
    if (type === "movement") return "Перемещение";
    if (type === "nuts") return "Орехи";
    if (type === "courier_call") return "Вызов курьера";
    if (type === "pickup_from_tc") {
      const comments = String(item.comments || "");
      return comments.includes("получатель → ТК") ? "Отправка в ТК" : "Получение в ТК";
    }
    if (type === "simple") return "Простая заявка";

    return "Заявка";
  };

  const getTaskStatusLabel = (status?: string) => {
    if (status === "new") return "Новая";
    if (status === "in_progress") return "В работе";
    if (status === "completed") return "Выполнена";
    if (status === "cancelled") return "Отмена";
    if (status === "postponed") return "Перенесена";
    return "Новая";
  };



  const getTaskTypeColor = (item: any) => {
    const type = item.requestType || item.taskType;

    if (type === "delivery") return "#2563EB";
    if (type === "movement") return "#D97706";
    if (type === "nuts") return "#15803D";
    if (type === "pickup_from_tc") return "#7C3AED";
    if (type === "courier_call") return "#0891B2";

    return "#475569";
  };

  const getTaskTypeIcon = (item: any) => {
    const type = item.requestType || item.taskType;

    if (type === "delivery") return Package;
    if (type === "movement") return ArrowLeftRight;
    if (type === "nuts") return Nut;
    if (type === "pickup_from_tc") return Truck;
    if (type === "courier_call") return Mail;

    return PackageOpen;
  };




  const getDisplayRequestId = (item: any) => {
    if (item.requestId) return item.requestId;

    const match = String(item.comments || "").match(/\[request:(\d+)\]/);
    if (match?.[1]) return match[1];

    return item.id;
  };



  const isNutsTask = (item: any) => {
    const type = item.requestType || item.taskType;
    return type === "nuts" || type === "warehouse_pickup";
  };

  const getNutsOrderLines = (item: any) => {
    return String(item.items || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/^([^(:]+).*?:\s*(\d+)/);
        if (!match) return part;

        return `${match[1].trim()} — ${match[2]} кор.`;
      });
  };

  const getNutsOrderItems = (item: any) => {
    return String(item.items || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/^(.+?):\s*(\d+)/);
        const rawName = (match?.[1] || part).trim();
        const quantity = match?.[2] || "";
        const isOil = rawName.toLowerCase().includes("масло") || rawName.toLowerCase().includes("РјР°СЃР»Рѕ");
        const label = isOil ? "масло" : rawName.replace(/\s*\(.+?\)\s*/g, "").trim();

        return {
          label,
          quantity,
          unit: isOil ? "шт." : "кор.",
        };
      });
  };

  const getNutsSumLabel = (item: any) => {
    const match = String(item.comments || "").match(/Сумма:\s*([0-9.]+)/);
    if (!match?.[1]) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;

    return `${Math.round(amount).toLocaleString("ru-RU")} ₽`;
  };

  const getTaskTimeLabel = (item: any) => {
    const from = item.deliveryTimeFrom || item.timeFrom || item.scheduledTimeFrom;
    const to = item.deliveryTimeTo || item.timeTo || item.scheduledTimeTo;

    if (from && to) return `${from}–${to}`;
    if (from) return `с ${from}`;
    if (to) return `до ${to}`;

    return null;
  };

  const isCourierCallTask = (item: any) => {
    const type = item.requestType || item.taskType;
    return type === "courier_call";
  };

  const getFooterParts = (item: any) => {
    return [
      isNutsTask(item) ? getNutsSumLabel(item) : null,
      getCourierLabel(item),
      getTaskTimeLabel(item),
    ].filter(Boolean);
  };

  const getMainCardInfo = (item: any) => {
    const type = item.requestType || item.taskType;

    if (type === "nuts" || type === "warehouse_pickup") {
      return {
        isNuts: true,
        leftTitle: "Получатель",
        leftName: item.recipientName || "—",
        leftAddress: item.deliveryAddress || item.recipientAddress || "",
        rightTitle: "Заказ",
        rightName: item.items || item.description || "Орехи",
        rightAddress: "",
      };
    }

    if (type === "pickup_from_tc") {
      const isToTc = String(item.comments || "").includes("получатель → ТК");
      const tcName = item.tcName || item.senderName || item.senderCompany || "Транспортная компания";
      const tcAddress = item.tcAddress || item.senderAddress || "";
      const recipientName = item.recipientName || item.recipientCompany || "Получатель";
      const recipientAddress = item.deliveryAddress || item.recipientAddress || "";

      return {
        isNuts: false,
        leftTitle: isToTc ? "Откуда" : "",
        leftName: isToTc ? recipientName : tcName,
        leftAddress: isToTc ? recipientAddress : tcAddress,
        rightTitle: isToTc ? "" : "Куда",
        rightName: isToTc ? tcName : recipientName,
        rightAddress: isToTc ? tcAddress : recipientAddress,
      };
    }

    return {
      isNuts: false,
      leftTitle: "Откуда",
      leftName: item.senderName || item.senderCompany || "—",
      leftAddress: item.senderAddress || "",
      rightTitle: "Куда",
      rightName: item.recipientName || item.recipientCompany || "—",
      rightAddress: item.deliveryAddress || item.recipientAddress || "",
    };
  };

  const getPlacesLabel = (item: any) => {
    const raw = item.placesCount;

    if (raw == null || raw === "") return null;

    const count = Number(raw);

    if (!Number.isFinite(count) || count <= 0) return null;

    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11
      ? "место"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "места"
        : "мест";

    return `${count} ${word}`;
  };

  const getCourierLabel = (item: any) => {
    if (item.courierName?.trim()) return item.courierName.trim();
    return "Без курьера";
  };

  const getTaskStatusBg = (status?: string) => {
    if (status === "new") return "#EAF2FF";
    if (status === "in_progress") return "#FEF3C7";
    if (status === "completed") return "#DCFCE7";
    if (status === "cancelled") return "#FEE2E2";
    if (status === "postponed") return "#E5E7EB";
    return "#EAF2FF";
  };

  const getTaskStatusColor = (status?: string) => {
    if (status === "new") return "#2563EB";
    if (status === "in_progress") return "#D97706";
    if (status === "completed") return "#16A34A";
    if (status === "cancelled") return "#DC2626";
    if (status === "postponed") return "#64748B";
    return "#2563EB";
  };

  const handleDateChange = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const calendarGrid = [];
    let week = [];

    for (let i = 0; i < firstDay; i++) {
      week.push(<View key={`empty-${i}`} style={{ flex: 1 }} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === new Date().getMonth();
      week.push(
        <TouchableOpacity
          key={day}
          onPress={() => handleDateChange(day)}
          style={{
            flex: 1,
            aspectRatio: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "transparent",
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              color: isSelected ? colors.primary : colors.foreground,
              fontWeight: isSelected ? "800" : "500",
              fontSize: 12,
            }}
          >
            {day}
          </Text>
        </TouchableOpacity>,
      );

      if (week.length === 7) {
        calendarGrid.push(
          <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {week}
          </View>,
        );
        week = [];
      }
    }

    if (week.length > 0) {
      while (week.length < 7) {
        week.push(<View key={`empty-end-${week.length}`} style={{ flex: 1 }} />);
      }
      calendarGrid.push(
        <View key={`week-${calendarGrid.length}`} style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {week}
        </View>,
      );
    }

    return calendarGrid;
  };

  if (!token) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, minHeight: 0, padding: 24 }}>
          <NetworkBanner visible={!isOnline} />
          <View style={styles.center}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Войдите в аккаунт</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Перейдите на вкладку «Профиль» и введите логин и пароль</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
        <NetworkBanner visible={!isOnline} />

        <HeaderBarV2
          title="Заявки"
          onProfilePress={() => router.push("/profile" as never)}
          onFilterToggle={setFilterMode}
          filterMode={filterMode}
          selectedDate={selectedDate}
          onDatePress={() => setShowDatePicker(true)}
          showDate
          showFilter
          myTasksCount={myTasksCount}
        />

      <Modal visible={showDatePicker} transparent animationType="slide" onRequestClose={() => setShowDatePicker(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowDatePicker(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, marginBottom: 4 }}>Выбор даты</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16 }}>Выберите дату для просмотра заявок</Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "800" }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground }}>
                {formatLocalDateWithOptions(selectedDate, { month: "long", year: "numeric" }, "")}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1))}>
                <Text style={{ fontSize: 24, color: colors.primary, fontWeight: "800" }}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", marginBottom: 8, gap: 8 }}>
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
                <View key={day} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.muted }}>{day}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginBottom: 16 }}>{renderCalendar()}</View>

            <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, fontWeight: "700" }}>Выбранная дата:</Text>
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground }}>
                {formatLocalDateWithOptions(selectedDate, { weekday: "long", year: "numeric", month: "long", day: "numeric" }, "")}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 13, backgroundColor: colors.border, borderRadius: 10, alignItems: "center" }}>
                <Text style={{ color: colors.foreground, fontWeight: "800" }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={{ flex: 1, paddingVertical: 13, backgroundColor: colors.surface, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.primary, fontWeight: "800" }}>Применить</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

        {isLoading && sortedTasks.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
            <ScrollView
              style={{ flex: 1, backgroundColor: colors.background }}
              contentContainerStyle={{ paddingTop: 0, paddingHorizontal: 0, paddingBottom: 160 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                />
              }
              showsVerticalScrollIndicator={false}
            >
              {sortedTasks.length === 0 ? (
                <View style={styles.center}>
                  <Text style={{ fontSize: 48 }}>📋</Text>
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                    {isSelectedDateToday ? "Нет заявок" : "Нет заявок на эту дату"}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                    {isSelectedDateToday ? "Заявки появятся здесь автоматически" : "Выберите другую дату"}
                  </Text>
                </View>
              ) : (
                sortedTasks.map((item: any, index: number) => {
                  const info = getMainCardInfo(item);
                  const nutsTask = isNutsTask(item);
                  const courierCallTask = isCourierCallTask(item);
                  const nutsItems = nutsTask
                    ? getNutsOrderItems(item)
                        .map((order) => `${order.label} (${order.quantity} ${order.unit})`)
                        .join(" · ")
                    : undefined;
                  const nutsSum = nutsTask ? getNutsSumLabel(item) : null;
                  const cardDetailLine = getCardDetailLine(item);
                  const TypeIcon = getTaskTypeIcon(item);

                  return (
                    <View key={`${String(item.id)}-${index}`} collapsable={false}>
                      {item.status === "completed" || item.status === "cancelled" ? (
                      <OperationRow
                        colors={colors}
                        status={item.status}
                        statusColor={getTaskStatusColor(item.status)}
                        typeLabel={getTaskTypeLabel(item)}
                        typeColor={getTaskTypeColor(item)}
                        TypeIcon={TypeIcon}
                        requestNumber={getDisplayRequestId(item)}
                        primaryName={nutsTask ? item.recipientName || "Получатель" : info.leftName}
                        primaryAddress={nutsTask ? item.deliveryAddress || item.recipientAddress : info.leftAddress}
                        secondaryName={!nutsTask && !courierCallTask ? info.rightName : undefined}
                        secondaryAddress={!nutsTask && !courierCallTask ? info.rightAddress : undefined}
                        detailLine={nutsTask ? nutsItems || "Заказ не указан" : cardDetailLine}
                        places={getPlacesLabel(item)}
                        courier={getCourierLabel(item)}
                        trailingMeta={nutsTask ? nutsSum : undefined}
                        time={getTaskTimeLabel(item)}
                        isLast={index === sortedTasks.length - 1}
                        onPress={() => router.push(`/task/${item.id}` as never)}
                      />
                      ) : (
                        <Swipeable
                          overshootLeft={false}
                          renderLeftActions={() => renderSwipeCompleteAction(item)}
                        >
                      <OperationRow
                        colors={colors}
                        status={item.status}
                        statusColor={getTaskStatusColor(item.status)}
                        typeLabel={getTaskTypeLabel(item)}
                        typeColor={getTaskTypeColor(item)}
                        TypeIcon={TypeIcon}
                        requestNumber={getDisplayRequestId(item)}
                        primaryName={nutsTask ? item.recipientName || "Получатель" : info.leftName}
                        primaryAddress={nutsTask ? item.deliveryAddress || item.recipientAddress : info.leftAddress}
                        secondaryName={!nutsTask && !courierCallTask ? info.rightName : undefined}
                        secondaryAddress={!nutsTask && !courierCallTask ? info.rightAddress : undefined}
                        detailLine={nutsTask ? nutsItems || "Заказ не указан" : cardDetailLine}
                        places={getPlacesLabel(item)}
                        courier={getCourierLabel(item)}
                        trailingMeta={nutsTask ? nutsSum : undefined}
                        time={getTaskTimeLabel(item)}
                        isLast={index === sortedTasks.length - 1}
                        onPress={() => router.push(`/task/${item.id}` as never)}
                      />
                        </Swipeable>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  list: { paddingTop: 20, paddingHorizontal: 12, flexGrow: 1, paddingBottom: 140 },
  emptyTitle: { fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 20 },
});
