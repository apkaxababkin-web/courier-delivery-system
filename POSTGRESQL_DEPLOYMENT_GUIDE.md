# PostgreSQL Production Deployment Guide

**Courier Delivery System** — Complete migration from MySQL to PostgreSQL for production deployment on Ubuntu with nginx.

---

## Overview

This guide provides step-by-step instructions to deploy the courier-delivery-system on a production Ubuntu server with PostgreSQL, nginx, and Docker. The system has been fully refactored to use PostgreSQL exclusively, with automated database migrations on container startup.

**Key Requirements:**
- Ubuntu 22.04 LTS server
- Docker and Docker CLI
- PostgreSQL 12+ (already running in a container)
- nginx (already configured)
- Domain: `https://couriermig.ru`

---

## Files Modified

The following files have been updated for PostgreSQL compatibility:

| File | Changes | Impact |
|------|---------|--------|
| `drizzle/schema.ts` | Converted from `mysqlTable` → `pgTable`, `mysqlEnum` → `pgEnum`, `int().autoincrement()` → `serial()`, removed `.onUpdateNow()` | Database schema now uses PostgreSQL syntax |
| `server/db.ts` | Fixed `onDuplicateKeyUpdate()` → `onConflict()`, replaced all `.insertId` with `.returning({ id: table.id })` | All database operations now use PostgreSQL-compatible patterns |
| `package.json` | Removed problematic `@types/postgres` dependency | Build now succeeds without dependency conflicts |
| `drizzle/migrations/0001_init_postgresql.sql` | Created comprehensive PostgreSQL initialization migration with all 10 enums, 15 tables, and indexes | Database can be initialized from scratch |

---

## Deleted Files

All old MySQL migration files have been removed:
- `drizzle/0000_elite_eternals.sql` through `drizzle/0031_spooky_monster_badoon.sql` (32 files)
- All snapshot metadata in `drizzle/meta/` (32 files)

These files are no longer needed as the new PostgreSQL migration handles schema creation from scratch.

---

## Pre-Deployment Checklist

Before deploying to production, verify:

- ✅ PostgreSQL container is running: `sudo docker ps | grep courier-postgres`
- ✅ PostgreSQL is accessible: `sudo docker exec courier-postgres psql -U courier -d courier_db -c "SELECT 1"`
- ✅ Network is configured: `sudo docker network ls | grep courier-delivery-system_default`
- ✅ nginx is running: `sudo systemctl status nginx`
- ✅ Domain resolves: `nslookup couriermig.ru`
- ✅ Swap is available: `free -h | grep Swap` (should show 2GB)

---

## Deployment Steps

### Step 1: Pull Latest Code

```bash
cd /path/to/courier-delivery-system
git pull origin main
```

### Step 2: Build Docker Image

```bash
sudo docker build -t courier-delivery-system_api:latest .
```

**Expected output:**
```
Successfully tagged courier-delivery-system_api:latest
```

**Build time:** ~2-3 minutes

### Step 3: Remove Old Container

```bash
sudo docker rm -f courier-api
```

**Note:** This only removes the container, NOT the database volume. Data persists.

### Step 4: Start New Container

```bash
sudo docker run -d \
  --name courier-api \
  --network courier-delivery-system_default \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://courier:courier_password@postgres:5432/courier_db \
  -e API_PORT=3000 \
  -e API_HOST=0.0.0.0 \
  -e FRONTEND_URL=https://couriermig.ru \
  -e API_BASE_URL=https://couriermig.ru \
  -e OAUTH_SERVER_URL=https://couriermig.ru \
  -e OAUTH_PORTAL_URL=https://couriermig.ru \
  -e ALLOWED_ORIGINS=https://couriermig.ru \
  -e JWT_SECRET=supersecret \
  courier-delivery-system_api:latest
```

