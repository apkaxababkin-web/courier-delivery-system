# Финансовый цикл клиента: deploy, проверка и откат

Этап: сверка всех заявок периода → решения менеджера → проверка стоимости →
предпросмотр → счёт + акт + реестр → контроль оплаты → подтверждение оплаты.

Коммит: `0e8c414` (предыдущий задеплоенный: `71156b1`).
Миграция: `drizzle/migrations/0015_client_billing_documents.sql` — **в production
НЕ применена**. Ниже — порядок самостоятельного деплоя.

---

## 0. Что нужно знать до начала

* Все изменения только добавляющие. `0015` не делает ни одного `UPDATE`,
  `DELETE`, `DROP` или `ALTER COLUMN` — она добавляет колонки, одну таблицу,
  два индекса и три constraint'а. Старый образ API продолжит работать даже
  после применения миграции, поэтому порядок «БД → API → фронтенд» безопасен.
* Новые документы (PDF/XLSX) пишутся в `uploads/billing-documents/<id>/`
  (том `./uploads:/app/uploads` уже смонтирован в `courier-api`). Каталог
  создаётся автоматически при выставлении первого комплекта.
* Ничего в партнёрском биллинге, почте, `PartnerReconciliation`,
  корреспонденции, манифестах и камерах не менялось.

## 1. Бэкапы (обязательно до миграции)

```bash
cd /home/administrator333/courier-delivery-system
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose exec -T postgres pg_dump -U courier -d courier_db \
  --no-owner --no-privileges | gzip > backups/courier-db-before-billing-$STAMP.sql.gz
sha256sum backups/courier-db-before-billing-$STAMP.sql.gz
# фронтенд
sudo cp -a /var/www/courier-manager backups/courier-manager-www-$STAMP
```

Ранее уже снятые бэкапы (для справки):
* `backups/courier-billing-before-quote-rework-20260915-000447.json.gz`
  sha256 `c97f2c91a5eb6f7a819e5cf482fe53b2202dbf7d566a51f200256a72ae308f2b`
* `backups/courier-billing-pre-deploy-20260915-010549.json.gz`
  sha256 `0ce1f8f85a7aeccd4082fbfe01ca6d5a230d9fc993a7afdf8ec45b10fe3a1867`
* `backups/courier-manager-www-pre-billing-20260915-010549/` — статическая
  копия фронтенда до этого этапа.

## 2. Миграция 0015 (только БД)

Файл идемпотентен — повторный запуск ничего не ломает.

```bash
cd /home/administrator333/courier-delivery-system
docker compose exec -T postgres psql -U courier -d courier_db -v ON_ERROR_STOP=1 \
  < drizzle/migrations/0015_client_billing_documents.sql
```

Проверка после применения:

```bash
docker compose exec -T postgres psql -U courier -d courier_db -c "
  SELECT count(*) AS new_columns FROM information_schema.columns
   WHERE table_name IN ('billingSettings','requests','billingDocuments','billingDocumentFiles')
     AND column_name IN ('executorShortName','vatMode','vatRate','billingReviewState',
       'billingReviewNote','serviceNameSnapshot','periodTextSnapshot','vatModeSnapshot',
       'vatAmountSnapshot','clientOgrnSnapshot','directorNameSnapshot','voidedAt',
       'voidReason','paymentComment','documentDateText','generatedAt','kind','storedName','sizeBytes');
  SELECT to_regclass('public.\"billingDocumentFiles\"') AS files_table;
  SELECT count(*) AS reviewed FROM \"requests\" WHERE \"billingReviewState\" IS NOT NULL;
  SELECT count(*) AS docs FROM \"billingDocuments\" WHERE \"generatedAt\" IS NOT NULL;"
```

Ожидаемо: `new_columns = 19`, `files_table = billingDocumentFiles`,
`reviewed = 0`, `docs = 0`. Никакие существующие данные не меняются —
`deliveryFee`, `billingCheckedAt` и уже созданные документы остаются как есть.

## 3. Бэкенд

```bash
cd /home/administrator333/courier-delivery-system
git pull                 # или git checkout 0e8c414
docker compose build api
docker compose up -d --no-deps api
docker compose ps api
curl -fsS http://127.0.0.1:3000/api/health && echo
```

`docker compose build api` обязателен: в образ теперь копируются кириллические
шрифты (`server/assets` → `/app/assets/fonts`), без них PDF не отрендерится.

Живая проверка PDF/XLSX (без реального счёта — предпросмотр ничего не пишет):

```bash
# подставьте свой manager-JWT и id клиента с проверенными заявками
curl -fsS -H "Authorization: Bearer $MANAGER_TOKEN" \
  "http://127.0.0.1:3000/api/manager/billing/documents/preview?kind=invoice&clientId=<ID>&dateFrom=2026-08-16&dateTo=2026-08-31&documentDate=2026-09-01" \
  -o /tmp/preview-invoice.pdf
file /tmp/preview-invoice.pdf   # ожидаем PDF document
```

## 4. Фронтенд (менеджерский сайт)

```bash
cd /home/administrator333/courier-delivery-system/courier-manager
npx vite build
sudo rsync -a --delete dist/ /var/www/courier-manager/
sudo chown -R www-data:www-data /var/www/courier-manager   # как в вашей схеме
```

`nginx` не трогаем: путь `/var/www/courier-manager` и конфиг не меняются.
После обновления — жёсткое обновление страницы (Ctrl+F5).

