import { sql } from 'drizzle-orm';
import { InputError } from './correspondenceValidation';
export const resultRows = (r:any):any[] => Array.isArray(r) ? r : r?.rows || [];
// All creation paths, including legacy mail imports, share this transaction lock.
export async function lockCorrespondenceWrites(tx:any) {
  await tx.execute(sql`SET LOCAL lock_timeout='3s'`);
  await tx.execute(sql`SET LOCAL statement_timeout='30s'`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(738491,1)`);
}
export async function guardLegacyWaybills(tx:any, numbers:string[]) {
  const found=resultRows(await tx.execute(sql`SELECT "waybillNumber" FROM "correspondenceShipments"
    WHERE lower(btrim("waybillNumber")) IN
    (SELECT lower(btrim(value)) FROM jsonb_array_elements_text(${JSON.stringify(numbers)}::jsonb)) LIMIT 1`))[0];
  if(found) throw new InputError(`Накладная ${found.waybillNumber} уже находится в системе корреспонденции`);
}
