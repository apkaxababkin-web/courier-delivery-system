# Production rollout runbook

## Local predeploy verification

Run before touching production:

```bash
pnpm predeploy:local
```

This runs:

- TypeScript check
- production build smoke
- production startup smoke
- docker compose/build smoke

## Server deploy

On the production server:

```bash
cd ~/courier-delivery-system
PROD_URL=https://couriermig.ru pnpm deploy:server
```

Optional variables:

```bash
APP_DIR=~/courier-delivery-system
BRANCH=main
COMPOSE="docker compose"
PROD_URL=https://couriermig.ru
```

The deploy script does:

- fetch latest `main`
- hard reset to `origin/main`
- rebuild docker containers
- restart stack
- wait for local `/api/health`
- run live postdeploy verification when `PROD_URL` or `SMOKE_BASE_URL` is set

## Postdeploy verification

```bash
SMOKE_BASE_URL=https://couriermig.ru pnpm postdeploy:live
```

This verifies:

- `/api/health`
- auth/session endpoints
- TRPC compatibility routes
- manager realtime snapshot
- manager data integrity
- manifest flow

## Rollback

Rollback to a known good commit, tag, or branch:

```bash
cd ~/courier-delivery-system
TARGET_REF=<commit-sha-or-tag> PROD_URL=https://couriermig.ru pnpm rollback:server
```

The rollback script does:

- fetch refs
- checkout target ref
- rebuild docker containers
- restart stack
- wait for local `/api/health`
- run live postdeploy verification when `PROD_URL` or `SMOKE_BASE_URL` is set

## Useful smoke commands

```bash
pnpm smoke:local
pnpm smoke:live
SMOKE_BASE_URL=https://couriermig.ru pnpm verify:production
```

## Failure handling

If deploy health check fails:

```bash
docker compose ps
docker compose logs --tail=200 api
docker compose logs --tail=200 postgres
```

If live verification fails after deploy:

```bash
TARGET_REF=<previous-good-sha> PROD_URL=https://couriermig.ru pnpm rollback:server
```
