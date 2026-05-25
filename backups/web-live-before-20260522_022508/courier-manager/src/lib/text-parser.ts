/**
 * Improved text parser for automatic request type detection and data extraction
 */

interface ParsedData {
  taskType: 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  packageDescription: string;
}

// Phone number regex patterns
const PHONE_PATTERNS = [
  /\+7[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
  /8[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
  /\(\d{3}\)[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
  /\d{3}[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}/g,
];

// Address keywords
const ADDRESS_KEYWORDS = [
  'ул\\.',
  'улица',
  'пр\\.',
  'проспект',
  'бульвар',
  'б-р',
  'переулок',
  'пер\\.',
  'дом',
  'д\\.',
  'кв\\.',
  'квартира',
  'офис',
  'здание',
  'корп\\.',
  'корпус',
  'шоссе',
  'площадь',
  'пл\\.',
];

// Request type keywords
const REQUEST_TYPE_KEYWORDS = {
  delivery: ['доставка', 'привезти', 'отправить', 'доставить', 'отправка', 'доставить посылку'],
  movement: ['переместить', 'перевезти', 'перемещение', 'переместить груз', 'перевоз', 'переместить'],
  nuts: ['орехи', 'коробка', 'коробки', 'кедровое масло', 'масло', 'кедр'],
  courier_call: ['вызов курьера', 'срочно', 'срочный вызов', 'курьер', 'экспресс', 'срочная'],
  pickup_from_tc: ['груз с тк', 'забрать с компании', 'получение груза', 'тк', 'транспортная компания', 'забрать груз'],
};

// Sender/recipient indicators
const SENDER_INDICATORS = ['от', 'из', 'забрать', 'забирать', 'забрал', 'отправить', 'отправляю'];
const RECIPIENT_INDICATORS = ['в', 'на', 'доставить', 'доставляю', 'доставить', 'привезти', 'привезу', 'получить'];

/**
 * Extract phone numbers from text
 */
function extractPhones(text: string): string[] {
  const phones: string[] = [];
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      phones.push(...matches);
    }
  }
  return [...new Set(phones)].map(p => p.replace(/[\s\-()]/g, ''));
}

/**
 * Extract addresses from text
 */
function extractAddresses(text: string): string[] {
  const addresses: string[] = [];
  const addressPattern = new RegExp(
    `[^.!?]*(?:${ADDRESS_KEYWORDS.join('|')})[^.!?]*[.!?]?`,
    'gi'
  );
  
  const matches = text.match(addressPattern);
  if (matches) {
    addresses.push(...matches.map(a => a.trim()).filter(a => a.length > 3));
  }
  
  // If no addresses found, try to extract by comma-separated parts
  if (addresses.length === 0) {
    const parts = text.split(/[,;]/);
    addresses.push(...parts.filter(p => p.length > 5 && p.length < 100).map(p => p.trim()));
  }
  
  return addresses;
}

/**
 * Extract Russian names from text
 */
function extractNames(text: string): string[] {
  const names: string[] = [];
  const namePattern = /\b[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*\b/g;
  
  const matches = text.match(namePattern);
  if (matches) {
    const commonWords = ['и', 'или', 'из', 'на', 'в', 'от', 'по', 'до', 'за', 'под', 'над', 'ул', 'пр', 'кв'];
    names.push(...matches.filter(name => !commonWords.includes(name.toLowerCase()) && name.length > 2));
  }
  
  return names;
}

/**
 * Detect request type from text
 */
function detectRequestType(text: string): ParsedData['taskType'] {
  const lowerText = text.toLowerCase();
  
  for (const [type, keywords] of Object.entries(REQUEST_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return type as ParsedData['taskType'];
      }
    }
  }
  
  return 'simple';
}

/**
 * Split text into sentences
 */
function splitSentences(text: string): string[] {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
}

/**
 * Detect sender vs recipient from text
 */
function detectSenderRecipient(text: string, addresses: string[], names: string[]): { sender: string; recipient: string } {
  const lowerText = text.toLowerCase();
  const sentences = splitSentences(text);
  
  let senderInfo = '';
  let recipientInfo = '';
  
  // Try to find sender and recipient by indicators
  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    
    // Check for sender indicators
    for (const indicator of SENDER_INDICATORS) {
      if (lowerSentence.includes(indicator)) {
        senderInfo = sentence.trim();
        break;
      }
    }
    
    // Check for recipient indicators
    for (const indicator of RECIPIENT_INDICATORS) {
      if (lowerSentence.includes(indicator)) {
        recipientInfo = sentence.trim();
        break;
      }
    }
  }
  
  // If not found by indicators, use first and second parts
  if (!senderInfo && sentences.length > 0) {
    senderInfo = sentences[0];
  }
  if (!recipientInfo && sentences.length > 1) {
    recipientInfo = sentences[1];
  } else if (!recipientInfo && sentences.length > 0) {
    recipientInfo = sentences[sentences.length - 1];
  }
  
  return { sender: senderInfo, recipient: recipientInfo };
}

/**
 * Extract data from info string
 */
function extractDataFromInfo(info: string, allPhones: string[], allAddresses: string[], allNames: string[]): { name: string; phone: string; address: string } {
  const infoLower = info.toLowerCase();
  
  // Find name in this info
  let name = '';
  const namePattern = /\b[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*\b/g;
  const nameMatches = info.match(namePattern);
  if (nameMatches) {
    const commonWords = ['и', 'или', 'из', 'на', 'в', 'от', 'по', 'до', 'за', 'под', 'над', 'ул', 'пр', 'кв'];
    name = nameMatches.find(n => !commonWords.includes(n.toLowerCase()) && n.length > 2) || '';
  }
  
  // Find phone in this info
  let phone = '';
  for (const pattern of PHONE_PATTERNS) {
    const match = info.match(pattern);
    if (match) {
      phone = match[0].replace(/[\s\-()]/g, '');
      break;
    }
  }
  
  // Find address in this info
  let address = '';
  const addressPattern = new RegExp(`[^.!?]*(?:${ADDRESS_KEYWORDS.join('|')})[^.!?]*`, 'gi');
  const addressMatch = info.match(addressPattern);
  if (addressMatch) {
    address = addressMatch[0].trim();
  }
  
  return { name, phone, address };
}

/**
 * Parse text and extract request data
 */
export function parseRequestText(text: string): ParsedData {
  const phones = extractPhones(text);
  const addresses = extractAddresses(text);
  const names = extractNames(text);
  const taskType = detectRequestType(text);
  const { sender, recipient } = detectSenderRecipient(text, addresses, names);
  
  // Extract data from sender info
  const senderData = extractDataFromInfo(sender, phones, addresses, names);
  
  // Extract data from recipient info
  const recipientData = extractDataFromInfo(recipient, phones, addresses, names);
  
  // Use remaining phone and address if needed
  const senderPhone = senderData.phone || phones[0] || '';
  const recipientPhone = recipientData.phone || phones[1] || phones[0] || '';
  const senderAddress = senderData.address || addresses[0] || sender;
  const recipientAddress = recipientData.address || addresses[1] || addresses[0] || recipient;
  
  return {
    taskType,
    senderName: senderData.name || names[0] || '',
    senderPhone,
    senderAddress,
    recipientName: recipientData.name || names[1] || names[0] || '',
    recipientPhone,
    recipientAddress,
    packageDescription: text,
  };
}
