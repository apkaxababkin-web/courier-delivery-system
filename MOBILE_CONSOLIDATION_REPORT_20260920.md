# MOBILE CONSOLIDATION REPORT

**Date:** 2026-09-20
**Mobile working copy:** `/home/administrator333/courier-delivery-system-apk-check`
**Branch:** `audit/server-current-state-20260702-0134`
**Base HEAD before work:** `1cb7f36`
**Main repo (comparison / backend):** `/home/administrator333/courier-delivery-system` (`feature/site-improvements-current`)

EAS build: **NOT run**. Submit / store upload: **NOT run**. `git push`: **NOT run**.

---

## 1. Snapshot path

```
/home/administrator333/mobile-snapshots/mobile-consolidation-20260920-105821
```

| Item | Value |
|---|---|
| Root | `/home/administrator333/mobile-snapshots/mobile-consolidation-20260920-105821` |
| Size | 84 MB |
| Source tarball | `apk-check-source-20260920-105821.tar.gz` — 21 039 371 bytes, 2 197 entries |
| Tarball sha256 | `00d7520c9dec2fdb068d74b7e6fc9f7ba4d88e2199c120358f1b20ffb57bb99b` |
| APK copy | `apk/app-release-1.0.2-20260913.apk` (55 285 260 bytes) |
| APK sha256 | `c616dc55b9aa3d776eb1bbaa407f16b76d4a86ee4caffad6fda3643f10907fd7` |
| backups/ | full copy, 47 entries |
| Diagnostics | `diagnostics/` — `git status --porcelain=v1`, `git diff`, `git diff --stat`, `git diff --cached --stat`, branches, tags, stash list, log, untracked list, key-file manifest (md5 only — no secret contents) |
| Pointer | `/home/administrator333/mobile-snapshots/LATEST.txt` |

Excluded from the tarball (regenerable, and the disk had only 2.9 GB free):
`node_modules`, `android/app/build`, `android/build`, `android/.gradle`, `android/.kotlin`, `.expo`, `dist`, `courier-manager/dist`.
`android/`, `ios/`, `credentials.json`, `.easignore`, `eslint.config.mjs`, `lib/chat-v2.ts` and the APK **are** included.

No secret values were printed to the console or written into this report.

---

## 2. Git checkpoint commit

```
f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9
chore(mobile): consolidate APK redesign source before new build
2026-09-20 11:13:07 +0000
```

- 1 commit ahead of `origin/audit/server-current-state-20260702-0134` — **not pushed**.
- 61 files changed, 58 759 insertions(+), 1 405 deletions(−).
- The pre-existing `stash@{0}` is untouched.

---

## 3. All changed files

Consolidation-relevant changes (files actually edited by this stage):

| File | Change |
|---|---|
| `.gitignore` | secrets rules + EAS-submit snapshot rule |
| `app/(tabs)/chat.tsx` | chat v2 reactions / scroll-to-latest / menu |
| `app/(tabs)/index.tsx` | duplicate startup fetch removed |
| `app/(tabs)/letters.tsx` | undo via tRPC, clear ×, input hardening, snapshot fallback |
| `app/(tabs)/pickup-gemotest.tsx` | confirmation, async handlers, courier colour, focus dedupe |
| `app/(tabs)/pickup-sberbank.tsx` | same as above |
| `app/_layout.tsx` | `getPushRoute`, cold-start push, cache hydration, perf logging |
| `app/task/[id].tsx` | `placesCount` default/min + plural form |
| `components/pickup-operation-list.tsx` | exact-ID collection confirmation, loading/error, courier colour |
| `lib/chat-v2.ts` | reactions typed API |
| `lib/query-cache-persist.ts` | **new** — cache-first layer |
| `lib/perf-mark.ts` | **new** — dev-only instrumentation |
| `assets/images/icon.png` | restored from HEAD |
| `assets/images/favicon.png` | restored from HEAD |
| `assets/images/splash-icon.png` | restored from HEAD |
| `assets/images/android-icon-foreground.png` | restored from HEAD |
| `0`, `tsc`, `{n`, `app-template@1.0.0`, `assets/icon.png` | removed (proven junk) |

