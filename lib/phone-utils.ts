export type ParsedPhone = {
  raw: string;
  display: string;
  dial: string;
  extension?: string;
};

export function normalizePhoneForDial(
  phone?: string | null,
): string {
  if (!phone) return "";

  const trimmed = String(phone).trim();

  if (!trimmed) return "";

  let digits = trimmed.replace(/\D/g, "");

  if (!digits) return "";

  // 8 914 123-45-67 -> +7 914...
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  }

  // 7 914 123-45-67 -> +7...
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  // 914 123-45-67 -> +7...
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+7${digits}`;
  }

  // Local/landline short numbers remain local.
  return trimmed.startsWith("+")
    ? `+${digits}`
    : digits;
}

export function formatPhoneDisplay(
  dial: string,
): string {
  if (/^\+7\d{10}$/.test(dial)) {
    return `+7 ${dial.slice(2, 5)} ${dial.slice(5, 8)}-${dial.slice(8, 10)}-${dial.slice(10, 12)}`;
  }

  return dial;
}

export function parsePhoneField(
  value?: string | null,
): ParsedPhone[] {
  if (!value) return [];

  const source = String(value);

  // Phone-looking fragments. Commas/semicolons split numbers,
  // therefore one match cannot swallow the next number.
  const phoneRegex = /\+?\d[\d\s()\-]{3,}\d/g;
  const matches = [...source.matchAll(phoneRegex)];

  const result: ParsedPhone[] = [];

  matches.forEach((match, index) => {
    const raw = match[0].trim();
    const dial = normalizePhoneForDial(raw);

    if (!dial) return;

    const start = match.index ?? 0;
    const end = start + match[0].length;

    // Extension belongs to THIS number when it occurs after it
    // and before the next phone number.
    const nextStart =
      index + 1 < matches.length
        ? (matches[index + 1].index ?? source.length)
        : source.length;

    const after = source.slice(end, nextStart);

    const extMatch = after.match(
      /(?:доб(?:авочный)?\.?|ext\.?|extension)\s*[:№#-]?\s*(\d{1,8})/i,
    );

    result.push({
      raw,
      dial,
      display: formatPhoneDisplay(dial),
      extension: extMatch?.[1],
    });
  });

  return result;
}
