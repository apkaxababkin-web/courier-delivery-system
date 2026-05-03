# Multi-stage build для Node.js backend

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Копируем package.json и pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Устанавливаем pnpm
RUN npm install -g pnpm

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Копируем исходный код
COPY . .

# Собираем backend (если скрипт существует)
RUN pnpm run build || echo "Build script not found, skipping build"

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Устанавливаем pnpm
RUN npm install -g pnpm

# Копируем package.json для установки production зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем только production зависимости
RUN pnpm install --frozen-lockfile --prod

# Копируем собранный код из builder (если существует)
COPY --from=builder /app/dist ./dist 2>/dev/null || true
COPY --from=builder /app/drizzle ./drizzle 2>/dev/null || true

# Копируем скрипты для миграций БД (если существуют)
COPY scripts/ ./scripts/ 2>/dev/null || true

# Копируем исходный код (на случай если dist не был собран)
COPY server/ ./server/ 2>/dev/null || true
COPY shared/ ./shared/ 2>/dev/null || true

# Expose порт (по умолчанию 3000)
EXPOSE 3000

# Health check - проверяем что процесс запущен
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode > 500) throw new Error(r.statusCode)}).on('error', () => {throw new Error('Connection failed')})" || exit 1

# Запуск приложения
CMD ["node", "dist/index.js"]