## 5. Приёмка на проде (только чтение/предпросмотр)

1. «Расчёты» → «Сверка»: выбрать клиента и период 16–31.08.2026 — все заявки
   видны, у отменённых/незавершённых есть кнопка «Разобрать».
2. Разобрать одну отменённую заявку → «Подтвердить отмену». Период должен
   перестать блокироваться этой заявкой.
3. Проверить стоимость нескольких выполненных заявок (кнопка проверки) —
   `billingCheckedAt` проставляется, сумма не пересчитывается повторно.
4. «Тарифы»: убедиться, что тарифы на месте (новая форма — та же карточка
   `clientTariffs`; Инвитро не менять).
5. «Реквизиты организации»: заполнить наши реквизиты (они печатаются на
   счетах). Пустые реквизиты блокируют выставление — это ожидаемо.
6. Предпросмотр счёта/акта/реестра: проверить номер, дату, период, сумму.
7. Первый реальный счёт выставлять, когда период полностью разобран
   (все блокировки сняты) — после этого `billingDocuments` = 1,
   заявки получают активную привязку, повторное выставление того же периода
   невозможно (частичный уникальный индекс `billingDocumentRequests_active_request_key`).
8. Оплата: отметить оплату и приложить подтверждение (PDF/JPEG/PNG ≤ 15 МБ,
   тип проверяется по сигнатуре файла). Аннулирование сохраняет запись и причину.

Чего делать не нужно: запускать `billing.backfillHistorical` и массовые
пересчёты `deliveryFee` — этот этап их не требует, и `deliveryFee = 0`
не является ошибкой.

## 6. Откат

Откат не требует отката БД: миграция только добавляет структуру, а старый код
её не читает.

1. Бэкенд — вернуть предыдущий образ:

```bash
cd /home/administrator333/courier-delivery-system
git checkout 71156b1
docker compose build api && docker compose up -d --no-deps api
curl -fsS http://127.0.0.1:3000/api/health && echo
```

2. Фронтенд — вернуть статику:

```bash
sudo rsync -a --delete backups/courier-manager-www-pre-billing-20260915-010549/ /var/www/courier-manager/
```

3. Если откатывается сам этап (а не только релиз) и нужно вернуть схему —
   выполнять только при отсутствии созданных документов:

```sql
-- ВНИМАНИЕ: только если billingDocuments.generatedAt IS NULL для всех строк.
DROP TABLE IF EXISTS "billingDocumentFiles";
DROP INDEX IF EXISTS "billingDocuments_client_period_idx";
ALTER TABLE "billingDocuments"
  DROP CONSTRAINT IF EXISTS "billingDocuments_voidedByManager_fk",
  DROP COLUMN IF EXISTS "serviceNameSnapshot", DROP COLUMN IF EXISTS "periodTextSnapshot",
  DROP COLUMN IF EXISTS "vatModeSnapshot",    DROP COLUMN IF EXISTS "vatRateSnapshot",
  DROP COLUMN IF EXISTS "vatAmountSnapshot",  DROP COLUMN IF EXISTS "clientOgrnSnapshot",
  DROP COLUMN IF EXISTS "directorNameSnapshot", DROP COLUMN IF EXISTS "directorPositionSnapshot",
  DROP COLUMN IF EXISTS "accountantNameSnapshot", DROP COLUMN IF EXISTS "generatedAt",
  DROP COLUMN IF EXISTS "voidedAt", DROP COLUMN IF EXISTS "voidedByManagerId",
  DROP COLUMN IF EXISTS "voidReason", DROP COLUMN IF EXISTS "paymentComment",
  DROP COLUMN IF EXISTS "documentDateText";
ALTER TABLE "requests"
  DROP CONSTRAINT IF EXISTS "requests_billingReviewState_valid",
  DROP COLUMN IF EXISTS "billingReviewState", DROP COLUMN IF EXISTS "billingReviewNote";
ALTER TABLE "billingSettings"
  DROP COLUMN IF EXISTS "executorShortName", DROP COLUMN IF EXISTS "executorOgrn",
  DROP COLUMN IF EXISTS "executorOgrnip", DROP COLUMN IF EXISTS "executorPostalAddress",
  DROP COLUMN IF EXISTS "executorEmail", DROP COLUMN IF EXISTS "directorName",
  DROP COLUMN IF EXISTS "directorPosition", DROP COLUMN IF EXISTS "accountantName",
  DROP COLUMN IF EXISTS "vatMode", DROP COLUMN IF EXISTS "vatRate",
  DROP COLUMN IF EXISTS "vatExemptionBasis", DROP COLUMN IF EXISTS "signatureFile",
  DROP COLUMN IF EXISTS "stampFile";
```

Сгенерированные файлы лежат в `uploads/billing-documents/` — если документов
не создавалось, каталог можно просто удалить.

## 7. Локальные тесты (перед деплоем, по желанию)

```bash
cp .env.test.example .env.test   # указать локальный PostgreSQL
npx vitest run                   # 106 тестов, из них 53 интеграционных
```

Интеграционные тесты сами создают и удаляют одноразовую БД
`courier_billing_test` на локальном сервере, применяют фикстуру схемы и
миграцию `0015`. Против нелокального хоста harness откажется работать
(`TEST_ALLOW_REMOTE_DATABASE=1` — только для выделенного тестового сервера).
