# PRODUCTION SOURCE RECOVERY REPORT

**Date:** 2026-09-20
**Repo:** `/home/administrator333/courier-delivery-system`
**Branch:** `feature/site-improvements-current`
**Stage scope:** AUDIT → RECONSTRUCT → TEST → CHECKPOINT. No deploy, no EAS, no DB migration, no API restart, mobile repo untouched.

---

## 1. Snapshot path + hash

```
/home/administrator333/backend-snapshots/production-source-recovery-20260920-112453
```

| Item | Value |
|---|---|
| Source tarball | `main-repo-source-20260920-112453.tar.gz` — 118 335 847 bytes, 19 808 entries |
| sha256 | `4ba308861cdbc3c3f8dbc99723c6b3bd7a7815712576a34fe6decf64133b5306` |
| `untracked/` | all 8 untracked files copied verbatim (incl. the Cyrillic-named XLSX) |
| `diagnostics/` | `status-porcelain.txt`, `status.txt`, `diff.patch`, `diff-stat.txt`, `diff-cached-stat.txt`, `log.txt`, `head.txt`, `branch.txt`, `untracked-list.txt`, `git-info.txt` |
| `production-evidence/` | `production-evidence.txt` (process, health, nginx, manager artefacts + hashes) |
| Excluded (regenerable) | `node_modules`, `dist`, `courier-manager/dist`, `.git`, `uploads`, `build`, `.gradle`, `.cache`, `.expo` |
| Pointer | `/home/administrator333/backend-snapshots/LATEST.txt` |

The snapshot is sufficient to restore the dirty working tree: `git diff` patch + every untracked file + full source tree. No secret values were printed.

## 2. Starting main HEAD

| Point | Commit |
|---|---|
| Before the previous stage (git baseline) | `8b32e81cc34d969a8ef533f9f7d7bd67c98fc1c0` |
| **At the start of this stage** | `31a3f56a3f9f6c1a0024c9515fe5dd880e3e32d4` (reaction patch) |
| At the end of this stage | `005e8562a1c1fdd50711e14b76f3f187c9a019cb` |

## 3. Starting dirty files (14 entries — confirmed)

```
 M courier-manager/src/lib/api.ts
 M courier-manager/src/views/ReportsView.tsx
 M drizzle/schema.ts
 M server/_core/requestQuote.ts
 M server/routers.ts
 M tests/helpers/testDb.ts
?? MOBILE_AUDIT_20260920.md
?? MOBILE_BACKEND_READINESS_REPORT_20260920.md
?? MOBILE_CONSOLIDATION_REPORT_20260920.md
?? drizzle/migrations/0020_client_smart_tariff_rules.sql
?? server/_core/smartTariffs.ts
?? tests/smart-tariff-financial-safety.test.ts
?? tests/smart-tariffs.test.ts
?? "Основная_движения_сверка_16.08-31.08.2026.xlsx"
```

## 4. Classification of every dirty file

Categories: **A** production functionality · **B** tests only · **C** migration/schema · **D** report/document · **E** unrelated artifact · **F** uncertain.

