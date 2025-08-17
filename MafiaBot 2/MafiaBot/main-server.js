const express = require('express');
const path = require('path');
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { app: apiApp, setupWebSocket } = require('./server/api.js');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Создаем wizard сцену для регистрации
const registrationWizard = new Scenes.WizardScene(
    'registration',
    // Шаг 1: Запрос псевдонима
    async (ctx) => {
        ctx.reply('📝 Давайте зарегистрируем ваш профиль!\n\n🏷️ Введите псевдонимь1ьь1]-/-/3{4, под которым вы будете играть в Мафию:');
        return ctx.wizard.next();
    },
    // Шаг 2: Запрос настоящего имени
    async (ctx) => {
        if (!ctx.message?.text) {
            ctx.reply('❌ Пожалуйста, введите текст (ваш псевдоним)');
            return;
        }
        
        const nickname = ctx.message.text.trim().slice(0, 30);
        if (nickname.length < 2) {
            ctx.reply('❌ Псевдоним должен содержать минимум 2 символа. Попробуйте еще раз:');
            return;
        }
        
        ctx.wizard.state.nickname = nickname;
        ctx.reply(`✅ Псевдоним: "${nickname}"\n\n👤 Теперь введите ваше настоящее имя:`);
        return ctx.wizard.next();
    },
    // Шаг 3: Запрос фотографии
    async (ctx) => {
        if (!ctx.message?.text) {
            ctx.reply('❌ Пожалуйста, введите текст (ваше имя)');
            return;
        }
        
        const realName = ctx.message.text.trim().slice(0, 50);
        if (realName.length < 2) {
            ctx.reply('❌ Имя должно содержать минимум 2 символа. Попробуйте еще раз:');
            return;
        }
        
        ctx.wizard.state.realName = realName;
        ctx.reply(`✅ Имя: "${realName}"\n\n📸 Теперь отправьте вашу фотографию для аватара:`);
        return ctx.wizard.next();
    },
    // Шаг 4: Обработка фотографии и завершение регистрации
    async (ctx) => {
        const photos = ctx.message?.photo;
        if (!photos || !photos.length) {
            ctx.reply('❌ Не вижу фотографию. Пришлите изображение (не файл, а именно фото):');
            return;
        }
        
        try {
            // Берем самое большое изображение
            const photo = photos[photos.length - 1];
            const fileId = photo.file_id;
            console.log(`📸 Обработка файла с ID: ${fileId}`);
            
            // Получаем URL файла для более надежного хранения
            const fileLink = await ctx.telegram.getFileLink(fileId);
            console.log(`🔗 Получена ссылка на файл: ${fileLink.href}`);
            
            // Сохраняем полную регистрацию в базе данных
            const userId = ctx.from.id;
            const username = ctx.from.username;
            const firstName = ctx.from.first_name || '';
            const lastName = ctx.from.last_name || '';
            
            const response = await fetch(`${BASE_URL}/api/players/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer bot-secret'
                },
                body: JSON.stringify({
                    telegramId: userId,
                    username: username,
                    firstName: firstName,
                    lastName: lastName,
                    nickname: ctx.wizard.state.nickname,
                    realName: ctx.wizard.state.realName,
                    avatarUrl: fileLink.href // Сохраняем URL для надежности
                })
            });
            
            if (response.ok) {
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('👤 Мой профиль', 'show_profile')],
                    [Markup.button.callback('🎭 События', 'show_events')],
                    [Markup.button.callback('🔙 Главное меню', 'back_to_menu')]
                ]);
                
                ctx.reply(
                    `🎉 Регистрация завершена!\n\n` +
                    `🏷️ Псевдоним: ${ctx.wizard.state.nickname}\n` +
                    `👤 Имя: ${ctx.wizard.state.realName}\n` +
                    `📸 Аватар загружен\n\n` +
                    `✅ Теперь вы можете участвовать в играх Мафия!`,
                    keyboard
                );
                
                console.log(`✅ Пользователь ${username} (${userId}) завершил полную регистрацию`);
            } else {
                ctx.reply('❌ Ошибка при сохранении регистрации. Попробуйте позже.');
            }
            
        } catch (error) {
            console.error('Ошибка обработки аватара:', error);
            ctx.reply('❌ Ошибка при загрузке фотографии. Попробуйте еще раз.');
            return;
        }
        
        return ctx.scene.leave();
    }
);

// Создаем stage для сцен
const stage = new Scenes.Stage([registrationWizard]);

// Initialize bot with token from environment variables and middleware
const BOT_TOKEN = process.env.BOT_TOKEN;
let bot = null;
if (BOT_TOKEN) {
    bot = new Telegraf(BOT_TOKEN);
    bot.use(session());
    bot.use(stage.middleware());
} else {
    console.warn('⚠️ BOT_TOKEN is not set. Telegram bot is disabled.');
}

// Initialize Express app for web server  
const app = express();
// PORT уже определен выше

// Проверка переменных окружения
console.log('🔄 Starting main server with API integration...');
console.log('🔑 Bot token exists:', !!process.env.BOT_TOKEN);
console.log('👤 Admin ID exists:', !!process.env.ADMIN_TELEGRAM_ID);
console.log('👑 Admin ID value:', process.env.ADMIN_TELEGRAM_ID);

// Добавляем express.json middleware для обработки JSON запросов
app.use(express.json());

// Удалены локальные дубли API (/api/players/register, /api/players/:id, /api/events, /api/events GET, /api/events/:eventId/registrations)

// Оставляем специальный endpoint, которого нет в server/api.js
// API endpoint для получения профилей игроков по их Telegram ID
app.post('/api/players/profiles', async (req, res) => {
    try {
        const { userIds } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ ok: false, error: 'userIds array required' });
        }
        const { db } = require('./server/db.js');
        const { userProfiles } = require('./shared/schema.js');
        const { inArray } = require('drizzle-orm');
        const users = await db.select().from(userProfiles).where(inArray(userProfiles.id, userIds.map(String)));
        res.json({ ok: true, profiles: users });
    } catch (error) {
        console.error('❌ Ошибка получения профилей:', error);
        res.status(500).json({ ok: false, error: 'Database error' });
    }
});

// Подключение статических файлов и фронтенда
app.use('/balagan', express.static(path.join(__dirname, 'mafia-balagan')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск бота (только если задан токен) — удаляем вебхук на всякий случай и используем long polling
if (bot) {
    bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
    bot.launch({ dropPendingUpdates: true })
      .then(() => console.log('✅ Telegram bot connected successfully!'))
      .catch(err => console.error('❌ Bot connection failed:', err));
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🔗 Web App URL: ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/` : `http://localhost:${PORT}/`}`);
});

// API endpoints
console.log('🔌 Подключение API модуля...');
app.use(apiApp); // Используем без префикса, так как в api.js уже есть /api
console.log('✅ API модуль подключен к основному серверу');

// Настройка WebSocket
setupWebSocket(server);

if (bot) {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}