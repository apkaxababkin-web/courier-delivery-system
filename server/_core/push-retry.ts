/**
 * Push Notification Retry Service
 * Implements exponential backoff for failed push notifications
 */

import { sendPushNotification, type PushNotificationPayload } from "./push-service";
import { logPushEvent } from "./push-analytics";

export interface RetryableNotification {
  payload: PushNotificationPayload;
  maxRetries: number;
  initialDelayMs: number;
}

/**
 * Calculate delay with exponential backoff
 * Formula: initialDelayMs * (2 ^ retryCount) + random jitter
 */
function getBackoffDelay(retryCount: number, initialDelayMs: number = 1000): number {
  const exponentialDelay = initialDelayMs * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000; // Add 0-1000ms jitter to prevent thundering herd
  return exponentialDelay + jitter;
}

/**
 * Send push notification with retry logic
 * Retries on failure with exponential backoff
 */
export async function sendPushWithRetry(
  notification: RetryableNotification,
  retryCount: number = 0
): Promise<boolean> {
  try {
    const success = await sendPushNotification(notification.payload);

    if (success) {
      return true;
    }

    // If max retries not reached, schedule retry
    if (retryCount < notification.maxRetries) {
      const delay = getBackoffDelay(retryCount, notification.initialDelayMs);
      console.log(
        `[Push Retry] Scheduling retry ${retryCount + 1}/${notification.maxRetries} after ${Math.round(delay)}ms`
      );

      // Schedule retry
      setTimeout(() => {
        sendPushWithRetry(notification, retryCount + 1);
      }, delay);

      return false;
    }

    // Max retries reached
    console.error(
      `[Push Retry] Max retries (${notification.maxRetries}) reached for token: ${notification.payload.to}`
    );
    logPushEvent({
      type: "failed",
      courierToken: notification.payload.to,
      taskId: notification.payload.data?.taskId
        ? parseInt(notification.payload.data.taskId)
        : undefined,
      message: `Failed after ${notification.maxRetries} retries`,
      retryCount: notification.maxRetries,
    });

    return false;
  } catch (error) {
    console.error("[Push Retry] Error during retry:", error);

    if (retryCount < notification.maxRetries) {
      const delay = getBackoffDelay(retryCount, notification.initialDelayMs);
      console.log(
        `[Push Retry] Scheduling retry ${retryCount + 1}/${notification.maxRetries} after ${Math.round(delay)}ms`
      );

      setTimeout(() => {
        sendPushWithRetry(notification, retryCount + 1);
      }, delay);

      return false;
    }

    logPushEvent({
      type: "error",
      courierToken: notification.payload.to,
      taskId: notification.payload.data?.taskId
        ? parseInt(notification.payload.data.taskId)
        : undefined,
      message: `Error after ${notification.maxRetries} retries`,
      retryCount: notification.maxRetries,
      errorDetails: error instanceof Error ? error.message : String(error),
    });

    return false;
  }
}

/**
 * Send bulk notifications with retry logic
 */
export async function sendBulkPushWithRetry(
  payloads: PushNotificationPayload[],
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<number> {
  const BATCH_SIZE = 10;
  let successCount = 0;

  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map((payload) =>
        sendPushWithRetry({
          payload,
          maxRetries,
          initialDelayMs,
        })
      )
    );

    successCount += results.filter((success) => success).length;
  }

  console.log(`[Push Retry] Sent ${successCount}/${payloads.length} notifications with retry logic`);
  return successCount;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
};

/**
 * Aggressive retry configuration (for critical notifications)
 */
export const AGGRESSIVE_RETRY_CONFIG = {
  maxRetries: 5,
  initialDelayMs: 500, // 500ms
};
