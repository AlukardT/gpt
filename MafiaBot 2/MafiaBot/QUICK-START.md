# 🚀 Быстрый старт на Render

## ⚡ Развертывание за 5 минут

### 1. Подготовка
```bash
# Перейдите в папку проекта
cd "MafiaBot 2/MafiaBot"

# Запустите скрипт подготовки
./deploy-to-render.sh
```

### 2. Создание Telegram бота
1. Напишите [@BotFather](https://t.me/botfather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям и получите токен
4. Сохраните токен - он понадобится позже

### 3. Развертывание на Render
1. Откройте [Render Dashboard](https://dashboard.render.com)
2. Нажмите **"New +"** → **"Blueprint"**
3. Вставьте URL вашего GitHub/GitLab репозитория
4. Нажмите **"Create New Blueprint Instance"**
5. Дождитесь завершения развертывания (5-10 минут)

### 4. Настройка переменных окружения
После развертывания в настройках веб-сервиса добавьте:
```
BOT_TOKEN = [ваш токен от @BotFather]
ADMIN_TELEGRAM_ID = [ваш Telegram ID]
```

### 5. Проверка работы
- **Health Check**: `https://your-app.onrender.com/health`
- **Веб-интерфейс**: `https://your-app.onrender.com/balagan/`
- **Telegram бот**: Найдите вашего бота и начните чат

## 🔧 Что происходит автоматически

✅ База данных PostgreSQL создается  
✅ Веб-сервер запускается  
✅ API endpoints настраиваются  
✅ WebSocket сервер активируется  
✅ Health check endpoint доступен  

## 📱 Использование

1. **Telegram бот**: Отправьте `/start` вашему боту
2. **Веб-интерфейс**: Откройте в браузере
3. **API**: Доступен по базовому URL

## 🆘 Если что-то пошло не так

1. Проверьте логи в Render Dashboard
2. Убедитесь, что все переменные окружения настроены
3. Проверьте, что база данных подключена
4. Убедитесь, что порт 10000 доступен

## 📞 Поддержка

- Render Docs: [docs.render.com](https://docs.render.com)
- Telegram Bot API: [core.telegram.org/bots](https://core.telegram.org/bots)
- Node.js: [nodejs.org](https://nodejs.org)