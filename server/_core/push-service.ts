/**
 * Expo Push Notification Service
 * Handles sending push notifications to couriers
 */

import axios from "axios";

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
      return true;
    }
    return false;
  } catch (error) {
    console.error("[Push] Failed to send notification:", error);
    return false;
  }
}

/**
 * Send push notifications to multiple devices
 */
export async function sendBulkPushNotifications(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<number> {
  let successCount = 0;

  for (const token of tokens) {
    const success = await sendPushNotification({
      to: token,
      title,
      body,
      data,
      priority: "high",
      sound: "default",
    });

    if (success) {
      successCount++;
    }
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
  return sendPushNotification({
    to: courierToken,
    title: "Новая заявка",
    body: `Новая доставка для ${recipientName}`,
    data: {
      taskId: taskId.toString(),
      type: "new_task",
    },
    priority: "high",
    sound: "default",
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

  return sendPushNotification({
    to: courierToken,
    title: "Изменение статуса",
    body: `Статус заявки изменился на: ${statusText}`,
    data: {
      taskId: taskId.toString(),
      status,
      type: "status_change",
    },
    priority: "high",
    sound: "default",
  });
}
