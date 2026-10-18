# MOBILE AUDIT — фактическое состояние мобильного приложения

**Дата аудита:** 2026-09-20
**Режим:** только чтение. Ни один файл в рабочих копиях не изменён.
Запрещённые операции (`restore/reset/checkout/switch/clean/stash/pull/merge/rebase`) **не выполнялись**.
Из `backups/` ничего не удалялось.

Артефакт аудита (этот файл) создан отдельно и не является частью mobile-кода.

---

## 0. Главный вывод (TL;DR)

1. Существуют **две разошедшиеся ветки мобильного кода** с общим предком `591c4a8` (2026-05-31 «Compact pickup list screens»):
   * **Линия A — «mobile redesign / correct APK source»** → живёт в рабочей копии `courier-delivery-system-apk-check` (June redesign + July fixes + September chat v2/EAS + 12 сентября requestType).
   * **Линия B — «site/server»** → `feature/site-improvements-current` в `/home/administrator333/courier-delivery-system` (та же мобильная база, но без June-redesign; зато с September chat v2 вплоть до реакций, July-9 правками почты и September backend).
2. **Фактически собранный APK существует и лежит в apk-check**: `android/app/build/outputs/apk/release/app-release.apk`, собран **2026-09-13 10:09**, version `1.0.2`, package `com.couriermig.app`. Разбор Hermes-бандла внутри APK **доказывает**, что APK собран из **рабочего дерева apk-check**, а не из main-repo.
3. Рабочее дерево apk-check содержит **34 untracked-записи, из них 24 — backup-снапшоты июля/сентября**, которых нет в git. Это самый хрупкий источник. `git clean` уничтожил бы их безвозвратно.
4. Наиболее полное мобильное состояние **не существует в одном месте**. Для каждого файла «самый новый/полный» источник свой (см. §5 и §6). Сентябрьские изменения не потеряны, но распределены между WT apk-check, main-repo и backups.

---

## 1. Верхология репозиториев

| | apk-check | main repo |
|---|---|---|
| Путь | `/home/administrator333/courier-delivery-system-apk-check` | `/home/administrator333/courier-delivery-system` |
| Branch | `audit/server-current-state-20260702-0134` | `feature/site-improvements-current` |
| HEAD | `1cb7f36` «fix: add manager error boundary» (2026-07-02 12:08 UTC) | `8b32e81` «feat(billing): add annual numbering…» (2026-09-16 14:20 UTC) |
| origin | `github.com/apkaxababkin-web/courier-delivery-system.git` | тот же |
| Uncommitted | **54 записи** (19 `M`, 1 `D`, 34 `??`) | нет mobile-изменений (только billing/smart-tariff) |
| Merge-base | `591c4a8` (2026-05-31) | `591c4a8` (2026-05-31) |
| Коммитов только здесь | 59 | 113 |

Main repo **содержит объекты** коммитов линии A (`86561e5`, `33446ff`, `1d8feb6`, `9e35e0b`, `9ae7562`, `1cb7f36`) — они достижимы только через `origin/*` (в частности `origin/mobile-correct-apk-source-jun25`, `origin/audit/server-current-state-20260702-0134`). В рабочую ветку `feature/site-improvements-current` они **не влиты**, поэтому мобильные файлы в main-repo идут от старой базы.

### Ключевые коммиты линии A (в apk-check)

```
1cb7f36 2026-07-02  fix: add manager error boundary
62bfcb6 2026-07-02  fix: stabilize docker restart after reboot
33896ce 2026-07-02  fix: stabilize pickup realtime sync
b639071 2026-07-02  chore: sync current server state for full audit
9ae7562 2026-07-01  fix: improve mobile task card layout
9e35e0b 2026-06-28  Save working mobile app fixes
33446ff 2026-06-12  Add shared manager courier chat
1d8feb6 2026-06-12  Stabilize Android task list layout
14a8ef2 2026-06-12  Render all mobile task cards
86561e5 2026-06-11  Integrate mobile app redesign
```

### Ключевые mobile-коммиты линии B (в main repo, отсутствуют в apk-check)

