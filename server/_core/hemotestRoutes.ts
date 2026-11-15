export type HemotestRouteDraft = {
  number: 1 | 2;
  courierId: number | null;
  pointIds: number[];
  isFrozen: boolean;
};

/** Pure validation shared by the route persistence boundary and tests. */
export function validateHemotestRoutes(date: string, routes: HemotestRouteDraft[]): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z'))) {
    throw new Error('Invalid route date');
  }
  if (routes.length !== 2 || routes[0].number !== 1 || routes[1].number !== 2) {
    throw new Error('Exactly two numbered routes required');
  }
  const pointIds = routes.flatMap((route) => route.pointIds);
  if (pointIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(pointIds).size !== pointIds.length) {
    throw new Error('Invalid or duplicated route points');
  }
  const courierIds = routes.map((route) => route.courierId).filter((id) => id !== null);
  if (courierIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(courierIds).size !== courierIds.length) {
    throw new Error('Invalid or duplicated courier assignments');
  }
}
