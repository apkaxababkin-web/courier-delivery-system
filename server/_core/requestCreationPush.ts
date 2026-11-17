import * as db from "../db";
import { sendPushToCouriers } from "./pushDispatcher";
import { buildNewRequestPush } from "./requestPushPresentation";

const timeZone = "Asia/Irkutsk";

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function isRequestScheduledForToday(value: unknown) {
  if (!value) return true;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return false;
  return dateKey(date) === dateKey(new Date());
}

export async function sendNewRequestPush(requestId: number, taskId: number | null) {
  if (!taskId) {
    console.warn("[REQUEST_PUSH] task not ready", requestId);
    return false;
  }

  const request = await db.getRequestById(requestId);
  if (!request || !isRequestScheduledForToday(request.scheduledAt)) {
    return false;
  }

  const push = buildNewRequestPush(request);
  const couriers = await db.getAllCouriers();
  const results = await sendPushToCouriers(
    couriers.map(c => c.id),
    push.title,
    push.body,
    {
      type: "new_request_available",
      requestId,
      taskId,
      requestType: request.requestType,
    },
  );

  const accepted = results.reduce(
    (total, result) => total + result.acceptedCount, 0,
  );
  const failed = results.reduce(
    (total, result) => total + result.failedCount, 0,
  );

  const assignedCourierAccepted = request.courierId
    ? results.some(
        result =>
          result.courierId === request.courierId &&
          result.accepted,
      )
    : accepted > 0;

  console.log("[REQUEST_PUSH]", requestId, "accepted", accepted, "failed", failed);

  if (request.scheduledAt && assignedCourierAccepted) {
    await db.updateRequest(requestId, {
      scheduledPushSentAt: new Date(),
    });
  }

  return accepted > 0;
}
