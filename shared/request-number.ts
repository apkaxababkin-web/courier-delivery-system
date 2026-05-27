export function getDisplayRequestId(task: any): string | number {
  if (task?.requestId) return task.requestId;

  const match = String(task?.comments || "").match(/\[request:(\d+)\]/);
  if (match?.[1]) return match[1];

  return task?.id ?? "—";
}
