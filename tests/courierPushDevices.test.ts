import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
const transaction = vi.fn(async (callback: (tx: { execute: typeof execute }) => Promise<unknown>) =>
  callback({ execute }),
);

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => ({
    execute,
    transaction,
  })),
}));

import {
  registerCourierPushDevice,
  registerLegacyCourierPushToken,
  unregisterCourierPushDevice,
} from "../server/_core/courierPushDevices";

function sqlText(call: unknown[]): string {
  const query = call[0] as {
    queryChunks?: unknown[];
  };

  return (query.queryChunks ?? [])
    .map(chunk => {
      if (typeof chunk === "string") return chunk;
      if (
        chunk &&
        typeof chunk === "object" &&
        "value" in chunk &&
        Array.isArray((chunk as { value: unknown[] }).value)
      ) {
        return (chunk as { value: unknown[] }).value.join("");
      }
      return "?";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

beforeEach(() => {
  execute.mockReset();
  transaction.mockClear();
  execute.mockResolvedValue([]);
});

describe("courier push device registration", () => {
  it("registers FCM in a transaction with an ownership lock", async () => {
    await expect(registerCourierPushDevice({
      courierId: 1,
      installationId: "installation-one",
      platform: "android",
      provider: "fcm",
      pushToken: "fcm-token-12345678901234567890",
    })).resolves.toEqual({ success: true });

    const statements = execute.mock.calls.map(sqlText);

    expect(transaction).toHaveBeenCalledOnce();
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements.some(s => s.includes("DELETE FROM courier_push_devices"))).toBe(true);
    expect(statements.some(s => s.includes("INSERT INTO courier_push_devices"))).toBe(true);
  });

  it("removes conflicting device ownership before re-registration", async () => {
    await registerCourierPushDevice({
      courierId: 2,
      installationId: "shared-installation",
      platform: "android",
      provider: "fcm",
      pushToken: "fcm-token-abcdefghij1234567890",
    });

    const statements = execute.mock.calls.map(sqlText);
    const deletion = statements.find(s => s.includes("DELETE FROM courier_push_devices"));

    expect(deletion).toContain("push_token");
    expect(deletion).toContain("installation_id");
  });

  it("clears previous Expo ownership before assigning a token", async () => {
    await registerLegacyCourierPushToken({
      courierId: 2,
      pushToken: "ExponentPushToken[example123456789]",
    });

    const statements = execute.mock.calls.map(sqlText);

    expect(statements.some(s =>
      s.includes('UPDATE couriers') &&
      s.includes('"pushToken" = NULL') &&
      s.includes("id <>")
    )).toBe(true);

    expect(statements.some(s =>
      s.includes('UPDATE couriers') &&
      s.includes('"pushToken" =')
    )).toBe(true);
  });

  it("clears a legacy token conditionally on logout", async () => {
    await registerLegacyCourierPushToken({
      courierId: 1,
      pushToken: "",
      expectedPushToken: "ExponentPushToken[oldtoken123456]",
    });

    const statements = execute.mock.calls.map(sqlText);

    expect(statements.some(s =>
      s.includes('UPDATE couriers') &&
      s.includes('"pushToken" = NULL') &&
      s.includes('AND "pushToken" =')
    )).toBe(true);

    expect(statements.some(s =>
      s.includes("DELETE FROM courier_push_devices")
    )).toBe(false);
  });

  it("unregisters only the matching courier, installation and token", async () => {
    await expect(unregisterCourierPushDevice({
      courierId: 1,
      installationId: "installation-one",
      pushToken: "fcm-token-12345678901234567890",
    })).resolves.toEqual({ success: true });

    const statements = execute.mock.calls.map(sqlText);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("WHERE courier_id");
    expect(statements[0]).toContain("AND installation_id");
    expect(statements[0]).toContain("AND push_token");
  });
});
