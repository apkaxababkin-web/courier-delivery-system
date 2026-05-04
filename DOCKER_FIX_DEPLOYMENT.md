# Docker Deployment Fix - Frontend + Backend

## Проблема (была)
Docker build собирал только backend (`dist/index.js`), frontend не собирался. Результат:
- ❌ `/app/public` был пуст или содержал неправильные файлы
- ❌ Backend не отдавал static файлы
- ❌ Сайт по `/` давал `Cannot GET /`

## Решение (сделано)

### 1. Обновлен `package.json`
```json
{
  "scripts": {
    "build": "pnpm run build:frontend && pnpm run build:backend",
    "build:frontend": "cd courier-manager && pnpm run build",
    "build:backend": "esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist"
  }
}
```

**Что происходит:**
- `npm run build` сначала собирает frontend (`courier-manager/dist`)
- Потом собирает backend (`dist/index.js`)

### 2. Обновлен `Dockerfile`
Multi-stage build с 4 этапами:

```dockerfile
# Stage 1: Dependencies (кэш)
FROM node:22-alpine AS dependencies
# Копирует package.json, устанавливает зависимости

# Stage 2: Frontend Builder
FROM node:22-alpine AS frontend-builder
# Копирует courier-manager/, собирает React
# Результат: courier-manager/dist/

# Stage 3: Backend Builder
FROM node:22-alpine AS backend-builder
# Копирует server/, собирает Node.js
# Результат: dist/index.js

# Stage 4: Runtime
FROM node:22-alpine
# Копирует dist/index.js из backend-builder
# Копирует courier-manager/dist в /app/public из frontend-builder
# Запускает node dist/index.js
```

**Результат в контейнере:**
```
/app/
├── dist/
│   └── index.js              ← Backend
├── public/                   ← Frontend (скопирован из courier-manager/dist)
│   ├── index.html
│   ├── favicon.svg
│   ├── icons.svg
│   ├── index.js
│   └── assets/
│       ├── index-*.css
│       └── index-*.js
└── node_modules/
```

### 3. Обновлен `server/_core/index.ts`
Добавлен static middleware и SPA fallback:

```typescript
import path from "path";

// ... в startServer() ...

// Serve static files from /app/public (frontend build)
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

// SPA fallback: serve index.html for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"), (err) => {
    if (err) {
      res.status(404).json({ error: "Not found" });
    }
  });
});
```

**Что происходит:**
- `express.static(publicPath)` отдает все файлы из `/app/public`
- `app.get("*")` ловит все остальные маршруты и отдает `index.html` (для SPA)
- API маршруты (`/api/*`) обрабатываются до этого, так что они не затрагиваются

### 4. Исправлен `courier-manager/src/components/Modal.tsx`
Исправлена ошибка TypeScript с `verbatimModuleSyntax`:

```typescript
// Было:
import { ReactNode, useEffect } from 'react';

// Стало:
import type { ReactNode } from 'react';
import { useEffect } from 'react';
```

## Развертывание на сервере

### Шаг 1: Получить обновления
```bash
cd /path/to/courier-app
git pull origin main
```

### Шаг 2: Собрать новый образ
```bash
docker-compose build --no-cache
```

**Что происходит:**
1. Собирает frontend (React) → `courier-manager/dist/`
2. Собирает backend (Node.js) → `dist/index.js`
3. Копирует frontend в `/app/public` внутри контейнера
4. Финальный образ содержит оба компонента

### Шаг 3: Запустить контейнер
```bash
docker-compose up -d
```

### Шаг 4: Проверить результат

**Проверить что frontend доступен:**
```bash
curl http://localhost/
# Должен вернуть index.html
```

**Проверить что API работает:**
```bash
curl http://localhost/api/health
# Должен вернуть: {"ok":true,"timestamp":...}
```

**Проверить содержимое контейнера:**
```bash
docker exec courier-api ls -la /app/public/
# Должно быть:
# -rw-r--r-- 1 root root   465 ... index.html
# drwxr-xr-x 2 root root  4096 ... assets
# -rw-r--r-- 1 root root  9522 ... favicon.svg
# -rw-r--r-- 1 root root  5031 ... icons.svg
# -rw-r--r-- 1 root root 113927 ... index.js
```

## Архитектура потока данных

```
Пользователь
    ↓
GET http://localhost/
    ↓
Express Server (port 3000)
    ├─ /api/* → tRPC Router
    └─ /* → express.static(/app/public) → index.html → React SPA
    
React SPA
    ↓
GET /api/trpc/...
    ↓
tRPC Router → Database
```

## Что теперь работает

✅ Frontend собирается автоматически при `docker build`  
✅ Backend собирается автоматически при `docker build`  
✅ Static файлы отдаются из `/app/public`  
✅ SPA fallback работает (все маршруты → index.html)  
✅ API маршруты работают (`/api/*`)  
✅ Один контейнер вместо двух  

## Если что-то не работает

### Ошибка: `Cannot GET /`
**Причина:** Frontend не скопирован в `/app/public`  
**Решение:**
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Ошибка: `Cannot GET /api/health`
**Причина:** API маршруты не работают  
**Решение:** Проверить логи:
```bash
docker-compose logs api
```

### Ошибка: `Module not found` при сборке frontend
**Причина:** Зависимости не установлены  
**Решение:**
```bash
docker-compose build --no-cache --progress=plain
```

### Контейнер не запускается
**Причина:** Ошибка в коде  
**Решение:** Проверить логи:
```bash
docker-compose logs api
```

## Размер образа

- **Dependencies stage:** ~500 MB (кэшируется)
- **Frontend builder:** ~100 MB (временный)
- **Backend builder:** ~50 MB (временный)
- **Final image:** ~200 MB (только production зависимости)

## Оптимизация

Если нужно уменьшить размер:
1. Использовать `node:22-alpine` вместо `node:22` ✅ (уже используется)
2. Удалить dev зависимости в production ✅ (уже используется)
3. Использовать multi-stage build ✅ (уже используется)

## Дальнейшие улучшения

- [ ] Добавить кэширование слоев в GitHub Actions
- [ ] Добавить health check для frontend
- [ ] Добавить логирование запросов
- [ ] Добавить сжатие gzip для static файлов
- [ ] Добавить CDN для static файлов (в production)
