# MafiaBot - Telegram Bot & Web Server

Telegram бот для игры в Мафию с веб-интерфейсом и базой данных.

## 🚀 Развертывание на Render

### 1. Подготовка к развертыванию

1. Убедитесь, что у вас есть аккаунт на [Render.com](https://render.com)
2. Создайте Telegram бота через [@BotFather](https://t.me/botfather) и получите токен
3. Подготовьте базу данных PostgreSQL (можно использовать Render PostgreSQL)

### 2. Развертывание через Render Dashboard

#### Шаг 1: Создание базы данных
1. В Render Dashboard создайте новый **PostgreSQL** сервис
2. Назовите его `mafia-postgres`
3. Выберите план `Free`
4. Запишите данные для подключения

#### Шаг 2: Создание веб-сервиса
1. Создайте новый **Web Service**
2. Подключите ваш GitHub/GitLab репозиторий
3. Настройте следующие параметры:
   - **Name**: `mafia-bot-web`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci --only=production`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

#### Шаг 3: Настройка переменных окружения
Добавьте следующие переменные в настройках сервиса:

```
DATABASE_URL = [connection string from PostgreSQL service]
BOT_TOKEN = [your telegram bot token]
ADMIN_TELEGRAM_ID = [your telegram user ID]
ADMIN_TOKEN = [generate random string]
BOT_TOKEN_INTERNAL = [generate random string]
NODE_ENV = production
PORT = 10000
```

### 3. Автоматическое развертывание через render.yaml

Проект уже содержит файл `render.yaml` для автоматического развертывания:

1. Запушите код в репозиторий
2. В Render Dashboard выберите "New Blueprint Instance"
3. Укажите URL вашего репозитория
4. Render автоматически создаст все необходимые сервисы

### 4. Проверка развертывания

После развертывания:
1. Проверьте health check endpoint: `https://your-app.onrender.com/health`
2. Убедитесь, что бот отвечает в Telegram
3. Проверьте логи в Render Dashboard

## 🛠️ Локальная разработка

```bash
# Установка зависимостей
npm install

# Создание .env файла
cp .env.example .env
# Отредактируйте .env с вашими данными

# Запуск в режиме разработки
npm run dev

# Запуск в продакшене
npm start
```

## 📁 Структура проекта

- `main-server.js` - Основной сервер с Telegram ботом
- `server/` - API сервер
- `shared/` - Общие схемы и утилиты
- `mafia-balagan/` - Веб-интерфейс
- `render.yaml` - Конфигурация для Render

## 🔧 Требования

- Node.js 18+
- PostgreSQL
- Telegram Bot Token

## 📝 Примечания

- В Render используйте план Free для начала
- База данных автоматически создается через render.yaml
- Все переменные окружения генерируются автоматически
- Health check endpoint доступен по `/health`