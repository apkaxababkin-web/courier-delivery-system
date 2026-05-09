# Production rollout runbook

## Production environment file

Before deploy on the production server:

```bash
cd ~/courier-delivery-system
cp .env.production.example .env
nano .env
```

Replace placeholder values in `.env` with production values before running deploy.

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

For full docker runtime verification before deploy:

```bash
SMOKE_DOCKER_UP=1 pnpm smoke:docker
```

This additionally:

- builds the compose stack
- starts PostgreSQL and API containers
- waits for `/api/health`
- prints API logs on failure
- tears down containers automatically

Keep the stack running after smoke when needed:

```bash
SMOKE_DOCKER_UP=1 SMOKE_DOCKER_KEEP_UP=1 pnpm smoke:docker
```

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
SMOKE_DOCKER_UP=1 pnpm smoke:docker
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
