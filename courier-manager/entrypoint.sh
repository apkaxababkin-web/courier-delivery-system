#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# entrypoint.sh — wait for PostgreSQL, then start the courier-manager server.
#
# This script performs NO schema changes. The previous version ran
# `npx drizzle-kit push` on every container start (bypassing scripts/db-guard.mjs)
# and printed DATABASE_URL — including the password — into the container log.
# Both behaviours were removed; no environment variable can enable DDL here.
#
# DDL is applied only through the reviewed procedure:
#   * disposable local database: pnpm db:migrate (wrapped by scripts/db-guard.mjs)
#   * production: manual, backed-up, reviewed migration — see
#     POSTGRESQL_DEPLOYMENT_GUIDE.md and DEPLOY_VPS.md.
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Connection details are never logged: DATABASE_URL carries the password.
echo "[Entrypoint] Starting courier-manager API..."

# Wait for PostgreSQL to be ready
echo "[Entrypoint] Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  if psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    echo "[Entrypoint] PostgreSQL is ready!"
    break
  fi
  echo "[Entrypoint] Attempt $attempt/$max_attempts - waiting for PostgreSQL..."
  sleep 2
  attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "[Entrypoint] ERROR: PostgreSQL did not become ready in time"
  exit 1
fi

# Start the production server
echo "[Entrypoint] Starting API server..."
exec node dist/index.js
