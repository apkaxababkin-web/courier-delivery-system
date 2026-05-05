#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh — Run migrations and start API server
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
echo "[Entrypoint] DATABASE_URL: $DATABASE_URL"

# Wait for database to be ready
echo "[Entrypoint] Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  if pg_isready -h $(echo $DATABASE_URL | grep -oP 'postgres://[^:]+:[^@]+@\K[^:/]+') -U courier 2>/dev/null; then
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

# Run migrations
echo "[Entrypoint] Running database migrations..."
if [ -f "drizzle.config.ts" ]; then
  if npx drizzle-kit migrate 2>&1; then
    echo "[Entrypoint] ✓ Migrations completed successfully"
  else
    echo "[Entrypoint] ⚠ Migrations encountered an issue (continuing anyway)"
  fi
else
  echo "[Entrypoint] ⚠ drizzle.config.ts not found, skipping migrations"
fi

# Start the API server
echo "[Entrypoint] Starting API server..."
exec node dist/index.js
