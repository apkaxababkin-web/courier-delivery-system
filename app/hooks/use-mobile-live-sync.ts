import { useEffect, useRef } from "react";
import EventSource from "react-native-sse";

import { getApiBaseUrl } from "@/constants/oauth";

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
    console.log("[LiveSync] hook enabled:", enabled);
    if (!enabled) return;

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let eventSource: any = null;

    const runSync = (reason: string) => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < 700) return;

      lastSyncAtRef.current = now;
      console.log("[LiveSync] sync:", reason);
      onSyncRef.current();
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

      eventSource.addEventListener("tasks_changed", () => runSync("tasks_changed"));
      eventSource.addEventListener("requests_changed", () => runSync("requests_changed"));
      eventSource.addEventListener("mails_changed", () => runSync("mails_changed"));
      eventSource.addEventListener("hemotest_changed", () => runSync("hemotest_changed"));
      eventSource.addEventListener("sberbank_changed", () => runSync("sberbank_changed"));
      eventSource.addEventListener("data_changed", () => runSync("data_changed"));

      eventSource.addEventListener("error", (error: unknown) => {
        console.warn("[LiveSync] error:", error);

        try {
          eventSource?.close();
        } catch {}

        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      });
    };

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
