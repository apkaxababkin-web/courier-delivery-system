# Инструкция деплоя Backend на VPS Yandex Cloud

Пошаговое руководство для развертывания Backend API на виртуальной машине в Yandex Cloud.

## Предварительные требования

- VPS машина в Yandex Cloud (Ubuntu 22.04 LTS, 2+ vCPU, 2+ GB RAM)
- Публичный IP адрес VPS
- SSH ключ для подключения
- Домен `api.site.ru` (или ваш домен)
- Yandex Managed PostgreSQL кластер (подготовлен заранее)

## Этап 1: Подключение к VPS

### 1.1 Подключиться через SSH

```bash
ssh -i /path/to/your/key.pem ubuntu@<PUBLIC_IP>
```

Где:
- `/path/to/your/key.pem` — путь к SSH ключу
- `<PUBLIC_IP>` — публичный IP адрес VPS

### 1.2 Проверить подключение

```bash
whoami
# Должно вывести: ubuntu

uname -a
# Должно вывести информацию об Ubuntu 22.04
```

## Этап 2: Подготовка VPS

### 2.1 Обновить систему

```bash
sudo apt update
sudo apt upgrade -y
```

### 2.2 Установить Docker

```bash
# Установить Docker
sudo apt install -y docker.io docker-compose git curl wget

# Добавить пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER

# Применить изменения группы
newgrp docker

# Проверить установку
docker --version
docker-compose --version
```

### 2.3 Установить Nginx и Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

## Этап 3: Подготовка проекта

### 3.1 Клонировать репозиторий

```bash
# Перейти в домашнюю папку
cd ~

# Клонировать репозиторий
git clone <YOUR_REPO_URL> courier-app
cd courier-app
```

Где `<YOUR_REPO_URL>` — URL вашего GitHub репозитория.

### 3.2 Создать .env файл

```bash
# Скопировать пример
cp .env.example .env

# Отредактировать
nano .env
```

Заполнить следующие переменные:

```env
NODE_ENV=production

# Yandex Managed PostgreSQL
DATABASE_URL=postgresql://courier:YOUR_PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db?sslmode=require

# API Server
API_PORT=3000
API_HOST=0.0.0.0

# Frontend URLs
FRONTEND_URL=https://manager.site.ru
MANAGER_URL=https://manager.site.ru

# Session Secret (сгенерировать: openssl rand -base64 32)
SESSION_SECRET=<GENERATE_SECURE_STRING>

# Logging
LOG_LEVEL=info
```

Где:
- `YOUR_PASSWORD` — пароль от PostgreSQL
- `c-xxxxx` — ID кластера PostgreSQL
- `SESSION_SECRET` — сгенерировать: `openssl rand -base64 32`

### 3.3 Сохранить .env в безопасное место

```bash
# Установить правильные права доступа
chmod 600 .env

# Убедиться что .env не в git
cat .gitignore | grep ".env"
# Должно содержать ".env"
```

## Этап 4: Запуск Backend через Docker

### 4.1 Собрать Docker образ

```bash
cd ~/courier-app

# Собрать образ
docker build -t courier-api:latest .

# Проверить что образ создан
docker images | grep courier-api
```

### 4.2 Запустить контейнер

```bash
# Запустить контейнер
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest

# Проверить что контейнер запущен
docker ps | grep courier-api

# Проверить логи
docker logs -f courier-api
```

### 4.3 Проверить что API работает

```bash
# Локально на VPS
curl http://localhost:3000/health

# Должен вернуть: {"status":"ok"} или подобный ответ
```

## Этап 5: Настройка Nginx

### 5.1 Скопировать Nginx конфиг

```bash
# Скопировать конфиг в Nginx
sudo cp ~/courier-app/nginx.conf /etc/nginx/sites-available/courier-api

# Включить конфиг
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/

# Проверить синтаксис
sudo nginx -t
# Должно вывести: "test is successful"

# Перезагрузить Nginx
sudo systemctl restart nginx
```

### 5.2 Получить SSL сертификат

```bash
# Получить сертификат через Let's Encrypt
sudo certbot certonly --nginx -d api.site.ru

# Следовать инструкциям (выбрать email, согласиться с условиями)

# Проверить что сертификат получен
sudo certbot certificates
```

### 5.3 Настроить автоматическое обновление сертификата

```bash
# Включить автоматическое обновление
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Проверить статус
sudo systemctl status certbot.timer
```