| File | Cat | Evidence / role |
|---|---|---|
| `server/_core/smartTariffs.ts` (639 lines) | **A** | rule CRUD, selection preview, rule application; imports `clientTariffRules`, `requests`, `requestQuote`, `billingReview` |
| `server/_core/requestQuote.ts` | **A** | 15 hunks, **all** smart-tariff: `normalizeTariffAddress`, `smartRuleMatches`, `chooseSmartTariffRule`, `computeSmartTariff`, `quoteSmartTariff`, `tariffWeekday`, `loadSmartTariffRules`; `quoteTariffRuleId`/`quoteTariffSnapshot` audit; guarded `repriceAutomatic` |
| `server/routers.ts` | **A** | 3 hunks, all smart-tariff: the 5 `billing.*` procedures + `repriceAutomatic: true` in `quoteClientRequests` / `applyQuoteForRequest`. **No unrelated hunk.** |
| `drizzle/schema.ts` | **A + C** | `clientTariffRules` table + `requests.quoteTariffRuleId` / `quoteTariffSnapshot` |
| `drizzle/migrations/0020_client_smart_tariff_rules.sql` | **C** | DDL: table, 2 CHECK constraints, 3 indexes, 2 `requests` columns, 1 index |
| `courier-manager/src/lib/api.ts` | **A** | +168 lines: `SmartTariffRule`, `SmartTariffSelectionPreview`, create/update/disable types and calls |
| `courier-manager/src/views/ReportsView.tsx` | **A** | 32 hunks: smart-tariff UI in the client "Тарифы" section + compaction of the review/documents period layout. Removed blocks are relocated/rewritten inside the same feature — not a separate task |
| `tests/smart-tariffs.test.ts` (189 lines) | **B** | pure rule-matching unit tests, imports only from `requestQuote`, **no DB** |
| `tests/smart-tariff-financial-safety.test.ts` (855 lines) | **B** | DB-backed safety tests via `helpers/billingSeed` |
| `tests/helpers/testDb.ts` | **B (support)** | one line: registers `0020_client_smart_tariff_rules.sql` in the test-DB migration list — **required**, otherwise the throwaway test DB has no `clientTariffRules` and the safety test cannot run |
| `MOBILE_AUDIT_20260920.md`, `MOBILE_CONSOLIDATION_REPORT_20260920.md`, `MOBILE_BACKEND_READINESS_REPORT_20260920.md` | **D** | stage reports, excluded from the checkpoint |
| `Основная_движения_сверка_16.08-31.08.2026.xlsx` | **E** | reconciliation workbook, excluded from the checkpoint |

No file fell into category **F**.

## 5. Smart-tariff dependency graph

```
drizzle/migrations/0020_client_smart_tariff_rules.sql      (DDL, untracked)
        └─ creates clientTariffRules + requests.quoteTariffRuleId/quoteTariffSnapshot + indexes
                └─ declared in  drizzle/schema.ts                       (dirty)
                        └─ consumed by  server/_core/smartTariffs.ts    (untracked)
                                ├─ import * as db from "../db"                       (committed)
                                ├─ import { clientTariffRules, requests } from schema (dirty)
                                ├─ import { normalizeTariffAddress, quoteClientRequests } from "./requestQuote" (dirty)
                                └─ import { activeBillingMembership } from "./billingReview"  (committed, clean)
                                        └─ registered in server/routers.ts  (dirty)
                                                billing.smartTariffPreview
                                                billing.smartTariffs
                                                billing.createSmartTariff
                                                billing.updateSmartTariff
                                                billing.disableSmartTariff
                                                        └─ consumed by courier-manager/src/lib/api.ts      (dirty)
                                                                └─ courier-manager/src/views/ReportsView.tsx (dirty)
tests/smart-tariff-financial-safety.test.ts (untracked) ─┬─ helpers/billingSeed.ts (committed, clean)
                                                          └─ testDb.ts migration list (dirty)  → needs 0020
tests/smart-tariffs.test.ts (untracked) ── only server/_core/requestQuote.ts
```

Verification that the set is complete: every file in the repo containing `smartTariff` / `SmartTariff` / `clientTariffRules` is listed above, and **none** of them was already clean/committed. No other dependency is missing (`billingReview.ts` and `billingSeed.ts` are already in git). The manager builds from this set (see §9) and the backend bundles from it (§17).

## 6. Changes **proven** to be in production

| What | Proof |
|---|---|
| Manager frontend code, incl. all smart-tariff UI | The served bundle `/var/www/courier-manager/assets/index-DInOToej.js` has sha256 `1ede68d040e5584aa876c93144efd8ecba98b64e28015346e8ef53b806becb02` — **byte-identical** to a fresh build of the current `courier-manager/` source with the manager's own toolchain (vite 8.0.10). `smartTariffPreview` has **0** occurrences at HEAD. |
| Production DB schema for smart tariff | Live read-only query on the published Postgres port: `clientTariffRules` **exists** with 14 columns (`id, clientId, name, requestType, fromAddressNormalized, toAddressNormalized, weekdays, firstPlacePrice, nextPlacePrice, priority, isActive, createdByManagerId, createdAt, updatedAt`), indexes `clientTariffRules_client_active_idx`, `clientTariffRules_client_request_type_idx`, pkey; `requests.quoteTariffRuleId` and `requests.quoteTariffSnapshot` exist; `requests_quote_tariff_rule_idx` exists. Row count `0`. |
| That migration 0020 is effectively applied | The live table/columns/indexes match migration 0020 exactly. |

