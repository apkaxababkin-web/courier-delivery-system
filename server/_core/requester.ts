import { sql } from "drizzle-orm";
import * as db from "../db";

/**
 * Requester ("Кто заказал вызов") for courier_call requests.
 *
 * The requester is independent from sender ("Забрать у") and recipient
 * ("Куда направляется"). requesterId is a polymorphic reference without a
 * foreign key, so existence/activity is enforced here, and the name snapshot is
 * always read from the database rather than trusted from the client.
 */
export const REQUESTER_TYPES = ["partner", "correspondenceClient"] as const;
export type RequesterType = (typeof REQUESTER_TYPES)[number];

export type ResolvedRequester = {
  requesterType: RequesterType;
  requesterId: number;
  requesterNameSnapshot: string;
};

export class RequesterInputError extends Error {}

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : [];
}

/**
 * Resolve a requester reference to a validated snapshot.
 * Returns null when the requester is being cleared (no type and no id).
 * Throws RequesterInputError on invalid input, unknown/inactive record, or own company.
 */
export async function resolveRequester(
  rawType: unknown,
  rawId: unknown,
): Promise<ResolvedRequester | null> {
  const hasType = rawType !== undefined && rawType !== null && String(rawType).trim() !== "";
  const hasId = rawId !== undefined && rawId !== null && String(rawId).trim() !== "";

  if (!hasType && !hasId) return null;
  if (!hasType || !hasId) {
    throw new RequesterInputError("Выберите заказчика вызова: укажите и тип, и организацию");
  }

  const type = String(rawType).trim();
  if (!(REQUESTER_TYPES as readonly string[]).includes(type)) {
    throw new RequesterInputError("Некорректный тип заказчика вызова");
  }

  const idText = String(rawId).trim();
  if (!/^\d+$/.test(idText)) throw new RequesterInputError("Некорректный идентификатор заказчика");
  const id = Number(idText);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    throw new RequesterInputError("Некорректный идентификатор заказчика");
  }

  const conn = await db.getDb();
  if (!conn) throw new Error("Database not available");

  if (type === "partner") {
    const found = rowsOf(
      await conn.execute(sql`SELECT "id","name" FROM "partners"
        WHERE "id" = ${id} AND "isActive" = true AND "isOwnCompany" IS NOT TRUE LIMIT 1`),
    )[0];
    if (!found) {
      throw new RequesterInputError("Заказчик не найден, отключён или является нашей организацией");
    }
    return { requesterType: "partner", requesterId: id, requesterNameSnapshot: String(found.name) };
  }

  const found = rowsOf(
    await conn.execute(sql`SELECT "id","name" FROM "correspondenceClients"
      WHERE "id" = ${id} AND "isActive" = true LIMIT 1`),
  )[0];
  if (!found) throw new RequesterInputError("Клиент корреспонденции не найден или отключён");

  return {
    requesterType: "correspondenceClient",
    requesterId: id,
    requesterNameSnapshot: String(found.name),
  };
}

/** True when the payload explicitly carries requester fields (including an explicit null). */
export function hasRequesterInput(input: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, "requesterType") ||
    Object.prototype.hasOwnProperty.call(input, "requesterId")
  );
}
