/**
 * Expo Push Notification Service
 * Handles sending push notifications to couriers
 */

import axios from "axios";
import { logPushEvent } from "./push-analytics";
import { sendPushWithRetry, DEFAULT_RETRY_CONFIG } from "./push-retry";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

export interface PushNotificationPayload {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  priority?: "default" | "high";
}

/**
 * Send a push notification to a single device via Expo
 */
export async function sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
  try {
    const response = await axios.post(EXPO_PUSH_API_URL, payload, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });

    if (response.status === 200) {
      console.log(`[Push] Notification sent to ${payload.to}`);
      logPushEvent({
        type: "sent",
        courierToken: payload.to,
        taskId: payload.data?.taskId ? parseInt(payload.data.taskId) : undefined,
        message: payload.title,
      });
      return true;
    }
    logPushEvent({
      type: "failed",
      courierToken: payload.to,
      taskId: payload.data?.taskId ? parseInt(payload.data.taskId) : undefined,
      message: `HTTP ${response.status}`,
    });
    return false;
  } catch (error) {
    console.error("[Push] Failed to send notification:", error);
    logPushEvent({
      type: "error",
      courierToken: payload.to,
      taskId: payload.data?.taskId ? parseInt(payload.data.taskId) : undefined,
      message: payload.title,
      errorDetails: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Send push notifications to multiple devices with batching and concurrency control
 * Sends up to 10 notifications concurrently to avoid overwhelming the API
 */
export async function sendBulkPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  const BATCH_SIZE = 10; // Send 10 notifications concurrently
  let successCount = 0;

  // Process tokens in batches
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    
    // Send all notifications in this batch concurrently
    const results = await Promise.all(
      batch.map((token) =>
        sendPushNotification({
          to: token,
          title,
          body,
          data,
          priority: "high",
          sound: "default",
        })
      )
    );

    // Count successes
    successCount += results.filter((success) => success).length;
  }

  console.log(`[Push] Sent ${successCount}/${tokens.length} notifications`);
  return successCount;
}

/**
 * Send a new task notification to a courier
 */
export async function notifyNewTask(
  courierToken: string,
  taskId: number,
  recipientName: string
): Promise<boolean> {
  const payload = {
    to: courierToken,
    title: "Новая заявка",
    body: `Новая доставка для ${recipientName}`,
    data: {
      taskId: taskId.toString(),
      type: "new_task",
      url: `task/${taskId}`,
    },
    priority: "high" as const,
    sound: "default",
  };

  // Use retry logic for new task notifications (important)
  return sendPushWithRetry({
    payload,
    maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
    initialDelayMs: DEFAULT_RETRY_CONFIG.initialDelayMs,
  });
}

/**
 * Send a task status change notification to a courier
 */
export async function notifyTaskStatusChange(
  courierToken: string,
  taskId: number,
  status: string
): Promise<boolean> {
  const statusText = {
    "assigned": "Назначена",
    "in_progress": "В работе",
    "completed": "Завершена",
    "cancelled": "Отменена",
  }[status] || status;

  const payload = {
    to: courierToken,
    title: "Изменение статуса",
    body: `Статус заявки изменился на: ${statusText}`,
    data: {
      taskId: taskId.toString(),
      status,
      type: "status_change",
      url: `task/${taskId}`,
    },
    priority: "high" as const,
    sound: "default",
  };

  // Use retry logic for status change notifications
  return sendPushWithRetry({
    payload,
    maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
    initialDelayMs: DEFAULT_RETRY_CONFIG.initialDelayMs,
  });
}
