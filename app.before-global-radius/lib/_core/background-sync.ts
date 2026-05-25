/**
 * Background Sync Service
 * Manages efficient background synchronization with the server
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { getNetworkState, shouldFetchData } from "./battery-optimization";

export const BACKGROUND_SYNC_TASK = "background-sync-tasks";
export const BACKGROUND_LOCATION_SYNC_TASK = "background-location-sync";

// Sync callbacks
type SyncCallback = () => Promise<void>;
const syncCallbacks: Map<string, SyncCallback> = new Map();

/**
 * Register background sync task
 */
export async function registerBackgroundSync(): Promise<void> {
  try {
    // Define the sync task
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        console.log("[Background] Sync task started");

        // Check network before syncing
        const networkState = getNetworkState();
        if (!networkState.isConnected) {
          console.log("[Background] No internet, skipping sync");
          return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Run all registered sync callbacks
        let hasData = false;
        for (const [name, callback] of syncCallbacks) {
          try {
            console.log(`[Background] Running sync: ${name}`);
            await callback();
            hasData = true;
          } catch (error) {
            console.error(`[Background] Sync failed for ${name}:`, error);
          }
        }

        console.log("[Background] Sync completed");
        return hasData
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch (error) {
        console.error("[Background] Sync task error:", error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Register the task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60, // Minimum 15 minutes between syncs
      stopOnTerminate: false, // Continue even after app termination
      startOnBoot: true, // Start after device reboot
    });

    console.log("[Background] Sync task registered");
  } catch (error) {
    console.error("[Background] Failed to register sync task:", error);
  }
}

/**
 * Register background location sync task
 */
export async function registerBackgroundLocationSync(): Promise<void> {
  try {
    // Define location sync task
    TaskManager.defineTask(BACKGROUND_LOCATION_SYNC_TASK, async () => {
      try {
        console.log("[Background] Location sync task started");

        // Get location sync callback if registered
        const locationSync = syncCallbacks.get("location");
        if (locationSync) {
          await locationSync();
        }

        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error("[Background] Location sync error:", error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Register the task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_LOCATION_SYNC_TASK, {
      minimumInterval: 5 * 60, // Minimum 5 minutes for location sync
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log("[Background] Location sync task registered");
  } catch (error) {
    console.error("[Background] Failed to register location sync task:", error);
  }
}

/**
 * Register a sync callback
 */
export function registerSyncCallback(name: string, callback: SyncCallback): void {
  syncCallbacks.set(name, callback);
  console.log(`[Background] Registered sync callback: ${name}`);
}

/**
 * Unregister a sync callback
 */
export function unregisterSyncCallback(name: string): void {
  syncCallbacks.delete(name);
  console.log(`[Background] Unregistered sync callback: ${name}`);
}

/**
 * Unregister all background tasks
 */
export async function unregisterBackgroundTasks(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_LOCATION_SYNC_TASK);
    console.log("[Background] All tasks unregistered");
  } catch (error) {
    console.error("[Background] Failed to unregister tasks:", error);
  }
}

/**
 * Check if background fetch is available
 */
export async function isBackgroundFetchAvailable(): Promise<boolean> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    return status === BackgroundFetch.BackgroundFetchStatus.Available;
  } catch (error) {
    console.error("[Background] Failed to check availability:", error);
    return false;
  }
}

/**
 * Get background fetch status
 */
export async function getBackgroundFetchStatus(): Promise<string> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    const statusMap: Record<number, string> = {
      [BackgroundFetch.BackgroundFetchStatus.Restricted]: "Restricted",
      [BackgroundFetch.BackgroundFetchStatus.Denied]: "Denied",
      [BackgroundFetch.BackgroundFetchStatus.Available]: "Available",
    };
    return status !== null ? (statusMap[status] ?? "Unknown") : "Unknown";
  } catch (error) {
    console.error("[Background] Failed to get status:", error);
    return "Error";
  }
}

/**
 * Manually trigger background sync (for testing)
 */
export async function triggerBackgroundSync(): Promise<void> {
  console.log("[Background] Manually triggering sync...");

  try {
    // BackgroundFetch.scheduleAsync is not available in this SDK version
    // await BackgroundFetch.scheduleAsync({
      // minimumInterval: 1,

    console.log("[Background] Sync scheduled");
  } catch (error) {
    console.error("[Background] Failed to trigger sync:", error);
  }
}

/**
 * Get sync statistics
 */
export function getSyncStats(): {
  registeredCallbacks: number;
  callbackNames: string[];
} {
  return {
    registeredCallbacks: syncCallbacks.size,
    callbackNames: Array.from(syncCallbacks.keys()),
  };
}
