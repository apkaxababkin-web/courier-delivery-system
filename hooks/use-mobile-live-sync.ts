import { useEffect, useRef } from "react";
import EventSource from "react-native-sse";

import { getApiBaseUrl } from "@/constants/oauth";

const MIN_SYNC_INTERVAL_MS = 700;
const RECONNECT_DELAY_MS = 3000;

type LiveSyncOptions = {
  enabled?: boolean;
  onSync: () => void | Promise<unknown>;
};

export function useMobileLiveSync({ enabled = true, onSync }: LiveSyncOptions) {
  const onSyncRef = useRef(onSync);
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    console.log("[LiveSync] hook enabled:", enabled);
    if (!enabled) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const runSync = (reason: string) => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < MIN_SYNC_INTERVAL_MS) return;

      lastSyncAtRef.current = now;
      console.log("[LiveSync] sync:", reason);
      Promise.resolve(onSyncRef.current()).catch((error) => {
        console.warn("[LiveSync] sync failed:", error);
      });
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

      eventSource.addEventListener("tasks_changed", () => runSync("tasks_changed"));
      eventSource.addEventListener("requests_changed", () => runSync("requests_changed"));
      eventSource.addEventListener("mails_changed", () => runSync("mails_changed"));
      eventSource.addEventListener("data_changed", () => runSync("data_changed"));

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

    runSync("initial");
    connect();

    return () => {
      closed = true;

      if (reconnectTimer) clearTimeout(reconnectTimer);

      try {
        eventSource?.close();
      } catch {}
    };
  }, [enabled]);
}