Committed but **not** edited at this stage (pre-existing working-tree state that is the actual APK source):
`app.config.ts`, `eas.json`, `google-services.json`, `app/(tabs)/_layout.tsx`, `hooks/use-mobile-live-sync.ts`, `components/operation-row.tsx`, `server/routers.ts`, `eslint.config.js`→`eslint.config.mjs`, `.easignore`, `lib/chat-v2.ts` origin, 24 backup snapshots.

Main repo (production backend), 1 file:
`server/_core/chatV2Routes.ts` (+8 / −1) — reaction palette union.

---

## 4. What was ported from main

1. **Chat v2 final state** — applied as the exact upstream diff `daa13f6..b8e722b` because the apk-check working tree was byte-identical to `daa13f6`:
   reactions, reaction chips, reaction menu, `isNearBottom` + scroll-to-latest button, `onLayout` scroll pinning, `senderId === null` handling.
2. **`getPushRoute`** — chat v2 deep link (with `conversationId`), `new_request_available`, `request_assigned`, `request_reassigned`, `hemotest_*`, `sberbank_*`, `unfinished_tasks_reminder`, `scheduled_requests_available`, legacy `data.url` fallback.
3. **Cold-start push handling** — `getLastNotificationResponseAsync()` + notification-id de-duplication.
4. **`mails.undoDelivery`** — the redesign screen now uses the typed tRPC mutation.
5. **Courier colour** — `couriers.displayColor` / pickup `courierColor` from the existing production payloads.
6. **Production API contracts verified** — pickup cancel / assign, `tasks.*`, `placesCount` min 1.

## 5. What was preserved from the apk-check redesign

`OperationRow`, `PickupOperationList`, `HeaderBarV2`, `ScreenContainer`, the existing layout and mobile styling, `app/lib/local-date.ts`, theme providers, `lib/vibration-preference.ts`, mobile navigation, `design-preview`, the September-12 `requestType` task-detail blocks, and all July mobile fixes. No screen was replaced by its main-repo counterpart.

## 6. What was implemented new

1. **Collection confirmation** (shared `PickupOperationList`, used by Gemotest and Sberbank): modal titled «Подтвердите сбор точки» with the point name and address, buttons «Подтвердить сбор» / «Отмена». The pending confirmation stores the **unique point id**; the mutation is applied to that id only. Guards: re-entrancy (double tap), stale-list detection (point removed or state flipped while the dialog was open), in-flight disabled button + spinner, explicit error box, refresh after success, and no optimistic marking — the server stays authoritative.
2. **Letters search clear `×`** — visible only when the query is non-empty; clears to `""` and the list recomputes from the full set with the other filters untouched.
3. **Letters input hardening** — `autoCorrect={false}`, `autoCapitalize="none"`, `autoComplete="off"`, `importantForAutofill="no"`, `textContentType="none"`, `spellCheck={false}`, `clearButtonMode="never"`.
4. **`placesCount` default/min** — default `1`, minimum `1` (matches `tasks.updatePlaces` which already used `z.number().min(1)`; the screen previously accepted `0` and let the server reject it), plus correct Russian plural form («место / места / мест»).
5. **Cache-first / stale-while-revalidate layer** — no new dependency (AsyncStorage + superjson, both already present).
6. **Dev-only performance instrumentation**.
7. **Duplicate startup request removal** — first focus is skipped after the mount fetch on Requests, Gemotest and Sberbank; the heavy letters realtime snapshot is now a real fallback instead of an unconditional second request.

---

## 7–11. Status by area

### 7. Chat — `app/(tabs)/chat.tsx`, `lib/chat-v2.ts`

