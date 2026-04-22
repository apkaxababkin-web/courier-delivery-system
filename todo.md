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

## Task Card Design v3 (Time Interval + Courier Dots)
- [x] Backend: add deliveryTimeFrom / deliveryTimeTo fields to tasks table
- [x] Backend: update API to accept and return time interval fields
- [x] Mobile: TaskCard — add time interval row (hidden if not set)
- [x] Mobile: TaskCard — colored dot before courier name
- [x] Mobile: TaskCard — recipient address row
- [x] Mobile: TaskCard — places count in footer (hidden if not set)
- [x] Mobile: task detail screen — time interval input fields
- [x] Mobile: task detail screen — colored dot in courier picker

## Sender Info
- [x] Backend: add senderName and senderAddress fields to tasks table
- [x] Mobile: TaskCard — show ОТПРАВИТЕЛЬ name + address, then ПОЛУЧАТЕЛЬ name + address
- [x] Mobile: task detail — show sender name and address section
- [x] Demo data: add senderName and senderAddress to seed tasks

## Demo Data & Status Buttons Fix
- [x] Update demo tasks with real Ulan-Ude addresses (Основа движения, HelloKorea)
- [x] Status buttons in task detail: active/selected state clearly visible
- [x] Status badge on task card reflects current status with color

## Extended Task Detail Screen
- [x] Backend: add senderPhone and comments fields to tasks table
- [x] Mobile: task detail — sender section with clickable address and phone
- [x] Mobile: task detail — recipient section with clickable address and phone
- [x] Mobile: task detail — comments section (read-only, from manager)
- [x] Mobile: task detail — places button with numeric keypad input
- [x] Mobile: task detail — status buttons (В работе, Выполнено, Отмена, Перенос заявки)
- [x] Mobile: task detail — calendar for rescheduling task date
- [x] Mobile: 2GIS integration — address opens map with search
- [x] Mobile: phone integration — tap to call functionality

## Manager-Side Address URL Conversion
- [x] Backend: add senderAddressUrl and recipientAddressUrl fields to tasks table
- [x] Mobile: task detail — addresses are hyperlinks (if URL provided)
- [x] Mobile: task detail — addresses are plain text (if no URL provided)
- [x] Demo data: add 2GIS URLs for all demo task addresses

## Demo Courier & Tasks Loading
- [x] Backend: add seedDemoCourier mutation to create demo courier (login: demo, password: demo123)
- [x] Mobile: add "Create demo courier" button on login screen
- [x] Mobile: auto-fill login/password fields when demo courier is created
- [x] Backend: seedDemo mutation to load demo tasks (requires valid courier token)

## Task Reschedule Feature (Session 3)
- [x] Backend: add rescheduleTask mutation to tasks router
- [x] Backend: add updateTaskDate function to db.ts
- [x] Frontend: integrate reschedule mutation in app/task/[id].tsx
- [x] Frontend: task moves to new date and removed from old date
- [x] Frontend: TRPC cache properly invalidated
- [x] Frontend: success message and haptic feedback on reschedule
- [x] Fixed calendar day-of-week calculation for Russian locale

## Toast Notifications & Calendar Close (Session 4)
- [x] Install react-native-toast-notifications package
- [x] Add ToastProvider to app/_layout.tsx
- [x] Replace Alert with toast notifications for reschedule success
- [x] Add toast notifications for reschedule errors
- [x] Add close calendar on outside tap (Pressable overlay)
- [x] Calendar remains unchanged visually

## Badge & Swipe Navigation (Session 5)
- [x] Add red badge with task count on filter icon
- [x] Badge shows number of tasks assigned to current courier
- [x] Badge font improved (fontSize 12, fontWeight 800)
- [x] Badge updates in real-time when tasks are completed
- [x] Swipe navigation between tabs (Все заявки ↔ Гемотест ↔ Сбербанк ↔ Письма)
- [x] Installed react-native-pager-view for smooth swipe gestures

## Next Features
- [ ] Task status history — timeline of all status changes with timestamps
- [ ] Push notifications for new tasks assigned to courier
- [ ] Proof of delivery — photo capture when marking task complete

## Status Button Toggle & 2GIS Integration Fix
- [x] Mobile: status buttons work as toggle (нажал ещё раз = отмена)
- [x] Mobile: improved visual feedback on button press (color, scale, haptic)
- [x] Mobile: restored 2GIS integration (copy address + open 2GIS)
- [x] Backend: updated setStatus to accept 'assigned' status for toggle
- [x] Backend: allow reverting from completed/cancelled back to assigned

