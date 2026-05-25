# Frontend Deployment Guide - Courier Manager

Веб-портал для менеджеров курьерской службы.

## Структура проекта

```
courier-manager/
├── src/
│   ├── views/          # Основные экраны (Tasks, Clients, etc.)
│   ├── components/     # React компоненты
│   ├── App.tsx         # Главный компонент
│   ├── main.tsx        # Entry point
│   └── index.css       # Глобальные стили (Tailwind v4)
├── public/             # Статические файлы
├── vite.config.ts      # Vite конфигурация
├── tailwind.config.js  # Tailwind CSS конфигурация
├── package.json
└── dist/               # Собранное приложение (после build)
```

## Локальная разработка

```bash
cd courier-manager

# Установить зависимости
pnpm install

# Запустить dev сервер
pnpm dev

# Открыть http://localhost:5173
```

## Production Build

### Вариант 1: Локальная сборка

```bash
cd courier-manager

# Собрать приложение
pnpm build

# Результат в папке dist/
ls dist/
```

### Вариант 2: Vercel (рекомендуется)

Vercel автоматически собирает и деплоит приложение при push в GitHub.

#### Первичная настройка:

1. Перейти на [vercel.com](https://vercel.com)
2. Нажать "New Project"
3. Импортировать GitHub репозиторий
4. Выбрать "Vite" как framework
5. Установить переменные окружения:
   ```
   VITE_API_URL=https://api.site.ru
   ```
6. Нажать "Deploy"

#### Дальнейшие деплои:

Просто push в main ветку — Vercel автоматически соберет и задеплоит.

```bash
git add .
git commit -m "Update courier manager"
git push origin main
```

### Вариант 3: Nginx на VPS

Если деплоить на том же VPS, что и backend:

```bash
# На VPS
cd /home/ubuntu/courier-app/courier-manager

# Собрать
pnpm build

# Скопировать в Nginx
sudo cp -r dist /var/www/courier-site
sudo chown -R www-data:www-data /var/www/courier-site

# Перезагрузить Nginx
sudo systemctl reload nginx
```

## Конфигурация

### API URL

Приложение подключается к backend по адресу, указанному в переменной окружения.

**Для разработки:** `http://localhost:3000`
**Для production:** `https://api.site.ru`

Переменная устанавливается в:
- `.env.local` (локально)
- Vercel Dashboard (на Vercel)
- Nginx конфиг (на VPS)

### Environment Variables

Создать `.env.local`:

```env
VITE_API_URL=https://api.site.ru
VITE_APP_NAME=Courier Manager
```

## Оптимизация

### Размер бандла

```bash
# Проверить размер
pnpm build

# Анализировать
pnpm add -D vite-plugin-visualizer
# Затем добавить в vite.config.ts и запустить build
```

### Кэширование

Vercel автоматически кэширует статические файлы.

Для Nginx:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location / {
    expires -1;
    add_header Cache-Control "public, must-revalidate, proxy-revalidate";
}
```

## Troubleshooting

### Проблема: "API not found"

Проверить что переменная `VITE_API_URL` указывает на правильный адрес backend.

```bash
# Проверить в браузере
console.log(import.meta.env.VITE_API_URL)
```

### Проблема: "CORS error"

Backend должен разрешить запросы с фронтенда.

Проверить в `server/_core/index.ts`:

```typescript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```

### Проблема: "Blank page"

Проверить:
1. Консоль браузера на ошибки
2. Network tab на failed requests
3. Что index.html загружается

## Performance

### Lighthouse оптимизация

```bash
# Проверить performance
pnpm build

# Открыть dist/index.html в браузере
# Запустить Lighthouse audit
```

### Code splitting

Vite автоматически делает code splitting для динамических импортов:

```typescript
// Это будет в отдельном chunk
const TasksView = lazy(() => import('./views/TasksView'));
```

## Мониторинг

### Sentry интеграция (опционально)

```bash
pnpm add @sentry/react @sentry/tracing
```

Затем в `main.tsx`:

```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

## Обновление зависимостей

```bash
# Проверить обновления
pnpm outdated

# Обновить все
pnpm update

# Обновить конкретный пакет
pnpm update react@latest
```

## Безопасность

1. **Secrets:** Не хранить API ключи в коде
2. **HTTPS:** Всегда использовать HTTPS в production
3. **CSP:** Настроить Content Security Policy
4. **Dependencies:** Регулярно проверять на уязвимости

```bash
pnpm audit
pnpm audit --fix
```

## Дополнительные ресурсы

- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
- [Vercel Documentation](https://vercel.com/docs)
