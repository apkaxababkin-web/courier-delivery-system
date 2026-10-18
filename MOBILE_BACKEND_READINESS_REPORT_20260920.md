# MOBILE BACKEND READINESS REPORT

**Date:** 2026-09-20
**Repo:** `/home/administrator333/courier-delivery-system`
**Branch:** `feature/site-improvements-current`
**Mobile checkpoint (untouched):** `f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9` — working tree clean, no EAS build started.

---

## 1. Main branch / HEAD

| | Before this stage | After this stage |
|---|---|---|
| branch | `feature/site-improvements-current` | `feature/site-improvements-current` |
| HEAD | `8b32e81cc34d969a8ef533f9f7d7bd67c98fc1c0` | **`31a3f56a3f9f6c1a0024c9515fe5dd880e3e32d4`** |

## 2. Original `git status`

```
 M courier-manager/src/lib/api.ts              <- unrelated (billing/smart-tariff)
 M courier-manager/src/views/ReportsView.tsx   <- unrelated
 M drizzle/schema.ts                           <- unrelated
 M server/_core/chatV2Routes.ts                <- THIS stage
 M server/_core/requestQuote.ts                <- unrelated
 M server/routers.ts                           <- unrelated
 M tests/helpers/testDb.ts                     <- unrelated
?? MOBILE_AUDIT_20260920.md                    <- previous stage report
?? MOBILE_CONSOLIDATION_REPORT_20260920.md     <- previous stage report
?? drizzle/migrations/0020_client_smart_tariff_rules.sql  <- unrelated
?? server/_core/smartTariffs.ts                <- unrelated
?? tests/smart-tariff-financial-safety.test.ts <- unrelated
?? tests/smart-tariffs.test.ts                 <- unrelated
?? "Основная_движения_сверка_16.08-31.08.2026.xlsx"        <- unrelated
```

No `git add -A` / `git add .` was used at any point.

## 3. Exact `chatV2Routes.ts` diff

Originally 8 insertions / 1 deletion (the palette itself). Final committed diff is 24 insertions / 2 deletions, because the same values were additionally exposed as named exports so the palette can be tested without touching the route logic:

```diff
-const CHAT_REACTION_EMOJIS = new Set(["✅","❌","⚠️","🚀","🎯","💡","📌","📦","⏳","🛠️"]);
+// Reaction palette agreed for the consolidated mobile build.
+// The legacy set is kept as a superset so that reactions created by already
+// released clients can still be toggled off (otherwise removing an old
+// reaction would fail with 400 "Недоступная реакция").
+export const CHAT_REACTION_EMOJIS = new Set([
+  "❤️","🔥","😂","🤩","😍","🎉","💯","👏","👍","🤝","👀","🤯",
+  "✅","❌","⚠️","🚀","🎯","💡","📌","📦","⏳","🛠️",
+]);
+export const CHAT_REACTION_PALETTE = ["❤️","🔥","😂","🤩","😍","🎉","💯","👏","👍","🤝","👀","🤯"] as const;
+export const CHAT_REACTION_LEGACY  = ["✅","❌","⚠️","🚀","🎯","💡","📌","📦","⏳","🛠️"] as const;
+export function isAllowedReactionEmoji(value: unknown): boolean {
+  return CHAT_REACTION_EMOJIS.has(String(value ?? "").trim());
+}
 ...
 function reactionEmoji(value: unknown): string {
   const emoji = String(value ?? "").trim();
-  if (!CHAT_REACTION_EMOJIS.has(emoji)) {
+  if (!isAllowedReactionEmoji(emoji)) {
     throw new ChatV2HttpError(400, "Недоступная реакция");
   }
```

Confirmed **palette-only, behaviour-preserving**: no route, query, transaction, response-shape or realtime change. `git diff` was inspected before committing; nothing else is in the hunk.

Reaction route semantics (unchanged, reviewed read-only):

| Concern | Behaviour |
|---|---|
| validation | `reactionEmoji()` trims, rejects anything outside the set with `400 «Недоступная реакция»` |
| add | `INSERT … ON CONFLICT (messageId, participantType, participantId) DO UPDATE` |
| remove / toggle | `DELETE … AND emoji = <requested> RETURNING id`; if a row comes back the request stops |
| toggle semantics | one reaction per actor per message: same emoji → removed, different emoji → replaced |
| response | full updated message via `loadMessage()` incl. `reactions[{emoji,count,reactedByMe}]` |
| realtime | `broadcastLive("chat_v2_changed")` |

## 4. Reaction palette test result