## Этап 6: Проверка и мониторинг

### 6.1 Проверить что API доступен

```bash
# С внешнего хоста (после настройки DNS)
curl https://api.site.ru/health

# Должен вернуть JSON ответ
```

### 6.2 Проверить логи

```bash
# Docker логи
docker logs -f courier-api

# Nginx логи
sudo tail -f /var/log/nginx/courier-api-error.log
sudo tail -f /var/log/nginx/courier-api-access.log

# Системные логи
sudo journalctl -u nginx -f
```

### 6.3 Проверить статус сервисов

```bash
# Docker контейнер
docker ps | grep courier-api

# Nginx
sudo systemctl status nginx

# Сертификат
sudo certbot certificates
```

## Этап 7: Обновление приложения

### 7.1 Получить новый код

```bash
cd ~/courier-app

# Получить обновления
git pull origin main
```

### 7.2 Пересобрать Docker образ

```bash
# Собрать новый образ
docker build -t courier-api:latest .
```

### 7.3 Перезапустить контейнер

```bash
# Остановить старый контейнер
docker stop courier-api
docker rm courier-api

# Запустить новый
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest

# Проверить логи
docker logs -f courier-api
```

### 7.4 Запустить миграции БД (если нужно)

```bash
# Если есть новые миграции
docker exec courier-api npm run db:push
```

## Troubleshooting

### Проблема: "Connection refused"

```bash
# Проверить что контейнер запущен
docker ps | grep courier-api

# Если контейнер не запущен, проверить логи
docker logs courier-api

# Перезапустить контейнер
docker restart courier-api
```

### Проблема: "Database connection error"

```bash
# Проверить DATABASE_URL в .env
cat .env | grep DATABASE_URL

# Проверить подключение к PostgreSQL
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Проверить SSL
openssl s_client -connect c-xxxxx.postgres.yandexcloud.net:6432
```

### Проблема: "SSL certificate error"

```bash
# Проверить сертификат
sudo certbot certificates

# Обновить сертификат вручную
sudo certbot renew --force-renewal

# Перезагрузить Nginx
sudo systemctl reload nginx
```

### Проблема: "Nginx не запускается"

```bash
# Проверить синтаксис конфига
sudo nginx -t

# Проверить логи
sudo tail -f /var/log/nginx/error.log

# Перезагрузить Nginx
sudo systemctl restart nginx
```

### Проблема: "Docker образ не собирается"

```bash
# Проверить логи сборки
docker build -t courier-api:latest . --no-cache

# Проверить что все файлы на месте
ls -la ~/courier-app/

# Проверить что package.json существует
cat ~/courier-app/package.json
```

## Полезные команды

### Docker

```bash
# Просмотр всех контейнеров
docker ps -a

# Просмотр логов
docker logs -f courier-api

# Остановить контейнер
docker stop courier-api

# Удалить контейнер
docker rm courier-api

# Просмотр использования ресурсов
docker stats

# Очистить неиспользуемые образы
docker image prune -a
```

### Nginx

```bash
# Проверить синтаксис
sudo nginx -t

# Перезагрузить конфиг (без перезагрузки)
sudo systemctl reload nginx

# Перезагрузить сервис
sudo systemctl restart nginx

# Просмотр статуса
sudo systemctl status nginx

# Логи
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### PostgreSQL

```bash
# Подключиться к БД
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Список таблиц
\dt

# Выход
\q
```

### Система

```bash
# Проверить дисковое пространство
df -h

# Проверить использование памяти
free -h

# Проверить процессы
ps aux | grep node

# Проверить открытые порты
sudo netstat -tlnp | grep 3000
sudo netstat -tlnp | grep 80
sudo netstat -tlnp | grep 443
```

## Резервное копирование

### Backup БД

```bash
# Создать backup
pg_dump postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db > backup.sql

# Восстановить из backup
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db < backup.sql
```

### Backup конфигов

```bash
# Backup Nginx конфига
sudo cp -r /etc/nginx ~/nginx-backup

# Backup .env
cp ~/.env ~/env-backup
```

## Безопасность

1. **SSH ключи:** Использовать только SSH ключи, отключить пароли
2. **Firewall:** Ограничить доступ к портам 3000 и 5432
3. **Secrets:** Хранить в .env, не в коде
4. **Updates:** Регулярно обновлять Docker образы и зависимости
5. **Monitoring:** Настроить алерты на критические ошибки

## Дополнительные ресурсы

- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
