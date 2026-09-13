# Correspondence Web (МИГ · Корреспонденция)

Canonical source текущего frontend системы Correspondence.

## Что это

Одностраничный автономный интерфейс управления корреспонденцией:
отправления, приёмка, манифесты, листы развозов, клиенты, партнёры,
сверки, документы, оплаты, справочники, архив.

`index.html` — **single-file frontend**: HTML, CSS и JS находятся в одном файле,
сборка (webpack/vite и т.п.) не используется. Файл подключается к nginx как есть.

## Расположение

| Что | Путь |
|---|---|
| Source (этот каталог) | `/home/administrator333/courier-delivery-system/correspondence-web/` |
| Deploy (nginx отдаёт отсюда) | `/var/www/correspondence-ops-test/` |
| Test URL | https://couriermig.ru/correspondence-test/ |

nginx: `location ^~ /correspondence-test/ { alias /var/www/correspondence-ops-test/; }`
(конфиг — `/etc/nginx/sites-enabled/couriermig`).

## Файлы

| Файл | Назначение |
|---|---|
| `index.html` | весь UI (HTML + CSS + JS, ~231 KB, не форматировать и не минифицировать повторно) |
| `xlsx.full.min.js` | библиотека SheetJS — используется для чтения и выгрузки Excel |
| `XLSX-LICENSE.txt` | лицензия SheetJS |

## Состояние UI

Сейчас интерфейс работает в двух режимах:

- **Демо (по умолчанию)** — данные хранятся в `localStorage` браузера
  (ключ `mig-correspondence-preview-v4`) и заполняются встроенными тестовыми
  данными. Большая часть разделов пока демонстрационная.
- **Live (частично)** — часть разделов уже подключена к реальному backend:
  чтение через `/api/manager/correspondence/bootstrap` и
  `/api/manager/correspondence/directories`, запись справочников через
  `POST /api/manager/correspondence/directories/<kind>`, импорт входящих
  манифестов через `POST /api/manager/correspondence/manifests/import`,
  распознавание накладной камерой через
  `POST /api/manager/correspondence/camera/recognize`.

Live-режим требует активной сессии менеджера в том же браузере.

## Backend

Backend Correspondence находится в основном проекте:

```
server/_core/correspondenceRoutes.ts       # регистрация, bootstrap, импорт манифестов
server/_core/correspondenceDirectories.ts  # справочники (clients/partners/carriers/cities)
server/_core/correspondenceWorkflow.ts     # intake, shipments, outgoing-манифесты
server/_core/correspondenceCamera.ts       # распознавание накладной
server/_core/correspondenceWaybills.ts     # блокировки по накладным
server/_core/correspondenceValidation.ts   # валидация входных данных
```

Регистрация: `server/_core/index.ts` → `registerCorrespondenceRoutes(app)`.

## Deploy

Deploy выполняется копированием / rsync из этого каталога в deploy-каталог:

```bash
rsync -a correspondence-web/ /var/www/correspondence-ops-test/
```

Правила:

1. **Перед каждым deploy обязательно делать backup** текущего deploy-каталога:
   `/home/administrator333/backups/correspondence-ops-test-before-<причина>-YYYYMMDD-HHMMSS/`
2. **Не редактировать `/var/www/correspondence-ops-test/` напрямую** —
   это deploy-копия, а не источник. Все правки вносятся здесь и затем публикуются.
3. После deploy проверять, что `SHA256 index.html` в source и в deploy совпадают,
   и что `https://couriermig.ru/correspondence-test/` отдаёт HTTP 200.

## Проверка целостности

```bash
sha256sum correspondence-web/index.html /var/www/correspondence-ops-test/index.html
```

Текущий зафиксированный SHA256 `index.html`:

```
840feedbf521dc2af27ebd6bef937fb356cbba2a9d1338bc80a005190883864c
```

## Ограничения

- Секретов, токенов и ключей в этом каталоге быть не должно.
- Изменения бизнес-логики, API и схемы БД выполняются в основном проекте,
  а не в этом каталоге.
