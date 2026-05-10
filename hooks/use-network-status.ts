import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

type NetworkStatus = {
  isOnline: boolean;
  checked: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    checked: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setStatus({
        isOnline: Boolean(state.isConnected && state.isInternetReachable !== false),
        checked: true,
      });
    });

    NetInfo.fetch()
      .then((state) => {
        setStatus({
          isOnline: Boolean(state.isConnected && state.isInternetReachable !== false),
          checked: true,
        });
      })
      .catch(() => {
        setStatus({ isOnline: true, checked: true });
      });

    return () => unsubscribe();
  }, []);

  return status;
}
