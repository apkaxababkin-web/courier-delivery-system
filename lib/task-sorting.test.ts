import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateUrgency, sortTasks } from "./task-sorting";
import type { Task } from "@/shared/types";

describe("calculateUrgency", () => {
  beforeEach(() => {
    // Mock current time to 14:00 for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 19, 14, 0, 0)); // April 19, 2026 14:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return 'red' for tasks with less than 30 minutes remaining", () => {
    // 14:20 - 20 minutes remaining
    const urgency = calculateUrgency({ deliveryTimeTo: "14:20" });
    expect(urgency).toBe("red");
  });

  it("should return 'orange' for tasks with 30-60 minutes remaining", () => {
    // 14:45 - 45 minutes remaining
    const urgency = calculateUrgency({ deliveryTimeTo: "14:45" });
    expect(urgency).toBe("orange");
  });

  it("should return 'normal' for tasks with more than 60 minutes remaining", () => {
    // 15:30 - 90 minutes remaining
    const urgency = calculateUrgency({ deliveryTimeTo: "15:30" });
    expect(urgency).toBe("normal");
  });

  it("should return 'normal' for tasks with no deliveryTimeTo", () => {
    const urgency = calculateUrgency({ deliveryTimeTo: null });
    expect(urgency).toBe("normal");
  });

  it("should handle invalid time format gracefully", () => {
    const urgency = calculateUrgency({ deliveryTimeTo: "invalid" });
    expect(urgency).toBe("normal");
  });
});

describe("sortTasks", () => {
  const mockTasks: Task[] = [
    {
      id: 1,
      status: "pending",
      deliveryTimeTo: "15:30", // normal urgency
      recipientName: "John",
      deliveryAddress: "123 Main St",
    } as Task,
    {
      id: 2,
      status: "pending",
      deliveryTimeTo: "14:20", // red urgency
      recipientName: "Jane",
      deliveryAddress: "456 Oak Ave",
    } as Task,
    {
      id: 3,
      status: "in_progress",
      deliveryTimeTo: "14:45", // orange urgency
      recipientName: "Bob",
      deliveryAddress: "789 Pine Rd",
    } as Task,
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 19, 14, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should sort by status priority first", () => {
    const sorted = sortTasks(mockTasks);
    // pending tasks (id 1, 2) should come before in_progress (id 3)
    const statusIndices = sorted.map((t) => t.status);
    expect(statusIndices.indexOf("pending")).toBeLessThan(statusIndices.indexOf("in_progress"));
  });

  it("should sort by urgency within same status", () => {
    const sorted = sortTasks(mockTasks);
    // Within pending status, red urgency (id 2) should come before normal (id 1)
    const pendingTasks = sorted.filter((t) => t.status === "pending");
    expect(pendingTasks[0].id).toBe(2); // red urgency first
    expect(pendingTasks[1].id).toBe(1); // normal urgency second
  });
});
