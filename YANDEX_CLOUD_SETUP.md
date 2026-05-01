# Yandex Cloud Setup Guide

Полное руководство по настройке и деплою приложения на Yandex Cloud.

## Архитектура системы

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
│  │  Nginx (443)    │                                        │
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

## Требования

- **Yandex Cloud аккаунт** с активным проектом
- **VPS машина** (Ubuntu 22.04+, 2+ CPU, 2+ GB RAM)
- **Managed PostgreSQL** (версия 16+, SSL включен)
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

### 2. Создать VPS машину

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

### 3. Подготовить VPS

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

### 4. Конфигурация Backend

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
FRONTEND_URL=https://site.ru
MANAGER_URL=https://site.ru
SESSION_SECRET=<GENERATE: openssl rand -base64 32>
LOG_LEVEL=info
```

### 5. Запустить Backend через Docker

```bash
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

### 6. Настроить Nginx

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
    }
}
```

Включить конфиг:

```bash
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Получить SSL сертификат

```bash
sudo certbot certonly --nginx -d api.site.ru

# Автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 8. Деплой Frontend

**Вариант A: Vercel (рекомендуется)**

```bash
npm i -g vercel
cd courier-manager
vercel --prod
```

**Вариант B: На том же VPS**

```bash
cd courier-manager
npm run build
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
}
```

## Проверка статуса

```bash
# Docker контейнер
docker ps | grep courier-api
docker logs courier-api

# Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/courier-api-error.log

# Подключение к БД
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# API
curl https://api.site.ru/health
```

## Обновление приложения

```bash
cd /home/ubuntu/courier-app

# Получить новый код
git pull origin main

# Пересобрать Docker образ
docker build -t courier-api:latest .

# Перезапустить контейнер
docker stop courier-api
docker rm courier-api

docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest

# Запустить миграции БД (если нужно)
docker exec courier-api npm run db:push
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
docker exec courier-api npm run db:push

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
2. **SSH ключи:** Использовать только SSH ключи
3. **Secrets:** Хранить в .env, не в коде
4. **Updates:** Регулярно обновлять Docker образы
5. **Monitoring:** Настроить алерты на ошибки

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

## Дополнительные ресурсы

- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
