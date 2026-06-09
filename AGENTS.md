# courier-delivery-system — project instructions for Codex

## Language and style
- Ответы пользователю писать по-русски.
- Не объяснять проект с нуля.
- Работать как продолжение текущей разработки.
- Не делать большие переписывания без причины.
- Перед изменениями искать реальные файлы через grep/sed.
- После изменений обязательно запускать проверки.
- Все правки делать точечно и безопасно.

## Repository
Main repo:
https://github.com/apkaxababkin-web/courier-delivery-system

Main working branch:
fix/mobile-auth-realtime-final

## Production server
SSH:
administrator333@81.26.190.83

Project path:
~/courier-delivery-system

Manager site:
https://couriermig.ru

Courier web:
https://courier.couriermig.ru

Manager web root:
/var/www/courier-manager

Courier web root:
/var/www/courier-app

## Main stack
- Node.js
- TypeScript
- React
- Vite
- React Native / Expo
- Expo Router
- PostgreSQL
- Drizzle ORM
- Docker / Docker Compose
- Nginx

## Important containers
- courier-api
- courier-postgres

## Important DB tables
- requests
- tasks
- taskStatusHistory
- couriers
- clients
- mails
- managers
- hemotestPickupPoints
- hemotestPickupLists
- hemotestListItems
- hemotestPickups
- sberbankPickupPoints
- sberbankPickupLists
- sberbankListItems
- sberbankPickups
- sberbankPickupSchedule

## Important business logic
- Manager site creates delivery requests.
- Courier mobile/web app displays tasks.
- New requests must sync into tasks.
- requests and tasks must stay consistent.
- Created requests must be visible to couriers on the correct local date.
- Courier business timezone is Ulan-Ude / Irkutsk: Asia/Irkutsk, UTC+8.
- Do not rely on server UTC or Moscow time for courier date filtering.

## Timezone rule
Courier-facing dates must be calculated using Asia/Irkutsk.
If a request has no scheduledAt, assign a courier business-day scheduledAt so it appears on the correct day for the user.

Check both files when touching request/task sync:
- server/_core/requestTaskSync.ts
- server/_core/compatRoutes.ts

There may be duplicated compatibility logic. Do not fix only one copy.

## Push notifications
Push notifications already use Expo/FCM.
Important:
- Pushes to assigned courier work.
- Need all-courier push for new requests, Hemotest lists/points, Sberbank lists/points.
- Do not break existing assigned-courier push.

## Current known requirements
### Courier request screen
- Remove "[request:58]" from visible comments.
- Move creation date below status buttons, small gray.
- Make back button larger.
- Keep sender and recipient as separate compact cards.
- Places and courier in one row.
- Courier comment compact.
- Status buttons below.

### Hemotest / Sberbank screens
- Remove double-tap hints and "ещё тап".
- Increase title.
- "Забрано X из Y" must not go off-screen.
- Point row format: "Biorise • Пестеля, д.8".
- Name bold, address normal.

### Theme
- app/lib/theme-provider.tsx must persist themePreference in AsyncStorage.
- app/(tabs)/index.tsx must not hardcode white/gray colors; use colors.surface/colors.border/colors.foreground.

### Vibration setting
- Add profile setting "Вибрация" on/off via AsyncStorage.
- If disabled, do not call Haptics.notificationAsync or Haptics.impactAsync.

## Commands
Always run after code changes:
pnpm check

For bigger changes:
pnpm build

For API/docker changes:
sudo docker compose build api
sudo docker compose up -d api
sudo docker compose logs --tail=120 api

For DB checks:
sudo docker compose exec -T postgres psql -U courier -d courier_db -c '<SQL>'

For courier web export:
rm -rf dist-courier-app
EXPO_PUBLIC_API_BASE_URL=https://couriermig.ru npx expo export --platform web --output-dir dist-courier-app
sudo rsync -a --delete dist-courier-app/ /var/www/courier-app/
sudo nginx -t
sudo systemctl reload nginx

For manager web deploy:
cd courier-manager
pnpm build
sudo rsync -a --delete dist/ /var/www/courier-manager/
sudo nginx -t
sudo systemctl reload nginx

For APK release:
cd android
./gradlew assembleRelease -x lint -x test -x lintVitalAnalyzeRelease

APK path:
android/app/build/outputs/apk/release/app-release.apk

## Full audit command
Use this when user asks to check the whole project:

cd ~/courier-delivery-system

git status --short
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm smoke:local
pnpm smoke:live
sudo docker compose build api
sudo docker compose up -d api
sudo docker compose logs --tail=150 api
curl -sk https://couriermig.ru/api/health

sudo docker compose exec -T postgres psql -U courier -d courier_db -c '
select ''clients'' as table, count(*) from clients
union all select ''couriers'', count(*) from couriers
union all select ''requests'', count(*) from requests
union all select ''tasks'', count(*) from tasks
union all select ''mails'', count(*) from mails
union all select ''hemotestPickupPoints'', count(*) from "hemotestPickupPoints"
union all select ''sberbankPickupPoints'', count(*) from "sberbankPickupPoints"
union all select ''hemotestPickupLists'', count(*) from "hemotestPickupLists"
union all select ''sberbankPickupLists'', count(*) from "sberbankPickupLists"
order by table;
'

## Safe work rules
- Do not delete couriers "Аркадий Бабкин" and "Баир Цыренов".
- Do not delete Hemotest/Sberbank pickup points unless explicitly asked.
- Before destructive DB operations, make pg_dump backup.
- Do not expose passwords/tokens in final answers.
- Do not commit secrets.
- Do not rewrite the project from scratch.
- Prefer small commits with clear messages.

## Useful grep targets
Request/task sync:
grep -R "syncTaskForRequestId\\|taskFromRequest\\|createTask\\|scheduledAt\\|requestMarker" -n server

Courier app date/tasks:
grep -R "tasks.all\\|selectedDate\\|scheduledAt\\|FlatList" -n app

Push:
grep -R "sendExpoPush\\|PUSH\\|pushToken\\|registerPushToken\\|sendPushToAllCouriers" -n server app

Theme:
grep -R "themePreference\\|AsyncStorage\\|colors.surface\\|colors.foreground" -n app

Haptics:
grep -R "Haptics\\.notificationAsync\\|Haptics\\.impactAsync" -n app

## Whole project development mode
When user asks to continue development, audit or fix the project, treat the repository as one full product:
- Manager web app
- Courier mobile app
- Courier web app
- API server
- PostgreSQL database
- Docker deployment
- Nginx deployment
- Expo/Android build
- Push notifications
- Hemotest and Sberbank pickup flows

Do not check only one file.
Always consider cross-effects between:
- requests and tasks
- manager site and courier app
- mobile app and web app
- API code and compatibility routes
- database schema and Drizzle types
- Docker build and deployed server state

Before saying a bug is fixed, verify the real flow end-to-end:
1. Create data from manager site or API.
2. Check DB rows.
3. Check courier API response.
4. Check courier web/mobile display.
5. Check logs.
6. Run pnpm check.
7. Run pnpm build for larger changes.
8. For server changes, rebuild and restart Docker API.
