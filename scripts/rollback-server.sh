#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/courier-delivery-system}"
TARGET_REF="${TARGET_REF:-${1:-}}"
COMPOSE="${COMPOSE:-docker compose}"
PROD_URL="${PROD_URL:-${SMOKE_BASE_URL:-}}"

if [[ -z "$TARGET_REF" ]]; then
  echo "TARGET_REF is required. Usage: TARGET_REF=<commit-or-branch> pnpm rollback:server" >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Fetch refs"
git fetch --all --prune

echo "==> Rollback to $TARGET_REF"
git checkout "$TARGET_REF"

echo "==> Rebuild rollback containers"
$COMPOSE build

echo "==> Restart production stack"
$COMPOSE up -d --remove-orphans

echo "==> Current containers"
$COMPOSE ps

echo "==> API health from localhost"
for i in {1..40}; do
  if curl -fsS http://127.0.0.1:3000/api/health >/tmp/courier-health.json; then
    cat /tmp/courier-health.json
    echo
    break
  fi
  sleep 2
  if [[ "$i" == "40" ]]; then
    echo "Rollback API health check failed" >&2
    $COMPOSE logs --tail=200 api >&2 || true
    exit 1
  fi
done

if [[ -n "$PROD_URL" ]]; then
  echo "==> Production URL verification after rollback: $PROD_URL"
  SMOKE_BASE_URL="$PROD_URL" pnpm postdeploy:live
else
  echo "==> PROD_URL/SMOKE_BASE_URL not set; skipping external rollback verification"
fi

echo "Rollback completed to $TARGET_REF"
