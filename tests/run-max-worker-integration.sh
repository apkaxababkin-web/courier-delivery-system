#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

NAME="mig-max-integration-$$"
trap 'sudo -n docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

echo "=== START TEST POSTGRES ==="
sudo -n docker run -d --name "$NAME" \
  -e POSTGRES_USER=max_test \
  -e POSTGRES_PASSWORD=test_only \
  -e POSTGRES_DB=max_test \
  --tmpfs /var/lib/postgresql/data:rw,size=128m \
  postgres:16-alpine

echo "=== WAIT FOR DATABASE ==="
READY=0
for i in $(seq 1 60); do
  if [ "$(sudo -n docker exec "$NAME" psql -X -U max_test -d max_test -tAc 'SELECT 1' 2>/dev/null)" = "1" ]; then
    READY=1
    break
  fi
  sleep 1
done
[ "$READY" -eq 1 ] || { echo "FAIL: database not ready"; exit 1; }

echo "=== APPLY MIGRATION ==="
sudo -n docker exec -i "$NAME" \
  psql -X -v ON_ERROR_STOP=1 -U max_test -d max_test \
  < drizzle/migrations/0021_max_delayed_notifications.sql

echo "=== CREATE TEST FIXTURES ==="
sudo -n docker exec -i "$NAME" \
  psql -X -v ON_ERROR_STOP=1 -U max_test -d max_test <<'SQL'
CREATE TABLE max_client_chats (
  id BIGINT PRIMARY KEY,
  chat_id TEXT,
  enabled BOOLEAN DEFAULT TRUE
);
CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  status TEXT,
  "placesCount" INTEGER
);
CREATE TABLE max_order_drafts (
  id BIGINT PRIMARY KEY,
  chat_binding_id BIGINT,
  request_id INTEGER,
  status TEXT
);
INSERT INTO max_client_chats VALUES (1,'123456',TRUE);
INSERT INTO requests VALUES (100,'completed',4);
INSERT INTO max_order_drafts VALUES (36,1,100,'approved');
SQL

IP=$(sudo -n docker inspect \
  -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$NAME")

echo "=== RUN INTEGRATION TESTS ==="
MAX_TEST_DATABASE_URL="postgres://max_test:test_only@$IP:5432/max_test" \
  ./node_modules/.bin/tsx tests/max-worker.integration.ts

echo "=== ALL TESTS COMPLETED ==="
