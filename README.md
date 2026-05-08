# Courier Delivery System

Мобильное приложение для курьеров на Expo/React Native с backend на Node.js/tRPC/PostgreSQL.

## Структура репозитория

```
courier-delivery-system/
├── app/                        # Expo/React Native мобильное приложение
│   ├── (tabs)/                 # Основные экраны (Tab Bar)
│   │   ├── index.tsx           # Список заявок
│   │   ├── pickup-gemotest.tsx # Пикап Гемотест
│   │   ├── pickup-sberbank.tsx # Пикап Сбербанк
│   │   └── letters.tsx         # Письма
│   ├── task/[id].tsx           # Детали заявки
│   ├── login.tsx               # Экран входа курьера
│   ├── profile.tsx             # Профиль курьера
│   ├── lib/
│   │   └── courier-auth.tsx    # Аутентификация курьера (SecureStore)
│   └── constants/
│       └── oauth.ts            # API base URL (production fallback)
├── server/                     # Backend (tRPC + PostgreSQL)
│   └── routers.ts              # Все API endpoints
├── courier-manager/            # Веб-панель менеджера (React + Vite)
├── courier-web/                # Веб-версия для курьеров (React + Vite)
├── shared/                     # Общие типы (TypeScript)
├── eas.json                    # EAS Build конфигурация
├── app.config.ts               # Expo конфигурация
└── docker-compose.yml          # Production deployment
```

## Мобильное приложение (Expo)

### Экраны

| Экран | Файл | Описание |
|-------|------|----------|
| Вход | `app/login.tsx` | Логин по username/password |
| Список заявок | `app/(tabs)/index.tsx` | Все заявки с фильтрами и датой |
| Детали заявки | `app/task/[id].tsx` | Просмотр и смена статуса |
| Профиль | `app/profile.tsx` | Инфо курьера, настройки, выход |
| Пикап Гемотест | `app/(tabs)/pickup-gemotest.tsx` | Двойной тап для подтверждения |
| Пикап Сбербанк | `app/(tabs)/pickup-sberbank.tsx` | Двойной тап для подтверждения |
| Письма | `app/(tabs)/letters.tsx` | Список писем |

### API Endpoints (production: https://courier.couriermig.ru)

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `courierAuth.login` | mutation | Вход по username + password |
| `courierAuth.me` | query | Получить данные текущего курьера |
| `courierAuth.getDemoToken` | mutation | Войти как демо-курьер |
| `tasks.all` | query | Все заявки курьера за дату |
| `tasks.byId` | query | Детали одной заявки |
| `tasks.setStatus` | mutation | Сменить статус заявки |
| `tasks.assignCourier` | mutation | Назначить курьера на заявку |
| `tasks.rescheduleTask` | mutation | Перенести заявку на другую дату |
| `tasks.updatePlaces` | mutation | Обновить места доставки |
| `tasks.updateComments` | mutation | Обновить комментарии |
| `couriers.list` | query | Список всех курьеров |

### Статусы заявок

| Статус | Цвет | Описание |
|--------|------|----------|
| `assigned` | Синий | Назначена курьеру |
| `in_progress` | Оранжевый | В работе |
| `completed` | Зелёный | Выполнена |
| `cancelled` | Красный | Отменена |

---

## Сборка Android APK

### Требования

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- EAS CLI (`npm install -g eas-cli`)
- Аккаунт на [expo.dev](https://expo.dev)

### Установка зависимостей

```bash
git clone https://github.com/apkaxababkin-web/courier-delivery-system.git
cd courier-delivery-system
git checkout mobile-production-fix
pnpm install
```

### Вход в EAS

```bash
eas login
# Введите email и пароль от аккаунта expo.dev
```

### Debug APK (для тестирования)

```bash
# Собрать debug APK (developmentClient)
eas build --platform android --profile development

# APK будет доступен по ссылке после сборки
# Или скачать через: eas build:list
```

### Preview APK (release, без подписи Play Store)

```bash
# Собрать release APK для внутреннего распространения
eas build --platform android --profile preview

# Скачать APK:
eas build:list --platform android
```

### Production AAB (для Google Play Store)

```bash
# Собрать AAB для загрузки в Google Play
eas build --platform android --profile production
```

### Локальная сборка (без EAS, нужен Android SDK)

```bash
# Установить Java 17
sudo apt-get install openjdk-17-jdk

# Сгенерировать Android-проект
npx expo prebuild --platform android --clean

# Собрать debug APK
cd android && ./gradlew assembleDebug

# APK будет в:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Сборка iOS IPA

### Требования

- macOS (обязательно для локальной сборки)
- Xcode 15+
- Apple Developer Account
- EAS CLI

### Preview IPA (Simulator)

```bash
eas build --platform ios --profile development
```

### Production IPA (App Store)

```bash
eas build --platform ios --profile production
```

### Локальная сборка (macOS + Xcode)

```bash
# Сгенерировать iOS-проект
npx expo prebuild --platform ios --clean

# Открыть в Xcode
open ios/CourierDeliveryApp.xcworkspace

# Или собрать через xcodebuild
cd ios && xcodebuild -workspace CourierDeliveryApp.xcworkspace \
  -scheme CourierDeliveryApp \
  -configuration Release \
  -archivePath build/CourierDeliveryApp.xcarchive \
  archive
```

---

## Запуск в режиме разработки

### Мобильное приложение (Expo Go)

```bash
# Запустить Metro bundler
pnpm dev:metro

# Открыть в Expo Go на телефоне по QR-коду
# Или в эмуляторе:
pnpm android   # Android
pnpm ios       # iOS (только macOS)
```

### Backend сервер

```bash
# Запустить backend (порт 3000)
pnpm dev:server

# Или запустить всё вместе:
pnpm dev
```

### Веб-панель менеджера

```bash
cd courier-manager
pnpm install
pnpm dev
# Откроется на http://localhost:5173
```

### Веб-версия для курьеров

```bash
cd courier-web
pnpm install
pnpm dev
# Откроется на http://localhost:5174
```

---

## Production Deployment

### Docker Compose (рекомендуется)

```bash
# Скопировать .env.example в .env и заполнить
cp .env.example .env
nano .env

# Запустить все сервисы
docker-compose up -d

# Проверить статус
docker-compose ps
docker-compose logs -f
```

### Переменные окружения

```env
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/courier_db

# JWT секреты
JWT_SECRET=your-jwt-secret-here
COURIER_JWT_SECRET=your-courier-jwt-secret-here

# API
EXPO_PUBLIC_API_BASE_URL=https://courier.couriermig.ru
```

---

## Конфигурация EAS (eas.json)

| Профиль | Тип | Описание |
|---------|-----|----------|
| `development` | APK debug | Для разработки с dev client |
| `preview` | APK release | Для внутреннего тестирования |
| `production` | AAB | Для Google Play Store |

Все профили используют production API: `https://courier.couriermig.ru`

---

## Технологии

| Компонент | Технология |
|-----------|------------|
| Мобильное приложение | Expo SDK 54, React Native 0.81 |
| Навигация | Expo Router 6 |
| Стилизация | NativeWind 4 (Tailwind CSS) |
| API клиент | tRPC + TanStack Query |
| Хранение сессии | expo-secure-store |
| Backend | Node.js, Express, tRPC |
| База данных | PostgreSQL + Drizzle ORM |
| Веб-панель | React + Vite + TypeScript |
| Деплой | Docker Compose + Nginx |