## Places Input & Calendar & 2GIS Fixes
- [x] Mobile: places input — autoFocus on TextInput (keyboard appears immediately)
- [x] Mobile: places input — working save/cancel buttons
- [x] Mobile: calendar — fixed layout to show day numbers properly
- [x] Mobile: 2GIS — second variant with URL parameter ?q=address + clipboard copy

## UI Fixes (Current Sprint)
- [x] Fix places modal — ensure modal window shows (not just keyboard)
- [x] Update places button description to "Введите количество мест"
- [x] Fix loading spinner on home screen when returning from task detail

## Critical Bug Fixes (Session 2)
- [x] Fix places modal TextInput not updating when typing digits
- [x] Add KeyboardAvoidingView to prevent keyboard overlap
- [x] Update UI labels: "Введите количество мест" header + "место" placeholder
- [x] Add selectTextOnFocus and maxLength to TextInput

## Courier Comments Feature
- [x] Backend: add updateComments mutation to tasks router
- [x] Backend: add courierComments field to tasks table
- [x] Mobile: split button layout — Places + Comments stacked vertically
- [x] Mobile: comments modal with multiline text input for courier notes
- [x] Mobile: display saved courier comments on task detail screen

## Task Sorting & Urgency Highlighting
- [x] Backend: add urgencyThresholdOrange and urgencyThresholdRed to couriers table
- [x] Backend: add updateUrgencyThresholds mutation to tasks router
- [x] Mobile: add urgency settings to courier profile screen
- [x] Mobile: implement smart task sorting (new → in_progress → completed → cancelled, sorted by deadline within each group)
- [ ] Mobile: add color-coded urgency indicators (orange/red background on task cards based on time remaining)
- [x] Mobile: create task-sorting.ts utility with calculateUrgency and sortTasks functions


