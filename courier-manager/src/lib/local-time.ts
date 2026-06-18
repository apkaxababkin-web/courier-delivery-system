export const BUSINESS_TIME_ZONE = 'Asia/Irkutsk';

type DateValue = Date | string | number | null | undefined;

function toValidDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === '') return null;

  let normalized: Date | string | number = value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    const hasTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(trimmed);
    const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(trimmed);

    if (isDateOnly) {
      normalized = `${trimmed}T12:00:00+08:00`;
    } else if (hasTime && !hasTimezone) {
      normalized = `${trimmed.replace(' ', 'T')}Z`;
    } else {
      normalized = trimmed;
    }
  }

  const date = normalized instanceof Date ? normalized : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalTime(value: DateValue, fallback = '—') {
  const date = toValidDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatLocalDate(value: DateValue, fallback = '—') {
  const date = toValidDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatLocalDateTime(value: DateValue, fallback = '—') {
  const date = toValidDate(value);
  if (!date) return fallback;

  return `${formatLocalDate(date, fallback)} ${formatLocalTime(date, fallback)}`;
}

export function formatLocalDateWithOptions(
  value: DateValue,
  options: Omit<Intl.DateTimeFormatOptions, 'timeZone'>,
  fallback = '—',
) {
  const date = toValidDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat('ru-RU', {
    ...options,
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

export function toLocalDateKey(value: DateValue) {
  const date = toValidDate(value);
  if (!date) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

export function getLocalDateKey(value: DateValue = new Date()) {
  return toLocalDateKey(value);
}
