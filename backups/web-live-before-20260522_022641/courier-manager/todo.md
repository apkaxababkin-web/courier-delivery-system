# Courier Manager TODO

## Core Features
- [x] Clients management (CRUD + export reports)
- [x] Tasks management
- [x] Hemotest points management
- [x] Sberbank points management with day-of-week templates
- [x] Mails manifest upload with flexible column mapping
- [x] Create Request (Создание заявки) with 6 request types
  - [x] Доставка (Delivery)
  - [x] Перемещение (Movement)
  - [x] Орехи (Nuts)
  - [x] Вызов курьера (Courier Call)
  - [x] Забор груза с ТК (Pickup from TC)
  - [x] Простая заявка (Simple Request)

## Database
- [x] Requests table schema with all 6 request types
- [x] Drizzle migration for requests table
- [x] Request management functions in db.ts

## API
- [x] tRPC routes for request creation
- [x] Request status management endpoints
- [x] Courier assignment endpoints
- [x] Request retrieval endpoints

## Frontend - Refactoring
- [x] Break down TasksView.tsx into modular components
- [x] Create src/features/tasks/ directory structure
- [x] Implement TasksPage.tsx as main container
- [x] Create TasksStats.tsx with statistics cards
- [x] Create TasksFilters.tsx with status chips and date filters
- [x] Create TasksList.tsx for task list display
- [x] Create TaskCard.tsx for individual task cards
- [x] Create CreateTaskModal.tsx for task creation
- [x] Create AiTaskModal.tsx for AI-powered task parsing
- [x] Create EmptyState.tsx for empty list state
- [x] Implement model layer (types.ts, filters.ts, stats.ts)
- [x] Synchronize types between API and frontend
- [x] Fix TypeScript errors and type mismatches
- [x] Update status chips with correct values (pending, assigned, in_progress, completed, cancelled)
- [x] Implement clean SaaS design with cards and modern UI
- [x] Fix all TypeScript compilation errors

## Testing
- [ ] Unit tests for TasksFilters component
- [ ] Unit tests for TasksStats calculations
- [ ] Unit tests for request filtering logic
- [ ] Integration tests for request API endpoints
- [ ] E2E tests for complete task workflow

## Future Enhancements
- [ ] Request list view with filtering and search
- [ ] Request detail view with status tracking
- [ ] Bulk request import from Excel
- [ ] Request templates for recurring tasks
- [ ] Request assignment automation
- [ ] Request analytics and reporting
