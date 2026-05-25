import { useEffect, useRef } from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";

type UseMobileLiveSyncOptions = {
  enabled: boolean;
  onSync: () => void;
};

export function useMobileLiveSync({ enabled, onSync }: UseMobileLiveSyncOptions) {
  const onSyncRef = useRef(onSync);
  const lastSyncAtRef = useRef(0);

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const runSync = () => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < 800) return;
      lastSyncAtRef.current = now;
      onSyncRef.current();
    };

    const connect = () => {
      if (closed) return;

      try {
        const url = `${getApiBaseUrl()}/api/live`;
        eventSource = new EventSource(url);

        eventSource.addEventListener("connected", () => {
          console.log("[LiveSync] connected");
        });

        eventSource.addEventListener("tasks_changed", runSync);
        eventSource.addEventListener("requests_changed", runSync);
        eventSource.addEventListener("mails_changed", runSync);
        eventSource.addEventListener("data_changed", runSync);

        eventSource.onerror = () => {
          console.warn("[LiveSync] connection error, reconnecting");
          eventSource?.close();

          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };
      } catch (error) {
        console.warn("[LiveSync] failed to connect", error);

        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      closed = true;
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [enabled]);
}
