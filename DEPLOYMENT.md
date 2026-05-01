# Deployment Guide - Yandex Cloud

Этот документ описывает процесс деплоя backend и frontend на Yandex Cloud.

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                    Yandex Cloud                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │  VPS (VM)        │         │  Managed PostgreSQL      │  │
│  │  ┌────────────┐  │         │  ┌──────────────────────┐│  │
│  │  │ Docker     │  │◄────────┼──┤ courier_db           ││  │
│  │  │ Backend    │  │         │  └──────────────────────┘│  │
│  │  │ (port 3000)│  │         │  (SSL, автобэкапы)      │  │
│  │  └────────────┘  │         └──────────────────────────┘  │
│  │                  │                                        │
│  │  api.site.ru    │                                        │
│  └──────────────────┘                                        │
│           ▲                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
    ┌───────┴────────┐
    │                │
┌───▼────────┐  ┌───▼────────┐
│ Frontend   │  │ Mobile App │
│ (Vercel)   │  │ (Expo EAS) │
│ site.ru    │  │            │
└────────────┘  └────────────┘
```

## Предварительные требования

1. **Yandex Cloud аккаунт** с активным проектом
2. **VPS машина** (Ubuntu 22.04 или выше)
   - Минимум: 2 CPU, 2 GB RAM
   - Рекомендуется: 4 CPU, 4 GB RAM
3. **Yandex Managed Service for PostgreSQL**
   - Версия 16+
   - SSL включен
4. **Docker и Docker Compose** установлены на VPS
5. **Domain** (example.com)

## Шаг 1: Подготовка Yandex Cloud

### 1.1 Создать Managed PostgreSQL кластер

```bash
# Через Yandex Cloud Console:
# 1. Перейти в "Managed Service for PostgreSQL"
# 2. Нажать "Создать кластер"
# 3. Выбрать:
#    - Версия: PostgreSQL 16
#    - Класс хоста: s2.small (или выше)
#    - Количество хостов: 1 (или 3 для HA)
#    - Зона доступности: любая
#    - Имя БД: courier_db
#    - Пользователь: courier
#    - Пароль: (сгенерировать надежный пароль)
# 4. Включить SSL
# 5. Создать кластер (ждать 10-15 минут)
```

После создания получить:
- **Хост:** `c-xxxxx.postgres.yandexcloud.net`
- **Пароль:** сохранить в безопасном месте
- **Сертификат SSL:** скачать

### 1.2 Создать VPS машину

```bash
# Через Yandex Cloud Console:
# 1. Перейти в "Compute Cloud"
# 2. Нажать "Создать виртуальную машину"
# 3. Выбрать:
#    - ОС: Ubuntu 22.04 LTS
#    - Тип: General purpose (n2-standard-2 или выше)
#    - Диск: 50 GB SSD
#    - Публичный IP: включить
# 4. Создать машину
```

Получить:
- **Публичный IP:** используется для подключения
- **SSH ключ:** сохранить локально

## Шаг 2: Подготовка VPS

### 2.1 Подключиться к VPS

```bash
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP>
```

### 2.2 Установить Docker и Docker Compose

```bash
# Обновить пакеты
sudo apt update && sudo apt upgrade -y

# Установить Docker
sudo apt install -y docker.io docker-compose

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Проверить установку
docker --version
docker-compose --version
```

### 2.3 Установить Git и клонировать репозиторий

```bash
sudo apt install -y git

# Клонировать репозиторий
git clone <YOUR_REPO_URL> /home/ubuntu/courier-app
cd /home/ubuntu/courier-app
```

## Шаг 3: Конфигурация Backend

### 3.1 Создать .env файл

```bash
cp .env.example .env
nano .env
```

Заполнить переменные:

```env
NODE_ENV=production

# Yandex Managed PostgreSQL
DATABASE_URL=postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db?sslmode=require

API_PORT=3000
API_HOST=0.0.0.0

FRONTEND_URL=https://site.ru
MANAGER_URL=https://site.ru

LOG_LEVEL=info

SESSION_SECRET=<GENERATE_SECURE_RANDOM_STRING>
```

Где:
- `PASSWORD` — пароль от PostgreSQL (из шага 1.1)
- `c-xxxxx` — ID кластера PostgreSQL
- `SESSION_SECRET` — сгенерировать: `openssl rand -base64 32`

### 3.2 Скачать SSL сертификат PostgreSQL (если требуется)

```bash
# Если используется SSL, скачать сертификат
mkdir -p /home/ubuntu/courier-app/certs
# Скачать сертификат из Yandex Cloud Console и поместить в certs/
```

## Шаг 4: Деплой Backend через Docker

### 4.1 Собрать и запустить контейнер

```bash
cd /home/ubuntu/courier-app

