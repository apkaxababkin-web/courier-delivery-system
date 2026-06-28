export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatLocalDateWithOptions(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  fallback = "",
) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString("ru-RU", options);
}
