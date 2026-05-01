# Deployment Checklist - Courier App на Yandex Cloud

Полный чек-лист для развертывания приложения на Yandex Cloud в правильном порядке.

## Фаза 1: Подготовка Yandex Cloud инфраструктуры

### 1.1 Создать Managed PostgreSQL кластер

- [ ] Перейти в Yandex Cloud Console
- [ ] Выбрать **Managed Service for PostgreSQL**
- [ ] Нажать **Создать кластер**
- [ ] Параметры:
  - [ ] Версия: PostgreSQL 16
  - [ ] Класс хоста: s2.small (2 vCPU, 4 GB RAM)
  - [ ] Количество хостов: 1 (или 3 для HA)
  - [ ] Имя БД: `courier_db`
  - [ ] Пользователь: `courier`
  - [ ] Пароль: (сгенерировать надежный)
  - [ ] SSL: включить
- [ ] Создать кластер (ждать 10-15 минут)
- [ ] Сохранить:
  - [ ] Хост: `c-xxxxx.postgres.yandexcloud.net`
  - [ ] Пароль в безопасном месте
  - [ ] Сертификат SSL (если требуется)

### 1.2 Создать VPS машину

- [ ] Перейти в **Compute Cloud**
- [ ] Нажать **Создать виртуальную машину**
- [ ] Параметры:
  - [ ] ОС: Ubuntu 22.04 LTS
  - [ ] Тип: n2-standard-2 (2 vCPU, 4 GB RAM)
  - [ ] Диск: 50 GB SSD
  - [ ] Публичный IP: включить
- [ ] Создать машину
- [ ] Сохранить:
  - [ ] Публичный IP: `<PUBLIC_IP>`
  - [ ] SSH ключ (скачать и сохранить)

### 1.3 Создать Object Storage бакет (для frontend)

- [ ] Перейти в **Object Storage**
- [ ] Нажать **Создать бакет**
- [ ] Параметры:
  - [ ] Имя: `courier-app-frontend`
  - [ ] Класс: Стандартный
  - [ ] Доступ: Публичный
- [ ] Создать бакет

### 1.4 Создать CDN дистрибьюцию

- [ ] Перейти в **CDN**
- [ ] Нажать **Создать дистрибьюцию**
- [ ] Параметры:
  - [ ] Источник: Object Storage (`courier-app-frontend`)
  - [ ] Домен: `manager.site.ru`
  - [ ] SSL: Let's Encrypt (автоматический)
- [ ] Создать дистрибьюцию
- [ ] Сохранить CNAME: `d-xxxxx.cdn.yandexcloud.net`

## Фаза 2: Подготовка VPS

### 2.1 Подключиться к VPS

```bash
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP>
```

- [ ] Успешно подключились
- [ ] Выполнить: `whoami` (должно вывести: ubuntu)

### 2.2 Обновить систему

```bash
sudo apt update && sudo apt upgrade -y
```

- [ ] Система обновлена

### 2.3 Установить Docker

```bash
sudo apt install -y docker.io docker-compose git curl wget
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

- [ ] Docker установлен
- [ ] Проверено: `docker --version`

### 2.4 Установить Nginx и Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

- [ ] Nginx установлен
- [ ] Certbot установлен

## Фаза 3: Развертывание Backend

### 3.1 Клонировать репозиторий

```bash
cd ~
git clone <YOUR_REPO_URL> courier-app
cd courier-app
```

- [ ] Репозиторий клонирован
- [ ] Проверено: `ls -la` (видны файлы проекта)

### 3.2 Создать и заполнить .env

```bash
cp .env.example .env
nano .env
```

Заполнить:
- [ ] `DATABASE_URL=postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db?sslmode=require`
- [ ] `API_PORT=3000`
- [ ] `API_HOST=0.0.0.0`
- [ ] `FRONTEND_URL=https://manager.site.ru`
- [ ] `MANAGER_URL=https://manager.site.ru`
- [ ] `SESSION_SECRET=<GENERATE: openssl rand -base64 32>`
- [ ] `LOG_LEVEL=info`

```bash
chmod 600 .env
```

- [ ] .env создан и заполнен
- [ ] Права доступа установлены (600)

### 3.3 Собрать Docker образ

```bash
docker build -t courier-api:latest .
```

- [ ] Docker образ собран
- [ ] Проверено: `docker images | grep courier-api`

### 3.4 Запустить Docker контейнер

```bash
docker run -d \
  --name courier-api \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  courier-api:latest

docker logs -f courier-api
```

- [ ] Контейнер запущен
- [ ] Логи показывают успешный запуск
- [ ] Проверено: `docker ps | grep courier-api`

### 3.5 Проверить локально

```bash
curl http://localhost:3000/health
```

- [ ] API отвечает на localhost:3000
- [ ] Ответ: JSON (например, `{"status":"ok"}`)

## Фаза 4: Настройка Nginx

### 4.1 Скопировать и включить Nginx конфиг

```bash
sudo cp ~/courier-app/nginx.conf /etc/nginx/sites-available/courier-api
sudo ln -s /etc/nginx/sites-available/courier-api /etc/nginx/sites-enabled/
sudo nginx -t
```

- [ ] Конфиг скопирован
- [ ] Проверено: `sudo nginx -t` (test is successful)

### 4.2 Перезагрузить Nginx

```bash
sudo systemctl restart nginx
```

- [ ] Nginx перезагружен
- [ ] Проверено: `sudo systemctl status nginx` (active)

### 4.3 Получить SSL сертификат

```bash
sudo certbot certonly --nginx -d api.site.ru
```

- [ ] Сертификат получен
- [ ] Проверено: `sudo certbot certificates`

### 4.4 Настроить автоматическое обновление сертификата

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