| Check | Status | Evidence |
|---|---|---|
| latest message / pinned after send | ✅ | `stickToBottomUntilRef`, `shouldScrollRef` on send |
| scroll-to-latest button | ✅ | `scrollToLatest` + ChevronDown button, a11y label «К последнему сообщению» |
| initial scroll | ✅ | `showLoader` → `nearBottom` + 2 s stick window |
| own right / other left | ✅ | `isMessageFromActor` + `own` alignment |
| date separators | ✅ | `showDateSeparator` (line ~581) |
| Irkutsk time | ✅ | `CHAT_TIME_ZONE = "Asia/Irkutsk"` |
| iOS keyboard gap | ✅ | `keyboardWillShow/Hide`, `KeyboardAvoidingView behavior="padding"`, `keyboardHidesTabBar` |
| edit own message | ✅ | `beginEdit` + PATCH `/api/chat/v2/messages/:id` |
| delete own message | ✅ | `deleteMessage` + confirmation |
| long-press menu | ✅ | `messageMenu` modal |
| reactions | ✅ | `toggleReaction` + `CHAT_REACTIONS` |
| realtime reactions | ✅ | `chat_v2_changed` via `useMobileLiveSync` |

**Reaction palette** is the agreed set: ❤️ 🔥 😂 🤩 😍 🎉 💯 👏 👍 🤝 👀 🤯.
The production backend previously allowed only the old 10 emojis, so `server/_core/chatV2Routes.ts` was updated to a **superset** (new 12 + legacy 10) — a legacy reaction can still be toggled off instead of failing with 400.

### 8. Push / deep links — `app/_layout.tsx`

Routing implemented for `chat_message_v2`, `request_assigned` / `request_reassigned` / `new_request_available` → `/task/{id}`, `hemotest_list_created|hemotest_point_added|hemotest_point_removed` → `/(tabs)/pickup-gemotest`, `sberbank_*` → `/(tabs)/pickup-sberbank`, `unfinished_tasks_reminder` / `scheduled_requests_available` → `/(tabs)`, plus legacy `data.url`.

- foreground / background listener: ✅
- cold start / killed app: ✅ (`getLastNotificationResponseAsync`, listener attached only after the root navigator is mounted)
- de-duplication by notification id: ✅
- Firebase credentials: untouched.

### 9. Hemotest — `app/(tabs)/pickup-gemotest.tsx` + `PickupOperationList`

Redesign preserved ✅ · confirmation before collected ✅ · exact point id ✅ · double-tap protection ✅ · cancel ✅ · assign ✅ · courier colour ✅.

### 10. Sberbank — `app/(tabs)/pickup-sberbank.tsx`

Identical to Hemotest (same shared component). ✅

### 11. Letters — `app/(tabs)/letters.tsx`

Redesign preserved ✅ · undo delivery ✅ (now via tRPC; the previous raw `fetch` was **broken** — `httpBatchLink` + superjson cannot decode a bare `{token, mailId}` body, so undo silently failed) · same-day delivered logic retained ✅ · undelivered + relevant delivered ✅ · clear × ✅ · autocorrect/autocomplete disabled ✅ · exact query used (`search.trim().toLowerCase()` over waybill / recipient / phone / address) ✅.

---

### 12. placesCount

Flow: modal (`number-pad`, max 3) → `tasks.updatePlaces({token, taskId, placesCount})` → production `db.updateTaskStatus(..., {placesCount})` → `updateRequestStatusFromTask(...)` → Postgres → `tasks.byId` refetch.

- **Found and fixed a real defect:** the screen allowed `0` while the backend requires `min(1)` → user-visible server error. Now validated client-side with a clear message.
- Default is now `1` when the value is absent (schema comment: “Number of places (packages). Default 1”).
- Plural form corrected (2 → «места», previously «мест»).

### 13. Request ↔ task sync

