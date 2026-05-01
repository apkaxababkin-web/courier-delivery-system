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

// ─── Request Types (Создание заявки) ─────────────────────────────────────────

export type RequestType =
  | "delivery"      // Доставка
  | "movement"      // Перемещение
  | "nuts"          // Орехи
  | "courier_call"  // Вызов курьера
  | "pickup_from_tc" // Забор груза с ТК
  | "simple";       // Простая заявка

export type RequestStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface RequestTypeMeta {
  label: string;
  description: string;
  icon: string;
}

export const REQUEST_TYPE_META: Record<RequestType, RequestTypeMeta> = {
  delivery: {
    label: "Доставка",
    description: "Доставка посылки от клиента до получателя",
    icon: "📦",
  },
  movement: {
    label: "Перемещение",
    description: "Перемещение груза между точками",
    icon: "🚚",
  },
  nuts: {
    label: "Орехи",
    description: "Сбор и доставка орехов",
    icon: "🥜",
  },
  courier_call: {
    label: "Вызов курьера",
    description: "Вызов курьера для срочной доставки",
    icon: "📞",
  },
  pickup_from_tc: {
    label: "Забор груза с ТК",
    description: "Забор груза с транспортной компании",
    icon: "📮",
  },
  simple: {
    label: "Простая заявка",
    description: "Простая заявка без специальных требований",
    icon: "📝",
  },
};

export interface RequestStatusMeta {
  label: string;
  color: string;
}

export const REQUEST_STATUS_META: Record<RequestStatus, RequestStatusMeta> = {
  pending:     { label: "В ожидании",   color: "#6B7280" },
  assigned:    { label: "Назначена",    color: "#3B82F6" },
  in_progress: { label: "В работе",     color: "#F97316" },
  completed:   { label: "Выполнена",    color: "#22C55E" },
  cancelled:   { label: "Отменена",     color: "#EF4444" },
};
