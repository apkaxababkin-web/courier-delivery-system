# Courier App — TODO

## Backend
- [x] Database schema: couriers, tasks, task_status_history
- [x] API: POST /auth/login (courier login)
- [x] API: GET /tasks (list tasks for courier)
- [x] API: GET /tasks/:id (task details)
- [x] API: PATCH /tasks/:id/accept (accept task)
- [x] API: PATCH /tasks/:id/reject (reject task)
- [x] API: PATCH /tasks/:id/complete (complete task)
- [x] API: GET /couriers/me (courier profile)
- [x] Seed data: demo courier accounts and sample tasks

## Mobile App
- [x] Update theme colors (brand colors)
- [x] Generate and set app logo/icon
- [x] LoginScreen — OAuth login via profile screen
- [x] Auth token storage with SecureStore
- [x] Tab navigation: Tasks, History, Profile
- [x] TaskListScreen — FlatList with filter tabs (Новые / В работе / Все)
- [x] TaskCard component with status badge
- [x] TaskDetailScreen — full task info + Accept/Reject buttons
- [x] ActiveTaskScreen — active delivery with confirm button (in TaskDetailScreen)
- [x] HistoryScreen — completed/rejected tasks list
- [x] ProfileScreen — courier info and stats
- [x] API integration with tRPC
- [x] Pull-to-refresh on task list
- [x] Empty state for no tasks
- [x] Loading states and error handling
- [ ] Push notifications for new tasks

## Branding
- [x] Generate app icon
- [x] Update app.config.ts with app name and logo

## Auth Rework (Login/Password)
- [x] Add login/password fields to couriers table in DB schema
- [x] API: POST /auth/courier-login (login with username + password)
- [x] API: POST /auth/courier-logout (clear session)
- [x] Backend: password hashing with bcrypt
- [x] Backend: JWT session token for couriers
- [x] Remove OAuth dependency from mobile app
- [x] Create LoginScreen with username/password form
- [x] Store courier session token in SecureStore
- [x] Update ProfileScreen: show courier info without OAuth
- [x] Update TaskList/History screens to use courier auth
- [x] Manager API: create courier with login/password

## Task Logic Rework
- [x] Backend: remove reject endpoint
- [x] Backend: simplify statuses — assigned → in_progress → completed
- [x] Backend: allow multiple tasks in_progress simultaneously
- [x] Mobile: remove "Отклонить" button everywhere
- [x] Mobile: rename "Принять" → "Я заберу" (assigned → in_progress)
- [x] Mobile: rename "Подтвердить доставку" → "Доставлено"
- [x] Mobile: remove "accepted" intermediate status
- [x] Mobile: update filter tabs to match new statuses
- [x] Mobile: update StatusBadge labels
- [x] Mobile: update TaskCard to show new statuses

## Task Card Rework v2
- [x] Backend: add placesCount field to tasks (default 1)
- [x] Backend: API to update placesCount (courier or manager)
- [x] Backend: API tasks.all — all tasks visible to all couriers
- [x] Backend: API tasks.assignCourier — courier can assign any courier to a task
- [x] Backend: API tasks.setStatus — set status (in_progress, completed, cancelled)
- [x] Backend: API couriers.list — list all couriers (for picker)
- [x] Mobile: main screen shows ALL tasks (not just assigned to me)
- [x] Mobile: TaskCard shows courier name under status badge
- [x] Mobile: TaskCard shows "Не назначен" if no courier
- [x] Mobile: task detail — courier picker (dropdown/modal with all couriers)
- [x] Mobile: task detail — status buttons: В работе / Выполнено / Отменено
- [x] Mobile: task detail — places counter (default 1, +/- buttons)
- [x] Mobile: task detail — show assigned courier name
