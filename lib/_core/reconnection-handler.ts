/**
 * Reconnection Handler
 * Manages automatic sync when internet connection is restored
 */

import { subscribeToNetworkChanges, getNetworkState } from "./battery-optimization";
import { syncAllChanges, getSyncStatus } from "./sync-manager";

export interface ReconnectionConfig {
  autoSyncOnReconnect: boolean;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: ReconnectionConfig = {
  autoSyncOnReconnect: true,
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

let config = { ...DEFAULT_CONFIG };
let isMonitoring = false;
let reconnectionListeners: Set<(success: boolean) => void> = new Set();
let wasOffline = false;
let retryCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Start monitoring network changes
 */
export function startReconnectionMonitoring(): void {
  if (isMonitoring) {
    console.warn("[Reconnection] Monitoring already started");
    return;
  }

  isMonitoring = true;
  console.log("[Reconnection] Started monitoring");

  // Subscribe to network changes
  subscribeToNetworkChanges(async (networkState) => {
    const isNowOnline = networkState.isConnected && networkState.isInternetReachable;

    if (isNowOnline && wasOffline) {
      console.log("[Reconnection] Internet restored!");
      wasOffline = false;
      retryCount = 0;

      if (config.autoSyncOnReconnect) {
        await handleReconnection();
      }
    } else if (!isNowOnline && !wasOffline) {
      console.log("[Reconnection] Internet lost");
      wasOffline = true;
    }
  });
}

/**
 * Stop monitoring network changes
 */
export function stopReconnectionMonitoring(): void {
  isMonitoring = false;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  console.log("[Reconnection] Stopped monitoring");
}

/**
 * Handle reconnection event
 */
async function handleReconnection(): Promise<void> {
  try {
    console.log("[Reconnection] Handling reconnection...");

    const syncStatus = await getSyncStatus();

    if (syncStatus.queueLength === 0) {
      console.log("[Reconnection] No items to sync");
      notifyReconnectionListeners(true);
      return;
    }

    console.log("[Reconnection] Syncing", syncStatus.queueLength, "items");

    const result = await syncAllChanges("last-write-wins");

    if (result.failureCount === 0) {
      console.log("[Reconnection] Sync completed successfully");
      retryCount = 0;
      notifyReconnectionListeners(true);
    } else {
      console.warn("[Reconnection] Sync had failures, will retry");
      scheduleRetry();
    }
  } catch (error) {
    console.error("[Reconnection] Error during sync:", error);
    scheduleRetry();
  }
}

/**
 * Schedule retry with exponential backoff
 */
function scheduleRetry(): void {
  if (retryCount >= config.maxRetries) {
    console.error("[Reconnection] Max retries reached");
    notifyReconnectionListeners(false);
    return;
  }

  retryCount++;

  // Calculate delay with exponential backoff
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, retryCount - 1),
    config.maxDelayMs
  );

  // Add jitter (random 0-20% of delay)
  const jitter = delay * (Math.random() * 0.2);
  const finalDelay = delay + jitter;

  console.log(
    `[Reconnection] Scheduling retry ${retryCount}/${config.maxRetries} after ${finalDelay.toFixed(0)}ms`
  );

  if (retryTimeout) {
    clearTimeout(retryTimeout);
  }

  retryTimeout = setTimeout(async () => {
    const networkState = getNetworkState();
    if (networkState.isConnected && networkState.isInternetReachable) {
      await handleReconnection();
    } else {
      console.log("[Reconnection] No internet, will retry later");
      scheduleRetry();
    }
  }, finalDelay);
}

/**
 * Manually trigger reconnection sync
 */
export async function manualReconnectionSync(): Promise<void> {
  console.log("[Reconnection] Manual sync triggered");
  retryCount = 0;
  await handleReconnection();
}

/**
 * Update reconnection config
 */
export function updateReconnectionConfig(newConfig: Partial<ReconnectionConfig>): void {
  config = { ...config, ...newConfig };
  console.log("[Reconnection] Config updated:", config);
}

/**
 * Get current reconnection config
 */
export function getReconnectionConfig(): ReconnectionConfig {
  return { ...config };
}

/**
 * Subscribe to reconnection events
 */
export function subscribeToReconnection(
  callback: (success: boolean) => void
): () => void {
  reconnectionListeners.add(callback);

  return () => {
    reconnectionListeners.delete(callback);
  };
}

/**
 * Notify all listeners
 */
function notifyReconnectionListeners(success: boolean): void {
  reconnectionListeners.forEach((listener) => listener(success));
}

/**
 * Get reconnection status
 */
export function getReconnectionStatus(): {
  isMonitoring: boolean;
  wasOffline: boolean;
  retryCount: number;
  maxRetries: number;
  nextRetryIn?: number;
} {
  return {
    isMonitoring,
    wasOffline,
    retryCount,
    maxRetries: config.maxRetries,
  };
}

/**
 * Reset reconnection state
 */
export function resetReconnectionState(): void {
  retryCount = 0;
  wasOffline = false;
  if (retryTimeout) {
    clearTimeout(retryTimeout);
    retryTimeout = null;
  }
  console.log("[Reconnection] State reset");
}

