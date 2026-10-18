# BACKEND PRODUCTION DEPLOY REPORT

**Date:** 2026-09-20
**Attempt:** safe deploy of the prepared backend (`005e856`)
**Outcome:** **STOPPED at pre-flight — Docker is unavailable.** No build, no restart, no rollback tag, no deploy.
**Pre-flight evidence file:** `/home/administrator333/backend-snapshots/deploy-attempt-20260920-113357/preflight-evidence.txt`

---

## 1. Deployment source path

```
/home/administrator333/courier-backend-production-ready
```

## 2. Source HEAD

```
005e8562a1c1fdd50711e14b76f3f187c9a019cb
```

Matches the expected commit exactly.

## 3. Source git status

```
$ git status --porcelain=v1
(no output)
```

**Clean.** Detached HEAD at `005e856`.

---

## 4. Old container ID

```
ff3af8fa0427e7c5f5d5a0b88aac477d56f1525a5a4f79413ba6eeb8774566dc
```

Obtained without Docker from `/proc/173805/cgroup` (`docker-<id>.scope`).
Process cmdline `node dist/index.js`, started **Thu Sep 17 01:50:45 2026**, uptime 3 d 09 h 43 m — unchanged, i.e. the container was **not** restarted during this attempt.

## 5. Old image ID

```
UNAVAILABLE
```

`docker inspect` cannot be executed (see §17). No workaround was attempted.

## 6. Old image tag / name

Not directly readable. Derived from the deployment scripts and compose file:

- `deploy.sh` removes `courier-delivery-system_api` and `courier-delivery-system-api`;
- `courier-manager` / compose project appears to be `courier-delivery-system`;
- therefore the running image is almost certainly `courier-delivery-system-api:<tag>`.

**Unconfirmed** — the authoritative value (`docker inspect --format '{{.Config.Image}}' courier-api`) requires Docker access.

## 7. Rollback tag

```
NOT CREATED
```

Required tag `courier-delivery-system-api:rollback-before-mobile-backend-20260920` could not be created, because tagging requires Docker access. Per the instructions (§3), this alone mandates STOP and forbids deploy.

## 8. Rollback image ID

```
N/A — no rollback tag exists
```

## 9. Health before

| Target | Result |
|---|---|
| `http://127.0.0.1:3000/api/health` | **HTTP 200** `{"ok":true,"timestamp":1789904038126}` |
| `https://couriermig.ru/api/health` | **HTTP 200** `{"ok":true,"timestamp":1789904038181}` |

Current production was healthy before the attempt.

## 10. Build result

```
NOT RUN
```

`docker compose build` / `docker build` could not be executed (Docker unavailable). Nothing was rebuilt, so no old image was replaced or removed.

## 11. New image ID

```
N/A
```

## 12. New container ID

```
N/A
```

## 13. Container health

`N/A` for a new container. The **existing** container remained running and healthy throughout (`docker inspect`-style health field is unavailable without Docker; the compose healthcheck endpoint answers 200).

## 14. Local API health

`http://127.0.0.1:3000/api/health` → **HTTP 200** (unchanged old container).

## 15. Public API health

`https://couriermig.ru/api/health` → **HTTP 200** (unchanged old container).

> Note: `https://couriermig.ru/health` (without `/api`) returns `200 text/html` — that is the nginx SPA fallback, not the API.

## 16. Startup log result

```
N/A — no API restart was performed
```

No logs were inspected because no new container was started, and the instructions forbid manual intervention inside the running production container.

---

## 17. Smart-tariff presence

**YES in the deployment source and in its built bundle.**

Verified earlier on this exact commit (`005e856`) by building the backend bundle locally in the clean worktree (esbuild, same command as `build:backend`) — the produced `dist/index.js` contained:

```
smartTariffPreview:      1
smartTariffs:            1
createSmartTariff:       1
updateSmartTariff:       3
disableSmartTariff:      3
previewSmartTariffSelection: 5
clientTariffRules:      16
repriceAutomatic:        8
```

Not verified in the **running** image (requires Docker; and the running image predates this commit).

## 18. Chat v2 presence