## 7. Changes only **presumed** (not directly proven)

| What | Why not proven | Corroboration |
|---|---|---|
| The smart-tariff **backend** procedures in the running API | `managerSecurity.ts` guards the whole `billing.` prefix and answers `401` **before** tRPC path resolution — verified with a deliberately non-existent path (`billing.definitelyNotAProcedure` → `401`, not `404`), so a probe cannot distinguish existence. No manager token was used. | The DB schema exists; the deployed UI calls those exact procedures (`smartTariffPreview`); the operator's 2026-09-17 production check recorded `createSmartTariff`, `disableSmartTariff`, `smartTariffPreview`, `smartTariffs`, `updateSmartTariff` on the running API. |
| Exact backend revision in the image | Docker/`/var/lib/docker` are not readable → **UNVERIFIED**. | Container start 2026-09-17 01:50:45, i.e. after the 01:38/01:44 builds of the dirty tree. |
| Deployed CSS | The deployed `index-lnspugyz.css` (72 232 B, sha256 `d94314cc…`) is **not** byte-identical to a build of the current source (`index-DOLRE5cS.css`, 71 863 B, sha256 `44b006d5…`). JS is identical, CSS differs → a styling-only difference between the deployed build and a build of the current source. | Cosmetic; does not affect backend readiness. Honest uncertainty recorded. |

Deliberate control: the string `smartTariffPreview` in the manager JS proves **frontend** code only; backend presence is asserted separately and labelled presumed.

## 8. Production DB schema status

**PRESENT** — read-only `information_schema` / `pg_indexes` / `to_regclass` inspection only. No `INSERT/UPDATE/DELETE/ALTER/CREATE/DROP`, no `drizzle push`, no migration was executed.

- `clientTariffRules`: present, 14 columns, 3 indexes, **0 rows**.
- `requests.quoteTariffRuleId`, `requests.quoteTariffSnapshot`, `requests_quote_tariff_rule_idx`: present.
- `__drizzle_migrations`: **absent** → the project does not track migrations through Drizzle's table; schema is applied by other means (manual SQL / entrypoint patches). Consistent with the schema already being live.

Consequence for deploy: **production needs no unknown schema migration** for the recovered source — the required schema is already there.

## 9. Manager bundle comparison (§9)

| Marker | Fresh build of current source | Production bundle | Repo `dist` build (01:38) |
|---|---|---|---|
| `smartTariffPreview` | 1 | 1 | 1 |
| `Настроить тариф` | 1 | 1 | 1 |
| `Пн–Пт` | 1 | 1 | 1 |
| `Сб–Вс` | 1 | 1 | 1 |
| `Редактировать` | 5 | 3 | 3 |

- Fresh local builds were run **to `/tmp` only** (`--outDir /tmp/manager-build-check`, `/tmp/manager-build-mgrvite`). `/var/www/courier-manager` was **not** touched.
- With the manager's own vite (8.0.10) the build reproduces the repo `dist` artefacts exactly (JS `1ede68d0…`, CSS `44b006d5…`, same filenames). The root vite (5.4.21) produces a different bundle — that explains the `Редактировать` count difference in the fresh-vs-deployed column and is a toolchain artefact, not a source difference.
- **Conclusion:** production manager **JS** == build of the current source; production **CSS** differs (see §7).

## 10. Production backend verification (§10)

Status: **UNVERIFIED** (as anticipated). Attempted, safely:

- unauthenticated existence probes for `/api/chat/v2/*` → `401` (routes registered, guard `requireManagerOrCourierAuth`).
- `billing.*` probes are **not** evidence of existence — proven with a control request to a non-existent procedure, which also returned `401`.
- No manager credentials were used; no production data was touched.
- Container filesystem/`dist` and Docker metadata are not readable without Docker/root.

## 11. Smart-tariff was not rewritten

