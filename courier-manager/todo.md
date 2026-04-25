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

## Frontend
- [x] RequestsView component with multi-type form
- [x] Request type selector with icons and descriptions
- [x] Type-specific form fields for each request type
- [x] Form validation for all request types
- [x] Success/error message handling
- [x] Navigation menu integration

## Testing
- [ ] Unit tests for request creation
- [ ] Integration tests for API endpoints
- [ ] Form validation tests
- [ ] E2E tests for complete request flow

## Future Enhancements
- [ ] Request list view with filtering and search
- [ ] Request detail view with status tracking
- [ ] Bulk request import from Excel
- [ ] Request templates for recurring tasks
- [ ] Request assignment automation
- [ ] Request analytics and reporting
