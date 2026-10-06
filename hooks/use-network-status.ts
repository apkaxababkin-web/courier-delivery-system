import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export type NetworkPhase = "online" | "connecting" | "offline";

type NetworkStatus = {
  isOnline: boolean;
  checked: boolean;
  phase: NetworkPhase;
};

const CONNECTING_DELAY_MS = 1200;
const OFFLINE_DELAY_MS = 7000;

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    checked: false,
    phase: "online",
  });

  const connectingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (connectingTimer.current) {
        clearTimeout(connectingTimer.current);
        connectingTimer.current = null;
      }

      if (offlineTimer.current) {
        clearTimeout(offlineTimer.current);
        offlineTimer.current = null;
      }
    };

    const applyState = (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => {
      const definitelyDisconnected = state.isConnected === false;
      const internetNotReachable =
        state.isConnected === true && state.isInternetReachable === false;

      if (!definitelyDisconnected && !internetNotReachable) {
        clearTimers();
        setStatus({
          isOnline: true,
          checked: true,
          phase: "online",
        });
        return;
      }

      clearTimers();

      connectingTimer.current = setTimeout(() => {
        setStatus({
          isOnline: false,
          checked: true,
          phase: "connecting",
        });
      }, CONNECTING_DELAY_MS);

      offlineTimer.current = setTimeout(() => {
        setStatus({
          isOnline: false,
          checked: true,
          phase: "offline",
        });
      }, OFFLINE_DELAY_MS);
    };

    const unsubscribe = NetInfo.addEventListener(applyState);

    NetInfo.fetch()
      .then(applyState)
      .catch(() => {
        setStatus({
          isOnline: true,
          checked: true,
          phase: "online",
        });
      });

    return () => {
      clearTimers();
      unsubscribe();
    };
  }, []);

  return status;
}
