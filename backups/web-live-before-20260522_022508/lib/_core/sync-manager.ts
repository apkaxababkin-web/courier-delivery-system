/**
 * Sync Manager
 * Manages synchronization of offline changes with the server
 */

import {
  getSyncQueue,
  addToSyncQueue,
  removeFromSyncQueue,
  updateSyncQueueItem,
  setLastSyncTime,
  type SyncQueueItem,
} from "./offline-db";
import { getNetworkState } from "./battery-optimization";

export type ConflictResolutionStrategy = "last-write-wins" | "server-wins" | "manual";

export interface SyncResult {
  success: boolean;
  itemId: string;
  error?: string;
  conflictDetected?: boolean;
}

export interface SyncStats {
  totalItems: number;
  successCount: number;
  failureCount: number;
  conflictCount: number;
  duration: number;
}

// Sync callbacks for different resource types
type SyncCallback = (item: SyncQueueItem) => Promise<void>;
const syncCallbacks: Map<string, SyncCallback> = new Map();

// Sync state
let isSyncing = false;
let syncListeners: Set<(stats: SyncStats) => void> = new Set();

/**
 * Register sync callback for a resource type
 */
export function registerSyncCallback(resource: string, callback: SyncCallback): void {
  syncCallbacks.set(resource, callback);
  console.log("[SyncManager] Registered callback for:", resource);
}

/**
 * Queue a task change for offline sync
 */
export async function queueTaskChange(
  type: "create" | "update" | "delete",
  taskData: any
): Promise<void> {
  try {
    await addToSyncQueue({
      type,
      resource: "task",
      data: taskData,
    });

    console.log("[SyncManager] Queued task", type, ":", taskData.id);
  } catch (error) {
    console.error("[SyncManager] Failed to queue task change:", error);
  }
}

/**
 * Queue a location update for offline sync
 */
export async function queueLocationUpdate(location: any): Promise<void> {
  try {
    await addToSyncQueue({
      type: "update",
      resource: "location",
      data: location,
    });

    console.log("[SyncManager] Queued location update");
  } catch (error) {
    console.error("[SyncManager] Failed to queue location update:", error);
  }
}

/**
 * Queue a status change for offline sync
 */
export async function queueStatusChange(taskId: number, newStatus: string): Promise<void> {
  try {
    await addToSyncQueue({
      type: "update",
      resource: "status",
      data: { taskId, status: newStatus },
    });

    console.log("[SyncManager] Queued status change for task:", taskId);
  } catch (error) {
    console.error("[SyncManager] Failed to queue status change:", error);
  }
}

/**
 * Sync all queued changes with the server
 */
