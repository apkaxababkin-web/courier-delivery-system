# Deployment Guide - Yandex Cloud (РФ)

Полное руководство по развертыванию приложения на Yandex Cloud с использованием Object Storage, CDN, VPS и Managed PostgreSQL.

## Архитектура системы

```
┌──────────────────────────────────────────────────────────┐
│              Yandex Cloud (РФ)                           │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Object Storage  │  │ CDN Edge     │  │ VPS Docker │  │
│  │ (статика)       │  │ (кэш)        │  │ (Backend)  │  │
│  │ ┌─────────────┐ │  │              │  │ ┌────────┐ │  │
│  │ │ index.html  │ │  │ manager.     │  │ │Backend │ │  │
│  │ │ app.js      │ │  │ site.ru      │  │ │:3000   │ │  │
│  │ │ styles.css  │ │  │              │  │ └────────┘ │  │
│  │ └─────────────┘ │  │              │  │ api.site.ru│  │
│  └─────────────────┘  └──────────────┘  └────────────┘  │
│                                                 ▲         │
│  ┌──────────────────────────────────────────────┼─────┐  │
│  │              Managed PostgreSQL              │     │  │
│  │              (courier_db)                    │     │  │
│  │              (SSL, автобэкапы)              │     │  │
│  └──────────────────────────────────────────────┼─────┘  │
│                                                 │         │
└─────────────────────────────────────────────────┼─────────┘
                                                  │
                                    ┌─────────────┴──────────┐
                                    │                        │
                            ┌───────▼────────┐      ┌───────▼────────┐
                            │ Браузер        │      │ Мобильное      │
                            │ manager.site.ru│      │ (Expo EAS)     │
                            └────────────────┘      └────────────────┘
```

## Компоненты

| Компонент | Назначение | Размещение |
|-----------|-----------|-----------|
| **Frontend (веб-портал)** | Статические файлы (HTML, JS, CSS) | Yandex Object Storage + CDN |
| **Backend API** | Node.js/tRPC сервер | Yandex VPS (Docker контейнер) |
| **Database** | PostgreSQL 16 | Yandex Managed Service for PostgreSQL |
| **DNS** | Маршрутизация трафика | Yandex Cloud DNS или внешний DNS |

## Требования

- **Yandex Cloud аккаунт** с активным проектом
- **VPS машина** (Ubuntu 22.04+, 2+ CPU, 2+ GB RAM)
- **Managed PostgreSQL** (версия 16+, SSL включен)
- **Object Storage** (для статики фронтенда)
- **CDN** (для кэширования и доставки)
- **Domain** (example.com)
- **Docker** и **Docker Compose** на VPS

## Быстрый старт

### 1. Создать Managed PostgreSQL

В консоли Yandex Cloud:

1. Перейти в **Managed Service for PostgreSQL**
2. Нажать **Создать кластер**
3. Выбрать:
   - Версия: PostgreSQL 16
   - Класс хоста: s2.small
   - Имя БД: `courier_db`
   - Пользователь: `courier`
   - Пароль: (сгенерировать надежный)
   - SSL: включить
4. Создать кластер (ждать 10-15 минут)

Получить:
- **Хост:** `c-xxxxx.postgres.yandexcloud.net`
- **Пароль:** сохранить в безопасном месте

### 2. Создать Object Storage бакет

1. Перейти в **Object Storage**
2. Нажать **Создать бакет**
3. Выбрать:
   - Имя: `courier-app-frontend`
   - Класс хранилища: Стандартный
   - Доступ: Публичный (для CDN)
4. Создать бакет

### 3. Создать CDN дистрибьюцию

1. Перейти в **CDN**
2. Нажать **Создать дистрибьюцию**
3. Выбрать:
   - Источник: Object Storage бакет `courier-app-frontend`
   - Домен: `manager.site.ru`
   - SSL сертификат: Let's Encrypt (автоматический)
4. Создать дистрибьюцию

### 4. Создать VPS машину

