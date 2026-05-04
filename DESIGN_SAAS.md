# SaaS Dashboard Design Specification

## Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Page Background | Light Gray | #f8fafc |
| Sidebar Background | Dark | #0f172a |
| Sidebar Text | Light Gray | #e2e8f0 |
| Sidebar Active | Blue | #3b82f6 |
| Card Background | White | #ffffff |
| Card Border | Light Gray | #e5e7eb |
| Primary Button | Blue | #2563eb |
| Primary Button Hover | Dark Blue | #1d4ed8 |
| Secondary Button | White | #ffffff |
| Secondary Button Border | Gray | #d1d5db |
| Text Primary | Dark | #111827 |
| Text Secondary | Gray | #6b7280 |
| Success | Green | #10b981 |
| Warning | Yellow | #f59e0b |
| Error | Red | #dc2626 |
| Divider | Light Gray | #f3f4f6 |

## Typography

- Font Family: Inter, system-ui, -apple-system, sans-serif
- Body: 14px / 1.5
- Small: 12px / 1.4
- Large: 16px / 1.6
- Heading H1: 28px / 1.2, font-weight 700
- Heading H2: 20px / 1.3, font-weight 600
- Heading H3: 16px / 1.4, font-weight 600

## Spacing

- xs: 4px
- sm: 8px
- md: 12px
- lg: 16px
- xl: 24px
- 2xl: 32px
- 3xl: 48px

## Border Radius

- sm: 8px
- md: 12px
- lg: 16px
- xl: 20px

## Shadows

- sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05)
- md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)
- lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1)
- xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1)
- soft: 0 4px 20px rgba(0, 0, 0, 0.05)

## Layout Structure

### Sidebar (Fixed Left)
- Width: 280px
- Background: #0f172a
- Position: Fixed, full height
- Padding: 24px 16px
- Z-index: 40

#### Sidebar Header
- Logo/App Name: 20px, font-weight 700, color white
- Margin bottom: 32px
- Border bottom: 1px solid rgba(255, 255, 255, 0.1)
- Padding bottom: 24px

#### Sidebar Menu Items
- Height: 44px
- Padding: 0 12px
- Border-radius: 10px
- Color: #e2e8f0
- Font-size: 14px
- Margin bottom: 8px
- Icon: 20px, margin-right 12px
- Active state: Background #3b82f6, color white, font-weight 600

#### Sidebar Footer
- Position: Absolute bottom 24px
- Font-size: 12px
- Color: #94a3b8
- Text: "v1.0.0"

### Header (Fixed Top)
- Height: 64px
- Background: white
- Border-bottom: 1px solid #e5e7eb
- Padding: 0 32px
- Margin-left: 280px
- Display: flex, justify-between, align-items center
- Z-index: 30

#### Header Left
- Page Title: 20px, font-weight 600, color #111827

#### Header Right
- User Info: flex, gap 16px, align-items center
- User Name: 14px, color #111827
- User Role: 12px, color #6b7280
- Logout Button: Secondary style

### Main Content Area
- Margin-left: 280px
- Margin-top: 64px
- Padding: 32px
- Background: #f8fafc
- Min-height: calc(100vh - 64px)

## Component Styles

### Card
- Background: white
- Border: 1px solid #e5e7eb
- Border-radius: 12px
- Padding: 24px
- Box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05)

### Button Primary
- Background: #2563eb
- Color: white
- Border-radius: 10px
- Height: 40px
- Padding: 0 16px
- Font-size: 14px
- Font-weight: 500
- Hover: Background #1d4ed8
- Active: Background #1e40af
- Disabled: Background #d1d5db, color #9ca3af

### Button Secondary
- Background: white
- Border: 1px solid #d1d5db
- Color: #111827
- Border-radius: 10px
- Height: 40px
- Padding: 0 16px
- Font-size: 14px
- Font-weight: 500
- Hover: Background #f9fafb
- Disabled: Background #f3f4f6, color #9ca3af

