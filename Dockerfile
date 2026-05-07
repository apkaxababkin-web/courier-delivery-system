# Multi-stage build для Node.js backend + React frontend

# ─────────────────────────────────────────────────────────────────
# Stage 1: Backend dependencies
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS backend-deps

WORKDIR /app

RUN npm install -g pnpm@9.12.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 2: Frontend dependencies
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-deps

WORKDIR /app/courier-manager

RUN npm install -g pnpm@9.12.0

COPY courier-manager/package.json courier-manager/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 3: Frontend Builder (собираем React приложение)
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /app/courier-manager

RUN npm install -g pnpm@9.12.0

# Копируем node_modules из frontend-deps
COPY --from=frontend-deps /app/courier-manager/node_modules ./node_modules

# Копируем исходный код frontend
COPY courier-manager/ ./

# Собираем frontend (vite build)
RUN pnpm run build

# ─────────────────────────────────────────────────────────────────
# Stage 4: Backend Builder (собираем Node.js приложение)
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS backend-builder

WORKDIR /app

RUN npm install -g pnpm@9.12.0

# Копируем node_modules из backend-deps
COPY --from=backend-deps /app/node_modules ./node_modules

# Копируем исходный код backend
COPY package.json ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY drizzle/ ./drizzle/

# Собираем backend (esbuild)
RUN pnpm run build:backend

# ─────────────────────────────────────────────────────────────────
# Stage 5: Runtime (минимальный production образ)
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

RUN npm install -g pnpm@9.12.0 \
  && apk add --no-cache postgresql-client

# Копируем только production зависимости
COPY --from=backend-deps /app/node_modules ./node_modules
COPY package.json ./

# Копируем собранный backend
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/drizzle ./drizzle

# Копируем собранный frontend в /app/public
COPY --from=frontend-builder /app/courier-manager/dist ./public

# Копируем drizzle.config.ts для миграций
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Копируем entrypoint скрипт
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

# Expose порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Запуск с entrypoint для автоматических миграций
ENTRYPOINT ["./entrypoint.sh"]
