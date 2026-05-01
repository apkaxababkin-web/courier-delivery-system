# Быстрый старт: Деплой Courier App на Yandex Cloud

Минимальные шаги для развертывания приложения за 30 минут.

## Шаг 1: Создать инфраструктуру (10 минут)

### 1.1 PostgreSQL

В консоли Yandex Cloud:
1. **Managed Service for PostgreSQL** → **Создать кластер**
2. Версия: PostgreSQL 16, Класс: s2.small
3. БД: `courier_db`, Пользователь: `courier`, Пароль: (сгенерировать)
4. SSL: включить
5. Создать (ждать 10-15 минут)

**Сохранить:**
```
Хост: c-xxxxx.postgres.yandexcloud.net
Пароль: YOUR_PASSWORD
```

### 1.2 VPS

1. **Compute Cloud** → **Создать ВМ**
2. ОС: Ubuntu 22.04 LTS, Тип: n2-standard-2, Диск: 50 GB
3. Публичный IP: включить
4. Создать

**Сохранить:**
```
IP: <PUBLIC_IP>
SSH ключ: скачать
```

### 1.3 Object Storage (для frontend)

1. **Object Storage** → **Создать бакет**
2. Имя: `courier-app-frontend`, Доступ: Публичный
3. Создать

### 1.4 CDN

1. **CDN** → **Создать дистрибьюцию**
2. Источник: Object Storage, Домен: `manager.site.ru`
3. SSL: Let's Encrypt
4. Создать

**Сохранить CNAME:** `d-xxxxx.cdn.yandexcloud.net`

## Шаг 2: Подготовить VPS (5 минут)

```bash
# Подключиться
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP>

# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker и Nginx
sudo apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx
sudo usermod -aG docker $USER
newgrp docker

# Проверить
docker --version
```

## Шаг 3: Развернуть Backend (10 минут)

```bash
# Клонировать проект
cd ~
git clone <YOUR_REPO_URL> courier-app
cd courier-app

# Создать .env
cp .env.example .env
nano .env
```

**Заполнить в .env:**
```env
DATABASE_URL=postgresql://courier:YOUR_PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db?sslmode=require
FRONTEND_URL=https://manager.site.ru
MANAGER_URL=https://manager.site.ru
SESSION_SECRET=$(openssl rand -base64 32)
```

**Запустить:**
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

# Проверить
docker logs -f courier-api
curl http://localhost:3000/health
```

## Шаг 4: Настроить Nginx + SSL (5 минут)

```bash
# Скопировать конфиг
sudo cp ~/courier-app/nginx.conf /etc/nginx/sites-available/courier-api
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/

# Проверить
sudo nginx -t

# Перезагрузить
sudo systemctl restart nginx

# Получить SSL сертификат
sudo certbot certonly --nginx -d api.site.ru

# Включить автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Шаг 5: Настроить DNS

В вашем DNS провайдере добавить:

```
api.site.ru      A      <PUBLIC_IP>
manager.site.ru  CNAME  d-xxxxx.cdn.yandexcloud.net
```

Ждать распространения DNS (обычно 5-10 минут).

## Шаг 6: Проверить API

```bash
# Проверить что API доступен
curl https://api.site.ru/health

# Должен вернуть JSON ответ
```

## Шаг 7: Развернуть Frontend (5 минут)

На локальном ПК:

```bash
# Собрать frontend
cd сайт
npm install
npm run build

# Загрузить в Object Storage
aws s3 sync dist/ s3://courier-app-frontend/ \
  --endpoint-url https://storage.yandexcloud.net

# Очистить кэш CDN
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

## Проверить всё работает

```bash
# Frontend
curl https://manager.site.ru

# Backend
curl https://api.site.ru/health

# БД
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db
```

## Готово! 🎉

Ваше приложение работает на Yandex Cloud:
- **Frontend:** https://manager.site.ru
- **Backend API:** https://api.site.ru
- **Database:** Managed PostgreSQL

## Обновление приложения

```bash
# На VPS
cd ~/courier-app
git pull origin main

# Пересобрать и перезапустить
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

## Мониторинг

```bash
# Логи
docker logs -f courier-api

# Статус
docker ps | grep courier-api

# Ресурсы
docker stats

# Nginx ошибки
sudo tail -f /var/log/nginx/courier-api-error.log
```

## Помощь

- Полный чек-лист: `DEPLOYMENT_CHECKLIST.md`
- Подробная инструкция: `DEPLOY_VPS.md`
- Архитектура: `DEPLOYMENT.md`

## Дополнительные ресурсы

- [Yandex Cloud Docs](https://cloud.yandex.com/docs)
- [Docker Docs](https://docs.docker.com/)
- [Nginx Docs](https://nginx.org/en/docs/)