```
b7415b9 2026-09-12  chore: checkpoint current project improvements   (index, pickup×2, _layout, courier-badge, courier-icon, task-card)
b8e722b 2026-09-01  refactor(chat): use operational reaction palette
8480e78 2026-09-01  refactor(chat): refresh reaction palette
6f8fea1 2026-09-01  feat(chat): add reactions and latest-message controls
daa13f6 2026-09-01  fix(chat): keep mobile conversation pinned after send
aa3fc8a 2026-09-01  fix(chat): correct mobile keyboard gap and timestamps
07e3917 2026-09-01  fix(chat): recognize imported own messages
6f12da1 2026-09-01  feat(chat): add message date separators
32e6389 2026-08-31  feat(chat): add courier chat v2 interface
897d29f 2026-07-09  fix(mobile): allow undo mail delivery
0ea7693 2026-07-09  fix(mobile): keep undelivered and same-day delivered mails
267f878 2026-07-09  fix(nuts): show order details and payment amount
```

---

## 2. Decisive evidence: собранный APK

`apk-check/android/app/build/outputs/apk/release/app-release.apk`
55 285 260 байт, mtime **2026-09-13 10:09** (позже последней правки WT — `app/task/[id].tsx`, 2026-09-12 13:56).

`assets/app.config` внутри APK: `version 1.0.2`, `package com.couriermig.app`, `softwareKeyboardLayoutMode: "pan"`, `userInterfaceStyle: "automatic"`, `bundleIdentifier com.couriermig.app` — **побайтово соответствует WT `app.config.ts` apk-check** и не соответствует main-repo (`space.manus…`, `1.0.0`, `light`).

Маркеры внутри `assets/index.android.bundle` (Hermes 96), поиск по UTF-8 и UTF-16LE:

| Маркер | В APK | Принадлежит |
|---|---|---|
| `designPreviewTasks`, `designPreviewPickupPoints`, `DESIGN_PREVIEW` | ✅ есть | **только apk-check** |
| `requestType`, `Тип заявки:` | ✅ есть | **только WT apk-check** (`app/task/[id].tsx`, 12.09) |
| `chat/v2`, `chat_v2_changed`, `chat_v2_read` | ✅ есть | apk WT + main (Sep 1) |
| `mails.undoDelivery` | ✅ есть | apk WT letters (нужен backend main) |
| `Предыдущие сообщения`, `Сообщение удалено`, `Отменить` | ✅ есть | обе линии |
| `reactions`, `reactedByMe` | ❌ нет | **только main** (реакции) |
| `К последнему сообщению` (scroll-to-latest) | ❌ нет | **только main** |
| `Реакция` (меню реакций) | ❌ нет | **только main** |
| `unfinished_tasks_reminder`, `chat_message_v2`, `hemotest_list_created`, `new_request_available` | ❌ нет | **только main** (`app/_layout.tsx` push-routing) |

**Вывод:** shipped APK = рабочее дерево apk-check (стадия `daa13f6` чата, без реакций), + September 12 requestType, + design-preview. main-repo-версии чата (реакции) и push-роутинга в APK **не попали**.

Дополнительно: WT `app/(tabs)/chat.tsx` побайтово равен main-repo на коммите `daa13f6` (md5 `fc354891`), а сентябрьские backup-снапшоты чата равны коммитам main: `chat-before-keyboard-time-fix-…084908` = `07e3917`, `chat-before-all-mobile-fixes-…085113` = `aa3fc8a`.

---

## 3. Четыре источника: что где реально лежит

### 3.1 WORKING TREE (apk-check) — 20 изменённых tracked-файлов

```
M app.config.ts                            M assets/images/android-icon-foreground.png
M app/(tabs)/_layout.tsx                   M assets/images/favicon.png
M app/(tabs)/chat.tsx                      M assets/images/icon.png
M app/(tabs)/index.tsx                     M assets/images/splash-icon.png
M app/(tabs)/letters.tsx                   M components/operation-row.tsx
M app/(tabs)/pickup-gemotest.tsx           M components/pickup-operation-list.tsx
M app/(tabs)/pickup-sberbank.tsx           M eas.json
M app/_layout.tsx                          M google-services.json
M app/task/[id].tsx                        M hooks/use-mobile-live-sync.ts
D eslint.config.js                         M server/routers.ts
```

