/**
 * Deterministic formatting and Russian number-to-words for billing documents.
 *
 * Everything here is plain arithmetic — no AI, no locale data from the host.
 */

// ─── Money and dates ─────────────────────────────────────────────────────────

/** Split a money value into whole roubles and kopecks (no rounding surprises). */
export function splitMoney(value: number | string | null | undefined): { rubles: number; kopecks: number } {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value ?? 0);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  const total = Math.round(safe * 100);
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  return { rubles: sign * Math.floor(abs / 100), kopecks: abs % 100 };
}

/** Group digits with a non-breaking space: 15145 → "15 145". */
export function groupThousands(value: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(Math.trunc(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  return negative ? `-${grouped}` : grouped;
}

/** "15 145,00" — the format used both on screen and in the printed documents. */
export function formatMoney(value: number | string | null | undefined): string {
  const { rubles, kopecks } = splitMoney(value);
  return `${groupThousands(rubles)},${String(kopecks).padStart(2, "0")}`;
}

/** "15 145,00 ₽" — for the web UI, where the rouble sign is available. */
export function formatMoneyWithSign(value: number | string | null | undefined): string {
  return `${formatMoney(value)} \u20BD`;
}

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const MONTHS_NOMINATIVE = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/** ISO date (YYYY-MM-DD) or Date → "31.08.2026". Never locale dependent. */
export function formatDateRu(value: string | Date | null | undefined): string {
  if (!value) return "";
  const iso = typeof value === "string" ? value.slice(0, 10) : toIsoDate(value);
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
}

/** Date → "31.08.2026" using UTC parts, so the server timezone cannot shift it. */
export function toIsoDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

/** "31.08.2026" → "август 2026" (the month the service belongs to). */
export function monthYearText(value: string | Date): string {
  const iso = typeof value === "string" ? value.slice(0, 10) : toIsoDate(value);
  const [year, month] = iso.split("-");
  const index = Number(month) - 1;
  if (!year || Number.isNaN(index) || !MONTHS_NOMINATIVE[index]) return "";
  return `${MONTHS_NOMINATIVE[index]} ${year}`;
}

/** "16.08.2026–31.08.2026" — the period wording used in documents and sheets. */
export function periodText(from: string, to: string): string {
  return `${formatDateRu(from)}\u2013${formatDateRu(to)}`;
}

/** "Курьерские услуги за август 2026 г." */
export function serviceNameForPeriod(to: string): string {
  const month = monthYearText(to);
  return month ? `Курьерские услуги за ${month} г.` : "Курьерские услуги";
}

/** "31.08.2026 г." — the heading form used by the act. */
export function dateWithPostfix(value: string | Date): string {
  const text = formatDateRu(value);
  return text ? `${text} г.` : "";
}

// ─── Amount in words ─────────────────────────────────────────────────────────

const UNITS_MASCULINE = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const UNITS_FEMININE = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
  "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

/** Russian plural form: 1 рубль / 2 рубля / 5 рублей. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function tripletToWords(value: number, feminine: boolean): string {
  const units = feminine ? UNITS_FEMININE : UNITS_MASCULINE;
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    const tens = Math.floor(rest / 10);
    const ones = rest % 10;
    if (tens > 0) parts.push(TENS[tens]);
    if (ones > 0) parts.push(units[ones]);
  }
  return parts.join(" ");
}

/** Cardinal number in words: 15145 → "пятнадцать тысяч сто сорок пять". */
export function numberToWordsRu(value: number, feminine = false): string {
  const n = Math.trunc(Math.abs(value));
  if (n === 0) return feminine ? "ноль" : "ноль";

  const groups: { value: number; feminine: boolean; forms: [string, string, string] }[] = [
    { value: Math.floor(n / 1_000_000_000) % 1000, feminine: false, forms: ["миллиард", "миллиарда", "миллиардов"] },
    { value: Math.floor(n / 1_000_000) % 1000, feminine: false, forms: ["миллион", "миллиона", "миллионов"] },
    { value: Math.floor(n / 1000) % 1000, feminine: true, forms: ["тысяча", "тысячи", "тысяч"] },
    { value: n % 1000, feminine, forms: ["", "", ""] },
  ];

  const words: string[] = [];
  for (const group of groups) {
    if (group.value === 0) continue;
    words.push(tripletToWords(group.value, group.feminine));
    if (group.forms[0]) words.push(pluralRu(group.value, group.forms[0], group.forms[1], group.forms[2]));
  }
  return words.filter(Boolean).join(" ");
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * "Пятнадцать тысяч сто сорок пять рублей 00 копеек"
 * — the exact wording required on the invoice and the act.
 */
export function amountInWordsRu(value: number | string | null | undefined): string {
  const { rubles, kopecks } = splitMoney(value);
  const roublesText = capitalize(numberToWordsRu(rubles));
  const roublesUnit = pluralRu(rubles, "рубль", "рубля", "рублей");
  const kopecksUnit = pluralRu(kopecks, "копейка", "копейки", "копеек");
  return `${roublesText} ${roublesUnit} ${String(kopecks).padStart(2, "0")} ${kopecksUnit}`;
}

// ─── VAT ─────────────────────────────────────────────────────────────────────

export interface VatBreakdown {
  /** Printed rate wording: "Без НДС" or "НДС 20%". */
  rateText: string;
  /** VAT amount included in the total, or null when the organisation is not a VAT payer. */
  vatAmount: number | null;
  /** Sum excluding VAT, or null when not applicable. */
  netAmount: number | null;
}

/**
 * The total on the documents is the amount to be paid. For a VAT payer the VAT is
 * treated as included in that total (the common case for a single service line),
 * so the printed net + VAT always add up to the same total.
 */
export function vatBreakdown(total: number, vatMode: string | null | undefined, vatRate: number | null | undefined): VatBreakdown {
  const mode = (vatMode ?? "without_vat").toLowerCase();
  const rate = Number(vatRate ?? 0);

  if (mode !== "vat" || !Number.isFinite(rate) || rate <= 0) {
    return { rateText: "Без НДС", vatAmount: null, netAmount: null };
  }

  const vatAmount = round2(total * rate / (100 + rate));
  const netAmount = round2(total - vatAmount);
  const rateLabel = Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace(".", ",");
  return { rateText: `НДС ${rateLabel}%`, vatAmount, netAmount };
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Sum a list of money values without floating point drift. */
export function sumMoney(values: (number | string | null | undefined)[]): number {
  const total = values.reduce<number>((acc, value) => {
    const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value ?? 0);
    return acc + (Number.isFinite(parsed) ? Math.round(parsed * 100) : 0);
  }, 0);
  return total / 100;
}
