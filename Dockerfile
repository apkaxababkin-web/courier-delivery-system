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

# Собираем backend
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Устанавливаем pnpm
RUN npm install -g pnpm

# Копируем package.json для установки production зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем только production зависимости
RUN pnpm install --frozen-lockfile --prod

# Копируем собранный код из builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Копируем скрипты для миграций БД
COPY scripts/ ./scripts/ 2>/dev/null || true

# Expose порт (по умолчанию 3000)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Запуск приложения
CMD ["node", "dist/index.js"]
