import type { NextFunction, Request, Response } from "express";
import { verifyCourierToken, verifyManagerToken } from "../routers";

const MANAGER_TPRC_PREFIXES = [
  "managerTasks.",
  "managerMails.",
  "requests.",
  "clients.",
  "ai.",
];

const MANAGER_TPRC_PROCEDURES = new Set([
  "manager.couriers",
  "manager.createCourier",
  "managerAuth.getDemoToken",
  "mails.notDelivered",
  "hemotest.points",
  "hemotest.create",
  "hemotest.createList",
  "hemotest.listsForDate",
  "hemotest.getList",
  "hemotest.addPointToList",
  "hemotest.removePointFromList",
  "hemotest.updatePoint",
  "hemotest.deletePoint",
  "sberbank.points",
  "sberbank.create",
  "sberbank.scheduleForDay",
  "sberbank.setScheduleForDay",
  "sberbank.createList",
  "sberbank.listsForDate",
  "sberbank.listsForDay",
  "sberbank.getList",
  "sberbank.addPointToList",
  "sberbank.removePointFromList",
  "sberbank.updatePoint",
  "sberbank.deletePoint",
]);

const SHARED_AUTH_TPRC_PROCEDURES = new Set([
  "tasks.setStatus",
  "tasks.reschedule",
  "tasks.updateDate",
  "rescheduleTask",
]);

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function jsonAuthError(res: Response, status: 401 | 403, message: string) {
  res.status(status).json({
    error: {
      code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message,
    },
  });
}

export async function requireManagerAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    jsonAuthError(res, 401, "Manager authorization required");
    return;
  }

  const manager = await verifyManagerToken(token);
  if (!manager) {
    jsonAuthError(res, 403, "Invalid manager token");
    return;
  }

  res.locals.manager = manager;
  next();
}

export async function requireManagerOrCourierAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    jsonAuthError(res, 401, "Authorization required");
    return;
  }

  const manager = await verifyManagerToken(token);
  if (manager) {
    res.locals.manager = manager;
    next();
    return;
  }

  const courier = await verifyCourierToken(token);
  if (courier) {
    res.locals.courier = courier;
    next();
    return;
  }

  jsonAuthError(res, 403, "Invalid authorization token");
}

function isManagerTrpcPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/trpc/")) return false;

  const encodedProcedures = pathname.slice("/api/trpc/".length);
  const procedures = decodeURIComponent(encodedProcedures).split(",");

  return procedures.some(
    (procedure) =>
      MANAGER_TPRC_PROCEDURES.has(procedure) ||
      MANAGER_TPRC_PREFIXES.some((prefix) => procedure.startsWith(prefix)),
  );
}

export async function managerApiAuthGate(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/manager/chat/messages") {
    await requireManagerOrCourierAuth(req, res, next);
    return;
  }

  if (
    req.path.startsWith("/api/manager/") &&
    !(req.method === "GET" && /^\/api\/manager\/requests\/\d+\/attachments$/.test(req.path))
  ) {
    await requireManagerAuth(req, res, next);
    return;
  }

  if (req.path === "/api/realtime/manager" || isManagerTrpcPath(req.path)) {
    await requireManagerAuth(req, res, next);
    return;
  }

  if (
    req.path.startsWith("/api/trpc/") &&
    decodeURIComponent(req.path.slice("/api/trpc/".length))
      .split(",")
      .some((procedure) => SHARED_AUTH_TPRC_PROCEDURES.has(procedure))
  ) {
    await requireManagerOrCourierAuth(req, res, next);
    return;
  }

  next();
}
