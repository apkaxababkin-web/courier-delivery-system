#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh — Run migrations and start API server
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
echo "[Entrypoint] DATABASE_URL: $DATABASE_URL"

echo "[Entrypoint] Running database migrations..."
if [ -f "drizzle.config.ts" ]; then
  if yes | npx drizzle-kit push 2>&1; then
    echo "[Entrypoint] ✓ Migrations completed successfully"
  else
    echo "[Entrypoint] ⚠ Migrations encountered an issue (continuing anyway)"
  fi
else
  echo "[Entrypoint] ⚠ drizzle.config.ts not found, skipping migrations"
fi

run_patch() {
  patch_file="$1"
  patch_name="$2"
  if [ -f "$patch_file" ]; then
    echo "[Entrypoint] Running $patch_name..."
    if command -v psql >/dev/null 2>&1 && psql "$DATABASE_URL" -f "$patch_file"; then
      echo "[Entrypoint] ✓ $patch_name applied"
    else
      echo "[Entrypoint] ⚠ $patch_name failed (continuing anyway)"
    fi
  fi
}

run_patch "scripts/db_compat_patch.sql" "compatibility patch"
run_patch "scripts/mails_manifest_patch.sql" "mails manifest patch"
# disabled: backend helper now handles request-task sync
# run_patch "scripts/realtime_bridge.sql" "request-task bridge patch"

echo "[Entrypoint] Starting API server..."
exec node dist/index.js
