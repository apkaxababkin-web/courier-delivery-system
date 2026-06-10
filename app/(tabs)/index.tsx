import {
  ActivityIndicator,
  AppState,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/lib/trpc";
import { NetworkBanner } from "@/components/network-banner";
import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useColors } from "@/hooks/use-colors";
import { useMobileLiveSync } from "@/hooks/use-mobile-live-sync";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useCourierAuth } from "@/lib/courier-auth";
import { useFilter } from "@/lib/filter-context";
import { sortTasks } from "@/lib/task-sorting";
import { createCourierMobileClient } from "@/shared/mobileCourierClient";
import { type TaskStatus } from "@/shared/types";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  MapPin,
  Clock,
  PackageOpen,
  ArrowLeftRight,
  Nut,
  Truck,
  Mail,
} from "lucide-react-native";


export default function TaskListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token, courier, loading: authLoading } = useCourierAuth();
  const { filterMode, setFilterMode } = useFilter();
  const { isOnline } = useNetworkStatus();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: tasksDataRaw,
    isLoading,
    refetch,
    isRefetching: isRefetchingQuery,
  } = trpc.tasks.all.useQuery(
    {
      token: token!,
      date: selectedDate.toISOString().slice(0, 10),
    },
    {
      enabled: !authLoading && !!token,
      staleTime: 0,
      refetchOnMount: "always",
      refetchOnReconnect: true,
      refetchInterval: 60_000,
      placeholderData: (previousData) => previousData,
    },
  );


  const tasksData = useMemo(() => {
    const next = Array.isArray(tasksDataRaw) ? (tasksDataRaw as any[]) : [];
    return next;
  }, [tasksDataRaw, authLoading, token, isLoading, isRefetchingQuery]);

  useMobileLiveSync({
    enabled: !!token,
    onSync: useCallback(() => {
      if (!token) return;
      return refetch();
    }, [token, refetch]),
  });

  useEffect(() => {
    if (!token || authLoading) return;

    const timer = setTimeout(() => {
      refetch();
    }, 700);

    return () => clearTimeout(timer);
  }, [token, authLoading, selectedDate, refetch]);

  useEffect(() => {
    if (!token) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      refetch();
    });

    return () => subscription.remove();
  }, [token, refetch]);


  const isToday = useMemo(() => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  }, [selectedDate]);

  const filteredTasks = useMemo(() => {
    if (!tasksData.length) {
      return [];
    }

    const selectedDateKey = selectedDate.toISOString().slice(0, 10);

    const tasks = tasksData.filter((task: any) => {
      const taskDateKey = String(task.scheduledAt || task.createdAt || "").slice(0, 10);

      if (taskDateKey && taskDateKey !== selectedDateKey) {
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
  }, [tasksData, filterMode, courier?.id, courier?.name, selectedDate]);

  const sortedTasks = useMemo(() => {
    return [...(filteredTasks as any[])].sort((a: any, b: any) => {
      const aDone = a.status === "completed" || a.status === "cancelled";
      const bDone = b.status === "completed" || b.status === "cancelled";

      if (aDone !== bDone) return aDone ? 1 : -1;

      return Number(a.id) - Number(b.id);
    });
  }, [filteredTasks]);

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
      refetch();
    }, [refetch]),
  );

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

      return {
        isNuts: false,
        leftTitle: isToTc ? "Откуда" : "ТК",
        leftName: isToTc ? (item.recipientName || "Получатель") : (item.tcName || "ТК"),
        leftAddress: isToTc ? (item.deliveryAddress || item.recipientAddress || "") : (item.tcAddress || ""),
        rightTitle: isToTc ? "ТК" : "Куда",
        rightName: isToTc ? (item.tcName || "ТК") : (item.recipientName || "Получатель"),
        rightAddress: isToTc ? (item.tcAddress || "") : (item.deliveryAddress || item.recipientAddress || ""),
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

    if (count === 1) return "1 место";

    return `${count} м`;
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
      <ScreenContainer className="p-6">
        <NetworkBanner visible={!isOnline} />
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📦</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Войдите в аккаунт</Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>Перейдите на вкладку «Профиль» и введите логин и пароль</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <HeaderBarV2
        onProfilePress={() => router.push("/profile" as never)}
        onFilterToggle={setFilterMode}
        filterMode={filterMode}
        selectedDate={selectedDate}
        onDatePress={() => setShowDatePicker(true)}
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
                {selectedDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
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
                {selectedDate.toLocaleDateString("ru-RU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
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
        <FlatList
          data={sortedTasks as any}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 12, paddingBottom: 220, backgroundColor: colors.background }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 260 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 48 }}>📋</Text>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {isToday ? "Нет заявок" : "Нет заявок на эту дату"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {isToday ? "Заявки появятся здесь автоматически" : "Выберите другую дату"}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            return (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => router.push(`/task/${item.id}` as never)}
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 10,
                padding: 10,
                marginBottom: 10,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                minHeight: 104,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, paddingRight: 12, flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ color: "#0F172A", fontSize: 14, fontWeight: "900" }}>
                    {index + 1}
                  </Text>
                  {(() => {
                    const Icon = getTaskTypeIcon(item);
                    const typeColor = getTaskTypeColor(item);

                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 7 }}>
                        <Icon size={14} color={typeColor} strokeWidth={2.4} />
                        <Text style={{ color: typeColor, fontSize: 13, fontWeight: "800", marginLeft: 5 }}>
                          {getTaskTypeLabel(item)}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                <View style={{ paddingHorizontal: 0, paddingVertical: 0 }}>
                  <Text style={{ color: getTaskStatusColor(item.status), fontSize: 11, fontWeight: "900" }}>
                    {getTaskStatusLabel(item.status)}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: "#E2E8F0",
                  marginTop: 8,
                  marginHorizontal: -12,
                }}
              />

              {(() => {
                const info = getMainCardInfo(item);
                const timeLabel = getTaskTimeLabel(item);
                const nutsTask = isNutsTask(item);

                if (nutsTask) {
                  const orderLines = getNutsOrderLines(item);
                  const sumLabel = getNutsSumLabel(item);

                  return (
                    <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start" }}>
                      <View style={{ flex: 32, paddingRight: 7, alignItems: "center" }}>
                        <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400" }}>Получатель</Text>
                        <Text numberOfLines={1} style={{ color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 2 }}>
                          {item.recipientName || "—"}
                        </Text>
                        {!!item.recipientPhone && (
                          <Text numberOfLines={1} style={{ color: "#64748B", fontSize: 10, fontWeight: "700", marginTop: 2 }}>
                            {item.recipientPhone}
                          </Text>
                        )}
                      </View>

                      <View style={{ flex: 2, alignItems: "center", paddingTop: 17 }}>
                        <View style={{ width: 1, height: Math.max(42, orderLines.length * 17 + 20), backgroundColor: "#E2E8F0" }} />
                      </View>

                      <View style={{ flex: 40, paddingHorizontal: 7, alignItems: "center" }}>
                        <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400" }}>Заказ</Text>
                        <View style={{ marginTop: 2 }}>
                          {orderLines.length ? orderLines.map((line, index) => (
                            <Text key={`${line}-${index}`} numberOfLines={1} style={{ color: "#0F172A", fontSize: 11.5, fontWeight: "800", marginTop: index === 0 ? 0 : 2 }}>
                              {line}
                            </Text>
                          )) : (
                            <Text style={{ color: "#0F172A", fontSize: 11.5, fontWeight: "800" }}>—</Text>
                          )}
                        </View>
                      </View>

                      <View style={{ flex: 2, alignItems: "center", paddingTop: 17 }}>
                        <View style={{ width: 1, height: Math.max(42, orderLines.length * 17 + 20), backgroundColor: "#E2E8F0" }} />
                      </View>

                      <View style={{ flex: 24, alignItems: "flex-start", paddingLeft: 7 }}>
                        <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400" }}>Сумма</Text>
                        <Text numberOfLines={2} style={{ color: "#0F172A", fontSize: 11.5, fontWeight: "900", marginTop: 2 }}>
                          {sumLabel || "—"}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return (
                  <View style={{ marginTop: 8, flexDirection: "row", alignItems: "flex-start" }}>
                    <View style={{ flex: timeLabel ? 35 : 49, paddingRight: 7, alignItems: "center" }}>
                      <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400" }}>{info.leftTitle}</Text>
                      <Text numberOfLines={1} style={{ color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 2 }}>
                        {info.leftName}
                      </Text>
                      {!!info.leftAddress && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                          <MapPin size={10.5} color="#64748B" strokeWidth={2.2} />
                          <Text numberOfLines={1} style={{ color: "#64748B", fontSize: 10, fontWeight: "700", marginLeft: 3 }}>
                            {info.leftAddress}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 2, alignItems: "center", paddingTop: 17 }}>
                      <View style={{ width: 1, height: 36, backgroundColor: "#E2E8F0" }} />
                    </View>

                    <View style={{ flex: timeLabel ? 35 : 49, paddingHorizontal: 7, alignItems: "center" }}>
                      <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400" }}>{info.rightTitle}</Text>
                      <Text numberOfLines={1} style={{ color: "#0F172A", fontSize: 13, fontWeight: "900", marginTop: 2 }}>
                        {info.rightName}
                      </Text>
                      {!!info.rightAddress && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                          <MapPin size={10.5} color="#64748B" strokeWidth={2.2} />
                          <Text numberOfLines={1} style={{ color: "#64748B", fontSize: 10, fontWeight: "700", marginLeft: 3 }}>
                            {info.rightAddress}
                          </Text>
                        </View>
                      )}
                    </View>

                    {timeLabel && (
                      <View style={{ flex: 2, alignItems: "center", paddingTop: 17 }}>
                        <View style={{ width: 1, height: 36, backgroundColor: "#E2E8F0" }} />
                      </View>
                    )}

                    {timeLabel && (
                      <View style={{ flex: 26, alignItems: "center", paddingLeft: 7 }}>
                        <Text style={{ color: "#64748B", fontSize: 10, fontWeight: "400", textAlign: "center" }}>Время</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                          <Clock size={11} color="#64748B" strokeWidth={2.3} />
                          <Text numberOfLines={1} style={{ color: "#475569", fontSize: 10, fontWeight: "400", marginLeft: 3, textAlign: "center" }}>
                            {timeLabel}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })()}

              <View
                style={{
                  height: 1,
                  backgroundColor: "#E2E8F0",
                  marginTop: 8,
                  marginHorizontal: -12,
                }}
              />

              <View
                style={{
                  marginTop: 8,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#64748B",
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {getPlacesLabel(item) ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Package size={13} color="#64748B" strokeWidth={2.2} />
                      <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "800", marginLeft: 5 }}>
                        {getPlacesLabel(item)}
                      </Text>
                    </View>
                  ) : ""}
                </Text>

                <Text
                  style={{
                    color: item.courierName ? "#0F172A" : "#2563EB",
                    fontSize: 11,
                    fontWeight: "800",
                  }}
                >
                  {getCourierLabel(item)}
                </Text>
              </View>

            </TouchableOpacity>
            );
          }}
        />
      )}

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  list: { paddingTop: 20, paddingHorizontal: 12, flexGrow: 1, paddingBottom: 140 },
  emptyTitle: { fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 24 },
  emptySubtitle: { fontSize: 12, textAlign: "center", lineHeight: 20 },
});