New file `tests/chat-v2-reactions.test.ts` — **14 tests, all passing**, no database, no real conversation, no auth token (DB, courier auth, live-events and push are mocked):

```
 ✓ tests/chat-v2-reactions.test.ts (14 tests) 169ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

Coverage: exact 12-emoji palette in order; all 12 legacy emojis retained; the full 22-emoji surface pinned (`size === 22`); invalid values rejected (`""`, whitespace, `null`, `undefined`, `42`, `🦄`, `abc`, `<script>`, `❤` without VS16, `👍🏻` with skin-tone); route add; toggle-off; replace; legacy emoji removal; **all 12 agreed emojis round-tripped through the route**; invalid emoji → 400 with no write; invalid emoji after a valid reaction leaves it intact; deleted message → 404; non-participant → 404.

> Runtime note: the test was run with a temporary vitest config that omits `globalSetup`, so PostgreSQL was **never provisioned or touched**. The temporary config was deleted immediately; it is not part of the commit.

## 5. Chat V2 compatibility

`registerChatV2Routes(app)` is called from `server/_core/index.ts:265`.

All nine routes the mobile client calls exist:

```
GET    /api/chat/v2/contacts
GET    /api/chat/v2/conversations
POST   /api/chat/v2/conversations/direct
GET    /api/chat/v2/conversations/:conversationId/messages
POST   /api/chat/v2/conversations/:conversationId/messages
POST   /api/chat/v2/conversations/:conversationId/read
POST   /api/chat/v2/messages/:messageId/reactions
PATCH  /api/chat/v2/messages/:messageId
DELETE /api/chat/v2/messages/:messageId
```

Mobile (`lib/chat-v2.ts` @ `f3e67ed`) targets exactly these paths. **Compatible.** Live probe (unauthenticated): contacts / conversations / reactions / read all return `401`, i.e. the routes are registered on the running server.

## 6. `mails.undoDelivery` compatibility

Backend `server/routers.ts:1244` — `{ token: string, mailId: number }`, resets `status`/`mailStatus` to `not_delivered`, clears `recipientSignature`, `deliveredAt`, `courierId`, broadcasts `mails_changed`.
Mobile (`app/(tabs)/letters.tsx` @ `f3e67ed`) sends `{ token, mailId }` through the tRPC mutation. **Compatible.**
`mails.all` uses `db.getCourierVisibleMails()` (not-delivered + same-day delivered) — matches the mobile redesign’s expectation.

## 7. Hemotest cancel / assign compatibility

`server/routers.ts:987` `cancelPickup` and `:1002` `assignPickupCourier`:

```
cancelPickup        { token: string, pointId: number, date: coerce.date }
assignPickupCourier { token: string, pointId: number, date: coerce.date, courierId: number | null }
```

Both use real DB implementations (`db.cancelHemotestPickup`, `db.assignHemotestPickupCourier`) and broadcast `hemotest_changed`. Mobile sends exactly these shapes via `mutateAsync`. **Compatible.**

## 8. Sberbank cancel / assign compatibility

`server/routers.ts:1173` `cancelPickup` and `:1188` `assignPickupCourier` — identical input shapes, real DB implementations (`db.cancelSberbankPickup`, `db.assignSberbankPickupCourier`), broadcast `sberbank_changed`. **Compatible.**

Pickup payloads also expose `isCancelled`, `cancelledAt`, `courierId`, `courierName`, `courierColor`, `courierIcon` — everything the consolidated mobile `PickupOperationList` reads.

## 9. Task API compatibility

| Procedure | Contract | Mobile call | Verdict |
|---|---|---|---|
| `tasks.byId` | `{ token, id }` | `{ token, id: taskId }` | ✅ |
| `tasks.assignCourier` | `{ token, taskId, courierId: number\|null }` | same | ✅ |
| `tasks.setStatus` | `{ token, taskId, status: enum }` | same | ✅ |
| `tasks.updatePlaces` | `{ token, taskId, placesCount: min(1) }` | same (mobile now enforces min 1) | ✅ |
| `tasks.updateComments` | `{ token, taskId, courierComments: min(1) }` | same | ✅ |
| `tasks.rescheduleTask` | `{ token, taskId, newDate: date }` | same | ✅ |

`tasks.byId` → `db.getTaskWithCourierById()` joins `requests` and returns `requestType` (plus the request meta), which is what the consolidated task detail reads, with `taskType` as fallback. **Compatible.**

## 10. Request / task sync result

Read-only review of `server/_core/requestTaskSync.ts`:

- `updateRequestStatusFromTask(taskId, status, courierId?, placesCount?)` resolves the request through the `[request:<id>]` comment marker.
- maps task status → request status, sets `courierId`, applies `placesCount` only when provided, stamps `acceptedAt` / `completedAt`, and auto-prices on completion with failures logged and swallowed.
- assignment / reassignment flows through `assignCourier` → same helper; cancel/complete go through `setStatus`.

No defect found → **`requestTaskSync` was not modified.**

## 11. Firebase conclusion (unchanged)

- Shipped APK 1.0.2 = package `com.couriermig.app` + Firebase project **`device-streaming-5e0a560e`** (`google_app_id 1:616141558595:android:4479050355cada6b0c15f6`, `gcm_defaultSenderId 616141558595`).
- `mig-courier` belongs to the legacy package `space.manus.courier.app.t20260415204516` and cannot have produced the shipped APK.
- Therefore `google-services.json` is **not** replaced with `mig-courier`; the current mobile Firebase config is treated as the baseline until a runtime push test proves otherwise.
- Nothing Firebase-related was changed in this stage.

## 12. Backend checkpoint commit

```
31a3f56a3f9f6c1a0024c9515fe5dd880e3e32d4
feat(chat): accept the consolidated mobile reaction palette

 server/_core/chatV2Routes.ts    |  26 +++-
 tests/chat-v2-reactions.test.ts | 302 ++++++++++++++++++++++++++++++++++++++++
 2 files changed, 326 insertions(+), 2 deletions(-)
