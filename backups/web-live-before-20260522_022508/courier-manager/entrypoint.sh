#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# entrypoint.sh — Wait for PostgreSQL, run migrations, start server
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-manager API..."
echo "[Entrypoint] DATABASE_URL: $DATABASE_URL"

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

# Run migrations using drizzle-kit push
echo "[Entrypoint] Running database migrations (drizzle-kit push)..."
if npx drizzle-kit push 2>&1; then
  echo "[Entrypoint] ✓ Migrations completed successfully"
else
  echo "[Entrypoint] ⚠ Migrations encountered an issue, but continuing..."
fi

# Start the production server
echo "[Entrypoint] Starting API server..."
exec node dist/index.js