**YES in source and bundle:** `/api/chat/v2/...` routes registered (`registerChatV2Routes`), `chat_v2_changed` present ×5. Already present in the running production API as well (unauthenticated probes return `401`, not `404`).

## 19. Reaction palette presence

**YES in source and bundle:** `CHAT_REACTION_EMOJIS` ×2, `isAllowedReactionEmoji` ×2, the heart literal `\u2764` present, and the reactions route `/api/chat/v2/messages/:messageId/reactions` ×1. The set is the agreed 12-emoji palette **plus** the 10 legacy emojis (superset, so old reactions remain removable).

Backed by the automated suite: `tests/chat-v2-reactions.test.ts` — **14/14 passing** (palette contents, all 12 emojis round-tripped, legacy emoji removal, invalid input rejection, add/toggle-off/replace/404).

## 20. Reaction runtime smoke result

```
NOT RUN — no safe test conversation
```

Reasons: (a) nothing was deployed, so a smoke test would have exercised the **old** backend; (b) no safe test conversation/test user is available, and the instructions forbid using a real working conversation. The deployed-source + image verification + the 14/14 automated tests are the evidence supplied until a device/runtime smoke can be done on a test conversation.

## 21. Migrations executed

```
NO
```

Not only were they never invoked — the deployment source confirms they cannot run implicitly:
- `entrypoint.sh` guards both operations: `RUN_DB_PUSH:-false` and `RUN_DB_PATCHES:-false`;
- `docker-compose.yml` contains **0** references to `RUN_DB_PUSH` / `RUN_DB_PATCHES`;
- neither `.env` nor `.env.deepseek` sets them to `true` (key names inspected only; no values printed).

No `drizzle push`, no SQL patch, no DDL/DML against production.

## 22. Manager frontend modified

```
NO
```

`/var/www/courier-manager` was not touched. Hashes are identical to those recorded during the recovery stage:

```
1ede68d040e5584a…  assets/index-DInOToej.js
d94314cc5b3a7f52…  assets/index-lnspugyz.css
d3c9fc09d24c20cc…  index.html
```

No manager build was run for the deployment. (Earlier verification builds were written to `/tmp` only.)

## 23. Production DB modified intentionally

```
NO
```

Database interaction in this whole effort has been strictly read-only (`to_regclass`, `information_schema.columns`, `pg_indexes`, `count(*)`). No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP, no migration, no `drizzle push`.

## 24. Rollback performed

```
NO — not required
```

Nothing was built, replaced or restarted, so the running production API is exactly the same container/process as before the attempt. Production stayed healthy throughout.

## 25. Mobile HEAD / status

```
/home/administrator333/courier-delivery-system-apk-check
HEAD   f3e67ed70e67c4b6ffdae8b95b1aa709ba3611b9
status (empty — clean)
```

Untouched. No EAS build, no submit, no `git push` was performed anywhere.

---

## 26. Remaining blockers

### Blocker A — Docker unavailable (the single reason the deploy stopped)

| Fact | Value |
|---|---|
| Socket | `srw-rw---- root docker /var/run/docker.sock` (mode 660) |
| User | `uid=1000(administrator333) gid=1000(administrator333) groups=1000(administrator333),1001(google-sudoers)` |
| `docker` group | `docker:x:113:` — **no members** |
| `docker ps` | `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock` |
| With widest sandbox mode | **still denied** → this is an OS-level permission, not a tooling limitation |
| `sudo` | blocked: *"The 'no new privileges' flag is set, which prevents sudo from running as root"* |
| Docker metadata | `/var/lib/docker/containers/<id>/` is root-only |

Consequently conditions 1–3 of the deploy gate (Docker access, current image ID, rollback tag) cannot be satisfied from this session.

### Blocker B — deployment-mechanics findings that must be handled before the eventual deploy

These were discovered while preparing the pre-flight and are **not** yet resolved; they could cause an outage if ignored:

