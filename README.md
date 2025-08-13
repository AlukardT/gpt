# Наша мафия

Продакшн-готовое приложение: веб-панель ведущего + Telegram-бот + серверная логика.

## Быстрый старт (локально)

1. Создайте файл `.env` с переменными:
```
BOT_TOKEN=<токен бота>
ADMIN_TELEGRAM_ID=<tg id ведущего>
NODE_ENV=production
PORT=3000
WEB_APP_URL=http://localhost:3000
DATABASE_URL=
```

2. Установка зависимостей:
```
npm install
```

3. Запуск:
```
npm start
```

Проверка:
- GET /health → 200 OK
- / отдаёт `mafia-balagan/index.html`

## Деплой на Railway
- Build: `npm install`
- Start: `npm start`
- Переменные окружения: `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `NODE_ENV=production`, `WEB_APP_URL`, `DATABASE_URL?`