1. Перейти в **Compute Cloud**
2. Нажать **Создать виртуальную машину**
3. Выбрать:
   - ОС: Ubuntu 22.04 LTS
   - Тип: n2-standard-2 или выше
   - Диск: 50 GB SSD
   - Публичный IP: включить
4. Создать машину

Получить:
- **Публичный IP:** для подключения
- **SSH ключ:** сохранить локально

### 5. Подготовить VPS

```bash
# Подключиться к VPS
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP>

# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker
sudo apt install -y docker.io docker-compose git

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Клонировать репозиторий
git clone <YOUR_REPO_URL> /home/ubuntu/courier-app
cd /home/ubuntu/courier-app
```

### 6. Конфигурация Backend

```bash
# Создать .env файл
nano .env
```

Заполнить:

```env
NODE_ENV=production
DATABASE_URL=postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db?sslmode=require
API_PORT=3000
API_HOST=0.0.0.0
FRONTEND_URL=https://manager.site.ru
MANAGER_URL=https://manager.site.ru
SESSION_SECRET=<GENERATE: openssl rand -base64 32>
LOG_LEVEL=info
```

### 7. Запустить Backend через Docker

```bash
# Перейти в папку с backend
cd сайт/server

# Собрать Docker образ
docker build -t courier-api:latest .

# Запустить контейнер
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ../../.env \
  courier-api:latest

# Проверить логи
docker logs -f courier-api
```

### 8. Настроить Nginx

```bash
# Установить Nginx и Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Создать конфиг
sudo nano /etc/nginx/sites-available/courier-api
```

Вставить:

```nginx
upstream courier_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name api.site.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.site.ru;

    ssl_certificate /etc/letsencrypt/live/api.site.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.site.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/courier-api-access.log;
    error_log /var/log/nginx/courier-api-error.log;

    location / {
        proxy_pass http://courier_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (без логирования)
    location /health {
        proxy_pass http://courier_backend;
        access_log off;
    }
}
```

Включить конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. Получить SSL сертификат

```bash
sudo certbot certonly --nginx -d api.site.ru

# Автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 10. Собрать и загрузить Frontend

```bash
# На локальном ПК
cd сайт

# Собрать фронтенд
npm install
npm run build

# Результат в папке dist/
```

### 11. Загрузить Frontend в Object Storage

Есть несколько способов:

**Способ A: Через консоль Yandex Cloud**

1. Перейти в **Object Storage**
2. Выбрать бакет `courier-app-frontend`
3. Нажать **Загрузить файлы**
4. Выбрать все файлы из папки `dist/`
5. Загрузить

**Способ B: Через AWS CLI**

```bash
# Установить AWS CLI
pip install awscli

# Конфигурировать
aws configure

# Загрузить файлы
aws s3 sync dist/ s3://courier-app-frontend/ --endpoint-url https://storage.yandexcloud.net

# Очистить кэш CDN
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

**Способ C: Через Yandex Cloud CLI**

```bash
# Установить Yandex Cloud CLI
curl https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash

# Конфигурировать
yc init

# Загрузить файлы
yc storage s3api put-object --bucket courier-app-frontend --key index.html --body dist/index.html
```

### 12. Настроить DNS

В вашем DNS провайдере создать записи:

```
manager.site.ru  CNAME  d-xxxxx.cdn.yandexcloud.net
api.site.ru      A      <PUBLIC_IP_VPS>
```

Или если используете Yandex Cloud DNS:

1. Перейти в **Cloud DNS**
2. Создать зону для `site.ru`
3. Добавить записи:
   - `manager.site.ru` → CDN дистрибьюция
   - `api.site.ru` → публичный IP VPS

## Проверка статуса

```bash
# Проверить фронтенд
curl https://manager.site.ru

# Проверить бэкенд
curl https://api.site.ru/health

# Проверить Docker контейнер
docker ps | grep courier-api
docker logs courier-api

# Проверить Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/courier-api-error.log

# Проверить БД
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db
```

## Обновление приложения

### Обновить Backend