Recovery only. No refactor, no architecture change, no business-logic change. The only edit made anywhere in this stage was committing existing content; no source line was modified.

## 12. Tests

| Test | DB needed | Result |
|---|---|---|
| `tests/smart-tariffs.test.ts` | **No** (imports only pure functions from `requestQuote`) | ✅ **10 passed** |
| `tests/chat-v2-reactions.test.ts` | No (mocked) | ✅ **14 passed** |
| `tests/smart-tariff-financial-safety.test.ts` | **Yes** (`helpers/billingSeed` + test DB) | ⛔ **NOT RUN** — see below |

**Why the DB-backed test was not run:** the only reachable PostgreSQL is the **production** server (the `.env` URL points at the docker-internal host `postgres`, unreachable; the published `127.0.0.1:5432` is the production container). `tests/helpers/testDb.ts` provisions a throwaway `courier_billing_test` database **on that server**. Per the stage rules ("Никогда не направлять тесты на production DB… Если безопасный test DB недоступен — не запускать DB-mutating test") it was deliberately skipped. Both DB-free suites were executed with a temporary vitest config that omits `globalSetup`, so **no database was created or contacted**; the temporary config was deleted and is not committed.

Suggested safe way to run it later: point `TEST_DATABASE_URL` at a disposable Postgres that is not the production instance.

## 13. Typecheck before / after

| Check | Before | After | Delta |
|---|---|---|---|
| `tsc --noEmit` (main repo) | 4 errors | **4 errors** | **0 introduced** |
| `tsc --noEmit` (courier-manager) | — | **0 errors** | clean |

The 4 errors are exactly the known pre-existing ones: `server/db.ts` ×2 (`tx` implicitly any), `server/_core/correspondenceWorkflow.ts` (`n` implicitly any), `tests/client-billing-cycle.test.ts` (`Buffer<ArrayBufferLike>`). **None is in a smart-tariff file.**

## 14. Exact files in the smart-tariff checkpoint

```
git diff --cached --name-only   (10 files, printed before commit)

courier-manager/src/lib/api.ts
courier-manager/src/views/ReportsView.tsx
drizzle/migrations/0020_client_smart_tariff_rules.sql
drizzle/schema.ts
server/_core/requestQuote.ts
server/_core/smartTariffs.ts
server/routers.ts
tests/helpers/testDb.ts
tests/smart-tariff-financial-safety.test.ts
tests/smart-tariffs.test.ts
```

Every path was reviewed individually; a guard rejected any staged path matching `MOBILE_*`, `*.xlsx`, `correspondence`, `credentials`, `.env`, `node_modules`, `dist/`, `*.jks`, `*.p8`, `*.p12`, `*.mobileprovision`. `git add -A` / `git add .` were **not** used.

`tests/helpers/testDb.ts` is included **because** `tests/smart-tariff-financial-safety.test.ts` builds its throwaway database by applying the listed migrations; without `0020` the `clientTariffRules` table would not exist and the test could not pass.

## 15. Smart-tariff checkpoint hash

```
005e8562a1c1fdd50711e14b76f3f187c9a019cb
feat(billing): recover production smart-tariff source into git
10 files changed, 3376 insertions(+), 251 deletions(-)
2026-09-20 11:29:30 +0000
```

## 16. Relationship to the reaction commit `31a3f56`

`31a3f56` is the **direct parent** of `005e856` (`git merge-base --is-ancestor 31a3f56 HEAD` → true). No cherry-pick was needed. History:

```
005e856  feat(billing): recover production smart-tariff source into git      <- combined base
31a3f56  feat(chat): accept the consolidated mobile reaction palette
8b32e81  feat(billing): add annual numbering and period suggestions
```

Contents verified at `005e856`: `CHAT_REACTION_PALETTE` present in `chatV2Routes.ts`; `server/_core/smartTariffs.ts` = 639 lines; `smartTariffPreview` present in `routers.ts`.

## 17. Final combined backend commit

```
005e8562a1c1fdd50711e14b76f3f187c9a019cb
```

Contains (A) recovered production smart-tariff functionality, (B) the reaction backend patch, (C) the pre-existing billing/backend history.