Verified against the production router — the mobile call sites match exactly:
`tasks.byId({token,id})`, `assignCourier({token,taskId,courierId})`, `setStatus({token,taskId,status})`, `updatePlaces({token,taskId,placesCount})`, `updateComments({token,taskId,courierComments})`, `rescheduleTask({token,taskId,newDate})`.
`requestType` on the task detail comes from the production join with `requests` (`getTaskWithCourierById` spreads `requestMeta` and sets `requestType`), with `taskType` as fallback.
**`requestTaskSync` was not modified** — no proven problem.

---

## 14. Performance changes

1. `lib/query-cache-persist.ts` — hydrates the TanStack Query cache from AsyncStorage **before the first render**, using per-entry `updatedAt` so restored data is stale and every query revalidates in the background. Only successful reads of whitelisted roots (`tasks`, `mails`, `hemotest`, `sberbank`, `couriers`, `requests`, `courierAuth`, `courier-mobile-board-tasks`) are stored; mutations are never persisted. Chat is deliberately excluded (event-driven, refetched on open, and message bodies should not be written to disk).
2. **Token safety**: the courier session token appears inside query keys, so it is replaced by a sentinel before writing and substituted back on hydration — the token is never written to AsyncStorage.
3. **Error resilience**: only `status === "success"` data is persisted, so a network error can never overwrite a good cached list with an empty array.
4. Debounced writes (1.5 s), ≤60 entries, ≤300 KB per entry, ≤1.8 MB total, 7-day expiry.
5. QueryClient defaults: `staleTime 10 s`, `gcTime 24 h`, `refetchOnWindowFocus: false`, `retry: 1`.
6. Removed duplicate startup requests (see §15).
7. `[Letters] state` debug log is now `__DEV__`-only.
8. No new state-management library, no Expo/RN upgrade, no architectural rewrite.

---

## 15. Before / after measurements

### Deterministic, code-derived request budget (reproducible)

Counted from the source of the snapshot vs the current tree:

| Screen (first mount) | BEFORE | AFTER | Why |
|---|---|---|---|
| Requests (`index.tsx`) | 2 | **1** | mount query + first `useFocusEffect` refetch → first focus skipped |
| Letters | 2 | **1** | `mails.all` + unconditional realtime snapshot → snapshot only when `mails.all` is empty |
| Gemotest | 5 | **3** | 3 queries + 2 focus refetches → first focus skipped |
| Sberbank | 5 | **3** | same |
| **Total for one pass over the four screens** | **14** | **8** | −6 requests |
| Letters on every `mails_changed` | 2 | **1** | `mails.all` only (snapshot is fallback mode) |

Checks: `app/(tabs)/index.tsx:287-301` (`hasFocusedOnceRef`), `app/(tabs)/pickup-{gemotest,sberbank}.tsx` (`hasFocusedOnceRef`), `app/(tabs)/letters.tsx:147-180` (`isMailsFallbackModeRef`).

### Runtime timings — NOT MEASURED

`adb devices` reports **no attached device** and there is **no emulator binary / AVD** on this host, so app start, first cached content, fresh content and per-screen timings **could not be measured**. No numbers are invented.

To make those numbers obtainable on a real device, dev-only instrumentation was added (`lib/perf-mark.ts`, wired in `app/_layout.tsx`) and is a **no-op in production builds**:

```
[PERF] cached content available at start: tasks, mails, ...
[PERF] cache:hydrate: <ms>
[PERF] app:first-render @ <ms>
[PERF] cached|fresh query:tasks first-success @ <ms>
[PERF] cached|fresh query:mails first-success @ <ms>
[PERF] cached|fresh query:hemotest first-success @ <ms>
[PERF] cached|fresh query:sberbank first-success @ <ms>
[PERF] cached|fresh query:chatV2 first-success @ <ms>
```

---

## 16. Typecheck / test results

