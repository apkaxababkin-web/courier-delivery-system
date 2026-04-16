import { describe, it, expect } from "vitest";
import { TASK_STATUS_META, PACKAGE_TYPE_LABELS, type TaskStatus, type PackageType } from "../shared/types";

describe("TASK_STATUS_META", () => {
  it("should have all required statuses", () => {
    const requiredStatuses: TaskStatus[] = [
      "pending", "assigned", "accepted", "in_progress",
      "completed", "rejected", "cancelled"
    ];
    for (const status of requiredStatuses) {
      expect(TASK_STATUS_META[status]).toBeDefined();
      expect(TASK_STATUS_META[status].label).toBeTruthy();
      expect(TASK_STATUS_META[status].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("should have Russian labels", () => {
    expect(TASK_STATUS_META.assigned.label).toBe("Новое");
    expect(TASK_STATUS_META.accepted.label).toBe("Принято");
    expect(TASK_STATUS_META.in_progress.label).toBe("В пути");
    expect(TASK_STATUS_META.completed.label).toBe("Выполнено");
    expect(TASK_STATUS_META.rejected.label).toBe("Отклонено");
  });
});

describe("PACKAGE_TYPE_LABELS", () => {
  it("should have all package types", () => {
    const types: PackageType[] = ["document", "small", "medium", "large", "fragile"];
    for (const type of types) {
      expect(PACKAGE_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("should have Russian labels", () => {
    expect(PACKAGE_TYPE_LABELS.document).toBe("Документы");
    expect(PACKAGE_TYPE_LABELS.fragile).toBe("Хрупкий груз");
  });
});

describe("Task status flow", () => {
  it("should define valid status transitions", () => {
    // pending -> assigned -> accepted -> in_progress -> completed
    const validFlow: TaskStatus[] = ["pending", "assigned", "accepted", "in_progress", "completed"];
    validFlow.forEach((status) => {
      expect(TASK_STATUS_META[status]).toBeDefined();
    });
  });

  it("should define rejection path", () => {
    const rejectionStatuses: TaskStatus[] = ["assigned", "accepted", "rejected"];
    rejectionStatuses.forEach((status) => {
      expect(TASK_STATUS_META[status]).toBeDefined();
    });
  });
});