Плюс 34 untracked, в т.ч. `.easignore`, `lib/chat-v2.ts`, `eslint.config.mjs`, `credentials.json`, `assets/icon.png`, `components/operation-row.tsx.before-restore-separators-20260630-140720`, пустышки `0`, `tsc`, `{n`, `app-template@1.0.0` и 24 backup-записи.

### 3.2 GIT

* apk-check: все refs ≤ 2026-07-02. Ничего новее WT в git нет. Теги: `working-pickup-screens-fixed-2026-06-10`, `working-pickup-scroll-order-fixed-2026-06-10`, `backup-screen-task-ok-20260531-1441`, `chat-shared-working-jun12`, `tag-before-mobile-chat-jun12`.
* apk-check **stash**: `stash@{0}` «mixed mobile state before approved test main jun25» на базе `3ac1811` (17.06). Содержит гибридный снапшот (chat 306 строк, `app/task/[id].tsx` 598 строк = md5 `6e773d72`, совпадает с main-репо-версией, operation-row 185 строк, pickup-operation-list 161 строка). Старше WT по всем ключевым файлам, но фиксирует факт смешивания линий.
* main repo: коммиты линии B (§1). Mobile-файлы в HEAD — committed, рабочее дерево по mobile чистое.

### 3.3 BACKUP

**apk-check/backups** — 47 записей; **452 файла tracked в git**, но **24 записи untracked** (только на диске):

* сентябрь 2026: `before-chat-v2-mobile-20260901-081550/`, `before-eas-android-chat-v2-20260901-082059/`, `before-ios-remote-version-20260901-082721/`, `chat-before-keyboard-time-fix-20260901-084908.tsx`, `chat-before-all-mobile-fixes-20260901-085113.tsx`, `easignore-before-autolinking-fix-20260901-083429`, `task-id-before-requesttype-details-20260912-135323.tsx`
* июль 2026: `patch-mobile-filter-scheduled-date-*` (3), `step1-safe-fixes-20260705/`, `step2-livesync-20260705/`, `step3-ios-keyboard-20260705/`, `fix-chat-initial-{bottom,scroll}-20260705/`, `fix-chat-input-ios-20260705/`, `fix-chat-response-parser-20260705/`, `fix-broken-expo-config-20260705-050856/`, `fix-broken-node-modules-autolinking-20260704-111548/`, `full-node-modules-reinstall-20260705-050937/`, `app-config-before-ios-build-{4,5}-20260705-*.ts`, `credentials-before-android-20260716-091312.json`, `eas-before-android-credentials-20260716-091312.json`
* июнь 2026 (tracked): `live-sse-mobile-*`, `mobile-build-marker-*`, `mobile-live-*`, `force-marker-near-tasklist-*`, `mobile-sse-polyfill-*`, `cleanup-audit-*`

**main-repo/backups** — 157 записей, но мобильных исходников линии A там нет; сентябрьские записи (`before-chat-v2-20260901-073345`, `var-www-before-chat-v2-dates-20260901-080520`) относятся к manager-frontend/backend, не к `app/`.

### 3.4 MAIN REPO

Mobile-файлы, которые **новее**, чем в apk-check WT (см. §5): `chat.tsx`, `lib/chat-v2.ts`, `hooks/use-mobile-live-sync.ts`, `app/(tabs)/_layout.tsx`, `app/_layout.tsx` (push-routing), `app/(tabs)/index.tsx`, `pickup-*.tsx`, `app/components/courier-badge.tsx`, `task-card.tsx`, `app/components/courier-icon.tsx` (новый), весь chat-v2 backend.

---

## 4. Файлы, существующие только в одной линии

| Файл | Только apk-check | Только main |
|---|---|---|
| `components/operation-row.tsx` | ✅ (redesign) | — |
| `components/pickup-operation-list.tsx` | ✅ | — |
| `lib/design-preview.ts` | ✅ | — |
| `app/lib/local-date.ts` | ✅ | — |
| `app/lib/vibration-preference.ts`, `lib/vibration-preference.ts` | ✅ | — |
| `server/_core/chatV2Routes.ts` | — | ✅ (28 947 б, chat v2 backend) |
| `app/components/courier-icon.tsx` | — | ✅ |
| `shared/billing-format.ts` | — | ✅ (не mobile) |
| `.easignore` | ✅ (WT) | — |
| `eslint.config.mjs` | ✅ (WT) | — (`eslint.config.js`) |