### Button Danger
- Background: #dc2626
- Color: white
- Border-radius: 10px
- Height: 40px
- Padding: 0 16px
- Font-size: 14px
- Font-weight: 500
- Hover: Background #b91c1c

### Input / Select
- Background: white
- Border: 1px solid #d1d5db
- Border-radius: 8px
- Height: 40px
- Padding: 0 12px
- Font-size: 14px
- Color: #111827
- Placeholder: #9ca3af
- Focus: Border #2563eb, outline none, box-shadow 0 0 0 3px rgba(37, 99, 235, 0.1)

### Textarea
- Background: white
- Border: 1px solid #d1d5db
- Border-radius: 8px
- Padding: 12px
- Font-size: 14px
- Color: #111827
- Placeholder: #9ca3af
- Focus: Border #2563eb, outline none, box-shadow 0 0 0 3px rgba(37, 99, 235, 0.1)
- Min-height: 120px

### Modal
- Width: 720px (or 900px for large)
- Background: white
- Border-radius: 16px
- Box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1)
- Position: Fixed, center
- Z-index: 50

#### Modal Header
- Padding: 24px
- Border-bottom: 1px solid #e5e7eb
- Font-size: 20px
- Font-weight: 600
- Color: #111827

#### Modal Body
- Padding: 24px
- Max-height: calc(100vh - 200px)
- Overflow-y: auto

#### Modal Footer
- Padding: 24px
- Border-top: 1px solid #e5e7eb
- Display: flex
- Justify-content: flex-end
- Gap: 12px

### Statistic Card
- Background: white
- Border: 1px solid #e5e7eb
- Border-radius: 12px
- Padding: 20px
- Display: flex, flex-direction column, gap 8px

#### Stat Label
- Font-size: 12px
- Color: #6b7280
- Font-weight: 500
- Text-transform: uppercase
- Letter-spacing: 0.5px

#### Stat Value
- Font-size: 28px
- Font-weight: 700
- Color: #111827

#### Stat Change
- Font-size: 12px
- Color: #10b981 (if positive) or #dc2626 (if negative)

### Table
- Background: white
- Border: 1px solid #e5e7eb
- Border-radius: 12px
- Overflow: hidden

#### Table Header
- Background: #f9fafb
- Border-bottom: 1px solid #e5e7eb
- Padding: 16px 24px
- Font-size: 12px
- Font-weight: 600
- Color: #6b7280
- Text-transform: uppercase
- Letter-spacing: 0.5px

#### Table Row
- Padding: 16px 24px
- Border-bottom: 1px solid #f3f4f6
- Color: #111827
- Font-size: 14px
- Hover: Background #f9fafb

#### Table Cell
- Vertical-align: middle

## Page Layouts

### Tasks View
1. Header: "Все заявки"
2. Statistics Cards Row:
   - Всего заявок (count)
   - Новые (count)
   - В работе (count)
   - Завершённые (count)
3. Filters Card:
   - Status filter
   - Date range filter
   - Search input
   - Buttons: "Создать заявку" (primary), "Создать по тексту" (secondary with sparkles icon)
4. Tasks Table:
   - Columns: ID, Клиент, Адрес, Статус, Дата, Действия
   - Empty state: "Заявок пока нет" + "Создайте первую заявку вручную или через ИИ"

### AI Text Parsing Modal
- Title: "Создать заявку по тексту"
- Textarea: "Вставьте текст заявки из мессенджера..."
- Button: "Распознать" (primary, with sparkles icon)
- After recognition: Fills the task creation form
- Cancel button: Secondary

### Task Creation Modal
- Title: "Создать заявку"
- Form fields:
  - Клиент (select or create)
  - Адрес доставки (text)
  - Получатель (text)
  - Телефон (text)
  - Тип заявки (select)
  - Сумма (number)
  - Статус (select)
  - Комментарий (textarea)
- Buttons: "Отмена" (secondary), "Создать" (primary)
