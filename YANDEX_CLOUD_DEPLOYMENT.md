# Пошаговое развертывание на Yandex Cloud

Детальная инструкция для развертывания приложения на Yandex Cloud полностью в РФ.

## Архитектура

- **Frontend:** Yandex Object Storage + CDN (manager.site.ru)
- **Backend:** VPS Docker контейнер (api.site.ru)
- **Database:** Yandex Managed PostgreSQL
- **Все компоненты в РФ, без зависимости от зарубежных сервисов**

## Этап 1: Подготовка Yandex Cloud

### 1.1 Создать Managed PostgreSQL кластер

```bash
# В консоли Yandex Cloud:
# 1. Перейти: Управляемые базы данных → PostgreSQL
# 2. Нажать "Создать кластер"
# 3. Параметры:
#    - Версия: PostgreSQL 16
#    - Класс хоста: s2.small (2 vCPU, 4 GB RAM)
#    - Количество хостов: 1
#    - Имя БД: courier_db
#    - Пользователь: courier
#    - Пароль: (сгенерировать, сохранить)
#    - SSL: включить
# 4. Создать (ждать 10-15 минут)
```

**Результат:**
- Хост: `c-xxxxx.postgres.yandexcloud.net`
- Пароль: сохранить в безопасном месте

### 1.2 Создать Object Storage бакет

```bash
# В консоли Yandex Cloud:
# 1. Перейти: Хранилище → Object Storage
# 2. Нажать "Создать бакет"
# 3. Параметры:
#    - Имя: courier-app-frontend
#    - Класс: Стандартный
#    - Доступ: Публичный
# 4. Создать
```

### 1.3 Создать CDN дистрибьюцию

```bash
# В консоли Yandex Cloud:
# 1. Перейти: Сеть → CDN
# 2. Нажать "Создать дистрибьюцию"
# 3. Параметры:
#    - Источник: Object Storage (courier-app-frontend)
#    - Домен: manager.site.ru
#    - SSL: Let's Encrypt (автоматический)
# 4. Создать
```

**Результат:**
- CNAME: `d-xxxxx.cdn.yandexcloud.net`
- Используется для DNS записи

### 1.4 Создать VPS машину

```bash
# В консоли Yandex Cloud:
# 1. Перейти: Вычисления → Виртуальные машины
# 2. Нажать "Создать ВМ"
# 3. Параметры:
#    - ОС: Ubuntu 22.04 LTS
#    - Тип: n2-standard-2 (2 vCPU, 4 GB RAM)
#    - Диск: 50 GB SSD
#    - Публичный IP: включить
# 4. Создать
```

**Результат:**
- Публичный IP: `<PUBLIC_IP>`
- SSH ключ: сохранить локально

## Этап 2: Подготовка VPS

### 2.1 Подключиться к VPS

```bash
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP>
```

### 2.2 Обновить систему

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.3 Установить Docker

```bash
sudo apt install -y docker.io docker-compose git

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker

# Проверить
docker --version
```

### 2.4 Клонировать репозиторий

```bash
git clone <YOUR_REPO_URL> /home/ubuntu/courier-app
cd /home/ubuntu/courier-app
```

## Этап 3: Развертывание Backend

### 3.1 Создать .env файл

```bash
nano .env
```

Содержимое:

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

### 3.2 Собрать Docker образ

```bash
cd /home/ubuntu/courier-app/сайт/server
docker build -t courier-api:latest .
```

### 3.3 Запустить контейнер

```bash
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /home/ubuntu/courier-app/.env \
  courier-api:latest

# Проверить логи
docker logs -f courier-api
```

### 3.4 Установить Nginx

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3.5 Создать Nginx конфиг

```bash
sudo nano /etc/nginx/sites-available/courier-api
```

Содержимое:

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
        
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://courier_backend;
        access_log off;
    }
}
```

### 3.6 Включить конфиг

```bash
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3.7 Получить SSL сертификат

```bash
sudo certbot certonly --nginx -d api.site.ru

# Автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 3.8 Проверить Backend

```bash
# Локально на VPS
curl http://localhost:3000/health

