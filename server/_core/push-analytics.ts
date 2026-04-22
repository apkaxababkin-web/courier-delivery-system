/**
 * Push Notification Analytics Service
 * Tracks push notification events for monitoring and debugging
 */

import { db } from "@/server/db";

export type PushEventType = "sent" | "failed" | "delivered" | "clicked" | "error";

export interface PushAnalyticsEvent {
  type: PushEventType;
  courierToken: string;
  courierEmail?: string;
  taskId?: number;
  message?: string;
  timestamp: Date;
  retryCount?: number;
  errorDetails?: string;
}

// In-memory event log (for development/monitoring)
const eventLog: PushAnalyticsEvent[] = [];
const MAX_LOG_SIZE = 1000;

/**
 * Log a push notification event
 */
export function logPushEvent(event: Omit<PushAnalyticsEvent, "timestamp">): void {
  const fullEvent: PushAnalyticsEvent = {
    ...event,
    timestamp: new Date(),
  };

  eventLog.push(fullEvent);

  // Keep log size manageable
  if (eventLog.length > MAX_LOG_SIZE) {
    eventLog.shift();
  }

  // Log to console for development
  const prefix = `[Push Analytics] ${event.type.toUpperCase()}`;
  const details = {
    task: event.taskId,
    courier: event.courierEmail || event.courierToken.slice(0, 10),
    message: event.message,
    retries: event.retryCount,
    error: event.errorDetails,
  };

  if (event.type === "failed" || event.type === "error") {
    console.error(prefix, details);
  } else {
    console.log(prefix, details);
  }
}

/**
 * Get recent push events (for debugging)
 */
export function getRecentPushEvents(limit: number = 50): PushAnalyticsEvent[] {
  return eventLog.slice(-limit);
}

/**
 * Get push statistics
 */
export function getPushStatistics(): {
  total: number;
  sent: number;
  failed: number;
  successRate: number;
} {
  const total = eventLog.length;
  const sent = eventLog.filter((e) => e.type === "sent").length;
  const failed = eventLog.filter((e) => e.type === "failed" || e.type === "error").length;

  return {
    total,
    sent,
    failed,
    successRate: total > 0 ? (sent / total) * 100 : 0,
  };
}

/**
 * Clear event log (for testing)
 */
export function clearPushEventLog(): void {
  eventLog.length = 0;
  console.log("[Push Analytics] Event log cleared");
}
