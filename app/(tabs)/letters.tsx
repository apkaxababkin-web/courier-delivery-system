import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { HeaderBarV2 } from "@/components/header-bar-v2";
import { useRouter } from "expo-router";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import EventSource from "react-native-sse";
import { NetworkBanner } from "@/components/network-banner";
import { trpc } from "@/lib/trpc";
import { useCourierAuth } from "@/lib/courier-auth";
import { useColors } from "@/hooks/use-colors";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { DESIGN_PREVIEW_TOKEN, designPreviewMails } from "@/lib/design-preview";
import { getApiBaseUrl } from "@/constants/oauth";
import { createCourierMobileClient } from "@/shared/mobileCourierClient";
import { CalendarDays, CheckCircle2, Circle, Search, UserRound, X } from "lucide-react-native";

function formatDateTimeInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDateTimeInput(value: string): Date | null {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizePhoneForDial(phone?: string | null) {
  if (!phone) return "";
  return phone.replace(/[^+\d]/g, "");
}

function isDarkBackground(background: string) {
  return background.toLowerCase() !== "#f5f3ef" && background.toLowerCase() !== "#ffffff";
}

function groupLabel(value?: string | Date | null) {
  if (!value) return "Без даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Без даты";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function shortTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dateKey(value?: string | Date | null) {
  if (!value) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch?.[1]) return isoMatch[1];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function LettersScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const bottomTabClearance = Platform.OS === "web"
    ? 76
    : Math.min(Math.max(tabBarHeight, 64 + insets.bottom), 120);
  const deliverBarBottom = bottomTabClearance + 12;
  const { token } = useCourierAuth();
  const isDesignPreview = token === DESIGN_PREVIEW_TOKEN;
  const mobileClient = useMemo(() => createCourierMobileClient(getApiBaseUrl()), []);
  const { isOnline } = useNetworkStatus();
  const dark = isDarkBackground(colors.background);
  const border = dark ? "rgba(148,163,184,0.18)" : colors.border;
  const soft = dark ? "rgba(148,163,184,0.07)" : "#F8FAFC";

  const [search, setSearch] = useState("");
  const [selectedDate] = useState(new Date());
  const [selectedMailId, setSelectedMailId] = useState<number | null>(null);
  const [selectedMailIds, setSelectedMailIds] = useState<number[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [deliveredAtInput, setDeliveredAtInput] = useState(formatDateTimeInput(new Date()));
  const [deliveryTimeError, setDeliveryTimeError] = useState("");
  const [snapshotMails, setSnapshotMails] = useState<any[]>([]);
  const [detailMailId, setDetailMailId] = useState<number | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const longPressHandledRef = useRef(false);

  const isDeliveryModalOpen = selectedMailId !== null;
  const { data: mailsRaw = [], refetch } = trpc.mails.all.useQuery(
    { token: token || "" },
    { enabled: !!token && !isDesignPreview, refetchInterval: isDeliveryModalOpen || isDesignPreview ? false : 5000 },
  );
  const loadSnapshotMails = useCallback(async () => {
    if (!token || isDesignPreview) return;
    try {
      const snapshot = await mobileClient.realtime(token);
      setSnapshotMails(Array.isArray(snapshot.mails) ? snapshot.mails : []);
    } catch (error) {
      console.warn("[Letters] Realtime mails fallback failed", error);
    }
  }, [isDesignPreview, mobileClient, token]);

  useEffect(() => {
    void loadSnapshotMails();
  }, [loadSnapshotMails]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const dismissKeyboardIfOpen = useCallback(() => {
    if (!keyboardVisible) return false;
    Keyboard.dismiss();
    return true;
  }, [keyboardVisible]);

  useEffect(() => {
    if (!token || isDesignPreview) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const refreshLetters = () => {
      void refetch();
      void loadSnapshotMails();
    };

    const connect = () => {
      if (closed) return;

      try {
        eventSource = new EventSource(`${getApiBaseUrl()}/api/live`, {
          pollingInterval: 0,
        });

        eventSource.addEventListener("connected", () => {
          console.log("[LettersLiveSync] connected");
        });

        eventSource.addEventListener("mails_changed", () => {
          console.log("[LettersLiveSync] mails_changed");
          refreshLetters();
        });

        eventSource.addEventListener("data_changed", () => {
          console.log("[LettersLiveSync] data_changed");
          refreshLetters();
        });

        eventSource.addEventListener("error", (error: unknown) => {
          console.warn("[LettersLiveSync] error:", error);

          try {
            eventSource?.close();
          } catch {}

          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        });
      } catch (error) {
        console.warn("[LettersLiveSync] connect failed:", error);

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
  }, [token, isDesignPreview, refetch, loadSnapshotMails]);


  const normalizedMailsRaw = Array.isArray(mailsRaw)
    ? mailsRaw
    : Array.isArray((mailsRaw as any)?.json)
      ? (mailsRaw as any).json
      : Array.isArray((mailsRaw as any)?.result?.data?.json)
        ? (mailsRaw as any).result.data.json
        : Array.isArray((mailsRaw as any)?.data?.json)
          ? (mailsRaw as any).data.json
          : [];

  const mails = isDesignPreview
    ? designPreviewMails
    : normalizedMailsRaw.length > 0
      ? normalizedMailsRaw
      : snapshotMails;

  useEffect(() => {
    console.log("[Letters] state", {
      tokenPresent: !!token,
      mailsRawType: Array.isArray(mailsRaw) ? "array" : typeof mailsRaw,
      mailsRawKeys: mailsRaw && typeof mailsRaw === "object" ? Object.keys(mailsRaw as any) : [],
      normalizedMailsRaw: normalizedMailsRaw.length,
      snapshotMails: snapshotMails.length,
      mails: Array.isArray(mails) ? mails.length : -1,
      isDesignPreview,
    });
  }, [token, mailsRaw, normalizedMailsRaw, snapshotMails, mails, isDesignPreview]);

  const deliverMutation = (trpc.mails as any).deliver.useMutation({
    onSuccess: () => refetch(),
  });

  const groupedMails = useMemo(() => {
    const q = search.trim().toLowerCase();

    const todayKey = dateKey();

    const filtered = mails.filter((mail: any) => {
      const matchesSearch =
        !q ||
        mail.waybillNumber?.toLowerCase().includes(q) ||
        mail.recipientName?.toLowerCase().includes(q) ||
        mail.recipientPhone?.toLowerCase().includes(q) ||
        mail.deliveryAddress?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const delivered = mail.status === "delivered";
      if (!delivered) return true;

      const deliveredKey = dateKey(mail.deliveredAt || mail.updatedAt);
      return deliveredKey === todayKey;
    });

    const sorted = [...filtered].sort((a: any, b: any) => {
      const aDelivered = a.status === "delivered";
      const bDelivered = b.status === "delivered";
      if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;

      const aTime = new Date(aDelivered ? a.deliveredAt || a.updatedAt || a.createdAt : a.createdAt).getTime();
      const bTime = new Date(bDelivered ? b.deliveredAt || b.updatedAt || b.createdAt : b.createdAt).getTime();

      return Number.isNaN(bTime - aTime) ? 0 : bTime - aTime;
    });

    const rows: Array<{ type: "header"; title: string } | { type: "mail"; mail: any }> = [];
    let deliveredHeaderAdded = false;

    sorted.forEach((mail: any) => {
      const delivered = mail.status === "delivered";

      if (delivered && !deliveredHeaderAdded) {
        deliveredHeaderAdded = true;
        rows.push({ type: "header", title: "Вручено" });
      }

      rows.push({ type: "mail", mail });
    });

    return rows;
  }, [mails, search]);

  const detailMail = useMemo(() => {
    if (detailMailId === null) return null;
    return mails.find((mail: any) => mail.id === detailMailId) || null;
  }, [detailMailId, mails]);

  const undoDelivery = useCallback(async (mailId: number) => {
    if (dismissKeyboardIfOpen()) return;
    if (isDesignPreview || !token) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/trpc/mails.undoDelivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token, mailId }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Не удалось отменить вручение");
      }

      setSelectedMailIds((current) => current.filter((id) => id !== mailId));
      await refetch();
      await loadSnapshotMails();
    } catch (error) {
      console.warn("[Letters] undo delivery failed", error);
    }
  }, [dismissKeyboardIfOpen, isDesignPreview, token, refetch, loadSnapshotMails]);

  const callRecipient = async (phone?: string | null) => {
    const normalizedPhone = normalizePhoneForDial(phone);
    if (!normalizedPhone) return;
    try {
      await Linking.openURL(`tel:${normalizedPhone}`);
    } catch (error) {
      console.warn("[Letters] Failed to open dialer", error);
    }
  };

  const openDeliveryModal = (mailIds: number[]) => {
    if (!mailIds.length) return;
    setSelectedMailIds(mailIds);
    setSelectedMailId(mailIds[0]);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  const closeDeliveryModal = () => {
    setSelectedMailId(null);
    setSelectedMailIds([]);
    setRecipientName("");
    setDeliveryTimeError("");
    setDeliveredAtInput(formatDateTimeInput(new Date()));
  };

  const confirmDelivery = async () => {
    const mailIds = selectedMailIds.length ? selectedMailIds : selectedMailId ? [selectedMailId] : [];
    if (!mailIds.length || !recipientName.trim()) return;
    const deliveredAt = parseDateTimeInput(deliveredAtInput);
    if (!deliveredAt) {
      setDeliveryTimeError("Введите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ");
      return;
    }
    if (isDesignPreview) {
      closeDeliveryModal();
      return;
    }
    if (!token) return;
    for (const mailId of mailIds) {
      await deliverMutation.mutateAsync({ token, mailId, recipientSignature: recipientName.trim(), deliveredAt } as any);
    }
    closeDeliveryModal();
    refetch();
  };

  const toggleMailSelection = (mailId: number) => {
    setSelectedMailIds((current) => current.includes(mailId) ? current.filter((id) => id !== mailId) : [...current, mailId]);
  };

  const selectionMode = selectedMailIds.length > 0 && selectedMailId === null;
  const selectionPanelClearance = selectionMode ? 82 : 20;

  return (
    <ScreenContainer className="p-0">
      <NetworkBanner visible={!isOnline} />

      <HeaderBarV2
        title="Письма"
        onProfilePress={() => router.push("/profile" as never)}
        selectedDate={selectedDate}
        showDate
      />

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, backgroundColor: colors.background }}>
        <View style={{ height: 38, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: border, paddingHorizontal: 12 }}>
          <Search size={17} color={colors.muted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Накладная, получатель или адрес"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, height: 38, paddingHorizontal: 9, paddingVertical: 0, color: colors.foreground, fontSize: 12 }}
          />
        </View>
      </View>

      <FlatList
        data={groupedMails}
        keyExtractor={(item: any, index) => item.type === "header" ? `h-${item.title}-${index}` : `m-${item.mail.id}`}
        style={{
          height: Math.max(windowHeight - 190, 420),
          flexGrow: 0,
          backgroundColor: colors.background,
        }}
        contentContainerStyle={{
          paddingBottom: Math.max(bottomTabClearance + selectionPanelClearance, 180),
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: border,
        }}
        scrollIndicatorInsets={{ bottom: Math.max(bottomTabClearance + selectionPanelClearance, 180) }}
        ListFooterComponent={<View style={{ height: Math.max(selectionPanelClearance, 80) }} />}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={() => Keyboard.dismiss()}
        removeClippedSubviews={false}
        initialNumToRender={50}
        maxToRenderPerBatch={50}
        windowSize={10}
        ListEmptyComponent={
          <View style={{ padding: 20 }}>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700" }}>
              Писем нет в списке. mails={mails.length}, rows={groupedMails.length}
            </Text>
          </View>
        }
        renderItem={({ item }: any) => {
          if (item.type === "header") {
            if (item.title === "Сегодня") return null;
            return <Text style={{ color: item.title === "Вручено" ? colors.success : colors.muted, fontSize: 11, fontWeight: "800", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>{item.title}</Text>;
          }

          const mail = item.mail;
          const delivered = mail.status === "delivered";
          const hasPhone = Boolean(normalizePhoneForDial(mail.recipientPhone));
          const selected = selectedMailIds.includes(mail.id);

          return (
            <Pressable
              onLongPress={() => {
                if (dismissKeyboardIfOpen()) return;
                if (delivered) return;
                longPressHandledRef.current = true;
                setSelectedMailId(null);
                toggleMailSelection(mail.id);
              }}
              delayLongPress={350}
              onPress={() => {
                if (dismissKeyboardIfOpen()) return;
                if (longPressHandledRef.current) {
                  longPressHandledRef.current = false;
                  return;
                }
                if (selectionMode && !delivered) {
                  toggleMailSelection(mail.id);
                  return;
                }
                setDetailMailId(mail.id);
              }}
              style={({ pressed }) => ({
                minHeight: 76,
                backgroundColor: selected ? "rgba(59,130,246,0.12)" : pressed ? colors.surface : colors.background,
                flexDirection: "row",
                borderBottomWidth: 1,
                borderBottomColor: border,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <View style={{ width: 54, alignItems: "center", justifyContent: "center", borderRightWidth: 1, borderRightColor: border }}>
                {!delivered ? (
                  <Pressable
                    onPress={() => {
                      if (dismissKeyboardIfOpen()) return;
                      setSelectedMailId(null);
                      toggleMailSelection(mail.id);
                    }}
                    hitSlop={12}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? "rgba(59,130,246,0.16)" : "transparent",
                    }}
                  >
                    {selected ? (
                      <CheckCircle2 size={24} color={colors.primary} strokeWidth={2.6} />
                    ) : (
                      <Circle size={24} color={colors.muted} strokeWidth={2.2} />
                    )}
                  </Pressable>
                ) : (
                  <CheckCircle2 size={23} color={colors.success} strokeWidth={2.3} />
                )}
              </View>
              <View style={{ flex: 1, paddingVertical: 10, paddingLeft: 12, paddingRight: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, lineHeight: 18, fontWeight: "700", flex: 1 }}>
                    Письмо №-{mail.waybillNumber}
                    {mail.recipientName ? <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "500" }}>  {mail.recipientName}</Text> : null}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 10 }}>{shortTime(mail.deliveredAt || mail.createdAt)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, lineHeight: 17, fontWeight: "600", flex: 1 }}>
                    {mail.recipientName || "—"}
                    <Text style={{ color: colors.muted, fontWeight: "400" }}>  {mail.deliveryAddress || "—"}</Text>
                  </Text>
                  {!selectionMode ? (
                    <Pressable
                      onPress={() => {
                        if (delivered) {
                          void undoDelivery(mail.id);
                        } else {
                          if (dismissKeyboardIfOpen()) return;
                          openDeliveryModal([mail.id]);
                        }
                      }}
                      hitSlop={10}
                      style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: delivered ? "rgba(34,197,94,0.14)" : "rgba(59,130,246,0.10)" }}
                    >
                      <Text style={{ color: delivered ? colors.success : colors.primary, fontSize: 11, fontWeight: "800" }}>
                        {delivered ? "Отмена" : "Вручить"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                {delivered ? (
                  <Text numberOfLines={1} style={{ color: colors.success, marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: "700" }}>
                    Вручено: {mail.recipientSignature || mail.recipientName || "—"}{mail.courierName ? `  ·  ${mail.courierName}` : ""}
                  </Text>
                ) : hasPhone ? (
                  <Pressable onPress={() => {
                    if (dismissKeyboardIfOpen()) return;
                    void callRecipient(mail.recipientPhone);
                  }}>
                    <Text style={{ color: colors.primary, marginTop: 3, fontSize: 11, lineHeight: 16 }}>{mail.recipientPhone}</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />

      {selectionMode ? (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: deliverBarBottom,
            zIndex: 999,
            minHeight: 58,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: border,
            shadowColor: "#000",
            shadowOpacity: 0.16,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 24,
          }}
        >
          <Pressable onPress={() => setSelectedMailIds([])} hitSlop={8}>
            <X size={20} color={colors.muted} />
          </Pressable>
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 13, fontWeight: "700", marginLeft: 12 }}>
            Выбрано писем: {selectedMailIds.length}
          </Text>
          <Pressable
            onPress={() => openDeliveryModal(selectedMailIds)}
            style={{ minHeight: 40, paddingHorizontal: 18, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>Вручить</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={detailMail !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)", padding: 16, paddingBottom: 86 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: border }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 16, fontWeight: "800" }}>
                Письмо №-{detailMail?.waybillNumber || "—"}
              </Text>
              <Pressable onPress={() => setDetailMailId(null)} hitSlop={10}>
                <X size={20} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 8 }}>Получатель</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20, marginTop: 3 }}>{detailMail?.recipientName || "—"}</Text>

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 12 }}>Телефон</Text>
            <Text style={{ color: colors.primary, fontSize: 14, lineHeight: 20, marginTop: 3 }}>{detailMail?.recipientPhone || "—"}</Text>

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 12 }}>Полный адрес</Text>
            <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 21, marginTop: 3 }}>{detailMail?.deliveryAddress || "—"}</Text>

            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", marginTop: 12 }}>Статус</Text>
            <Text style={{ color: detailMail?.status === "delivered" ? colors.success : colors.primary, fontSize: 14, lineHeight: 20, marginTop: 3, fontWeight: "800" }}>
              {detailMail?.status === "delivered" ? "Вручено" : "Не вручено"}
            </Text>

            {detailMail?.status === "delivered" ? (
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                Получил: {detailMail?.recipientSignature || "—"} · {shortTime(detailMail?.deliveredAt)}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={() => setDetailMailId(null)} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: soft, alignItems: "center", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700" }}>Закрыть</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!detailMail) return;
                  const id = detailMail.id;
                  setDetailMailId(null);
                  if (detailMail.status === "delivered") {
                    void undoDelivery(id);
                  } else {
                    openDeliveryModal([id]);
                  }
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: detailMail?.status === "delivered" ? colors.success : colors.primary, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontSize: 12, fontWeight: "800" }}>
                  {detailMail?.status === "delivered" ? "Отмена" : "Вручить"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={selectedMailId !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "position"}
          keyboardVerticalOffset={Platform.OS === "android" ? 12 : 0}
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1 }}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", padding: 16, paddingBottom: 86 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: border }}>
            <Text style={{ fontSize: 16, textAlign: "center", fontWeight: "700", color: colors.foreground, marginBottom: 3 }}>Кто получил?</Text>
            {selectedMailIds.length > 1 ? (
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: "center", marginBottom: 10 }}>
                Будет отмечено писем: {selectedMailIds.length}
              </Text>
            ) : <View style={{ height: 10 }} />}
            <View style={{ height: 42, flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: border, backgroundColor: colors.background, paddingHorizontal: 11 }}>
              <UserRound size={17} color={colors.muted} />
              <TextInput
                autoFocus
                value={recipientName}
                onChangeText={setRecipientName}
                placeholder="Введите ФИО"
                placeholderTextColor={colors.muted}
                returnKeyType="next"
                style={{ flex: 1, height: 42, paddingHorizontal: 10, paddingVertical: 0, color: colors.foreground, fontSize: 12 }}
              />
            </View>
            <View style={{ height: 42, flexDirection: "row", alignItems: "center", marginTop: 9, borderRadius: 8, borderWidth: 1, borderColor: deliveryTimeError ? colors.error : border, backgroundColor: colors.background, paddingHorizontal: 11 }}>
              <CalendarDays size={17} color={colors.muted} />
              <TextInput value={deliveredAtInput} onChangeText={(value) => { setDeliveredAtInput(value); setDeliveryTimeError(""); }} placeholder="ДД.ММ.ГГГГ ЧЧ:ММ" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={{ flex: 1, height: 42, paddingHorizontal: 10, paddingVertical: 0, color: colors.foreground, fontSize: 12 }} />
              <Pressable onPress={() => setDeliveredAtInput("")} hitSlop={8}><X size={16} color={colors.muted} /></Pressable>
            </View>
            {deliveryTimeError ? <Text style={{ color: colors.error, marginTop: 8, fontWeight: "800" }}>{deliveryTimeError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Pressable onPress={closeDeliveryModal} style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: soft, alignItems: "center", borderWidth: 1, borderColor: border }}>
                <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Отмена</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelivery}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center", opacity: deliverMutation.isPending || !recipientName.trim() ? 0.62 : 1 }}
              >
                <Text style={{ color: "white", fontSize: 12, fontWeight: "700" }}>{deliverMutation.isPending ? "Сохраняю..." : "Подтвердить"}</Text>
              </Pressable>
            </View>
          </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}
