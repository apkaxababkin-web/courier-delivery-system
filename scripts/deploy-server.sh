#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/courier-delivery-system}"
BRANCH="${BRANCH:-main}"
COMPOSE="${COMPOSE:-docker compose}"
PROD_URL="${PROD_URL:-${SMOKE_BASE_URL:-}}"

cd "$APP_DIR"

echo "==> Fetch latest code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Build production containers"
$COMPOSE build

echo "==> Start production stack"
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
    echo "API health check failed" >&2
    $COMPOSE logs --tail=200 api >&2 || true
    exit 1
  fi
done

if [[ -n "$PROD_URL" ]]; then
  echo "==> Production URL verification: $PROD_URL"
  SMOKE_BASE_URL="$PROD_URL" pnpm postdeploy:live
else
  echo "==> PROD_URL/SMOKE_BASE_URL not set; skipping external postdeploy live verification"
fi

echo "Deploy completed"
