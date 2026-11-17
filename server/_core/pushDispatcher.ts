import { sql } from "drizzle-orm";
import * as db from "../db";
import { getActiveCourierPushDevices } from "./courierPushDevices";
import { isExpoPushToken, sendExpoPush } from "./expoPush";
import { sendFcmPush } from "./firebasePush";

export type PushDeliveryResult = {
  courierId: number;
  accepted: boolean;
  acceptedCount: number;
  failedCount: number;
};

type PushTarget = {
  courierId: number;
  token: string;
  provider: "expo" | "fcm";
};

export async function sendPushToCouriers(
  courierIds: number[],
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<PushDeliveryResult[]> {
  const ids = [...new Set(courierIds)].filter(
    id => Number.isSafeInteger(id) && id > 0,
  );

  if (ids.length === 0) return [];

  const couriers = await db.getAllCouriers();
  const active = couriers.filter(c => ids.includes(c.id));
  const devices = await getActiveCourierPushDevices(active.map(c => c.id));

  const targets: PushTarget[] = [];
  const seenTokens = new Set<string>();

  for (const courier of active) {
    const registered = devices.filter(d => d.courierId === courier.id);

    for (const device of registered) {
      if (seenTokens.has(device.pushToken)) continue;

      if (
        device.provider === "expo" &&
        !isExpoPushToken(device.pushToken)
      ) continue;

      if (
        device.provider === "fcm" &&
        isExpoPushToken(device.pushToken)
      ) continue;

      seenTokens.add(device.pushToken);
      targets.push({
        courierId: courier.id,
        token: device.pushToken,
        provider: device.provider,
      });
    }

    // Legacy Expo fallback is used only when no new device
    // registration exists for this courier.
    if (
      registered.length === 0 &&
      isExpoPushToken(courier.pushToken) &&
      courier.pushToken &&
      !seenTokens.has(courier.pushToken)
    ) {
      seenTokens.add(courier.pushToken);
      targets.push({
        courierId: courier.id,
        token: courier.pushToken,
        provider: "expo",
      });
    }
  }

  const results = await Promise.allSettled(
    targets.map(async target => {
      if (target.provider === "expo") {
        return sendExpoPush(target.token, title, body, data);
      }

      const result = await sendFcmPush(
        target.token,
        title,
        body,
        data,
      );

      if (result.invalidToken) {
        try {
          const connection = await db.getDb();
          if (connection) {
            await connection.execute(sql`
              UPDATE courier_push_devices
              SET is_active = FALSE,
                  updated_at = NOW()
              WHERE push_token = ${target.token}
                AND courier_id = ${target.courierId}
            `);
          }
        } catch {
          console.error("[PUSH] failed to deactivate invalid FCM token");
        }
      }

      return result.ok;
    }),
  );

  const summary = new Map<number, PushDeliveryResult>();

  for (const id of ids) {
    summary.set(id, {
      courierId: id,
      accepted: false,
      acceptedCount: 0,
      failedCount: 0,
    });
  }

  results.forEach((result, index) => {
    const target = targets[index];
    const item = summary.get(target.courierId);
    if (!item) return;

    if (result.status === "fulfilled" && result.value === true) {
      item.accepted = true;
      item.acceptedCount++;
    } else {
      item.failedCount++;
    }
  });

  console.log("[PUSH_DISPATCH]", {
    couriers: ids.length,
    targets: targets.length,
    accepted: results.filter(
      r => r.status === "fulfilled" && r.value === true,
    ).length,
    failed: results.filter(
      r => r.status === "rejected" ||
        (r.status === "fulfilled" && r.value !== true),
    ).length,
  });

  return [...summary.values()];
}
