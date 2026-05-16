import { type Task, type TaskStatus } from "@/shared/types";

export type UrgencyLevel = "normal" | "orange" | "red";

/**
 * Calculate urgency level based on remaining time until deliveryTimeTo
 */
export function calculateUrgency(
  task: Task,
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 30
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
 */
export function calculateUrgencyFromTimeString(
  timeString: string | null | undefined,
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 30
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
 */
const STATUS_PRIORITY: Record<TaskStatus, number> = {
  assigned: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
};

/**
 * Sort tasks by status and urgency
 * Priority: pending/assigned (by urgency) → in_progress (by urgency) → completed → cancelled
 */
export function sortTasks(
  tasks: Task[],
  urgencyThresholdOrange: number = 60,
  urgencyThresholdRed: number = 30
): Task[] {
  return [...tasks].sort((a, b) => {
    // First, sort by status priority (default to 5 for unknown statuses)
    const priorityA = STATUS_PRIORITY[a.status] ?? 5;
    const priorityB = STATUS_PRIORITY[b.status] ?? 5;
    const statusDiff = priorityA - priorityB;
    if (statusDiff !== 0) return statusDiff;

    // Within same status, sort by urgency (more urgent first)
    const urgencyA = calculateUrgency(a, urgencyThresholdOrange, urgencyThresholdRed);
    const urgencyB = calculateUrgency(b, urgencyThresholdOrange, urgencyThresholdRed);

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
