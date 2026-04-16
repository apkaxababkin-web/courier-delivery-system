# Courier App — Design Document

## Brand Identity

**App Name:** КурьерПро (CourierPro)
**Brand Colors:**
- Primary: `#1A73E8` (Google Blue — trust, reliability)
- Secondary: `#34A853` (Green — success, delivery complete)
- Warning: `#FBBC04` (Yellow — in-progress, pending)
- Error: `#EA4335` (Red — rejected, failed)
- Background: `#F8F9FA` (Light Gray)
- Surface: `#FFFFFF` (White cards)
- Dark Background: `#1C1C1E`
- Dark Surface: `#2C2C2E`

---

## Screen List

### Auth Flow
1. **LoginScreen** — Courier login with phone/email and password

### Main App (Tab Navigation)
2. **TaskListScreen** (Home Tab) — List of all assigned delivery tasks
3. **ActiveTaskScreen** — Currently accepted task with delivery details and map
4. **HistoryScreen** — Completed and rejected tasks history
5. **ProfileScreen** — Courier profile, stats, settings

### Modal / Stack Screens
6. **TaskDetailScreen** — Full task details: address, recipient, package info, accept/reject buttons
7. **DeliveryConfirmScreen** — Confirm delivery completion

---

## Primary Content and Functionality

### LoginScreen
- Logo + app name at top
- Phone/email input field
- Password input field
- "Войти" (Login) button
- Error state for wrong credentials

### TaskListScreen (Home)
- Header: "Мои задания" with courier name
- Filter tabs: "Новые" | "В работе" | "Все"
- FlatList of TaskCards:
  - Delivery address (bold)
  - Recipient name
  - Package type badge
  - Status badge (colored)
  - Estimated time / distance
  - Arrow chevron to open detail
- Pull-to-refresh
- Empty state illustration when no tasks

### TaskDetailScreen
- Back button header
- Task ID and creation time
- Delivery address with map pin icon
- Recipient name and phone (tap to call)
- Package description
- Special instructions (if any)
- Estimated delivery time
- **"Принять задание"** (Accept) — green button
- **"Отклонить"** (Reject) — outlined red button
- Status badge at top

### ActiveTaskScreen
- Map view (top half) with route
- Bottom sheet with task summary
- Status: "В пути" indicator
- Recipient contact button
- **"Подтвердить доставку"** — primary green button
- Estimated arrival time

### HistoryScreen
- FlatList of past tasks
- Date grouping headers
- Status icons (green check / red X)
- Tap to view read-only task detail

### ProfileScreen
- Avatar with courier name
- Stats: Total deliveries, This week, Rating
- Settings section: Notifications toggle, Theme toggle
- Logout button

---

## Key User Flows

### Flow 1: Accept and Complete a Task
1. Courier opens app → TaskListScreen loads tasks from API
2. Taps a task card → TaskDetailScreen opens
3. Reviews details → taps "Принять задание"
4. Task status updates to "В работе" → navigates to ActiveTaskScreen
5. Courier delivers package → taps "Подтвердить доставку"
6. Task marked as "Выполнено" → success animation → back to TaskListScreen

### Flow 2: Reject a Task
1. Courier opens TaskDetailScreen
2. Taps "Отклонить" → confirmation bottom sheet appears
3. Selects rejection reason (optional)
4. Confirms → task status updated → back to TaskListScreen

### Flow 3: Login
1. App opens → checks auth token
2. If no token → LoginScreen
3. Courier enters credentials → API validates
4. On success → navigates to TaskListScreen
5. Token stored in SecureStore

---

## Color Choices

```js
primary: { light: '#1A73E8', dark: '#4A9EFF' }       // Blue — main actions
background: { light: '#F8F9FA', dark: '#1C1C1E' }     // App background
surface: { light: '#FFFFFF', dark: '#2C2C2E' }         // Cards
foreground: { light: '#1C1C1E', dark: '#F5F5F5' }     // Text
muted: { light: '#6B7280', dark: '#9CA3AF' }           // Secondary text
border: { light: '#E5E7EB', dark: '#3A3A3C' }          // Dividers
success: { light: '#34A853', dark: '#4ADE80' }         // Accepted/Done
warning: { light: '#FBBC04', dark: '#FCD34D' }         // In progress
error: { light: '#EA4335', dark: '#F87171' }           // Rejected/Error
```

---

## Typography

- **Headers:** SF Pro Display Bold, 24-28px
- **Body:** SF Pro Text Regular, 15-16px
- **Labels/Badges:** SF Pro Text Semibold, 12-13px
- **Muted text:** SF Pro Text Regular, 13px, muted color

---

## Component Patterns

- **TaskCard:** Rounded card (12px radius), white bg, shadow, status badge top-right
- **StatusBadge:** Pill shape, colored bg, white text, 6px padding
- **ActionButton:** Full-width, 52px height, 12px radius, bold text
- **BottomSheet:** Slides up from bottom, 24px top radius, handle bar
- **EmptyState:** Centered illustration + message + optional CTA button