# Собрать Docker образ
docker build -t courier-api:latest .

# Запустить контейнер
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest

# Проверить логи
docker logs -f courier-api
```

### 4.2 Альтернатива: использовать Docker Compose

```bash
# Если используется только backend (без локальной PostgreSQL):
docker-compose -f docker-compose.yml up -d api

# Или для полного стека (если PostgreSQL на VPS):
docker-compose up -d
```

### 4.3 Проверить что backend работает

```bash
# Проверить статус контейнера
docker ps | grep courier-api

# Проверить логи
docker logs courier-api

# Проверить API
curl http://localhost:3000/health

# Проверить с внешнего хоста
curl http://<PUBLIC_IP>:3000/health
```

## Шаг 5: Настройка Nginx (обратный прокси)

### 5.1 Установить Nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 5.2 Создать конфигурацию Nginx

```bash
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

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.site.ru;

    # SSL сертификаты (будут добавлены certbot)
    ssl_certificate /etc/letsencrypt/live/api.site.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.site.ru/privkey.pem;

    # SSL конфигурация
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Логи
    access_log /var/log/nginx/courier-api-access.log;
    error_log /var/log/nginx/courier-api-error.log;

    # Проксирование
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

### 5.3 Включить конфигурацию

```bash
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5.4 Получить SSL сертификат

```bash
sudo certbot certonly --nginx -d api.site.ru

# Автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Шаг 6: Деплой Frontend (веб-портал)

Frontend можно деплоить несколькими способами:

### Вариант A: На том же VPS через Nginx

```bash
# Собрать frontend
cd /home/ubuntu/courier-app/courier-manager
npm run build

# Скопировать dist в Nginx
sudo cp -r dist /var/www/courier-site
sudo chown -R www-data:www-data /var/www/courier-site

# Создать Nginx конфиг для фронтенда
sudo nano /etc/nginx/sites-available/courier-site
```

```nginx
server {
    listen 80;
    server_name site.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name site.ru;

    ssl_certificate /etc/letsencrypt/live/site.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/site.ru/privkey.pem;

    root /var/www/courier-site;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass https://api.site.ru/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Вариант B: На Vercel (рекомендуется)

```bash
# Установить Vercel CLI
npm i -g vercel

# Деплоить
cd courier-manager
vercel --prod
```

## Шаг 7: Мониторинг и логирование

### 7.1 Проверить статус сервисов

```bash
# Docker контейнер
docker ps
docker logs courier-api

# Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/courier-api-error.log

# PostgreSQL подключение
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db
```

### 7.2 Настроить автоматический перезапуск

```bash
# Docker контейнер уже имеет --restart unless-stopped

# Проверить
docker inspect courier-api | grep RestartPolicy
```

### 7.3 Настроить логирование

```bash
# Логи Docker
docker logs --follow courier-api

# Логи Nginx
sudo journalctl -u nginx -f
```

## Шаг 8: Обновление приложения

### 8.1 Обновить код

```bash
cd /home/ubuntu/courier-app
git pull origin main
```

### 8.2 Пересобрать Docker образ

```bash
docker build -t courier-api:latest .
docker stop courier-api
docker rm courier-api

docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest
```

### 8.3 Запустить миграции БД (если нужно)

```bash
docker exec courier-api npm run db:push
```

## Troubleshooting

### Проблема: "Connection refused"

```bash
# Проверить что контейнер запущен
docker ps | grep courier-api

# Проверить логи
docker logs courier-api

# Проверить порты
sudo netstat -tlnp | grep 3000
```

### Проблема: "Database connection error"

```bash
# Проверить DATABASE_URL в .env
cat .env | grep DATABASE_URL

# Проверить подключение к PostgreSQL
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Проверить SSL сертификат
openssl s_client -connect c-xxxxx.postgres.yandexcloud.net:6432
```

### Проблема: "SSL certificate error"

```bash
# Обновить сертификат
sudo certbot renew --force-renewal

# Проверить
sudo certbot certificates
```

## Backup и восстановление

### Автоматический backup PostgreSQL

Yandex Managed Service for PostgreSQL автоматически создает резервные копии.
Проверить в консоли: Managed Service for PostgreSQL → Кластер → Резервные копии

### Ручной backup

```bash
# Backup БД
pg_dump postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db > backup.sql

# Restore
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db < backup.sql
```

## Безопасность

1. **Firewall:** Ограничить доступ к портам 3000 и 5432 только необходимым IP
2. **SSH ключи:** Использовать только SSH ключи, отключить пароли
3. **Secrets:** Хранить чувствительные данные в .env, не в коде
4. **Updates:** Регулярно обновлять Docker образы и зависимости
5. **Monitoring:** Настроить алерты на критические ошибки

## Дополнительные ресурсы

- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