---

## 5. Матрица provenance по файлам

Обозначения: **WT** = uncommitted рабочее дерево apk-check; **GIT-A** = коммит линии A; **GIT-B** = коммит линии B (main); **BACKUP** = снапшот на диске.
«Новее» = источник с наибольшей датой содержимого / наиболее полной реализацией.

| Файл | apk WT | GIT-A (HEAD) | GIT-B (main) | BACKUP | Новее / полнее | Provenance фактического состояния |
|---|---|---|---|---|---|---|
| `app.config.ts` | v1.0.2, buildNumber убран, `softwareKeyboardLayoutMode:"pan"`, `userInterfaceStyle:"automatic"`, bundle `com.couriermig.app` | v1.0.1, buildNumber «3» | v1.0.0, `space.manus…`, `light` | `before-ios-remote-version…/app.config.ts` | **apk WT** | **WORKING TREE** + BACKUP |
| `eas.json` | `appVersionSource:"remote"`, `autoIncrement`, `credentialsSource:"local"`, ascAppId | без remote | устаревший (02.07) | `before-ios-remote-version…/eas.json` | **apk WT** | **WORKING TREE** + BACKUP |
| `.easignore` | 215 б, исключает `android/build`, `.gradle`, `local.properties`, `backups`, секреты | отсутствует | отсутствует | `easignore-before-autolinking-fix…` | **apk WT** | **WORKING TREE** + BACKUP |
| `google-services.json` | package `com.couriermig.app`, project `device-streaming-5e0a560e` | `space.manus…`/`mig-courier` (несовместим с пакетом!) | `space.manus…`/`mig-courier` | — | **apk WT** (исправляет несоответствие package) | **WORKING TREE** |
| `app/(tabs)/chat.tsx` | 581 стр., = main `daa13f6` | 306→ старая | **641 стр.**, +реакции, +scroll-to-latest, +onLayout | 3 сент. снапшота | **GIT-B (main)** | **GIT (main)** + WORKING TREE (та же база) |
| `lib/chat-v2.ts` | без `reactions` | отсутствует | +`ChatV2Reaction`, +`react()` | — | **main** | **GIT (main)**; в apk — **WORKING TREE** (untracked) |
| `hooks/use-mobile-live-sync.ts` | полный рерайт (events/payload/backoff) | старый | идентичен apk WT (закоммичен `32e6389`) | `before-chat-v2-mobile…` | одинаково, но **закоммичено в main** | **WORKING TREE (apk) + GIT (main)** |
| `app/(tabs)/_layout.tsx` | badge через `chatV2` + live-sync | legacy EventSource | идентичен apk WT | `before-chat-v2-mobile…` | одинаково, закоммичено в main | **WORKING TREE (apk) + GIT (main)** |
| `app/_layout.tsx` | 312 стр., `DESIGN_PREVIEW_TOKEN`, простой `data.url` push | — | **407 стр.**, `getPushRoute` (chat v2 deep link, hemotest, sberbank, reminder), интервал nav-bar; design-preview удалён | `step1-safe-fixes…` | **main по push-routing; apk по design-preview** → расхождение, нужен merge | **GIT (main)** + **WORKING TREE** (apk) |
| `app/task/[id].tsx` | **1233 стр.**, requestType-зависимые business fields | 786 стр. | 598 стр. (18.06) | `task-id-before-requesttype-details-20260912-135323.tsx` (743 стр.) | **apk WT (12.09 13:56)** — самое новое mobile-изменение вообще | **WORKING TREE + BACKUP** |
| `app/(tabs)/index.tsx` | 930 стр., redesign (`OperationRow`, header-bar-v2, design-preview, local-date, Swipeable) | Jul 1 | 813 стр., старая линия (FlatList + task-card + sortTasks), +12.09 | `patch-mobile-filter-scheduled-date-*`, `step2/step3` | **расхождение реализаций**; main новее по коммитам, apk — по redesign | **WORKING TREE** vs **GIT (main)** |
| `app/(tabs)/letters.tsx` | 29 881 б, redesign + `loadSnapshotMails`, undo через raw fetch, `Вручено`, design-preview | Jul 2 | 14 077 б, `groupLabel`, undo через tRPC, «Вернуть в недоставленные», same-day (Jul 9) | `step2/step3` | **расхождение**; main несёт July-9 логику, apk — redesign+snapshot | **WORKING TREE** vs **GIT (main)** |
| `app/(tabs)/pickup-gemotest.tsx` | Jul 5, `PickupOperationList`, cancel/assign, design-preview | Jul 2 | Sep 5/12, inline-список + `courier-icon`, окно-высоты | — | **расхождение**; main новее UI, apk несёт cancel/assign | **WORKING TREE** vs **GIT (main)** |
| `app/(tabs)/pickup-sberbank.tsx` | то же | Jul 2 | то же | — | **расхождение** | **WORKING TREE** vs **GIT (main)** |
| `components/operation-row.tsx` | 177 стр. (title/line3/line4/amount) | `9d3fe14a` | **отсутствует** | `operation-row.tsx.before-restore-separators-…` | **apk WT** | **WORKING TREE + BACKUP** |
| `components/pickup-operation-list.tsx` | 281 стр., cancel/assign UI | `cdc0b884` | **отсутствует** | — | **apk WT** | **WORKING TREE** |
| `app/components/courier-badge.tsx` | 11.06 | 11.06 | 12.09 (main) | — | **main** | **GIT (main)** |
| `app/components/task-card.tsx` | 27.05 | 27.05 | 12.09 (main) | — | **main** | **GIT (main)** |
| `app/components/courier-icon.tsx` | отсутствует | отсутствует | 12.09 (main, новый) | — | **main** | **GIT (main)** |
| `components/header-bar-v2.tsx`, `app/profile.tsx`, `app/login.tsx`, `components/haptic-tab.tsx`, `components/solito-tab-bar.tsx`, `app/lib/theme-provider.tsx`, `lib/theme-provider.tsx`, `shared/mobileCourierClient.ts` | June (redesign) | June | May (старая база) | stash | **apk WT/GIT-A** | **GIT-A + WORKING TREE** |
| `eslint.config.js` → `eslint.config.mjs` | чистый rename, содержимое идентично | `.js` | `.js` | `step1-safe-fixes…/eslint.config.js` | эквивалент | **WORKING TREE** |
| `server/routers.ts` | Jul 5, **заглушки** `cancelPickup`/`assignPickupCourier` (`return {success:true}`), **нет** `mails.undoDelivery` | Jul 2 | **Sep 17**, реальные `cancelPickup`/`assignPickupCourier` (db-вызовы), `mails.undoDelivery` | — | **main** | **GIT (main)** |
| `server/_core/chatV2Routes.ts` | **отсутствует** | отсутствует | Sep 4, полный chat v2 REST | — | **main** | **GIT (main)** |
| `assets/images/{icon,favicon,splash-icon,android-icon-foreground}.png` | все 4 = один файл `d3d83dae97` (699 104 б) | 4 разных корректных файла | корректные (совпадают с apk HEAD) | — | **apk HEAD / main** | ⚠ **регрессия в WORKING TREE** |

