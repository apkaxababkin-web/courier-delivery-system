import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import EventSource from "react-native-sse";

import { getApiBaseUrl } from "@/constants/oauth";

export type MobileLiveEventType =
  | "app_active"
  | "tasks_changed"
  | "requests_changed"
  | "mails_changed"
  | "hemotest_changed"
  | "sberbank_changed"
  | "data_changed"
  | "chat_v2_changed"
  | "chat_v2_read";

export type MobileLiveEventPayload = Record<string, unknown>;

type LiveSyncListener = (
  eventType: MobileLiveEventType,
  payload?: MobileLiveEventPayload,
) => void | Promise<unknown>;

type LiveSyncOptions = {
  enabled?: boolean;
  events?: MobileLiveEventType[];
  onSync: LiveSyncListener;
};

const SERVER_EVENTS: Exclude<MobileLiveEventType, "app_active">[] = [
  "tasks_changed",
  "requests_changed",
  "mails_changed",
  "hemotest_changed",
  "sberbank_changed",
  "data_changed",
  "chat_v2_changed",
  "chat_v2_read",
];

const DEFAULT_EVENTS: MobileLiveEventType[] = [
  "app_active",
  "tasks_changed",
  "requests_changed",
  "mails_changed",
  "hemotest_changed",
  "sberbank_changed",
  "data_changed",
];

type Subscription = { listener: LiveSyncListener; events: Set<MobileLiveEventType> };

const subscriptions = new Set<Subscription>();
let eventSource: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let currentAppState: AppStateStatus = AppState.currentState;

const debug = typeof __DEV__ !== "undefined" && __DEV__;

function parsePayload(event: unknown): MobileLiveEventPayload | undefined {
  const data = (event as { data?: unknown } | null)?.data;
  if (typeof data !== "string" || !data) return undefined;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" ? parsed as MobileLiveEventPayload : undefined;
  } catch {
    return undefined;
  }
}

function notify(eventType: MobileLiveEventType, payload?: MobileLiveEventPayload) {
  for (const subscription of Array.from(subscriptions)) {
    if (!subscription.events.has(eventType)) continue;
    Promise.resolve(subscription.listener(eventType, payload)).catch((error) => {
      if (debug) console.warn("[LiveSync] subscriber failed:", eventType, error);
    });
  }
}

function closeConnection() {
  const source = eventSource;
  eventSource = null;
  try {
    source?.close();
  } catch {}
}

function scheduleReconnect() {
  if (reconnectTimer || subscriptions.size === 0 || currentAppState !== "active") return;
  const delay = Math.min(1_000 * (2 ** reconnectAttempt), 30_000);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (eventSource || subscriptions.size === 0 || currentAppState !== "active") return;
  try {
    const source: any = new EventSource(`${getApiBaseUrl()}/api/live`, { pollingInterval: 0 });
    eventSource = source;
    source.addEventListener("open", () => {
      if (eventSource !== source) return;
      reconnectAttempt = 0;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
    });
    for (const eventType of SERVER_EVENTS) {
      source.addEventListener(eventType, (event: unknown) => {
        if (eventSource === source) notify(eventType, parsePayload(event));
      });
    }
    source.addEventListener("error", () => {
      if (eventSource !== source) return;
      closeConnection();
      scheduleReconnect();
    });
  } catch {
    closeConnection();
    scheduleReconnect();
  }
}

function ensureAppStateSubscription() {
  if (appStateSubscription) return;
  currentAppState = AppState.currentState;
  appStateSubscription = AppState.addEventListener("change", (nextState) => {
    const wasActive = currentAppState === "active";
    currentAppState = nextState;
    if (nextState !== "active") {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeConnection();
      return;
    }
    connect();
    if (!wasActive) notify("app_active");
  });
}

function subscribe(listener: LiveSyncListener, events: MobileLiveEventType[]) {
  const subscription: Subscription = { listener, events: new Set(events) };
  subscriptions.add(subscription);
  ensureAppStateSubscription();
  connect();
  return () => {
    subscriptions.delete(subscription);
    if (subscriptions.size > 0) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    closeConnection();
    reconnectAttempt = 0;
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}

export function useMobileLiveSync({ enabled = true, events = DEFAULT_EVENTS, onSync }: LiveSyncOptions) {
  const onSyncRef = useRef(onSync);
  const eventsKey = events.join("|");

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(
      (eventType, payload) => onSyncRef.current(eventType, payload),
      eventsKey.split("|").filter(Boolean) as MobileLiveEventType[],
    );
  }, [enabled, eventsKey]);
}