export async function syncAllChanges(
  conflictStrategy: ConflictResolutionStrategy = "last-write-wins"
): Promise<SyncStats> {
  if (isSyncing) {
    console.warn("[SyncManager] Sync already in progress");
    return {
      totalItems: 0,
      successCount: 0,
      failureCount: 0,
      conflictCount: 0,
      duration: 0,
    };
  }

  const startTime = Date.now();
  isSyncing = true;

  try {
    const networkState = getNetworkState();
    if (!networkState.isConnected) {
      console.warn("[SyncManager] No internet connection, skipping sync");
      isSyncing = false;
      return {
        totalItems: 0,
        successCount: 0,
        failureCount: 0,
        conflictCount: 0,
        duration: 0,
      };
    }

    const queue = await getSyncQueue();
    console.log("[SyncManager] Starting sync with", queue.length, "items");

    let successCount = 0;
    let failureCount = 0;
    let conflictCount = 0;

    // Process each item in the queue
    for (const item of queue) {
      try {
        const result = await syncItem(item, conflictStrategy);

        if (result.success) {
          successCount++;
          await removeFromSyncQueue(item.id);
          console.log("[SyncManager] Synced successfully:", item.id);
        } else {
          failureCount++;

          if (result.conflictDetected) {
            conflictCount++;
          }

          // Update retry count
          await updateSyncQueueItem(item.id, {
            retries: item.retries + 1,
            lastError: result.error,
          });

          console.warn("[SyncManager] Sync failed:", item.id, result.error);
        }
      } catch (error) {
        failureCount++;
        console.error("[SyncManager] Error syncing item:", item.id, error);
      }
    }

    const duration = Date.now() - startTime;
    const stats: SyncStats = {
      totalItems: queue.length,
      successCount,
      failureCount,
      conflictCount,
      duration,
    };

    console.log("[SyncManager] Sync completed:", stats);

    // Update last sync time
    await setLastSyncTime(Date.now());

    // Notify listeners
    syncListeners.forEach((listener) => listener(stats));

    return stats;
  } catch (error) {
    console.error("[SyncManager] Sync failed:", error);
    return {
      totalItems: 0,
      successCount: 0,
      failureCount: 0,
      conflictCount: 0,
      duration: Date.now() - startTime,
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Sync a single item
 */
async function syncItem(
  item: SyncQueueItem,
  conflictStrategy: ConflictResolutionStrategy
): Promise<SyncResult> {
  try {
    // Get the callback for this resource type
    const callback = syncCallbacks.get(item.resource);

    if (!callback) {
      return {
        success: false,
        itemId: item.id,
        error: `No sync callback registered for resource: ${item.resource}`,
      };
    }

    // Call the callback to sync this item
    await callback(item);

    return {
      success: true,
      itemId: item.id,
    };
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";

    // Check if this is a conflict error
    const isConflict = errorMessage.includes("conflict") || error?.status === 409;

    return {
      success: false,
      itemId: item.id,
      error: errorMessage,
      conflictDetected: isConflict,
    };
  }
}

/**
 * Get sync queue status
 */
export async function getSyncStatus(): Promise<{
  isSyncing: boolean;
  queueLength: number;
  oldestItem?: SyncQueueItem;
}> {
  try {
    const queue = await getSyncQueue();
    const oldestItem = queue.length > 0 ? queue[0] : undefined;

    return {
      isSyncing,
      queueLength: queue.length,
      oldestItem,
    };
  } catch (error) {
    console.error("[SyncManager] Failed to get sync status:", error);
    return {
      isSyncing,
      queueLength: 0,
    };
  }
}

/**
 * Subscribe to sync completion events
 */
export function subscribeToDyncCompletion(
  callback: (stats: SyncStats) => void
): () => void {
  syncListeners.add(callback);

  return () => {
    syncListeners.delete(callback);
  };
}

/**
 * Manually trigger sync
 */
export async function triggerSync(): Promise<SyncStats> {
  console.log("[SyncManager] Manually triggering sync...");
  return syncAllChanges("last-write-wins");
}

/**
 * Clear sync queue (use with caution!)
 */
export async function clearSyncQueue(): Promise<void> {
  try {
    const queue = await getSyncQueue();
    console.warn("[SyncManager] Clearing sync queue with", queue.length, "items");

    // This is a destructive operation - typically only done on logout
    for (const item of queue) {
      await removeFromSyncQueue(item.id);
    }

    console.log("[SyncManager] Sync queue cleared");
  } catch (error) {
    console.error("[SyncManager] Failed to clear sync queue:", error);
  }
}

/**
 * Get retry statistics
 */
export async function getRetryStats(): Promise<{
  totalRetries: number;
  maxRetries: number;
  itemsNeedingRetry: number;
}> {
  try {
    const queue = await getSyncQueue();

    const totalRetries = queue.reduce((sum, item) => sum + item.retries, 0);
    const maxRetries = Math.max(...queue.map((item) => item.retries), 0);
    const itemsNeedingRetry = queue.filter((item) => item.retries > 0).length;

    return {
      totalRetries,
      maxRetries,
      itemsNeedingRetry,
    };
  } catch (error) {
    console.error("[SyncManager] Failed to get retry stats:", error);
    return {
      totalRetries: 0,
      maxRetries: 0,
      itemsNeedingRetry: 0,
    };
  }
}