## Main Screen Redesign (Modern List Layout)
- [x] Redesign header: Profile | Date (18.04.26) | Logo
- [x] Add calendar modal for date selection (history filtering)
- [x] Create Tab Bar with 4 tabs: "Все заявки" | "Гемотест" | "Сбербанк" | "Письма"
- [x] Implement auto-login with demo courier
- [x] Add seed demo data button to empty state
- [x] Redesign TaskCard component — new information structure
- [x] Implement smart task sorting (new → in_progress → completed → cancelled)
- [x] Add courier color dots (stable color per courier name)
- [x] ID on same line as sender name
- [x] Status + Courier + Places at bottom of card
- [x] Fix calendar day-of-week calculation (18 апреля это суббота)
- [x] Keep completed/cancelled tasks on current day (don't move to past)
- [x] Load tasks for selected date from server (history)
- [x] Fix task history logic - filter by date instead of status
- [x] Add urgency color indicators (red border on task cards for < 1 hour)

## Warehouse Pickup UI Refinement
- [x] Hide sender name and sender address for warehouse_pickup
- [x] Show only delivery location name and address
- [x] Display items list on card
- [x] Label shows first item name instead of generic "Со склада"

## Pickup Points System
- [ ] Create database schema for pickup points
- [ ] Create database schema for daily pickup schedules
- [ ] Add backend endpoints for pickup points and tasks
- [ ] Implement Гемотест tab with pickup list
- [ ] Implement Сбербанк tab with pickup list
- [ ] Add "mark as picked" functionality for pickup tasks
- [ ] Show pickup task history

## Task Types Implementation (Three Types of Deliveries)
- [x] Add taskType field to tasks table (enum: 'regular' | 'warehouse_pickup' | 'courier_call')
- [x] Update database schema with taskType field
- [x] Update backend API to accept and return taskType
- [x] Update TaskCard component to show different layouts per type:
  - Regular: current layout (sender → recipient → time → status)
  - Warehouse: full info on card (warehouse address → delivery address → items → status)
  - Courier Call: minimal on card (address + time) → details in modal
- [ ] Update Task Detail screen for each type
- [x] Fix demo data loading (seedDemo mutation - added token parameter)
- [x] Add demo data for all three task types (5 regular + 1 warehouse + 1 courier_call)
- [x] Add items JSON field to tasks table for warehouse_pickup product list
- [x] Update TaskCard to display items list for warehouse_pickup
- [x] Add demo items for warehouse_pickup (Орехи 200г, 500г, Масло кедровое)
- [x] Fix warehouse_pickup layout: hide sender address, show only delivery address + items
- [x] Update label to show first item name ("📦 Орехи 200г" instead of "📦 Со склада")
- [ ] Test all task types end-to-end
- [ ] Verify warehouse_pickup card layout matches design

## Warehouse Pickup Label Fix
- [x] Add category field to items JSON (e.g., "category": "Орехи")
- [x] Update demo data items with categories
- [x] Update TaskCard label to show category instead of first item name
- [x] Verify all items display in list (not just first item)

## Light Theme & Card Styling
- [x] Add 3D shadow effect to TaskCard (shadowOpacity 0.15, elevation 6)
- [x] Improve light theme background color
- [x] Add border to cards for better separation
- [x] Ultra-compact card sizing (padding 10x8px, margin 4px between cards)
- [x] Minimize inter-row spacing (1-4px)
- [x] Fix seedDemo to clear old tasks before loading new ones
- [x] Add category field to warehouse_pickup items

## Pickup Points System (Гемотест & Сбербанк)
- [x] Create database schema: hemotest_pickup_points, sberbank_pickup_points
- [x] Create database schema: hemotest_pickups, sberbank_pickups (daily tracking)
- [x] Backend: tRPC procedures for hemotest and sberbank pickup points
- [x] Backend: toggle pickup status (picked/unpicked) for current day
- [x] Frontend: Гемотест tab with Telegram-style checkbox UI
- [x] Frontend: Сбербанк tab with Telegram-style checkbox UI
- [x] Frontend: Sorting logic (unpicked at top, picked at bottom)
- [x] Frontend: Counter for picked points today (header)
- [x] Demo data: Add sample Hemotest and Sberbank pickup points
- [x] Demo data: Expand to 8 points per network
- [x] Icons: Create outline-style Hemotest icon (test tube with blood drop)
- [x] Icons: Create outline-style Sberbank icon (bank building with safe)
- [x] Icons: Add icon mappings to icon-symbol.tsx
- [x] Icons: Update tab bar to use new icons


## Solito Navigation Integration (Current Sprint)
- [x] Install Solito package (v5.0.0)
- [x] Create SolitoHeader component with profile icon and date display
- [x] Create SolitoTabBar component with custom styling
- [x] Fix TypeScript errors in app/(tabs)/index.tsx (courierName property)
- [x] Verify app compiles without errors
- [x] Test SolitoHeader integration with existing HeaderBarV2
- [x] Test SolitoTabBar styling matches design requirements
- [x] Verify urgent task red border (< 1 hour) displays correctly
- [x] Test dark/light mode toggle with custom header and tab bar
- [x] Test tab navigation between all 4 screens (Все заявки, Гемотест, Сбербанк, Письма)
- [x] Verify tab bar margins (12px left/right) and compact sizing
- [x] Test profile icon press navigation to profile screen
- [x] Test date picker modal integration with header
- [x] Fix test: update in_progress label from "В пути" to "В работе"
- [x] All tests passing (6 passed, 1 skipped)
- [x] Full app testing complete - no critical errors


## Profile & UI Improvements (Session 6)
- [x] Remove "Login" and "Vehicle Type" tabs from courier profile
- [x] Add font size selector (Normal, Large, Very Large) with AsyncStorage persistence
- [x] Add red urgency dot at top center of urgent task cards (< 30 min remaining)
- [x] Red dot positioned absolutely, doesn't interfere with task info
- [x] Sorting logic verified - urgent tasks appear first
- [x] Fixed light mode tab bar colors (use dynamic theme colors instead of hardcoded)

## Push Notifications Implementation (Session 7)
- [x] Register mobile app for push tokens with Expo
- [x] Send push token to backend API
- [x] Implement push notification settings save in profile screen
- [x] Add notification service to backend
- [x] Send push when task is created (check user settings)
- [ ] Test end-to-end: create task in web portal → receive push on mobile


## Advanced Push Notifications (Session 8)
- [x] Add deep links to push notifications (open task detail when tapped)
- [x] Implement status change notifications (send push when manager updates task status)
- [x] Optimize batch push sending (send to multiple couriers efficiently)
- [x] Test end-to-end: verify all push scenarios work correctly


## Push Notifications Enhancements (Session 9)
- [x] Implement deep link handling in mobile app (open task when push tapped)
- [x] Add push analytics logging (track send success/failure)
- [x] Implement retry logic with exponential backoff (retry failed sends)


## Battery Optimization (Session 10)
- [x] Implement smart caching with React Query (staleTime, gcTime)
- [x] Add network-aware data fetching (check internet before sync)
- [x] Implement intelligent GPS tracking (only when in_progress)
- [x] Add background sync with expo-background-fetch
- [x] Replace ScrollView with FlatList in task lists
- [x] Memoize TaskCard and other expensive components
- [x] Implement dark mode optimization for OLED screens
- [x] Add adaptive screen brightness
- [x] Test battery drain scenarios