---

## 6. Критические находки / риски

### 6.1 APK-совместимость: frontend apk-check требует backend main-repo
* `app/(tabs)/letters.tsx` (WT apk) вызывает `/api/trpc/mails.undoDelivery`; в `server/routers.ts` apk-check процедуры **нет** (есть только в main, строка 1244, + `db.markMailUndelivered`).
* `components/pickup-operation-list.tsx` + `pickup-*.tsx` (WT apk) вызывают `sberbank/hemotest.cancelPickup` и `assignPickupCourier`; backend apk-check — **no-op заглушки**, backend main — реальные db-вызовы.
* `app/(tabs)/_layout.tsx`, `chat.tsx` (WT apk) вызывают `/api/chat/v2/*`; файла `chatV2Routes.ts` в apk-check **нет вовсе**.
* **Следствие:** рабочее дерево apk-check самодостаточно только как UI. Для работы этих функций на устройстве развёрнутый сервер обязан быть собран из main-repo (или его backend-часть должна быть перенесена в apk-check).

### 6.2 Регрессия иконок в WT apk-check
Все четыре tracked-иконки (`icon.png`, `favicon.png`, `splash-icon.png`, `android-icon-foreground.png`) перезаписаны **одним и тем же** файлом 699 104 б 2026-07-05 11:10 (md5 `d3d83dae97`). Исходные разные иконки сохранены в `apk-check HEAD` и в main-repo (совпадают). Итог: favicon 1 129 б → 699 КБ, splash 17 547 б → 699 КБ. Это почти наверняка случайная массовая перезапись. В APK вшита именно эта (испорченная) графика.

