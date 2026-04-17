/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ─── Courier App Shared Types ─────────────────────────────────────────────────

export type TaskStatus =
  | "pending"
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
  pending:     { label: "Ожидает",   color: "#6B7280" },
  assigned:    { label: "Новое",     color: "#1A73E8" },
  in_progress: { label: "В пути",    color: "#FF6D00" },
  completed:   { label: "Выполнено", color: "#34A853" },
  cancelled:   { label: "Отменено",  color: "#9CA3AF" },
};

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  document: "Документы",
  small:    "Малая посылка",
  medium:   "Средняя посылка",
  large:    "Крупная посылка",
  fragile:  "Хрупкий груз",
};