```

Staged files were printed before committing and a guard rejected any staged path matching `billing|smart-tariff|correspondence|courier-manager|drizzle/|migrations|requestQuote|testDb|ReportsView|api.ts`. **No unrelated file is in this commit.**

Typecheck (`tsc --noEmit`): 4 errors, **all pre-existing and unrelated** (`server/db.ts` ×2, `server/_core/correspondenceWorkflow.ts`, `tests/client-billing-cycle.test.ts`) — identical count and files before and after this stage. **0 introduced.**

## 13. Deployment source used

**No deployment was performed.** Two reasons, both hard blockers — see §19.

Prepared instead:

| Artifact | Path | State |
|---|---|---|
| Clean deployment worktree | `/home/administrator333/courier-backend-mobile-ready` | detached at `31a3f56`, `git status` **clean**, no billing/smart-tariff files, all files match HEAD, palette present |
| Deploy-prep dir | `/home/administrator333/courier-backend-deploy-prep/` | `mobile-backend-reaction-patch.patch`, `unrelated-tracked-changes.patch`, `unrelated-untracked-files.tar.gz` |

Build-context finding that forced the worktree: `Dockerfile` copies `server/`, `shared/`, `drizzle/`, `scripts/`, `courier-manager/`, `drizzle.config.ts`, `entrypoint.sh` straight from the working tree, so a `docker compose build` from the current dirty tree **would bake the uncommitted billing/smart-tariff work into the production image**. `scripts/deploy-server.sh` additionally runs `git reset --hard origin/main` and `scripts/deploy.sh` runs `docker-compose down` + `git pull` — neither is safe here.

## 14. Previous API image for rollback

| Item | Value |
|---|---|
| Container | `courier-api` |
| Container id (from `/proc/173805/cgroup`) | `ff3af8fa0427e7c5f5d5a0b88aac477d56f1525a5a4f79413ba6eeb8774566dc` |
| Started | 2026-09-17 01:50:45 (uptime 3 d 09:30 at the time of writing — unchanged, i.e. nothing was redeployed) |
| Image id / tag | **NOT RETRIEVABLE** — `docker` access is denied to this user (`unix:///var/run/docker.sock: permission denied`, no passwordless sudo, `no new privileges` flag set) and `/var/lib/docker/containers/…` is root-only |

An operator with Docker access must capture it **before** any deploy:

```bash
docker inspect --format '{{.Image}}' courier-api
docker images --digests | grep -i courier
docker inspect --format '{{json .Config.Image}}' courier-api
```

## 15. New API image

**None built.** `docker build` / `docker compose build` could not be run (no Docker permission).

## 16. Health check

| Target | Result |
|---|---|
| `http://127.0.0.1:3000/api/health` | `200` → `{"ok":true,"timestamp":1789903056002}` |
| `https://couriermig.ru/health` | `200` |
| `http://127.0.0.1/health` | `301` (nginx redirect to HTTPS) |

Compose healthcheck (`wget --spider http://localhost:3000/api/health`) is satisfied.

## 17. Startup / log errors

