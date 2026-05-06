# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build frontend and backend
RUN pnpm run build

# ─── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install pnpm and psql client for health checks
RUN npm install -g pnpm && apk add --no-cache postgresql-client

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle files for migrations
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Copy entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Verify critical files are present
RUN ls -la /app/drizzle && ls -la /app/dist

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
