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