```bash
cd /home/ubuntu/courier-app

# Получить новый код
git pull origin main

# Пересобрать Docker образ
cd сайт/server
docker build -t courier-api:latest .

# Перезапустить контейнер
docker stop courier-api
docker rm courier-api

docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file ../../.env \
  courier-api:latest
```

### Обновить Frontend

```bash
# На локальном ПК
cd сайт

# Получить новый код
git pull origin main

# Собрать
npm run build

# Загрузить в Object Storage
aws s3 sync dist/ s3://courier-app-frontend/ --endpoint-url https://storage.yandexcloud.net --delete

# Очистить кэш CDN
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

## Мониторинг

### Логи

```bash
# Docker логи
docker logs -f courier-api

# Nginx логи
sudo tail -f /var/log/nginx/courier-api-error.log
sudo tail -f /var/log/nginx/courier-api-access.log

# Системные логи
sudo journalctl -u nginx -f
```

### Проверка здоровья

```bash
# API health check
curl https://api.site.ru/health

# БД подключение
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db -c "SELECT 1"

# Дисковое пространство
df -h

# Использование памяти
free -h

# Процессы Docker
docker stats
```

## Troubleshooting

### "Connection refused"

```bash
# Проверить что контейнер запущен
docker ps | grep courier-api

# Проверить логи
docker logs courier-api

# Проверить порты
sudo netstat -tlnp | grep 3000
```

### "Database connection error"

```bash
# Проверить DATABASE_URL
cat .env | grep DATABASE_URL

# Проверить подключение
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Проверить SSL
openssl s_client -connect c-xxxxx.postgres.yandexcloud.net:6432
```

### "Frontend не загружается"

```bash
# Проверить что файлы в Object Storage
aws s3 ls s3://courier-app-frontend/ --endpoint-url https://storage.yandexcloud.net

# Проверить CDN статус
# В консоли Yandex Cloud → CDN → Дистрибьюция → Статус

# Очистить кэш браузера (Ctrl+Shift+Delete)
```

### "SSL certificate error"

```bash
# Обновить сертификат
sudo certbot renew --force-renewal

# Проверить
sudo certbot certificates

# Перезагрузить Nginx
sudo systemctl reload nginx
```

## Безопасность

1. **Firewall:** Ограничить доступ к портам 3000 и 5432
2. **SSH ключи:** Использовать только SSH ключи, отключить пароли
3. **Secrets:** Хранить в .env, не в коде
4. **Updates:** Регулярно обновлять Docker образы и зависимости
5. **Monitoring:** Настроить алерты на критические ошибки
6. **Object Storage:** Включить версионирование для восстановления

## Backup и восстановление

### Автоматический backup

Yandex Managed Service for PostgreSQL создает резервные копии автоматически.
Проверить в консоли: Managed Service for PostgreSQL → Кластер → Резервные копии

### Ручной backup

```bash
# Backup БД
pg_dump postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db > backup.sql

# Restore
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db < backup.sql
```

### Backup Object Storage

```bash
# Синхронизировать локально
aws s3 sync s3://courier-app-frontend/ ./backup/ --endpoint-url https://storage.yandexcloud.net
```

## Масштабирование

### Увеличить ресурсы VPS

1. Перейти в **Compute Cloud**
2. Выбрать машину
3. Нажать **Изменить конфигурацию**
4. Выбрать новый класс (больше CPU/RAM)
5. Перезагрузить машину

### Добавить реплики PostgreSQL

1. Перейти в **Managed Service for PostgreSQL**
2. Выбрать кластер
3. Нажать **Добавить хост**
4. Выбрать зону доступности (для HA)

### Кэширование CDN

Убедитесь что правильно настроены заголовки кэширования:

```nginx
# В Nginx конфиге для статики
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

location / {
    expires -1;
    add_header Cache-Control "public, must-revalidate, proxy-revalidate";
}
```

## Дополнительные ресурсы

- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
- [Object Storage Documentation](https://cloud.yandex.com/docs/storage/)
- [CDN Documentation](https://cloud.yandex.com/docs/cdn/)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