## 18. Clean deployment worktree

```
/home/administrator333/courier-backend-production-ready      HEAD 005e856 (detached)
$ git status --porcelain=v1   →   (empty)
```

Verified inside it: reaction palette present, `server/_core/smartTariffs.ts` present, migration `0020` present, reaction test present, both smart-tariff test files present, **no** `MOBILE_*` report and **no** XLSX.

The previously prepared, now-superseded `/home/administrator333/courier-backend-mobile-ready` (at `31a3f56`, **without** smart-tariff) was removed so that nobody can deploy an incomplete backend by mistake. It is fully reproducible from git.

## 19. Docker access status

**DENIED.** `docker` cannot reach `/var/run/docker.sock` (`permission denied`); the user is not in the `docker` group (`docker:x:113:` has no members) and `sudo` is blocked by the `no new privileges` flag. `/var/lib/docker/containers/...` is root-only. No permission workaround was attempted.

## 20. Current production container / image evidence

| Item | Value |
|---|---|
| Container name | `courier-api` |
| Container id | `ff3af8fa0427e7c5f5d5a0b88aac477d56f1525a5a4f79413ba6eeb8774566dc` |
| Started | 2026-09-17 01:50:45 (uptime 3 d 09 h 39 m at the end of this stage — unchanged) |
| Cmd | `node dist/index.js` |
| Image id / tag | **NOT RETRIEVABLE** (no Docker access) |
| `/api/health` | `200 {"ok":true,...}` on `127.0.0.1:3000` and on `https://couriermig.ru/api/health` |
| `/health` externally | `200 text/html` — that is the nginx SPA fallback, **not** the API health endpoint |
| nginx doc root | `/var/www/courier-manager` (manager served from the host, not from the image) |
| Manager assets | `index-DInOToej.js` sha256 `1ede68d040e5584aa876c93144efd8ecba98b64e28015346e8ef53b806becb02`; `index-lnspugyz.css` sha256 `d94314cc5b3a7f52a1ff…`; `index.html` sha256 `d3c9fc09d24c20cc1868af543f8d2597c261a7d75ae00d04cd6ca74fcb07863c` |

## 21. Rollback image / tag

**NOT created** — impossible without Docker access. An operator must run, before any deploy:

```bash
docker inspect --format '{{.Image}}' courier-api
docker inspect --format '{{json .Config.Image}}' courier-api
docker images --digests | grep -i courier
docker tag <current-image> courier-api:rollback-20260920
```

## 22. Deploy performed

**NO.**

## 23. If deploy NO — exact reason

Deploy is forbidden unless **all** conditions hold. Exactly three fail, all environmental:

| # | Condition | Status |
|---|---|---|
| 1 | Docker access | ❌ **DENIED** — no socket permission, not in `docker` group, no passwordless sudo |
| 2 | Current API image ID captured | ❌ cannot be read without Docker |
| 3 | Rollback image/tag created | ❌ depends on 1–2 |
| 4 | Clean worktree with smart-tariff + reaction | ✅ `/home/administrator333/courier-backend-production-ready` @ `005e856`, clean |
| 5 | Tests acceptable | ✅ 24/24 DB-free tests pass; DB-backed suite deliberately not run |
| 6 | No new type errors | ✅ 0 introduced (main 4 pre-existing, manager 0) |
| 7 | Migration will not auto-run | ✅ `RUN_DB_PUSH`/`RUN_DB_PATCHES` unset in compose and env; entrypoint defaults to `false` |
| 8 | Production DB needs no unknown migration | ✅ required schema already live |

## 24. Build dry run (§17)

Static verification on the clean worktree:

