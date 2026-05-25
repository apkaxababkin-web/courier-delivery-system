/**
 * Offline Database Layer
 * Manages local data storage using MMKV for offline functionality
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface StoredTask {
  id: number;
  title: string;
  recipientName: string;
  address: string;
  status: "pending" | "assigned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  timeRemaining?: number;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  isLocal?: boolean;
}

export interface SyncQueueItem {
  id: string;
  type: "create" | "update" | "delete";
  resource: "task" | "location" | "status";
  data: any;
  timestamp: number;
  retries: number;
  lastError?: string;
}

const STORAGE_KEYS = {
  TASKS: "offline_tasks",
  SYNC_QUEUE: "offline_sync_queue",
  LAST_SYNC: "offline_last_sync",
  OFFLINE_MODE: "offline_mode",
};

/**
 * Initialize offline database
 */
export async function initOfflineDB(): Promise<void> {
  try {
    console.log("[OfflineDB] Initializing...");

    // Check if offline mode is enabled
    const offlineMode = await getOfflineMode();
    console.log("[OfflineDB] Offline mode enabled:", offlineMode);

    // Load sync queue
    const queue = await getSyncQueue();
    console.log("[OfflineDB] Sync queue items:", queue.length);
  } catch (error) {
    console.error("[OfflineDB] Failed to initialize:", error);
  }
}

/**
 * Save tasks to local storage
 */
export async function saveTasks(tasks: StoredTask[]): Promise<void> {
  try {
    const data = JSON.stringify(tasks);
    await AsyncStorage.setItem(STORAGE_KEYS.TASKS, data);
    console.log("[OfflineDB] Saved", tasks.length, "tasks");
  } catch (error) {
    console.error("[OfflineDB] Failed to save tasks:", error);
  }
}

/**
 * Load tasks from local storage
 */
export async function loadTasks(): Promise<StoredTask[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.TASKS);
    if (!data) {
      return [];
    }

    const tasks = JSON.parse(data) as StoredTask[];
    console.log("[OfflineDB] Loaded", tasks.length, "tasks");
    return tasks;
  } catch (error) {
    console.error("[OfflineDB] Failed to load tasks:", error);
    return [];
  }
}

/**
 * Get task by ID from local storage
 */
export async function getTaskById(taskId: number): Promise<StoredTask | null> {
  try {
    const tasks = await loadTasks();
    return tasks.find((t) => t.id === taskId) || null;
  } catch (error) {
    console.error("[OfflineDB] Failed to get task:", error);
    return null;
  }
}

/**
 * Add item to sync queue
 */
export async function addToSyncQueue(item: Omit<SyncQueueItem, "id" | "timestamp" | "retries">): Promise<void> {
  try {
    const queue = await getSyncQueue();

    const newItem: SyncQueueItem = {
      id: `${item.type}-${item.resource}-${Date.now()}`,
      timestamp: Date.now(),
      retries: 0,
      ...item,
    };

    queue.push(newItem);
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));

    console.log("[OfflineDB] Added to sync queue:", newItem.id);
  } catch (error) {
    console.error("[OfflineDB] Failed to add to sync queue:", error);
  }
}

/**
 * Get sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
    if (!data) {
      return [];
    }

    return JSON.parse(data) as SyncQueueItem[];
  } catch (error) {
    console.error("[OfflineDB] Failed to get sync queue:", error);
    return [];
  }
}

/**
 * Remove item from sync queue
 */
export async function removeFromSyncQueue(itemId: string): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const filtered = queue.filter((item) => item.id !== itemId);
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(filtered));

    console.log("[OfflineDB] Removed from sync queue:", itemId);
  } catch (error) {
    console.error("[OfflineDB] Failed to remove from sync queue:", error);
  }
}

/**
 * Update sync queue item (for retries)
 */
export async function updateSyncQueueItem(
  itemId: string,
  updates: Partial<SyncQueueItem>
): Promise<void> {
  try {
    const queue = await getSyncQueue();
    const index = queue.findIndex((item) => item.id === itemId);

    if (index !== -1) {
      queue[index] = { ...queue[index], ...updates };
      await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(queue));
      console.log("[OfflineDB] Updated sync queue item:", itemId);
    }
  } catch (error) {
    console.error("[OfflineDB] Failed to update sync queue item:", error);
  }
}

/**
 * Clear sync queue
 */
export async function clearSyncQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    console.log("[OfflineDB] Cleared sync queue");
  } catch (error) {
    console.error("[OfflineDB] Failed to clear sync queue:", error);
  }
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTime(): Promise<number | null> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return data ? parseInt(data, 10) : null;
  } catch (error) {
    console.error("[OfflineDB] Failed to get last sync time:", error);
    return null;
  }
}

/**
 * Set last sync timestamp
 */
export async function setLastSyncTime(timestamp: number): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, timestamp.toString());
    console.log("[OfflineDB] Updated last sync time:", new Date(timestamp).toISOString());
  } catch (error) {
    console.error("[OfflineDB] Failed to set last sync time:", error);
  }
}

/**
 * Enable offline mode
 */
export async function enableOfflineMode(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_MODE, "true");
    console.log("[OfflineDB] Offline mode enabled");
  } catch (error) {
    console.error("[OfflineDB] Failed to enable offline mode:", error);
  }
}

/**
 * Disable offline mode
 */
export async function disableOfflineMode(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_MODE, "false");
    console.log("[OfflineDB] Offline mode disabled");
  } catch (error) {
    console.error("[OfflineDB] Failed to disable offline mode:", error);
  }
}

/**
 * Get offline mode status
 */
export async function getOfflineMode(): Promise<boolean> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_MODE);
    return data === "true";
  } catch (error) {
    console.error("[OfflineDB] Failed to get offline mode:", error);
    return false;
  }
}

/**
 * Get offline database statistics
 */
export async function getOfflineStats(): Promise<{
  tasksCount: number;
  syncQueueCount: number;
  lastSyncTime: number | null;
  offlineMode: boolean;
  syncQueueSize: number;
}> {
  try {
    const tasks = await loadTasks();
    const queue = await getSyncQueue();
    const lastSync = await getLastSyncTime();
    const offlineMode = await getOfflineMode();

    const queueData = JSON.stringify(queue);
    const queueSize = new Blob([queueData]).size;

    return {
      tasksCount: tasks.length,
      syncQueueCount: queue.length,
      lastSyncTime: lastSync,
      offlineMode,
      syncQueueSize: queueSize,
    };
  } catch (error) {
    console.error("[OfflineDB] Failed to get stats:", error);
    return {
      tasksCount: 0,
      syncQueueCount: 0,
      lastSyncTime: null,
      offlineMode: false,
      syncQueueSize: 0,
    };
  }
}

/**
 * Clear all offline data
 */
export async function clearAllOfflineData(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TASKS,
      STORAGE_KEYS.SYNC_QUEUE,
      STORAGE_KEYS.LAST_SYNC,
    ]);
    console.log("[OfflineDB] Cleared all offline data");
  } catch (error) {
    console.error("[OfflineDB] Failed to clear offline data:", error);
  }
}