### 6.3 Хрупкость untracked-снапшотов
24 записи в `apk-check/backups/` (все июльские и сентябрьские, включая `task-id-before-requesttype-details-20260912-135323.tsx` и `before-chat-v2-mobile-…`) **не отслеживаются git**. `git clean -fdx`/`git clean -fd` уничтожит их. Аналогично `lib/chat-v2.ts`, `.easignore`, `eslint.config.mjs`, `credentials.json` — untracked.

### 6.4 Секреты
`apk-check/credentials.json` (iOS provisioning + distribution cert, android keystore) — untracked и **не покрыт `.gitignore`** (в `.gitignore` только `*.jks`, `*.p8`, `*.p12`). От утечки в EAS-бандл защищает только `.easignore` (он исключает `credentials.json`, `*.jks`, `*.p8`, `*.p12`, `*.mobileprovision`). Риск при `git add -A`.

### 6.5 Нативные проекты не в git
`apk-check/ios/` и `apk-check/android/` — gitignored. При этом именно там лежит актуальная нативная версия:
* `android/app/build.gradle`: `applicationId com.couriermig.app`, `versionCode 2`, `versionName "1.0.2"` (backup = 1 / 1.0.1);
* `ios/Courier.xcodeproj/project.pbxproj`: `CURRENT_PROJECT_VERSION = 5`, `MARKETING_VERSION = 1.0.2` (backup = 1 / 1.0).
Снапшоты этих файлов сохранены в `backups/before-eas-android-chat-v2-…/build.gradle` и `backups/before-ios-remote-version-…/project.pbxproj`.

### 6.6 Push deep links
WT `app/_layout.tsx` apk-check умеет только `data.url`. Типы пушей `chat_message_v2`, `unfinished_tasks_reminder`, `hemotest_*`, `sberbank_*`, `new_request_available`, `request_assigned` обрабатываются **только в main-repo** (`getPushRoute`). В shipped APK их нет (проверено по бандлу) → по push из chat v2 приложение откроет не тот экран.

### 6.7 Мусор в WT
Пустые файлы `0`, `tsc`, `{n`, `app-template@1.0.0`, `assets/icon.png` (дубль), `components/operation-row.tsx.before-restore-separators-20260630-140720`. В `.easignore` явно перечислены `0`, `tsc`, `{n` — автор уже сталкивался с тем, что они ломают сборку.

### 6.8 `app/hooks/use-mobile-live-sync.ts` — мёртвый дубль
Реально импортируется `@/hooks/use-mobile-live-sync` (top-level). Файл `app/hooks/use-mobile-live-sync.ts` различается между репозиториями, но нигде не используется.

---

## 7. Ответ на главный вопрос: какая версия самая новая и полная

**Единой «самой полной» версии нет.** Фактическое состояние = объединение, и по группам файлов лидер разный:

