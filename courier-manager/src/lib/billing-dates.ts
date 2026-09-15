/**
 * Effective date of a request in the client settlement.
 *
 * The server anchors the billing period on `COALESCE(completedAt, createdAt)`
 * (see loadClientPeriodRequests in server/_core/billingReview.ts). The UI must use
 * exactly the same rule, otherwise a cancelled or unfinished request would show no
 * date ("—") and could not be found in the period it belongs to.
 *
 * Kept in its own module so the page and the tests share one implementation.
 */

/** YYYY-MM-DD in local time, or '' when the value is missing/invalid. */
export function toDateKey(value?: string | Date | null): string {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Date a request belongs to: when it was completed, otherwise when it was created.
 * A completed request uses `completedAt`; cancelled / pending / in-progress
 * requests (no `completedAt`) fall back to `createdAt`.
 *
 * A `completedAt` that cannot be parsed does NOT shadow a valid `createdAt`, so a
 * broken timestamp can never remove a request from its period.
 */
export function effectiveRequestDate(request: {
  completedAt?: string | null;
  createdAt?: string | null;
}): string {
  if (toDateKey(request.completedAt)) return request.completedAt as string;
  return request.createdAt || '';
}

/** Same as effectiveRequestDate but already reduced to YYYY-MM-DD. */
export function effectiveRequestDateKey(request: {
  completedAt?: string | null;
  createdAt?: string | null;
}): string {
  return toDateKey(effectiveRequestDate(request));
}

/** DD.MM.YYYY for display; '—' only when there is genuinely no date. */
export function formatDateRu(value?: string | Date | null): string {
  const key = toDateKey(value);
  if (!key) return '—';

  const [year, month, day] = key.split('-');
  return `${day}.${month}.${year}`;
}