| Check | BEFORE | AFTER | Verdict |
|---|---|---|---|
| `tsc --noEmit` (apk-check) | 0 errors | **0 errors** | 0 introduced |
| `expo lint` (apk-check) | 0 errors, 45 warnings | **0 errors, 45 warnings** | identical warning set (diff shows only path/line shifts) |
| `vitest run` (apk-check) | — | **12 passed, 1 skipped**, exit 0 | the single skip (`tests/auth.logout.test.ts`) is pre-existing |
| `tsc --noEmit` (main repo) | — | 4 errors, **0 in `chatV2Routes.ts`** | PRE-EXISTING, in unrelated uncommitted billing/correspondence files (`server/db.ts` ×2, `server/_core/correspondenceWorkflow.ts`, `tests/client-billing-cycle.test.ts`) |

The BEFORE baseline was produced by extracting the safety snapshot into `/tmp/apk-before` with a symlinked `node_modules`, so before/after are directly comparable.

---

## 17. Firebase status — **UNRESOLVED / BLOCKER (unchanged, not guessed)**

Read-only diagnosis:

- The shipped APK 1.0.2 contains `google_app_id = 1:616141558595:android:4479050355cada6b0c15f6`, `gcm_defaultSenderId = 616141558595`, resource package `com.couriermig.app` → Firebase project **`device-streaming-5e0a560e`**.
- The working-tree `google-services.json` matches exactly (`device-streaming-5e0a560e`, package `com.couriermig.app`).
- The `mig-courier` project (apk HEAD / main repo) belongs to package `space.manus.courier.app.t20260415204516` and **cannot** have produced the shipped APK.
- The `space.manus...` string that also appears inside the APK is **not** Firebase config: it is a stale `bundleId` constant in `constants/oauth.ts` (present identically in both repos) used for the OAuth scheme.

`google-services.json`, the Firebase project, push credentials, `app.config.ts` and `eas.json` were **left unchanged** (md5 verified identical to the snapshot). Whether `device-streaming-5e0a560e` is the *intended production* Firebase project cannot be proven from local evidence → left as a blocker rather than guessed.

---

## 18. Secret-safety status — **PASS**

`.gitignore` now blocks: `credentials.json`, `.eas-local-credentials/`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.cer`, `*.certSigningRequest`, `backups/credentials-*.json`, `backups/*-credentials-*.json`, `backups/**/eas.json`.

Verified:

| File | On disk | Git |
|---|---|---|
| `credentials.json` | exists | IGNORED |
| `backups/credentials-before-android-*.json` | exists | IGNORED |
| `backups/eas-before-android-credentials-*.json` | exists | IGNORED |
| `.eas-local-credentials/ios/ios_distribution.p12` | exists | IGNORED |
| `.eas-local-credentials/ios/*.mobileprovision` | exists | IGNORED |
| `backups/before-ios-remote-version-*/eas.json` (ASC ids) | exists | IGNORED (kept in external snapshot) |

The staged set was scanned before committing (`git diff --cached --name-only`): **no secret-like path**. Untracked files were content-scanned for `PRIVATE KEY` / `CERTIFICATE` / `keystorePassword` / `ascApiKey` — the only hit was the ASC-identifier `eas.json` snapshot, which is now git-ignored. `node_modules`, `dist`, `courier-manager/dist`, `/android`, `/ios`, `android/app/build` remain ignored.

---

## 19. Remaining blockers

1. **Firebase project unresolved** (§17) — deliberately unchanged; needs a product decision.
2. **Backend deployment required for the new reaction palette.** `server/_core/chatV2Routes.ts` in the main repo now accepts the agreed palette (**uncommitted, undeployed**). Until that backend change is deployed, the new palette returns `400 «Недоступная реакция»`; legacy reactions keep working.
3. **No device/emulator available** → the new confirmation modal, cold-start push routing, and all runtime timings are verified by code review and typecheck only, **not** by a device smoke test.
4. **Production deployment state not verifiable from here.** The mobile frontend targets the production main-repo API for `chat/v2`, `mails.undoDelivery` and pickup `cancelPickup` / `assignPickupCourier`. The repo contains those implementations; whether the currently running server is at that revision must be confirmed before release.
5. **apk-check local backend is not production.** It still contains no-op `cancelPickup` / `assignPickupCourier` stubs and no `chatV2Routes.ts`. No production backend code was duplicated into apk-check; the local copy is only build/test scaffolding and is intentionally left as-is.
6. **Minor known duplication:** `chatV2.conversations` is fetched by both the tab-bar unread badge (`app/(tabs)/_layout.tsx`) and the chat screen. Fixing it cleanly needs a shared cache — not done to avoid an architectural rewrite.
7. **Pre-existing main-repo typecheck errors** (4, unrelated files, §16) — not introduced here.
8. `components/operation-row.tsx.before-restore-separators-20260630-140720` was kept: it is a backup, not a proven duplicate.

---

## 20. Exact `git status`

`courier-delivery-system-apk-check` — **clean**:

```
$ git status --porcelain=v1
(no output)