1. **Сентябрьский EAS/iOS/сборка-конфиг** → `WORKING TREE` apk-check (`app.config.ts` v1.0.2, `eas.json`, `.easignore`, `google-services.json`, нативные `build.gradle`/`project.pbxproj`). Только здесь. Подтверждено содержимым shipped APK.
2. **Сентябрьский chat v2** → `GIT` main-repo (`chat.tsx`@`b8e722b` 641 стр., `lib/chat-v2.ts`@`6f8fea1`, backend `chatV2Routes.ts`) — **новее** apk WT (который равен `daa13f6`). apk WT = та же база минус реакции/scroll-to-latest.
3. **Сентябрьский task detail (requestType)** → `WORKING TREE` apk-check (`app/task/[id].tsx`, 1233 стр., 2026-09-12 13:56) + `BACKUP` (`task-id-before-requesttype-details-20260912-135323.tsx` — состояние *до*). **Самое новое мобильное изменение из всех найденных**; в main-repo отсутствует.
4. **Сентябрьский push-routing** → `GIT` main-repo (`app/_layout.tsx`@`b7415b9`), в apk WT отсутствует.
5. **Сентябрьские UI-правки main** (pickup×2, index, courier-badge, task-card, courier-icon) → `GIT` main-repo, но на **старой** мобильной базе (без June-redesign). Реализации расходятся с apk WT, а не надстраиваются над ними.
6. **Июль-9 логика почты** (`mails.undoDelivery`, same-day delivered, nuts payment) → `GIT` main-repo (backend+`letters.tsx`). apk WT имеет собственную (redesign) реализацию undo, но без backend.
7. **Июль-5 redesign UI** (operation-row, pickup-operation-list, index/letters/pickup screens, design-preview, local-date, vibration-preference) → `WORKING TREE` apk-check + `GIT-A`(`86561e5`,`9e35e0b`,`9ae7562`) + `BACKUP`(step1/2/3, fix-chat-\*). Только в линии A.
8. **June mobile fixes** (profile, login, header-bar-v2, haptic-tab, solito-tab-bar, theme-provider, mobileCourierClient, app/lib/\*) → `GIT-A` (закоммичено в apk-check, `9e35e0b` и раньше).

**Определение фактической версии приложения:** shipped APK от 2026-09-13 собран из `WORKING TREE` apk-check — это и есть «фактическое состояние мобильного приложения на устройстве». Но оно (а) опирается на backend main-repo для chat v2 / undo mail / pickup cancel-assign, (б) не содержит более новых улучшений main (реакции чата, push-routing), (в) содержит регрессию иконок.

---

## 8. Рекомендации (код НЕ менялся)

Приоритет 1 — сохранность:
1. Немедленно сделать внешний snapshot: `tar` всего `apk-check/backups/` (особенно 24 untracked), `lib/chat-v2.ts`, `.easignore`, `eslint.config.mjs`, `credentials.json`, `ios/`, `android/`, и самого APK.
2. Не запускать `git clean`/`checkout`/`stash pop` в apk-check до консолидации.
3. Добавить в `.gitignore` исключения и/или закоммитить сентябрьские снапшоты (после отдельного решения).

Приоритет 2 — консолидация (после подтверждения):
4. Зафиксировать WT apk-check отдельным коммитом (baseline фактического APK).
5. Перенести из main-repo в линию A: `chat.tsx`@`b8e722b`, `lib/chat-v2.ts`, `server/_core/chatV2Routes.ts`, `app/_layout.tsx` push-routing (`getPushRoute`), backend `mails.undoDelivery`, реальные `cancelPickup`/`assignPickupCourier`.
6. Сверить `index.tsx`/`letters.tsx`/`pickup-*.tsx`: решить, какая реализация (redesign A или main B) является целевой, и слить недостающие фичи (Jul-9 логика почты, courier-icon, высоты списков).
7. Восстановить исходные 4 иконки (взять из `apk-check HEAD` или main-repo).
8. Убрать мусорные файлы `0`, `tsc`, `{n`, `app-template@1.0.0`, дубль `assets/icon.png`, `.before-restore-separators`.

Приоритет 3 — проверка:
9. Проверить `credentials.json` на попадание в индекс; при необходимости — `git rm --cached` и правило в `.gitignore`.
10. После консолидации — пересобрать APK и повторить проверку бандла по маркерам из §2.

---

## 9. Открытые вопросы

1. `google-services.json` WT использует Firebase-проект `device-streaming-5e0a560e` (похоже на временный Manus-проект), тогда как в EAS/main фигурирует `mig-courier`. Какой проект — целевой для push в проде?
2. Целевая мобильная база — redesign линии A (`OperationRow`, `PickupOperationList`) или текущая main-линия (FlatList/task-card)? От этого зависит, что считать «истиной» для index/letters/pickup.
3. Реакции чата (main `b8e722b`) и scroll-to-latest намеренно не попали в APK 13.09, или APK просто собран раньше?
4. Штатный ли это путь — держать `ios/`/`android/` вне git, при том что именно там актуальные версии/билд-номера?
5. Нужно ли сохранять `design-preview` (`lib/design-preview.ts`, `DESIGN_PREVIEW_TOKEN`) в проде, учитывая, что main-repo его удалил?