- `Dockerfile` build context = repo root; it copies `package.json`, `pnpm-lock.yaml`, `courier-manager/`, `drizzle.config.ts`, `server/`, `shared/`, `drizzle/`, `scripts/`, `entrypoint.sh`. In the **clean worktree** that context contains only committed code, so a build cannot pick up the previously dirty billing/smart-tariff work by accident.
- `entrypoint.sh`: `RUN_DB_PUSH` and `RUN_DB_PATCHES` both default to `false`; `docker-compose.yml` does not set them; neither `.env` nor `.env.deepseek` contains `RUN_DB_PUSH=true` / `RUN_DB_PATCHES=true` (key names inspected only — no values printed). → **no migration, no SQL patch on restart.**
- **Local build performed (no Docker):** `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` in the clean worktree → success, `dist/index.js` 748.9 kB in 91 ms.
  - smart-tariff present: `smartTariffPreview:` ×1, `smartTariffs:` ×1, `createSmartTariff:` ×1, `updateSmartTariff:` ×3, `disableSmartTariff:` ×3, `previewSmartTariffSelection` ×5, `clientTariffRules` ×16, `repriceAutomatic` ×8.
  - reaction patch present: `CHAT_REACTION_EMOJIS` ×2, `isAllowedReactionEmoji` ×2, `\u2764` (❤) present, `/api/chat/v2/messages/:messageId/reactions` ×1, `chat_v2_changed` ×5.
  - The build-only `node_modules` symlink and `dist/` were removed afterwards; the worktree is clean again.

## 25. Final main `git status`

```
$ git status --porcelain=v1
?? MOBILE_AUDIT_20260920.md
?? MOBILE_BACKEND_READINESS_REPORT_20260920.md
?? MOBILE_CONSOLIDATION_REPORT_20260920.md
?? "Основная_движения_сверка_16.08-31.08.2026.xlsx"
```

Only the three stage reports and the unrelated workbook remain untracked — intentionally. Nothing was reset, restored, stashed, cleaned or discarded.

## 26. Mobile HEAD / status confirmation

```
$ cd /home/administrator333/courier-delivery-system-apk-check
$ git log -1 --format='%H'
f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9
$ git status --porcelain=v1
(no output — clean)
```

EAS build: **not started.**

## 27. Remaining blockers

1. **Docker access denied** — blocks image build, rollback tagging and any deploy from this environment.
2. **Current API image id/tag unknown** — must be captured by an operator with Docker access.
3. **Backend production revision UNVERIFIED** — the running image cannot be inspected; the smart-tariff API is presumed present (DB schema + deployed UI + operator's 17.09 check), not directly proven.
4. **Reaction palette not live** — the running image predates `31a3f56`; new-palette reactions return `400 «Недоступная реакция»` until redeployed.
5. **DB-backed smart-tariff safety test not executed** — needs a disposable Postgres; only the production instance is reachable.
6. **Firebase project question** — unchanged, still open (carried over).
7. **Runtime push test on a device** — still pending (carried over).
8. **Minor:** deployed manager CSS is not byte-identical to a build of the current source (styling only).

---

# PRODUCTION SOURCE-OF-TRUTH RECOVERED: YES

The smart-tariff/billing functionality that production has been running is now in git as `005e856`, as a single logical unit with no unrelated changes, after a complete external snapshot and a per-file/per-hunk classification. It is proven to be the deployed manager code (byte-identical JS bundle) and the deployed schema (live DB inspection). The mobile reaction patch is its direct parent, so one commit now carries both. The remaining uncertainty is limited to the exact backend image revision, which cannot be inspected without Docker.

# BACKEND READY FOR MOBILE BUILD: NO

The **source** is ready: `005e856` contains the recovered production functionality **and** the reaction patch, it typechecks with 0 introduced errors, 24/24 DB-free tests pass, it bundles cleanly, a clean deployment worktree exists at `/home/administrator333/courier-backend-production-ready`, and no migration would auto-run.

It is **NO** only because it has not been — and from here cannot be — deployed: **Docker access is denied**, so the current image cannot be captured, no rollback tag can be created, and the running backend still rejects the new palette.

An operator with Docker access can finish in four steps:

1. `docker inspect --format '{{.Image}}' courier-api` and tag it as the rollback image.
2. `cd /home/administrator333/courier-backend-production-ready && docker compose build api`
3. `docker compose up -d --no-deps api` (API only; do not touch `/var/www/courier-manager`, do not rebuild the manager)
4. Verify `/api/health`, container health, startup logs, and an authenticated reaction smoke test on a **test** conversation.

**No EAS build was started. Mobile checkpoint `f3e67ed` was not modified. Stopping here.**
