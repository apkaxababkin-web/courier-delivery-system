import type { Response } from "express";

type LiveClient = {
  id: number;
  res: Response;
};

const liveClients = new Map<number, LiveClient>();
let liveClientSeq = 1;

export function addLiveClient(res: Response): number {
  const id = liveClientSeq++;
  liveClients.set(id, { id, res });
  return id;
}

export function removeLiveClient(id: number) {
  liveClients.delete(id);
}

export function sendLiveEvent(res: Response, type: string, payload: Record<string, unknown> = {}) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify({ type, at: new Date().toISOString(), ...payload })}\n\n`);
}

export function broadcastLive(type = "data_changed", payload: Record<string, unknown> = {}) {
  for (const [id, client] of liveClients) {
    try {
      sendLiveEvent(client.res, type, payload);
    } catch {
      liveClients.delete(id);
    }
  }
}