# С внешнего хоста (после настройки DNS)
curl https://api.site.ru/health
```

## Этап 4: Развертывание Frontend

### 4.1 Собрать фронтенд (на локальном ПК)

```bash
cd сайт

npm install
npm run build

# Результат в папке dist/
```

### 4.2 Загрузить в Object Storage

**Способ 1: Через консоль Yandex Cloud**

1. Перейти в Object Storage
2. Выбрать бакет `courier-app-frontend`
3. Нажать "Загрузить файлы"
4. Выбрать все файлы из папки `dist/`
5. Загрузить

**Способ 2: Через AWS CLI (автоматизация)**

```bash
# Установить AWS CLI
pip install awscli

# Конфигурировать
aws configure
# Access Key ID: <YANDEX_CLOUD_KEY>
# Secret Access Key: <YANDEX_CLOUD_SECRET>
# Default region: ru-central1

# Загрузить файлы
aws s3 sync dist/ s3://courier-app-frontend/ \
  --endpoint-url https://storage.yandexcloud.net \
  --delete

# Очистить кэш CDN
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

## Этап 5: Настройка DNS

### 5.1 Добавить DNS записи

В вашем DNS провайдере (или Yandex Cloud DNS):

```
manager.site.ru  CNAME  d-xxxxx.cdn.yandexcloud.net
api.site.ru      A      <PUBLIC_IP_VPS>
```

### 5.2 Проверить DNS

```bash
# Проверить CNAME
nslookup manager.site.ru

# Проверить A запись
nslookup api.site.ru
```

## Этап 6: Финальная проверка

### 6.1 Проверить фронтенд

```bash
curl https://manager.site.ru
# Должен вернуть HTML страницу
```

### 6.2 Проверить бэкенд

```bash
curl https://api.site.ru/health
# Должен вернуть JSON ответ
```

### 6.3 Проверить БД

```bash
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db
# Должно подключиться
```

## Обновление приложения

### Обновить Backend

```bash
cd /home/ubuntu/courier-app

# Получить новый код
git pull origin main

# Пересобрать образ
cd сайт/server
docker build -t courier-api:latest .

# Перезапустить контейнер
docker stop courier-api
docker rm courier-api

docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /home/ubuntu/courier-app/.env \
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
aws s3 sync dist/ s3://courier-app-frontend/ \
  --endpoint-url https://storage.yandexcloud.net \
  --delete

# Очистить кэш CDN
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

## Мониторинг

### Логи Backend

```bash
# На VPS
docker logs -f courier-api
sudo tail -f /var/log/nginx/courier-api-error.log
```

### Проверка здоровья

```bash
# API
curl https://api.site.ru/health

# БД
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db -c "SELECT 1"

# Диск
df -h

# Память
free -h

# Процессы Docker
docker stats
```

## Troubleshooting

### Backend не отвечает

```bash
# Проверить контейнер
docker ps | grep courier-api

# Проверить логи
docker logs courier-api

# Перезапустить
docker restart courier-api
```

### Frontend не загружается

```bash
# Проверить файлы в Object Storage
aws s3 ls s3://courier-app-frontend/ --endpoint-url https://storage.yandexcloud.net

# Очистить кэш браузера (Ctrl+Shift+Delete)
```

### Проблемы с БД

```bash
# Проверить подключение
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Проверить SSL
openssl s_client -connect c-xxxxx.postgres.yandexcloud.net:6432
```

## Резервное копирование

### Backup БД

```bash
pg_dump postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db > backup.sql
```

### Backup Frontend

```bash
aws s3 sync s3://courier-app-frontend/ ./backup/ \
  --endpoint-url https://storage.yandexcloud.net
```

## Дополнительные ресурсы

- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
- [Object Storage](https://cloud.yandex.com/docs/storage/)
- [CDN](https://cloud.yandex.com/docs/cdn/)
- [Docker](https://docs.docker.com/)
- [Nginx](https://nginx.org/en/docs/)