1. **`env_file` is absent in the clean worktree.** `docker-compose.yml` declares `env_file: [./.env.deepseek]`, but `.env.deepseek` is gitignored and therefore **does not exist** in `/home/administrator333/courier-backend-production-ready`. A `docker compose` command run there would fail (or start the API without its env). The operator must supply it, e.g. `--env-file /home/administrator333/courier-delivery-system/.env.deepseek`.
2. **Compose project-name sensitivity.** `docker-compose.yml` pins `container_name: courier-api` and `container_name: courier-postgres`, and uses project-scoped named volume `postgres_data` and network `courier-network`. Building/starting from the worktree under a different project name would target different volume/network names; with `--no-deps` postgres is not recreated, but the new API container could be attached to a *new* network where the hostname `postgres` does not resolve → database connectivity failure. The deploy must therefore run with the **same** project name as the running stack (likely `COMPOSE_PROJECT_NAME=courier-delivery-system`, to be confirmed with `docker network ls` / `docker volume ls`).
3. `scripts/deploy-server.sh` does `git reset --hard origin/$BRANCH` and `scripts/deploy.sh` does `docker-compose down` + `git pull`. **Neither may be used** — they would destroy the working tree and stop the stack.
4. Because `.env`/`.env.deepseek` and the compose project context matter, the recommended safe sequence is to confirm the running stack's project, network and volume first, then build the API image from the clean worktree and recreate **only** the `api` service.

### Blocker C — carried over (unchanged)

- Current API image id/tag unknown (needs Docker).
- Running backend revision unverified; the smart-tariff **API** presence is inferred, not directly probed (the `billing.` tRPC prefix is auth-guarded and answers `401` even for non-existent paths).
- Reaction palette not live until a successful deploy.
- Firebase project question open.
- Device/runtime push + reaction smoke still pending.
- DB-backed `tests/smart-tariff-financial-safety.test.ts` not executed (needs a disposable Postgres; only the production instance is reachable).

---

# BACKEND READY FOR MOBILE BUILD: NO

The verdict criteria require the **new** API to actually be running, with a rollback image in place:

| Criterion | Status |
|---|---|
| new API actually running | ❌ **not deployed** — Docker unavailable |
| health OK | ⚠️ the *existing* API is healthy (200 local + public); no new API exists |
| rollback image exists | ❌ not created (no Docker access) |
| smart-tariff present | ✅ in source + locally built bundle (`005e856`) |
| reaction patch present | ✅ in source + bundle, 14/14 tests pass |
| no critical startup errors | ⚠️ N/A — nothing was started |
| migrations not run | ✅ none ran |
| manager not damaged | ✅ untouched (hashes unchanged) |

All that remains is **operational**: grant Docker access (add the user to the `docker` group or run the deploy as a user with socket access), then perform the four steps below. No source, schema or configuration change is outstanding.

Recommended operator sequence (after confirming Blocker B.1/B.2):

```bash
# 0. capture rollback BEFORE touching anything
docker inspect --format '{{.Image}} {{.Config.Image}}' courier-api
docker images --digests | grep -i courier
docker tag <current-image-id> courier-delivery-system-api:rollback-before-mobile-backend-20260920

# 1. build from the CLEAN worktree only, with the running stack's project name
cd /home/administrator333/courier-backend-production-ready
COMPOSE_PROJECT_NAME=courier-delivery-system \
  docker compose --env-file /home/administrator333/courier-delivery-system/.env.deepseek build api

# 2. recreate ONLY the api service (no down, no postgres, no nginx, no manager)
COMPOSE_PROJECT_NAME=courier-delivery-system \
  docker compose --env-file /home/administrator333/courier-delivery-system/.env.deepseek \
  up -d --no-deps api

# 3. verify
docker inspect --format '{{.Id}} {{.Image}} {{.State.Health.Status}}' courier-api
curl -fsS http://127.0.0.1:3000/api/health && curl -fsS https://couriermig.ru/api/health
docker logs --tail=120 courier-api      # look for crash / db / module / bind errors
```

If anything fails: `docker tag` the rollback image back and recreate the `api` service from it; do not attempt repairs inside the container.

**No EAS build was started. The mobile checkpoint `f3e67ed` was not modified. The manager frontend was not modified. No migrations were run. Stopping here.**
