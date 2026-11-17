import { sql } from "drizzle-orm";
import { getDb } from "../db";

export type PushPlatform = "android" | "ios";
export type PushProvider = "fcm" | "expo";

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function registerCourierPushDevice(input: {
  courierId: number;
  installationId: string;
  platform: PushPlatform;
  provider: PushProvider;
  pushToken: string;
}) {
  const db = requireDb(await getDb());

  await db.transaction(async (tx: any) => {
    // Serialize registrations by token and installation.
    // A global transaction advisory lock avoids races involving
    // different couriers and installations.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(711931789436)
    `);

    await tx.execute(sql`
      DELETE FROM courier_push_devices
      WHERE push_token = ${input.pushToken}
         OR installation_id = ${input.installationId}
    `);

    // Remove a matching legacy Expo owner before assigning this token.
    // FCM and Expo tokens cannot be correlated without installation identity.
    await tx.execute(sql`
      UPDATE couriers
      SET "pushToken" = NULL
      WHERE "pushToken" = ${input.pushToken}
        AND id <> ${input.courierId}
    `);

    await tx.execute(sql`
      INSERT INTO courier_push_devices (
        courier_id,
        installation_id,
        platform,
        provider,
        push_token,
        is_active,
        created_at,
        updated_at,
        last_registered_at
      ) VALUES (
        ${input.courierId},
        ${input.installationId},
        ${input.platform},
        ${input.provider},
        ${input.pushToken},
        TRUE,
        NOW(),
        NOW(),
        NOW()
      )
    `);
  });

  return { success: true };
}

export async function registerLegacyCourierPushToken(input: {
  courierId: number;
  pushToken: string;
  expectedPushToken?: string;
}) {
  const database = requireDb(await getDb());

  return database.transaction(async (tx: any) => {
    // Shared with modern device registration to serialize ownership changes.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(711931789436)
    `);

    if (input.pushToken === "") {
      if (input.expectedPushToken) {
        await tx.execute(sql`
          UPDATE couriers
          SET "pushToken" = NULL
          WHERE id = ${input.courierId}
            AND "pushToken" = ${input.expectedPushToken}
        `);
      } else {
        await tx.execute(sql`
          UPDATE couriers
          SET "pushToken" = NULL
          WHERE id = ${input.courierId}
        `);
      }

      return { success: true };
    }

    // A legacy token can have only one courier owner.
    await tx.execute(sql`
      UPDATE couriers
      SET "pushToken" = NULL
      WHERE "pushToken" = ${input.pushToken}
        AND id <> ${input.courierId}
    `);

    // A token registered through the modern API must not also remain
    // assigned to a different courier through the device table.
    await tx.execute(sql`
      DELETE FROM courier_push_devices
      WHERE push_token = ${input.pushToken}
        AND courier_id <> ${input.courierId}
    `);

    await tx.execute(sql`
      UPDATE couriers
      SET "pushToken" = ${input.pushToken}
      WHERE id = ${input.courierId}
    `);

    return { success: true };
  });
}

export async function unregisterCourierPushDevice(input: {
  courierId: number;
  installationId: string;
  pushToken: string;
}) {
  const db = requireDb(await getDb());

  await db.execute(sql`
    DELETE FROM courier_push_devices
    WHERE courier_id = ${input.courierId}
      AND installation_id = ${input.installationId}
      AND push_token = ${input.pushToken}
  `);

  return { success: true };
}

export async function getActiveCourierPushDevices(courierIds: number[]) {
  if (courierIds.length === 0) return [];

  const db = requireDb(await getDb());

  const result = await db.execute(sql`
    SELECT
      courier_id AS "courierId",
      push_token AS "pushToken",
      provider,
      platform
    FROM courier_push_devices
    WHERE is_active = TRUE
      AND courier_id IN (${sql.join(
        courierIds.map(id => sql`${id}`),
        sql`, `,
      )})
  `);

  return Array.from(result as Iterable<{
    courierId: number;
    pushToken: string;
    provider: PushProvider;
    platform: PushPlatform;
  }>);
}
