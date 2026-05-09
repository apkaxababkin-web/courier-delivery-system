#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh — Run migrations and start API server
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
echo "[Entrypoint] DATABASE_URL: $DATABASE_URL"

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

echo "[Entrypoint] Running database migrations..."
if [ -f "drizzle.config.ts" ]; then
  if npx drizzle-kit push 2>&1; then
    echo "[Entrypoint] ✓ Migrations completed successfully"
  else
    echo "[Entrypoint] ⚠ Migrations encountered an issue (continuing anyway)"
  fi
else
  echo "[Entrypoint] ⚠ drizzle.config.ts not found, skipping migrations"
fi

if [ -f "scripts/db_compat_patch.sql" ]; then
  echo "[Entrypoint] Running compatibility patch..."
  if psql "$DATABASE_URL" -f scripts/db_compat_patch.sql; then
    echo "[Entrypoint] ✓ Compatibility patch applied"
  else
    echo "[Entrypoint] ⚠ Compatibility patch failed (continuing anyway)"
  fi
fi

if [ -f "scripts/realtime_bridge.sql" ]; then
  echo "[Entrypoint] Running request-task bridge patch..."
  if psql "$DATABASE_URL" -f scripts/realtime_bridge.sql; then
    echo "[Entrypoint] ✓ Request-task bridge applied"
  else
    echo "[Entrypoint] ⚠ Request-task bridge failed (continuing anyway)"
  fi
fi

echo "[Entrypoint] Starting API server..."
exec node dist/index.js
