

## Payment Indicator & Double Tap Protection (NEW)
- [x] Display ₽ icon on task cards with payment (bottom, next to courier name)
- [x] Double tap protection for Gemotest pickup point selection
- [x] Double tap protection for Sberbank pickup point selection

## Web Portal - Task Creation Form Design (DONE)
- [x] Переделать дизайн формы создания заявки (сделать как форма добавления клиента)
- [x] Упростить форму создания заявки - убрать сложные поля
- [x] Применить чистый дизайн модального диалога к форме заявки

## Web Portal - Task Filter Buttons (DONE)
- [x] Заменить выпадающий список типов заявок на кнопки для выбора
- [x] Добавить кнопки: "Все типы", "Сбербанк", "Гемотест", "Другие"
- [x] Сделать горизонтальный layout кнопок
- [x] Добавить список всех заявок с карточками

## Web Portal - Date and Status Filters (DONE)
- [x] Добавить фильтр по диапазону дат (от и до) с календарем
- [x] Добавить фильтр по статусу заявки
- [x] Реализовать фильтрацию заявок по датам и статусу
- [x] Протестировать фильтры

## Web Portal - AI Text Parsing (DONE)
- [x] Добавить backend endpoint /api/ai/parse-request для парсинга текста через YandexGPT
- [x] Создать модальное окно для ввода текста заявки
- [x] Реализовать отправку текста на backend и получение структурированных данных
- [x] Автоматическое заполнение формы создания заявки данными от ИИ
- [x] Протестировать функцию парсинга текста
- [x] Исправить обработку LLM ответа (поддержка OpenAI-like формата)
- [x] Обновить API_BASE на правильный порт 3001