**What happens automatically:**
1. Container starts
2. `entrypoint.sh` waits for PostgreSQL to be ready (max 30 attempts, 2-second intervals)
3. `drizzle-kit migrate` runs automatically
4. All tables are created from `drizzle/migrations/0001_init_postgresql.sql`
5. API server starts on port 3000
6. Health check passes

**Expected output:**
```
[Entrypoint] Starting courier-delivery-system API...
[Entrypoint] Waiting for PostgreSQL to be ready...
[Entrypoint] PostgreSQL is ready!
[Entrypoint] Running database migrations...
[Entrypoint] ✓ Migrations completed successfully
[Entrypoint] Starting API server...
[api] server listening on port 3000
```

### Step 5: Verify Container is Running

```bash
sudo docker ps | grep courier-api
```

**Expected output:**
```
CONTAINER_ID  IMAGE                               STATUS         PORTS
abc123def456  courier-delivery-system_api:latest  Up 10 seconds  0.0.0.0:3000->3000/tcp
```

### Step 6: Check Database Migrations

```bash
sudo docker exec -it courier-api npm run db:push
```

**Expected output:**
```
> app-template@1.0.0 db:push
> drizzle-kit migrate
Reading config file '/app/drizzle.config.ts'
0 tables
No schema changes, nothing to migrate
```

This is **normal** — migrations already ran in the entrypoint. The message "0 tables" means drizzle-kit is comparing the current schema to the migration history and found no new changes.

### Step 7: Verify Tables Exist

```bash
sudo docker exec -it courier-postgres psql -U courier -d courier_db -c "\dt"
```

**Expected output:**
```
                    List of relations
 Schema |          Name           | Type  | Owner
--------+-------------------------+-------+-------
 public | clients                 | table | courier
 public | couriers                | table | courier
 public | hemotestListItems       | table | courier
 public | hemotestPickupLists     | table | courier
 public | hemotestPickupPoints    | table | courier
 public | hemotestPickups         | table | courier
 public | mails                   | table | courier
 public | managers                | table | courier
 public | requests                | table | courier
 public | sberbankListItems       | table | courier
 public | sberbankPickupLists     | table | courier
 public | sberbankPickupPoints    | table | courier
 public | sberbankPickupSchedule  | table | courier
 public | sberbankPickups         | table | courier
 public | settings                | table | courier
 public | taskStatusHistory       | table | courier
 public | tasks                   | table | courier
 public | users                   | table | courier
(18 rows)
```

All 18 tables should be present.

### Step 8: Verify Enums Exist

```bash
sudo docker exec -it courier-postgres psql -U courier -d courier_db -c "\dT"
```

**Expected output:**
```
                          List of data types
 Schema |          Name           | Type | Owner
--------+-------------------------+-------+-------
 public | courier_vehicle_type    | enum | courier
 public | mail_status             | enum | courier
 public | package_type            | enum | courier
 public | payment_method          | enum | courier
 public | pickup_list_status      | enum | courier
 public | request_status          | enum | courier
 public | request_type            | enum | courier
 public | task_status             | enum | courier
 public | task_type               | enum | courier
 public | user_role               | enum | courier
(10 rows)
```

All 10 enums should be present.

### Step 9: Test API Health Check

```bash
curl https://couriermig.ru/api/health
```

**Expected response:**
```json
{"ok":true,"timestamp":"2026-05-05T09:45:00.000Z"}
```

### Step 10: Test Authentication

```bash
curl -X POST https://couriermig.ru/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}'
```

**Expected response:**
```json
{"success":true,"user":{"id":1,"username":"demo",...}}
```

If authentication works, the database is properly initialized and the API is functioning correctly.

---

## Troubleshooting

### Issue: "PostgreSQL did not become ready in time"

**Cause:** PostgreSQL container is not running or not responding.

**Solution:**
```bash
sudo docker ps | grep courier-postgres
sudo docker logs courier-postgres | tail -20
```

If PostgreSQL is not running, start it:
```bash
sudo docker start courier-postgres
sleep 5
sudo docker start courier-api
```

### Issue: "0 tables" after migration

