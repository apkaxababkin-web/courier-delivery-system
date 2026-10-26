import * as db from "../db";
import { isExpoPushToken, sendExpoPush } from "./expoPush";
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
  const targets = couriers.filter(c => isExpoPushToken(c.pushToken));

  const results = await Promise.allSettled(
    targets.map(c => sendExpoPush(c.pushToken, push.title, push.body, {
      type: "new_request_available",
      requestId,
      taskId,
      requestType: request.requestType,
    }))
  );

  const acceptedIndexes = results
    .map((result, index) =>
      result.status === "fulfilled" && result.value === true ? index : -1
    )
    .filter(index => index >= 0);

  const accepted = acceptedIndexes.length;
  const failed = targets.length - accepted;

  const assignedCourierAccepted = request.courierId
    ? acceptedIndexes.some(index => targets[index]?.id === request.courierId)
    : accepted > 0;

  console.log("[REQUEST_PUSH]", requestId, "accepted", accepted, "failed", failed);

  if (request.scheduledAt && assignedCourierAccepted) {
    await db.updateRequest(requestId, {
      scheduledPushSentAt: new Date(),
    });
  }

  return accepted > 0;
}
