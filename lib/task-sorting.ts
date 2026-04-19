import { type Task, type TaskStatus } from "@/shared/types";

export type UrgencyLevel = "normal" | "orange" | "red";

/**
 * Calculate urgency level based on remaining time until deliveryTimeTo
 * Red dot appears when ≤1 hour (60 minutes) remaining
 */
export function calculateUrgency(
  task: Task,
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 60
): UrgencyLevel {
  if (!task.deliveryTimeTo) return "normal";

  const now = new Date();
  const deliveryEnd = new Date(task.deliveryTimeTo);
  const minutesRemaining = (deliveryEnd.getTime() - now.getTime()) / (1000 * 60);

  if (minutesRemaining <= urgencyThresholdRed) return "red";
  if (minutesRemaining <= urgencyThresholdOrange) return "orange";
  return "normal";
}

/**
 * Calculate urgency level from time string (HH:MM format)
 * Used for TaskCard display
 * Red dot appears when ≤1 hour (60 minutes) remaining
 */
export function calculateUrgencyFromTimeString(
  timeString: string | null | undefined,
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 60
): UrgencyLevel {
  if (!timeString) return "normal";

  try {
    const [hours, minutes] = timeString.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return "normal";

    const now = new Date();
    const deliveryEnd = new Date();
    deliveryEnd.setHours(hours, minutes, 0, 0);

    // If delivery time is in the past, it's urgent
    if (deliveryEnd < now) return "red";

    const minutesRemaining = (deliveryEnd.getTime() - now.getTime()) / (1000 * 60);

    if (minutesRemaining <= urgencyThresholdRed) return "red";
    if (minutesRemaining <= urgencyThresholdOrange) return "orange";
    return "normal";
  } catch {
    return "normal";
  }
}

/**
 * Get urgency color for display
 */
export function getUrgencyColor(urgency: UrgencyLevel): string {
  switch (urgency) {
    case "red":
      return "#EF4444"; // Red
    case "orange":
      return "#FF6D00"; // Orange
    default:
      return "transparent";
  }
}

/**
 * Status priority for sorting (lower number = higher priority)
 * New priority: Urgent (red dot, any status) > assigned > in_progress > completed > cancelled
 */
const STATUS_PRIORITY: Record<TaskStatus, number> = {
  assigned: 2,
  in_progress: 3,
  completed: 4,
  cancelled: 5,
};

/**
 * Sort tasks by urgency first, then status, then delivery time
 * Priority: Urgent (red dot, assigned/in_progress) > assigned > in_progress > completed > cancelled
 */
export function sortTasks(
  tasks: Task[],
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 30
): Task[] {
  return [...tasks].sort((a, b) => {
    // First, sort by urgency (red urgent tasks first across all statuses)
    const urgencyA = calculateUrgency(a, urgencyThresholdOrange, urgencyThresholdRed);
    const urgencyB = calculateUrgency(b, urgencyThresholdOrange, urgencyThresholdRed);

    // Only prioritize red urgency for assigned and in_progress statuses
    const isUrgentA = urgencyA === "red" && (a.status === "assigned" || a.status === "in_progress");
    const isUrgentB = urgencyB === "red" && (b.status === "assigned" || b.status === "in_progress");

    if (isUrgentA !== isUrgentB) {
      return isUrgentA ? -1 : 1; // Urgent tasks first
    }

    // Then, sort by status priority
    const statusDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Within same status, sort by urgency (more urgent first)
    const urgencyOrder: Record<UrgencyLevel, number> = { red: 0, orange: 1, normal: 2 };
    const urgencyDiff = urgencyOrder[urgencyA] - urgencyOrder[urgencyB];
    if (urgencyDiff !== 0) return urgencyDiff;

    // Finally, sort by delivery time (earlier first)
    if (a.deliveryTimeTo && b.deliveryTimeTo) {
      return new Date(a.deliveryTimeTo).getTime() - new Date(b.deliveryTimeTo).getTime();
    }

    return 0;
  });
}