Not applicable — no deploy happened, so no new startup logs. The existing container has been continuously up since 2026-09-17 and answers health checks.

Risk noted for the eventual deploy: `entrypoint.sh` runs `drizzle-kit push` **only** when `RUN_DB_PUSH=true` and the SQL compat patches only when `RUN_DB_PATCHES=true`. Neither is set in `docker-compose.yml`, and `.env.deepseek` contains only `DEEPSEEK_API_KEY` (key names inspected; no values printed). So a restart will **not** run migrations or patches. Verified by default, not by execution.

## 18. Final `git status`

`courier-delivery-system` (unrelated work deliberately untouched):

```
 M courier-manager/src/lib/api.ts
 M courier-manager/src/views/ReportsView.tsx
 M drizzle/schema.ts
 M server/_core/requestQuote.ts
 M server/routers.ts
 M tests/helpers/testDb.ts
?? MOBILE_AUDIT_20260920.md
?? MOBILE_CONSOLIDATION_REPORT_20260920.md
?? drizzle/migrations/0020_client_smart_tariff_rules.sql
?? server/_core/smartTariffs.ts
?? tests/smart-tariff-financial-safety.test.ts
?? tests/smart-tariffs.test.ts
?? "Основная_движения_сверка_16.08-31.08.2026.xlsx"
```

`courier-delivery-system-apk-check` (mobile checkpoint — untouched):

```
$ git log -1 --format='%H %s'
f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9 chore(mobile): consolidate APK redesign source before new build
$ git status --porcelain=v1
(no output — clean)
```

---

## 19. Remaining blockers

1. **Docker is not accessible to this user** — `permission denied` on `/var/run/docker.sock`, user not in the `docker` group, no passwordless `sudo`, `no new privileges` flag set. Building or restarting the production container is impossible from this session. This alone blocks §8.
2. **Production source-of-truth divergence (critical).** The deployed manager bundle `/var/www/courier-manager/assets/index-DInOToej.js` (built 2026-09-17 01:44) contains the string `smartTariffPreview`, which exists **only** in the currently uncommitted working tree (`git show HEAD:server/routers.ts` has 0 occurrences; the working tree has 5). The last production deploy was therefore built from the **dirty** tree, and production today contains code that is not in git.
   *Consequence:* deploying the clean worktree at `31a3f56` would **remove** the smart-tariff/billing functionality that is currently live. That decision belongs to the owner, not to this audit.
   *Control check:* a probe of `billing.*` procedures cannot distinguish existence, because `managerSecurity.ts` guards the whole `billing.` prefix and answers `401` before tRPC path resolution — verified with a deliberately non-existent path, which also returned `401`.
3. **The reaction palette is not live yet.** The running image was built 2026-09-17, before this patch, so the new 12-emoji palette would be rejected with `400 «Недоступная реакция»` in production until the backend is redeployed. Legacy reactions are unaffected.
4. **Firebase project question** — deliberately unchanged; still open as a product decision (see MOBILE AUDIT §Firebase).
5. **Runtime push test** on a real device remains pending (carried over from the mobile stage).
6. **No device/emulator** for the on-device chat-reaction check — the route behaviour is verified by the mocked route test and by code review, not end-to-end against production data (correct per instruction §9: no production mutations were made).

---

# BACKEND READY FOR MOBILE BUILD: NO

The backend **code** is ready: the reaction patch is committed (`31a3f56`), covered by 14 passing tests, typecheck introduces 0 new errors, and every mobile-required API contract was verified against the mobile checkpoint `f3e67ed`.

It is **NO** because the *running* backend does not yet accept the new palette and deploying it is blocked:

1. Docker is not accessible from this environment, so the patch cannot be built or rolled out here.
2. The production image is currently built from a dirty working tree that contains uncommitted billing/smart-tariff code; a naive clean rebuild would silently revert live functionality. This must be resolved (commit or explicitly approve) before any deploy.

To turn this into YES, an operator with Docker access should:

1. Snapshot the current image/container for rollback (`docker inspect`, `docker images`, `docker tag`).
2. Decide how to treat the uncommitted billing/smart-tariff work — the clean worktree at `31a3f56` excludes it.
3. Build from the chosen source, `docker compose up -d api`, then verify `/api/health`, container health, startup logs, and that `POST /api/chat/v2/messages/:id/reactions` accepts `🔥` (authenticated smoke on a test conversation only).
4. Confirm `RUN_DB_PUSH` / `RUN_DB_PATCHES` remain unset so no migration runs.

**No EAS build was started. The mobile checkpoint `f3e67ed` was not modified. Stopping here.**
