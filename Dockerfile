# Multi-stage build для Node.js backend + React frontend

# Stage 1: Dependencies (кэшируется отдельно)
FROM node:22-alpine AS dependencies

WORKDIR /app

# Копируем только package.json и pnpm-lock.yaml (для кэширования слоя)
COPY package.json pnpm-lock.yaml ./

# Устанавливаем pnpm
RUN npm install -g pnpm@9.12.0

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Stage 2: Frontend Builder (собираем React приложение)
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Копируем node_modules из dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Копируем исходный код frontend
COPY courier-manager/ ./courier-manager/
COPY package.json ./

# Собираем frontend
WORKDIR /app/courier-manager
RUN pnpm run build

# Stage 3: Backend Builder (собираем Node.js приложение)
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Копируем node_modules из dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Копируем исходный код backend
COPY package.json ./
COPY server/ ./server/
COPY shared/ ./shared/
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts tsconfig.json ./

# Собираем backend
RUN npm install -g pnpm@9.12.0 && \
    pnpm run build:backend

# Stage 4: Runtime (минимальный образ)
FROM node:22-alpine

WORKDIR /app

# Устанавливаем pnpm
RUN npm install -g pnpm@9.12.0

# Копируем только production зависимости
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY package.json ./

# Копируем собранный backend код
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/drizzle ./drizzle

# Копируем собранный frontend в /app/public
COPY --from=frontend-builder /app/courier-manager/dist ./public

# Копируем скрипты для миграций БД (если существуют)
COPY scripts/ ./scripts/ 2>/dev/null || true

# Expose порт (по умолчанию 3000)
EXPOSE 3000

# Health check - проверяем что процесс запущен
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode > 500) throw new Error(r.statusCode)}).on('error', () => {throw new Error('Connection failed')})" || exit 1

# Запуск приложения
CMD ["node", "dist/index.js"]
