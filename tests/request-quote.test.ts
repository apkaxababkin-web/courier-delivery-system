import { describe, expect, it } from 'vitest';
import {
  EMPTY_TARIFF_RATES,
  computeQuote,
  tariffCategoryFor,
  toTariffRates,
  type ClientTariffRates,
  type QuoteInput,
} from '../server/_core/requestQuote';

const rates: ClientTariffRates = {
  deliveryFirstPlace: 300,
  deliveryNextPlace: 0,
  transportCompanyFirstPlace: 400,
  transportCompanyNextPlace: 150,
  movementFirstPlace: 250,
  movementNextPlace: 100,
  otherFirstPlace: 500,
  otherNextPlace: 200,
};

const request = (over: Partial<QuoteInput> = {}): QuoteInput => ({
  clientId: 1,
  requestType: 'delivery',
  placesCount: 1,
  ...over,
});

describe('tariff category mapping', () => {
  it('maps movement requests to the movement tariff', () => {
    expect(tariffCategoryFor(request({ requestType: 'movement' }))).toBe('movement');
  });

  it('maps pickup from a transport company to the transport company tariff', () => {
    expect(tariffCategoryFor(request({ requestType: 'pickup_from_tc' }))).toBe('transportCompany');
  });

  it('treats any request carrying TC data as a transport company job', () => {
    expect(tariffCategoryFor(request({ requestType: 'simple', tcName: 'DPD' }))).toBe('transportCompany');
    expect(tariffCategoryFor(request({ requestType: 'simple', trackingNumber: '123' }))).toBe('transportCompany');
    expect(tariffCategoryFor(request({ requestType: 'simple', tcAddress: '502 км' }))).toBe('transportCompany');
  });

  it('maps delivery requests to the delivery tariff', () => {
    expect(tariffCategoryFor(request({ requestType: 'delivery' }))).toBe('delivery');
  });

  it('falls back to the "other" tariff for the remaining types', () => {
    for (const type of ['simple', 'nuts', 'courier_call']) {
      expect(tariffCategoryFor(request({ requestType: type }))).toBe('other');
    }
  });
});

describe('computeQuote', () => {
  it('prices the first place at the category base rate', () => {
    const result = computeQuote(request({ requestType: 'delivery', placesCount: 1 }), rates, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount).toBe(300);
      expect(result.category).toBe('delivery');
      expect(result.places).toBe(1);
    }
  });

  it('adds the per-place rate for every extra place', () => {
    const result = computeQuote(request({ requestType: 'movement', placesCount: 4 }), rates, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(250 + 3 * 100);
  });

  it('treats a missing extra-place rate as zero instead of failing', () => {
    const result = computeQuote(request({ requestType: 'delivery', placesCount: 5 }), rates, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(300);
  });

  it('treats a missing place count as one place', () => {
    const result = computeQuote(request({ requestType: 'delivery', placesCount: null }), rates, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(300);
  });

  it('prices the "other" category with its own rates', () => {
    const result = computeQuote(request({ requestType: 'courier_call', placesCount: 2 }), rates, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(500 + 200);
  });

  it('never invents a price when the base rate is not configured', () => {
    const deliveryOnly: ClientTariffRates = { ...EMPTY_TARIFF_RATES, deliveryFirstPlace: 300 };
    const result = computeQuote(request({ requestType: 'courier_call' }), deliveryOnly, true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('tariff_not_configured');
      expect(result.category).toBe('other');
    }
  });

  it('reports a missing tariff card separately from an unconfigured rate', () => {
    const result = computeQuote(request(), EMPTY_TARIFF_RATES, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_tariff');
  });

  it('refuses to price a request without a client', () => {
    const result = computeQuote(request({ clientId: null }), rates, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_client');
  });

  it('zero base rate is "no price", never a free service', () => {
    const zeroRates: ClientTariffRates = { ...EMPTY_TARIFF_RATES, deliveryFirstPlace: 0 };
    const result = computeQuote(request(), zeroRates, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('tariff_not_configured');
  });

  it('is deterministic for the same input', () => {
    const first = computeQuote(request({ requestType: 'transportCompany', placesCount: 3 }), rates, true);
    const second = computeQuote(request({ requestType: 'transportCompany', placesCount: 3 }), rates, true);
    expect(first).toEqual(second);
  });
});

describe('toTariffRates', () => {
  it('returns zeros for a missing tariff row', () => {
    expect(toTariffRates(null)).toEqual(EMPTY_TARIFF_RATES);
  });

  it('coerces strings and nulls from the database into numbers', () => {
    const parsed = toTariffRates({
      deliveryFirstPlace: '300',
      deliveryNextPlace: null,
      movementFirstPlace: undefined,
    } as unknown as Record<string, unknown>);
    expect(parsed.deliveryFirstPlace).toBe(300);
    expect(parsed.deliveryNextPlace).toBe(0);
    expect(parsed.movementFirstPlace).toBe(0);
  });
});