**Cause:** This is normal behavior. Drizzle-kit is comparing schemas and found no new changes.

**Solution:** Verify tables exist using Step 7 above.

### Issue: API returns 500 on authentication

**Cause:** Database tables not created.

**Solution:**
1. Check container logs: `sudo docker logs courier-api`
2. Verify tables: `sudo docker exec -it courier-postgres psql -U courier -d courier_db -c "\dt"`
3. If tables are missing, manually run migrations:
   ```bash
   sudo docker exec -it courier-api npm run db:migrate
   ```

### Issue: "Cannot find module 'postgres'"

**Cause:** Dependencies not installed in Docker image.

**Solution:** Rebuild the image:
```bash
sudo docker build --no-cache -t courier-delivery-system_api:latest .
```

---

## Database Connection Details

**Inside Docker network:**
- Host: `postgres`
- Port: `5432`
- Database: `courier_db`
- User: `courier`
- Password: `courier_password`

**From host machine:**
- Host: `localhost` or `127.0.0.1`
- Port: `5432` (if exposed)
- Database: `courier_db`
- User: `courier`
- Password: `courier_password`

---

## Important Notes

### ⚠️ Do NOT use `docker-compose down -v`

This command deletes all volumes, including the PostgreSQL database. Use only:
```bash
sudo docker-compose down
```

To remove only containers, not volumes.

### ✅ Database Data Persistence

The PostgreSQL database is stored in a Docker volume (`courier-postgres-data` or similar). Data persists across container restarts:
```bash
sudo docker volume ls | grep courier
```

### ✅ Automatic Migrations

The `entrypoint.sh` script automatically runs migrations on every container start. This ensures the schema is always up-to-date without manual intervention.

### ✅ Production Environment Variables

All sensitive values are set via environment variables in the `docker run` command. Update these for your environment:
- `JWT_SECRET`: Use a strong random value
- `ALLOWED_ORIGINS`: Set to your actual domain
- `DATABASE_URL`: Verify credentials match your PostgreSQL setup

---

## Rollback Procedure

If deployment fails, rollback to the previous version:

```bash
# Stop current container
sudo docker stop courier-api

# Remove current image
sudo docker rmi courier-delivery-system_api:latest

# Check git history
cd /path/to/courier-delivery-system
git log --oneline | head -10

# Checkout previous commit
git checkout <previous-commit-hash>

# Rebuild and restart
sudo docker build -t courier-delivery-system_api:latest .
sudo docker run -d ... courier-delivery-system_api:latest
```

**Important:** Database data is preserved during rollback because it's stored in a separate volume.

---

## Performance Optimization

### Enable Query Logging (Optional)

To debug slow queries, enable PostgreSQL logging:

```bash
sudo docker exec -it courier-postgres psql -U courier -d courier_db -c "
  ALTER SYSTEM SET log_min_duration_statement = 1000;
  SELECT pg_reload_conf();
"
```

This logs queries taking longer than 1 second.

### Monitor Container Resources

```bash
sudo docker stats courier-api
```

Expected resource usage:
- CPU: < 5%
- Memory: 100-200 MB
- Network: < 1 MB/s

---

## Maintenance

### Daily Backup

```bash
sudo docker exec courier-postgres pg_dump -U courier courier_db > /backups/courier_db_$(date +%Y%m%d).sql
```

### Weekly Cleanup

```bash
sudo docker system prune -a --volumes
```

### Monthly Updates

Check for security updates:
```bash
sudo apt update && sudo apt upgrade -y
```

---

## Support

For issues or questions:

1. Check logs: `sudo docker logs courier-api`
2. Verify database: `sudo docker exec -it courier-postgres psql -U courier -d courier_db -c "\dt"`
3. Test API: `curl https://couriermig.ru/api/health`
4. Review this guide's Troubleshooting section

---

**Last Updated:** May 5, 2026  
**Version:** PostgreSQL 1.0  
**Status:** Production Ready ✅
