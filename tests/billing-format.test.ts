import { describe, expect, it } from 'vitest';
import {
  amountInWordsRu,
  dateWithPostfix,
  formatDateRu,
  formatMoney,
  groupThousands,
  monthYearText,
  numberToWordsRu,
  periodText,
  pluralRu,
  serviceNameForPeriod,
  splitMoney,
  sumMoney,
  toIsoDate,
  vatBreakdown,
} from '../shared/billing-format';

describe('money formatting', () => {
  it('splits roubles and kopecks', () => {
    expect(splitMoney(15145)).toEqual({ rubles: 15145, kopecks: 0 });
    expect(splitMoney('15145.07')).toEqual({ rubles: 15145, kopecks: 7 });
    expect(splitMoney(0.1 + 0.2)).toEqual({ rubles: 0, kopecks: 30 });
  });

  it('groups thousands as the printed documents do', () => {
    expect(groupThousands(15145)).toBe('15\u00A0145');
    expect(groupThousands(1234567)).toBe('1\u00A0234\u00A0567');
    expect(groupThousands(0)).toBe('0');
  });

  it('formats money with a comma decimal separator', () => {
    expect(formatMoney(15145)).toBe('15\u00A0145,00');
    expect(formatMoney('300.5')).toBe('300,50');
    expect(formatMoney(null)).toBe('0,00');
  });

  it('sums money without floating point drift', () => {
    expect(sumMoney([300, 250.5, '99.99'])).toBe(650.49);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
});

describe('dates', () => {
  it('formats as DD.MM.YYYY', () => {
    expect(formatDateRu('2026-08-31')).toBe('31.08.2026');
    expect(formatDateRu(new Date(Date.UTC(2026, 0, 5)))).toBe('05.01.2026');
    expect(formatDateRu(null)).toBe('');
  });

  it('never shifts the day because of the server timezone', () => {
    // 31.08 23:30 UTC is already 01.09 in UTC+8; the document must keep 31.08.
    expect(formatDateRu(new Date('2026-08-31T23:30:00.000Z'))).toBe('31.08.2026');
    expect(toIsoDate(new Date('2026-08-31T23:30:00.000Z'))).toBe('2026-08-31');
  });

  it('builds the period text and month wording', () => {
    expect(periodText('2026-08-16', '2026-08-31')).toBe('16.08.2026\u201331.08.2026');
    expect(monthYearText('2026-08-31')).toBe('август 2026');
    expect(monthYearText('2026-01-15')).toBe('январь 2026');
  });

  it('builds the service name from the period end', () => {
    expect(serviceNameForPeriod('2026-08-31')).toBe('Курьерские услуги за август 2026 г.');
  });

  it('adds the "г." postfix for the act heading', () => {
    expect(dateWithPostfix('2026-08-31')).toBe('31.08.2026 г.');
  });
});

describe('plural forms', () => {
  it('declines the rouble and kopeck units', () => {
    expect(pluralRu(1, 'рубль', 'рубля', 'рублей')).toBe('рубль');
    expect(pluralRu(2, 'рубль', 'рубля', 'рублей')).toBe('рубля');
    expect(pluralRu(5, 'рубль', 'рубля', 'рублей')).toBe('рублей');
    expect(pluralRu(11, 'рубль', 'рубля', 'рублей')).toBe('рублей');
    expect(pluralRu(21, 'рубль', 'рубля', 'рублей')).toBe('рубль');
    expect(pluralRu(112, 'рубль', 'рубля', 'рублей')).toBe('рублей');
    expect(pluralRu(101, 'копейка', 'копейки', 'копеек')).toBe('копейка');
    expect(pluralRu(44, 'копейка', 'копейки', 'копеек')).toBe('копейки');
  });
});

describe('number to words', () => {
  it('converts the sample amount from the provided invoice', () => {
    expect(numberToWordsRu(15145)).toBe('пятнадцать тысяч сто сорок пять');
    expect(amountInWordsRu(15145)).toBe('Пятнадцать тысяч сто сорок пять рублей 00 копеек');
  });

  it('handles feminine thousands', () => {
    expect(numberToWordsRu(2000)).toBe('две тысячи');
    expect(numberToWordsRu(1000)).toBe('одна тысяча');
    expect(numberToWordsRu(51000)).toBe('пятьдесят одна тысяча');
  });

  it('handles teens and hundreds', () => {
    expect(numberToWordsRu(115)).toBe('сто пятнадцать');
    expect(numberToWordsRu(712)).toBe('семьсот двенадцать');
    expect(numberToWordsRu(418)).toBe('четыреста восемнадцать');
  });

  it('handles zero and kopecks wording', () => {
    expect(amountInWordsRu(0)).toBe('Ноль рублей 00 копеек');
    expect(amountInWordsRu(1.01)).toBe('Один рубль 01 копейка');
    expect(amountInWordsRu(2.02)).toBe('Два рубля 02 копейки');
    expect(amountInWordsRu(5.05)).toBe('Пять рублей 05 копеек');
    expect(amountInWordsRu(11.11)).toBe('Одиннадцать рублей 11 копеек');
    expect(amountInWordsRu(121.22)).toBe('Сто двадцать один рубль 22 копейки');
  });

  it('handles millions and billions', () => {
    expect(numberToWordsRu(1_000_000)).toBe('один миллион');
    expect(numberToWordsRu(2_000_000)).toBe('два миллиона');
    expect(numberToWordsRu(5_000_000)).toBe('пять миллионов');
    expect(numberToWordsRu(1_234_567)).toBe('один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь');
  });

  it('is deterministic', () => {
    expect(amountInWordsRu(45550)).toBe(amountInWordsRu(45550));
    expect(amountInWordsRu(45550)).toBe('Сорок пять тысяч пятьсот пятьдесят рублей 00 копеек');
  });
});

describe('vat', () => {
  it('reports "Без НДС" when the organisation is not a VAT payer', () => {
    const result = vatBreakdown(15145, 'without_vat', 0);
    expect(result.rateText).toBe('Без НДС');
    expect(result.vatAmount).toBeNull();
    expect(result.netAmount).toBeNull();
  });

  it('treats VAT as included in the total so net + VAT equals the total', () => {
    const result = vatBreakdown(12000, 'vat', 20);
    expect(result.rateText).toBe('НДС 20%');
    expect(result.vatAmount).toBe(2000);
    expect(result.netAmount).toBe(10000);
    expect((result.netAmount ?? 0) + (result.vatAmount ?? 0)).toBe(12000);
  });

  it('supports a fractional rate', () => {
    const result = vatBreakdown(11050, 'vat', 10);
    expect(result.vatAmount).toBe(1004.55);
    expect(result.netAmount).toBe(10045.45);
  });
});
