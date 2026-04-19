/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ─── Courier App Shared Types ─────────────────────────────────────────────────

export type TaskStatus =
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

export type PackageType = "document" | "small" | "medium" | "large" | "fragile";

export interface TaskStatusMeta {
  label: string;
  color: string;
}

export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  assigned:    { label: "Новая",     color: "#3B82F6" },
  in_progress: { label: "В работе",  color: "#F97316" },
  completed:   { label: "Выполнено", color: "#22C55E" },
  cancelled:   { label: "Отменено",  color: "#EF4444" },
};

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  document: "Документы",
  small:    "Малая посылка",
  medium:   "Средняя посылка",
  large:    "Крупная посылка",
  fragile:  "Хрупкий груз",
};


export type MailStatus = "not_delivered" | "delivered";

export interface MailStatusMeta {
  label: string;
  color: string;
}

export const MAIL_STATUS_META: Record<MailStatus, MailStatusMeta> = {
  not_delivered: { label: "Не доставлено", color: "#3B82F6" },
  delivered:     { label: "Доставлено",    color: "#22C55E" },
};
