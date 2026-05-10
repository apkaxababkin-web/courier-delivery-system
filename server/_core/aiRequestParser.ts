export type ParsedRequestType = 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
export type ParsedPaymentMethod = 'paid' | 'transfer' | 'cash' | 'terminal' | 'qr';

export interface ParsedRequestData {
  requestType: ParsedRequestType;
  clientName: string;
  courierName: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  pickupAddress: string;
  deliveryAddress: string;
  paymentMethod: ParsedPaymentMethod | '';
  paymentAmount: number | null;
  comment: string;
  packageDescription: string;
  placesCount: number;
  deliveryTimeFrom: string;
  deliveryTimeTo: string;
}

function clean(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function pick(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function pickPhone(text: string) {
  return pick(text, [
    /(?:тел(?:ефон)?|phone|номер)\s*[:\-]?\s*(\+?\d[\d\s()\-]{7,}\d)/i,
    /(\+7[\d\s()\-]{7,}\d)/,
    /(8[\d\s()\-]{8,}\d)/,
  ]);
}

function pickMoney(text: string) {
  const value = pick(text, [/(?:сумма|стоимость|оплата|наличные|к оплате)\s*[:\-]?\s*(\d+[\d\s]*(?:[.,]\d+)?)/i]);
  if (!value) return null;
  const number = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function detectRequestType(text: string): ParsedRequestType {
  const lower = text.toLowerCase();
  if (/вызов\s+курьер|забрать\s+у\s+клиент|курьер\s+к\s+клиент/.test(lower)) return 'courier_call';
  if (/тк|транспортн|накладн|трек|трек[-\s]?номер/.test(lower)) return 'pickup_from_tc';
  if (/орех|кедр|nuts/.test(lower)) return 'nuts';
  if (/перемещ|со склада|на склад|между офис/.test(lower)) return 'movement';
  if (/прост|simple/.test(lower)) return 'simple';
  return 'delivery';
}

function detectPaymentMethod(text: string): ParsedPaymentMethod | '' {
  const lower = text.toLowerCase();
  if (/перевод|transfer/.test(lower)) return 'transfer';
  if (/налич|cash/.test(lower)) return 'cash';
  if (/терминал|card|карт/.test(lower)) return 'terminal';
  if (/qr|куар|кьюар/.test(lower)) return 'qr';
  if (/оплачен|paid/.test(lower)) return 'paid';
  return '';
}

function detectTime(text: string) {
  const range = text.match(/(?:с|от)?\s*(\d{1,2}[:.]\d{2})\s*(?:до|\-|—)\s*(\d{1,2}[:.]\d{2})/i);
  if (!range) return { deliveryTimeFrom: '', deliveryTimeTo: '' };
  return {
    deliveryTimeFrom: range[1].replace('.', ':'),
    deliveryTimeTo: range[2].replace('.', ':'),
  };
}

function detectPlaces(text: string) {
  const value = pick(text, [/(?:мест|короб|пакет|посылок)\s*[:\-]?\s*(\d+)/i, /(\d+)\s*(?:мест|короб|пакет|посылок)/i]);
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

export function parseRequestText(text: string): ParsedRequestData {
  const source = clean(text);
  const phone = pickPhone(source);
  const { deliveryTimeFrom, deliveryTimeTo } = detectTime(source);

  const senderAddress = pick(source, [
    /(?:забрать|забор|откуда|адрес\s+забора|pickup)\s*[:\-]?\s*([^\n;.]+)/i,
    /(?:отправитель|sender)\s*[:\-]?\s*([^\n;.]+)/i,
  ]);

  const deliveryAddress = pick(source, [
    /(?:доставить|куда|адрес\s+доставки|delivery)\s*[:\-]?\s*([^\n;.]+)/i,
    /(?:получатель|recipient)\s*[:\-]?\s*[^\n;.]*?(?:адрес)?\s*[:\-]?\s*([^\n;.]+)/i,
  ]);

  const recipientName = pick(source, [
    /(?:получатель|recipient|кому)\s*[:\-]?\s*([^\n;.,]+)/i,
    /(?:клиент|client)\s*[:\-]?\s*([^\n;.,]+)/i,
  ]);

  const senderName = pick(source, [/(?:отправитель|sender|от кого)\s*[:\-]?\s*([^\n;.,]+)/i]);

  const comment = pick(source, [/(?:коммент(?:арий)?|примечание|note)\s*[:\-]?\s*([^\n]+)/i]) || source;
  const packageDescription = pick(source, [/(?:что|груз|товар|посылка|описание)\s*[:\-]?\s*([^\n;.]+)/i]);

  return {
    requestType: detectRequestType(source),
    clientName: pick(source, [/(?:клиент|client)\s*[:\-]?\s*([^\n;.,]+)/i]),
    courierName: pick(source, [/(?:курьер|courier)\s*[:\-]?\s*([^\n;.,]+)/i]),
    senderName,
    senderPhone: phone,
    senderAddress,
    recipientName,
    recipientPhone: phone,
    recipientAddress: deliveryAddress,
    pickupAddress: senderAddress,
    deliveryAddress,
    paymentMethod: detectPaymentMethod(source),
    paymentAmount: pickMoney(source),
    comment,
    packageDescription,
    placesCount: detectPlaces(source),
    deliveryTimeFrom,
    deliveryTimeTo,
  };
}
