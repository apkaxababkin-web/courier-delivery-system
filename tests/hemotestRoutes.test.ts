import { describe, expect, it } from 'vitest';
import { validateHemotestRoutes } from '../server/_core/hemotestRoutes';

const routes = () => [
  { number: 1 as const, courierId: 11, pointIds: [1, 2], isFrozen: false },
  { number: 2 as const, courierId: 12, pointIds: [3], isFrozen: false },
];

describe('Hemotest daily route validation', () => {
  it('accepts two independent routes', () => {
    expect(() => validateHemotestRoutes('2026-11-15', routes())).not.toThrow();
  });
  it('rejects duplicate points across routes', () => {
    const input = routes();
    input[1].pointIds.push(2);
    expect(() => validateHemotestRoutes('2026-11-15', input)).toThrow(/duplicated/);
  });
  it('rejects assigning the same courier to both routes', () => {
    const input = routes();
    input[1].courierId = 11;
    expect(() => validateHemotestRoutes('2026-11-15', input)).toThrow(/courier/);
  });
  it('rejects missing routes and invalid dates', () => {
    expect(() => validateHemotestRoutes('bad-date', routes())).toThrow();
    expect(() => validateHemotestRoutes('2026-11-15', routes().slice(0, 1))).toThrow();
  });
});
