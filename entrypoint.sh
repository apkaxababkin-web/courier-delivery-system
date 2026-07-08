#!/bin/sh
# ─────────────────────────────────────────────────────────────────
# entrypoint.sh - Start API server; DB changes require explicit flags
# ─────────────────────────────────────────────────────────────────

set -e

echo "[Entrypoint] Starting courier-delivery-system API..."
if [ -n "$DATABASE_URL" ]; then
  echo "[Entrypoint] DATABASE_URL is configured"
else
  echo "[Entrypoint] DATABASE_URL is not configured"
fi

wait_for_database() {
  if [ -z "$DATABASE_URL" ]; then
    echo "[Entrypoint] DATABASE_URL is not configured; skipping DB readiness wait"
    return 0
  fi

  timeout="${WAIT_FOR_DB_TIMEOUT:-90}"
  echo "[Entrypoint] Waiting for database readiness (timeout: ${timeout}s)..."

  if node - "$timeout" <<'NODE'
const postgres = require('postgres');
const timeoutSeconds = Number(process.argv[2] || 90);
const startedAt = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function check() {
  while (Date.now() - startedAt < timeoutSeconds * 1000) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 1, connect_timeout: 5 });
    try {
      await sql`select 1`;
      await sql.end({ timeout: 1 });
      return true;
    } catch {
      try { await sql.end({ timeout: 1 }); } catch {}
      await sleep(2000);
    }
  }
  return false;
}

check().then((ok) => process.exit(ok ? 0 : 1));
NODE
  then
    echo "[Entrypoint] Database is reachable"
  else
    echo "[Entrypoint] Database is not reachable before timeout; exiting so Docker restart policy can retry"
    exit 1
  fi
}

wait_for_database

if [ "${RUN_DB_PUSH:-false}" = "true" ]; then
  echo "[Entrypoint] RUN_DB_PUSH=true; running explicit Drizzle schema push..."
  if [ -f "drizzle.config.ts" ]; then
    if npx drizzle-kit push; then
      echo "[Entrypoint] Drizzle schema push completed"
    else
      echo "[Entrypoint] Drizzle schema push failed (continuing without blocking API startup)"
    fi
  else
    echo "[Entrypoint] drizzle.config.ts not found, skipping schema push"
  fi
else
  echo "[Entrypoint] Skipping Drizzle schema push (set RUN_DB_PUSH=true to run it explicitly)"
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

if [ "${RUN_DB_PATCHES:-false}" = "true" ]; then
  run_patch "scripts/db_compat_patch.sql" "compatibility patch"
  run_patch "scripts/mails_manifest_patch.sql" "mails manifest patch"
  # disabled: backend helper now handles request-task sync
  # run_patch "scripts/realtime_bridge.sql" "request-task bridge patch"
else
  echo "[Entrypoint] Skipping compatibility SQL patches (set RUN_DB_PATCHES=true to run them explicitly)"
fi

echo "[Entrypoint] Starting API server..."
exec node dist/index.js