$ git log -1 --format='%H %s'
f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9 chore(mobile): consolidate APK redesign source before new build
```

`courier-delivery-system` (main repo, pre-existing unrelated work still present):

```
 M courier-manager/src/lib/api.ts
 M courier-manager/src/views/ReportsView.tsx
 M drizzle/schema.ts
 M server/_core/requestQuote.ts
 M server/_core/chatV2Routes.ts        <- this stage (reaction palette union)
 M server/routers.ts
 M tests/helpers/testDb.ts
?? MOBILE_AUDIT_20260920.md            <- audit report (previous stage)
?? drizzle/migrations/0020_client_smart_tariff_rules.sql
?? server/_core/smartTariffs.ts
?? tests/smart-tariff-financial-safety.test.ts
?? tests/smart-tariffs.test.ts
?? "Основная_движения_сверка_16.08-31.08.2026.xlsx"
```

---

## Build-config checklist

| Item | Status |
|---|---|
| `app.config.ts` preserved (v1.0.2, `com.couriermig.app`, `softwareKeyboardLayoutMode: "pan"`) | ✅ unchanged (md5 match) |
| EAS config preserved (`eas.json` remote versioning, local credentials, autoIncrement) | ✅ unchanged (md5 match) |
| package `com.couriermig.app` | ✅ |
| secrets excluded from git/build | ✅ |
| Firebase unresolved config **not** guessed | ✅ (blocker recorded) |
| icons corrected (icon / favicon / splash / android foreground) | ✅ restored from HEAD, correct dimensions |

---

# READY FOR BUILD: NO

Not because of a code defect — TypeScript introduced errors are 0, lint is unchanged, and tests pass — but because two of the stated conditions are not fully satisfied:

1. **Mobile API ↔ production backend:** the agreed reaction palette requires deploying the prepared backend change (`server/_core/chatV2Routes.ts`). Until it is deployed, reactions will fail on device.
2. **Critical functionality verified:** the collection-confirmation flow, cold-start push routing and all performance numbers have no device/emulator verification on this host.

Minimum steps to flip the verdict to YES:

1. Deploy the main-repo backend change (reaction palette) and confirm the running server is at the revision containing `chat/v2`, `mails.undoDelivery`, `cancelPickup`, `assignPickupCourier`.
2. Install the current build on a real Android device (and iOS) and run the checklist: confirm a collection on Gemotest and Sberbank, cancel/assign, letters undo, clear ×, chat reactions/scroll-to-latest, and a cold-start push of each type.
3. Resolve or explicitly accept the Firebase project question.
4. Collect the `[PERF]` lines for the before/after record.

**Per instructions the EAS build is NOT started. Stopping here and waiting for explicit approval.**
