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
  | "chat_changed";

type LiveSyncListener = (eventType: MobileLiveEventType) => void | Promise<unknown>;

type LiveSyncOptions = {
  enabled?: boolean;
  onSync: LiveSyncListener;
};

const LIVE_EVENTS: Exclude<MobileLiveEventType, "app_active">[] = [
  "tasks_changed",
  "requests_changed",
  "mails_changed",
  "hemotest_changed",
  "sberbank_changed",
  "data_changed",
  "chat_changed",
];

const listeners = new Set<LiveSyncListener>();
let eventSource: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let currentAppState: AppStateStatus = AppState.currentState;

function notifyListeners(eventType: MobileLiveEventType) {
  for (const listener of Array.from(listeners)) {
    Promise.resolve(listener(eventType)).catch((error) => {
      console.warn("[LiveSync] subscriber failed:", eventType, error);
    });
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function closeConnection() {
  const source = eventSource;
  eventSource = null;

  try {
    source?.close();
  } catch (error) {
    console.warn("[LiveSync] close failed:", error);
  }
}

function scheduleReconnect() {
  if (reconnectTimer || listeners.size === 0 || currentAppState !== "active") return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function connect() {
  if (eventSource || listeners.size === 0 || currentAppState !== "active") return;

  const url = `${getApiBaseUrl()}/api/live`;
  console.log("[LiveSync] connecting:", url);

  try {
    const source: any = new EventSource(url, { pollingInterval: 0 });
    eventSource = source;

    source.addEventListener("open", () => {
      if (eventSource !== source) return;
      clearReconnectTimer();
      console.log("[LiveSync] opened");
    });

    source.addEventListener("connected", () => {
      if (eventSource !== source) return;
      console.log("[LiveSync] connected");
    });

    for (const eventType of LIVE_EVENTS) {
      source.addEventListener(eventType, () => {
        if (eventSource !== source) return;
        notifyListeners(eventType);
      });
    }

    source.addEventListener("error", (error: unknown) => {
      if (eventSource !== source) return;
      console.warn("[LiveSync] error:", error);
      closeConnection();
      scheduleReconnect();
    });
  } catch (error) {
    console.warn("[LiveSync] connect failed:", error);
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
      clearReconnectTimer();
      closeConnection();
      return;
    }

    connect();
    if (!wasActive) notifyListeners("app_active");
  });
}

function subscribe(listener: LiveSyncListener) {
  listeners.add(listener);
  ensureAppStateSubscription();
  connect();

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;

    clearReconnectTimer();
    closeConnection();
    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}

export function useMobileLiveSync({ enabled = true, onSync }: LiveSyncOptions) {
  const onSyncRef = useRef(onSync);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe((eventType) => onSyncRef.current(eventType));
  }, [enabled]);
}