- [ ] Автоматическое обновление включено
- [ ] Проверено: `sudo systemctl status certbot.timer` (active)

## Фаза 5: Проверка API

### 5.1 Проверить локально на VPS

```bash
curl http://localhost:3000/health
curl https://localhost/health -k
```

- [ ] Локальный запрос работает
- [ ] HTTPS запрос работает (с -k для самоподписанного сертификата)

### 5.2 Настроить DNS

В вашем DNS провайдере или Yandex Cloud DNS:

```
api.site.ru      A      <PUBLIC_IP_VPS>
manager.site.ru  CNAME  d-xxxxx.cdn.yandexcloud.net
```

- [ ] DNS запись для api.site.ru добавлена
- [ ] DNS запись для manager.site.ru добавлена
- [ ] Ждать распространения DNS (до 24 часов, обычно 5-10 минут)

### 5.3 Проверить DNS

```bash
nslookup api.site.ru
nslookup manager.site.ru
```

- [ ] DNS разрешается правильно
- [ ] api.site.ru указывает на <PUBLIC_IP_VPS>
- [ ] manager.site.ru указывает на CDN

### 5.4 Проверить API через HTTPS

```bash
curl https://api.site.ru/health
```

- [ ] API доступен по HTTPS
- [ ] Сертификат валидный (нет ошибок SSL)
- [ ] Ответ: JSON

### 5.5 Проверить логи

```bash
docker logs courier-api
sudo tail -f /var/log/nginx/courier-api-error.log
sudo tail -f /var/log/nginx/courier-api-access.log
```

- [ ] Логи не содержат ошибок
- [ ] Запросы логируются в Nginx

## Фаза 6: Подготовка Frontend

### 6.1 Собрать Frontend

На локальном ПК:

```bash
cd сайт
npm install
npm run build
```

- [ ] Frontend собран
- [ ] Папка `dist/` содержит файлы

### 6.2 Загрузить в Object Storage

Способ 1 (через консоль):
- [ ] Перейти в Object Storage
- [ ] Выбрать бакет `courier-app-frontend`
- [ ] Загрузить все файлы из `dist/`

Способ 2 (через AWS CLI):

```bash
aws s3 sync dist/ s3://courier-app-frontend/ \
  --endpoint-url https://storage.yandexcloud.net
```

- [ ] Frontend загружен в Object Storage
- [ ] Проверено: файлы видны в консоли

### 6.3 Очистить кэш CDN

```bash
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"
```

- [ ] Кэш CDN очищен

### 6.4 Проверить Frontend

```bash
curl https://manager.site.ru
```

- [ ] Frontend доступен по HTTPS
- [ ] Загружается HTML страница
- [ ] Нет ошибок в консоли браузера

## Фаза 7: Финальная проверка

### 7.1 Проверить все компоненты

- [ ] Frontend доступен: `https://manager.site.ru`
- [ ] Backend доступен: `https://api.site.ru/health`
- [ ] БД подключена: `psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db`
- [ ] SSL сертификаты валидны
- [ ] Логирование работает

### 7.2 Проверить мониторинг

```bash
docker stats
df -h
free -h
```

- [ ] Docker контейнер использует разумное количество ресурсов
- [ ] Дисковое пространство в норме
- [ ] Память в норме

### 7.3 Проверить Backup

```bash
pg_dump postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db > backup.sql
```

- [ ] Backup БД работает
- [ ] Файл backup.sql создан

## Фаза 8: Документирование

- [ ] Сохранить все пароли в безопасном месте
- [ ] Документировать IP адреса и домены
- [ ] Создать инструкцию для обновления приложения
- [ ] Создать инструкцию для восстановления из backup

## Полезные команды для мониторинга

### Docker

```bash
# Просмотр контейнеров
docker ps

# Логи
docker logs -f courier-api

# Статистика
docker stats

# Перезапуск
docker restart courier-api
```

### Nginx

```bash
# Статус
sudo systemctl status nginx

# Логи ошибок
sudo tail -f /var/log/nginx/courier-api-error.log

# Логи доступа
sudo tail -f /var/log/nginx/courier-api-access.log

# Перезагрузить конфиг
sudo systemctl reload nginx
```

### PostgreSQL

```bash
# Подключиться
psql postgresql://courier:PASSWORD@c-xxxxx.postgres.yandexcloud.net:6432/courier_db

# Список таблиц
\dt

# Выход
\q
```

### Система

```bash
# Дисковое пространство
df -h

# Память
free -h

# Открытые порты
sudo netstat -tlnp | grep -E "3000|80|443"

# Процессы
ps aux | grep node
```

## Troubleshooting

### API не отвечает

1. Проверить контейнер: `docker ps | grep courier-api`
2. Проверить логи: `docker logs courier-api`
3. Проверить порт: `sudo netstat -tlnp | grep 3000`
4. Перезапустить: `docker restart courier-api`

### SSL ошибка

1. Проверить сертификат: `sudo certbot certificates`
2. Обновить: `sudo certbot renew --force-renewal`
3. Перезагрузить Nginx: `sudo systemctl reload nginx`

### БД не подключается

1. Проверить DATABASE_URL: `cat .env | grep DATABASE_URL`
2. Проверить подключение: `psql postgresql://...`
3. Проверить SSL: `openssl s_client -connect c-xxxxx.postgres.yandexcloud.net:6432`

### Frontend не загружается

1. Проверить файлы: `aws s3 ls s3://courier-app-frontend/ --endpoint-url https://storage.yandexcloud.net`
2. Очистить кэш: `aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"`
3. Очистить кэш браузера: Ctrl+Shift+Delete

## Дополнительные ресурсы

- [Yandex Cloud Documentation](https://cloud.yandex.com/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
