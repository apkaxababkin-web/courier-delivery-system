import { useEffect, useRef } from "react";
import EventSource from "react-native-sse";

import { getApiBaseUrl } from "@/constants/oauth";

const MIN_SYNC_INTERVAL_MS = 900;
const RECONNECT_DELAY_MS = 3000;
const SYNC_DEBOUNCE_MS = 350;

type LiveSyncOptions = {
  enabled?: boolean;
  onSync: () => void | Promise<unknown>;
};

export function useMobileLiveSync({ enabled = true, onSync }: LiveSyncOptions) {
  const onSyncRef = useRef(onSync);
  const lastSyncAtRef = useRef(0);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReasonRef = useRef<string | null>(null);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    console.log("[LiveSync] hook enabled:", enabled);
    if (!enabled) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const executeSync = (reason: string) => {
      const now = Date.now();
      const waitMs = Math.max(0, MIN_SYNC_INTERVAL_MS - (now - lastSyncAtRef.current));

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      syncTimerRef.current = setTimeout(() => {
        if (closed) return;

        lastSyncAtRef.current = Date.now();
        const finalReason = pendingReasonRef.current || reason;
        pendingReasonRef.current = null;

        console.log("[LiveSync] sync:", finalReason);
        Promise.resolve(onSyncRef.current()).catch((error) => {
          console.warn("[LiveSync] sync failed:", error);
        });
      }, waitMs);
    };

    const scheduleSync = (reason: string) => {
      pendingReasonRef.current = pendingReasonRef.current
        ? `${pendingReasonRef.current}+${reason}`
        : reason;

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }

      syncTimerRef.current = setTimeout(() => executeSync(reason), SYNC_DEBOUNCE_MS);
    };

    const connect = () => {
      if (closed) return;

      const url = `${getApiBaseUrl()}/api/live`;
      console.log("[LiveSync] connecting:", url);

      eventSource = new EventSource(url, {
        pollingInterval: 0,
      });

      eventSource.addEventListener("open", () => {
        console.log("[LiveSync] opened");
      });

      eventSource.addEventListener("connected", () => {
        console.log("[LiveSync] connected");
      });

      eventSource.addEventListener("ping", () => {
        console.log("[LiveSync] ping");
      });

      eventSource.addEventListener("tasks_changed", () => scheduleSync("tasks_changed"));
      eventSource.addEventListener("requests_changed", () => scheduleSync("requests_changed"));
      eventSource.addEventListener("mails_changed", () => scheduleSync("mails_changed"));
      eventSource.addEventListener("data_changed", () => scheduleSync("data_changed"));

      eventSource.addEventListener("error", (error: unknown) => {
        console.warn("[LiveSync] error:", error);

        try {
          eventSource?.close();
        } catch {}

        if (!closed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
    };

    scheduleSync("initial");
    connect();

    return () => {
      closed = true;

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      if (reconnectTimer) clearTimeout(reconnectTimer);

      try {
        eventSource?.close();
      } catch {}
    };
  }, [enabled]);
}
