#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh — Run migrations and start API server
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[Entrypoint] DATABASE_URL is configured"
else
  echo "[Entrypoint] DATABASE_URL is not configured"
fi

echo "[Entrypoint] Automatic drizzle push is disabled; run versioned migrations during a controlled deploy"

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
