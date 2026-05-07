#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh — Run migrations and start API server
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
echo "[Entrypoint] DATABASE_URL: $DATABASE_URL"

# Wait for database to be ready. Use the app's postgres npm dependency
# instead of psql so the runtime image does not depend on system tools.
echo "[Entrypoint] Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
  if node -e "const postgres=require('postgres'); const sql=postgres(process.env.DATABASE_URL,{max:1}); sql\`SELECT 1\`.then(()=>sql.end()).then(()=>process.exit(0)).catch((err)=>{ console.error(err.message); process.exit(1); });" >/tmp/postgres-wait.log 2>&1; then
    echo "[Entrypoint] PostgreSQL is ready!"
    break
  fi
  echo "[Entrypoint] Attempt $attempt/$max_attempts - waiting for PostgreSQL..."
  cat /tmp/postgres-wait.log || true
  sleep 2
  attempt=$((attempt + 1))
done

if [ $attempt -gt $max_attempts ]; then
  echo "[Entrypoint] ERROR: PostgreSQL did not become ready in time"
  cat /tmp/postgres-wait.log || true
  exit 1
fi

# Run migrations / schema sync
echo "[Entrypoint] Running database migrations..."
if [ -f "drizzle.config.ts" ]; then
  if npx drizzle-kit push 2>&1; then
    echo "[Entrypoint] ✓ Migrations completed successfully"
  else
    echo "[Entrypoint] ✗ Migrations failed"
    exit 1
  fi
else
  echo "[Entrypoint] ✗ drizzle.config.ts not found, cannot run migrations"
  exit 1
fi

# Start the API server
echo "[Entrypoint] Starting API server..."
exec node dist/index.js
