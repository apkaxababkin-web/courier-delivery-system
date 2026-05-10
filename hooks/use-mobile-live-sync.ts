import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";

const MIN_SYNC_INTERVAL_MS = 1500;

type LiveSyncOptions = {
  enabled?: boolean;
  onSync: () => void | Promise<unknown>;
};

export function useMobileLiveSync({ enabled = true, onSync }: LiveSyncOptions) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastSyncAtRef = useRef(0);
  const syncRef = useRef(onSync);

  useEffect(() => {
    syncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    if (!enabled) return;

    const runSync = () => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < MIN_SYNC_INTERVAL_MS) return;
      lastSyncAtRef.current = now;
      Promise.resolve(syncRef.current()).catch((error) => {
        console.warn("[LiveSync] Sync failed", error);
      });
    };

    runSync();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const wasInactive = previousState === "inactive" || previousState === "background";
      if (wasInactive && nextState === "active") {
        runSync();
      }
    });

    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        runSync();
      }
    });

    return () => {
      appStateSubscription.remove();
      netInfoUnsubscribe();
    };
  }, [enabled]);
}
