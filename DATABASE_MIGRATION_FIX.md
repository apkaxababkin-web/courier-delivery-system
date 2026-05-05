# Database Migration Fix — Production Deployment

## Problem Summary

The production deployment was failing because:

1. **MySQL vs PostgreSQL Mismatch**
   - `drizzle.config.ts` was configured for MySQL
   - `server/db.ts` was using mysql2 driver
   - But docker-compose uses PostgreSQL
   - Result: Database migrations failed, tables not created, authentication broken

2. **No Automatic Migrations**
   - Dockerfile didn't run migrations on container start
   - drizzle.config.ts wasn't copied to runtime image
   - Result: Database remained empty

3. **Docker Issues**
   - docker-compose v1.29 had ContainerConfig bugs
   - No proper dependency management between services

## Solution

### 1. Database Driver Fixed (MySQL → PostgreSQL)

**Changed Files:**

#### `drizzle.config.ts`
```typescript
// BEFORE
dialect: "mysql"

// AFTER
dialect: "postgresql"
```

#### `server/db.ts`
```typescript
// BEFORE
import mysql from "mysql2/promise";
const _pool = mysql.createPool(process.env.DATABASE_URL);

// AFTER
import postgres from "postgres";
const _pool = postgres(process.env.DATABASE_URL);
```

#### `package.json`
```json
// BEFORE
"mysql2": "^3.11.3"

// AFTER
"postgres": "^3.4.4"
```

### 2. Automatic Migrations Added

#### New File: `entrypoint.sh`
```bash
#!/bin/sh
# Waits for PostgreSQL
# Runs drizzle-kit migrate
# Starts API server
```

#### Updated `Dockerfile`
```dockerfile
# Copy drizzle config and schema
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Copy and run entrypoint
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
```

### 3. Docker Compose Improved

#### Updated `docker-compose.yml`
```yaml
services:
  postgres:
    healthcheck:
      start_period: 10s  # Added
    networks:
      - courier-network  # Added

  api:
    depends_on:
      postgres:
        condition: service_healthy  # Waits for DB
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      start_period: 30s  # Increased for migrations
    networks:
      - courier-network  # Added

networks:
  courier-network:  # Added
    driver: bridge
```

## Deployment Steps

### On Your Server

```bash
# 1. Pull latest code with fixes
cd /path/to/courier-delivery-system
git pull origin main

# 2. Run deployment script
bash deploy.sh

# This will:
# - Remove old containers (fixes docker-compose bugs)
# - Remove old images
# - Build fresh images
# - Start containers
# - Automatically run migrations
```

### What Happens Automatically

1. **Container starts** → entrypoint.sh runs
2. **Waits for PostgreSQL** → Checks if database is ready
3. **Runs migrations** → `drizzle-kit migrate` creates tables
4. **Starts API server** → `node dist/index.js`
5. **Health check passes** → `/api/health` returns 200

## Verification

### Check Migrations Ran

```bash
# View API logs
docker-compose logs api

# Expected output:
# [Entrypoint] PostgreSQL is ready!
# [Entrypoint] Running database migrations...
# [Entrypoint] ✓ Migrations completed successfully
# [Entrypoint] Starting API server...
```

### Check Tables Exist

```bash
# Connect to database
docker-compose exec postgres psql -U courier -d courier_db

# List tables
\dt

# Expected: couriers, tasks, users, requests, etc.
```

### Test Authentication

```bash
# Should return 200 (not 500)
curl http://localhost:3000/api/health

# Expected:
# {"ok":true,"timestamp":1234567890}
```

## Files Modified

| File | Change | Reason |
|------|--------|--------|
| `drizzle.config.ts` | MySQL → PostgreSQL | Match docker-compose database |
| `server/db.ts` | mysql2 → postgres driver | Use correct database driver |
| `package.json` | Replace mysql2 with postgres | Install correct dependencies |
| `Dockerfile` | Add entrypoint + drizzle config | Run migrations automatically |
| `docker-compose.yml` | Fix health checks + networking | Proper service dependencies |
| `entrypoint.sh` | NEW | Auto-run migrations on start |
| `deploy.sh` | UPDATED | Remove old containers first |

## Troubleshooting

### "Database still empty"

```bash
# Check if migrations ran
docker-compose logs api | grep -i migration

# If failed, check error
docker-compose logs api | grep -i error

# Run migrations manually
docker-compose exec api drizzle-kit migrate
```

### "Connection refused"

```bash
# Check if containers are running
docker-compose ps

# Check API logs
docker-compose logs api

# Check database logs
docker-compose logs postgres
```

### "Authentication still returns 500"

```bash
# Verify database connection
docker-compose exec api node -e "
  const { getDb } = require('./dist/index.js');
  getDb().then(db => console.log('DB:', !!db));
"

# Check if tables exist
docker-compose exec postgres psql -U courier -d courier_db -c "SELECT COUNT(*) FROM users;"
```

## Rollback (If Needed)

```bash
# Stop containers
docker-compose down

# Remove volumes (WARNING: deletes data)
docker volume rm courier-app_postgres_data

# Restart with old code
git checkout HEAD~1
bash deploy.sh
```

## Production Checklist

- [ ] Database driver changed from MySQL to PostgreSQL
- [ ] Drizzle config uses postgresql dialect
- [ ] Entrypoint script runs migrations automatically
- [ ] Dockerfile copies drizzle config
- [ ] Docker-compose has proper health checks
- [ ] Tables are created after deploy
- [ ] Authentication endpoint works
- [ ] API health check passes
- [ ] No manual database setup needed

## Next Steps

1. ✅ Commit all changes to git
2. ✅ Push to GitHub
3. ⏳ SSH to production server
4. ⏳ Run `bash deploy.sh`
5. ⏳ Verify with `docker-compose ps`
6. ⏳ Test authentication

---

**Status:** Ready for Production
**Last Updated:** 2026-05-05
