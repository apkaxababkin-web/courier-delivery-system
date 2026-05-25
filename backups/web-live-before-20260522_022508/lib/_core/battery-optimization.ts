/**
 * Battery Optimization Service
 * Manages caching, network awareness, and efficient data fetching
 */

import NetInfo from "@react-native-community/netinfo";

export type NetworkType = "wifi" | "cellular" | "none" | "unknown";

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: NetworkType;
}

// Global network state
let currentNetworkState: NetworkState = {
  isConnected: false,
  isInternetReachable: false,
  type: "unknown",
};

// Listeners for network changes
const networkListeners: Set<(state: NetworkState) => void> = new Set();

/**
 * Initialize network monitoring
 */
export function initNetworkMonitoring(): void {
  NetInfo.addEventListener((state) => {
    currentNetworkState = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      type: (state.type as NetworkType) || "unknown",
    };

    console.log("[Battery] Network state changed:", currentNetworkState);

    // Notify all listeners
    networkListeners.forEach((listener) => listener(currentNetworkState));
  });
}

/**
 * Get current network state
 */
export function getNetworkState(): NetworkState {
  return currentNetworkState;
}

/**
 * Subscribe to network changes
 */
export function subscribeToNetworkChanges(
  callback: (state: NetworkState) => void
): () => void {
  networkListeners.add(callback);

  return () => {
    networkListeners.delete(callback);
  };
}

/**
 * Check if we should fetch data based on network conditions
 */
export function shouldFetchData(): boolean {
  return currentNetworkState.isConnected && currentNetworkState.isInternetReachable;
}

/**
 * Check if we're on metered connection (cellular)
 */
export function isMeteredConnection(): boolean {
  return currentNetworkState.type === "cellular";
}

/**
 * Get optimal cache duration based on network type
 */
export function getOptimalCacheDuration(): {
  staleTime: number;
  gcTime: number;
} {
  if (!currentNetworkState.isConnected) {
    // Offline: keep cache longer
    return {
      staleTime: 30 * 60 * 1000, // 30 minutes
      gcTime: 60 * 60 * 1000, // 1 hour
    };
  }

  if (isMeteredConnection()) {
    // Cellular: longer cache to save data
    return {
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
    };
  }

  // WiFi: shorter cache, more frequent updates
  return {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  };
}

/**
 * Defer non-critical operations when on cellular
 */
export function shouldDeferOperation(priority: "critical" | "high" | "normal" | "low"): boolean {
  if (!isMeteredConnection()) {
    return false; // Always execute on WiFi
  }

  // On cellular, defer low priority operations
  return priority === "low" || priority === "normal";
}

/**
 * Get batch size based on network conditions
 */
export function getOptimalBatchSize(): number {
  if (!currentNetworkState.isConnected) {
    return 5; // Offline: small batches
  }

  if (isMeteredConnection()) {
    return 10; // Cellular: medium batches
  }

  return 20; // WiFi: larger batches
}

/**
 * Retry configuration based on network type
 */
export function getRetryConfig(): {
  maxRetries: number;
  initialDelayMs: number;
} {
  if (!currentNetworkState.isConnected) {
    // Offline: more aggressive retries
    return {
      maxRetries: 5,
      initialDelayMs: 2000,
    };
  }

  if (isMeteredConnection()) {
    // Cellular: moderate retries
    return {
      maxRetries: 3,
      initialDelayMs: 1000,
    };
  }

  // WiFi: fewer retries
  return {
    maxRetries: 2,
    initialDelayMs: 500,
  };
}

/**
 * Recommended query options for React Query
 */
export function getOptimizedQueryOptions() {
  const cacheDuration = getOptimalCacheDuration();

  return {
    staleTime: cacheDuration.staleTime,
    gcTime: cacheDuration.gcTime,
    refetchOnWindowFocus: false, // Don't refetch on focus (saves battery)
    refetchOnReconnect: true, // Refetch when internet reconnects
    refetchOnMount: false, // Don't refetch on mount if cached
    retry: (failureCount: number) => {
      // Retry less on cellular
      const maxRetries = isMeteredConnection() ? 2 : 3;
      return failureCount < maxRetries;
    },
  };
}

/**
 * Log network state for debugging
 */
export function logNetworkState(): void {
  console.log("[Battery] Current network state:", {
    isConnected: currentNetworkState.isConnected,
    isInternetReachable: currentNetworkState.isInternetReachable,
    type: currentNetworkState.type,
    isMetered: isMeteredConnection(),
    shouldFetch: shouldFetchData(),
    cacheDuration: getOptimalCacheDuration(),
    batchSize: getOptimalBatchSize(),
  });
}
