# Гемотест: два независимых маршрута

## Scope
Manager web: two numbered routes for a selected date, courier selection, drag-and-drop / up-down ordering, moving points between routes, auto-distribution of unassigned points, freeze and explicit unfreeze. Existing daily lists remain the source of eligible points. Courier API continues reading `hemotestPickups` including `courierId`, `routeOrder`, `isFrozen`.

## Safety
- All writes to route configuration require manager JWT via `managerProcedure`.
- The save mutation runs in a PostgreSQL transaction, locks route records, rejects duplicate point/courier assignments and edits to frozen routes.
- `isPicked`, `pickedAt`, `isCancelled`, `cancelledAt` are **never reset** by route save or unfreeze.
- Unassigned points remain in the original daily list. Existing pickup rows are not deleted.
- Auto-distribution balances only currently unassigned points and is manager-initiated.

## Database rollout
**Do not run `drizzle-kit push` or `pnpm db:push` on production.** Production schema has legacy objects not represented in the current Drizzle schema. The guarded migration command also intentionally blocks production.

1. Create and verify a recoverable PostgreSQL backup, including a restore test.
2. In a maintenance window, inspect the production schema and manually review/apply `drizzle/migrations/0025_hemotest_two_routes.sql` with authorized database access.
3. Build/test the API and manager site in staging against a copied, disposable database first.
4. Deploy matching API + manager static assets together; then verify both route endpoints under a manager token.
5. Test create list, two couriers, point transfer, ordering, freeze/unfreeze, courier visibility, and completed/cancelled status retention.

## Rollback
Revert API and manager build to prior artifacts. Leave the additive `routeNumber` column and `hemotestDailyRoutes` table in place during emergency rollback to avoid deleting route state. Schema removal requires a separate reviewed migration and database backup.

## Validation
`pnpm check`, `pnpm exec vitest run server/_core/hemotestRoutes.test.ts`, `pnpm --dir courier-manager check`, `pnpm --dir courier-manager build`. Do not claim validation until these commands actually succeed.
