#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# deploy.sh — Clean deployment script for courier-delivery-system
# Fixes: docker-compose 1.29.2 ContainerConfig bug
# Usage: bash deploy.sh
# ─────────────────────────────────────────────────────────────────

set -e

echo "=== Courier Delivery System — Deploy ==="
echo ""

# Step 1: Stop and remove old containers (fixes ContainerConfig bug)
echo "[1/5] Stopping and removing old containers..."
docker-compose down --remove-orphans 2>/dev/null || true
docker rm -f courier-api courier-postgres 2>/dev/null || true

# Step 2: Remove old images to force rebuild
echo "[2/5] Removing old images..."
docker rmi courier-delivery-system_api 2>/dev/null || true
docker rmi courier-delivery-system-api 2>/dev/null || true

# Step 3: Pull latest code (if using git)
echo "[3/5] Pulling latest code..."
git pull origin main 2>/dev/null || echo "  (skipped: not a git repo or no remote)"

# Step 4: Build fresh images
echo "[4/5] Building fresh images (no cache)..."
docker-compose build --no-cache

# Step 5: Start containers
echo "[5/5] Starting containers..."
docker-compose up -d

echo ""
echo "=== Deploy complete ==="
echo ""
echo "Checking container status..."
docker-compose ps
echo ""
echo "API logs (last 20 lines):"
docker-compose logs --tail=20 api
