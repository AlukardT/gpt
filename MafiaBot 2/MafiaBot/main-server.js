const express = require('express');
const path = require('path');
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { app: apiApp, setupWebSocket } = require('./server/api.js');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN_VALUE = process.env.ADMIN_TOKEN || 'admin-secret';
const BOT_INTERNAL_TOKEN = process.env.BOT_TOKEN_INTERNAL || 'bot-secret';

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

    // Базовые обработчики, чтобы бот отвечал
    bot.start(async (ctx) => {
        try {
            // Лёгкая базовая регистрация/обновление профиля
            const userId = ctx.from.id;
            const username = ctx.from.username;
            const firstName = ctx.from.first_name || '';
            const lastName = ctx.from.last_name || '';
            await fetch(`${BASE_URL}/api/players/upsert`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}`
                },
                body: JSON.stringify({ telegramId: userId, username, firstName, lastName })
            }).catch(() => {});
        } catch {}

        const buttons = [[
            Markup.button.callback('📝 Регистрация', 'go_register')
        ], [
            Markup.button.callback('👤 Мой профиль', 'show_profile')
        ], [
            Markup.button.callback('🎭 События', 'show_events')
        ]];
        return ctx.reply('Привет! Я бот клуба Мафии. Выберите действие:', Markup.inlineKeyboard(buttons));
    });

    bot.command('register', (ctx) => ctx.scene.enter('registration'));
    bot.action('go_register', (ctx) => ctx.scene.enter('registration'));

    bot.command('help', (ctx) => ctx.reply('Доступные команды:\n/start — меню\n/register — регистрация'));

    bot.action('show_profile', async (ctx) => {
        try {
            const userId = ctx.from.id;
            const resp = await fetch(`${BASE_URL}/api/players/${userId}`, {
                headers: { 'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}` }
            });
            if (!resp.ok) return ctx.reply('Профиль не найден. Пройдите регистрацию.');
            const data = await resp.json();
            const p = data.profile || data?.ok && data.profile;
            if (!p) return ctx.reply('Профиль не найден.');
            const lines = [
                `👤 Псевдоним: ${p.nickname || '—'}`,
                `Имя: ${p.realName || '—'}`,
                `Telegram: @${ctx.from.username || '—'}`
            ].join('\n');
            await ctx.reply(lines);
        } catch (e) {
            console.error('show_profile error:', e);
            ctx.reply('Ошибка загрузки профиля');
        }
    });

    bot.action('show_events', async (ctx) => {
        try {
            const resp = await fetch(`${BASE_URL}/api/events`, {
                headers: { 'Authorization': `Bearer ${ADMIN_TOKEN_VALUE}` }
            });
            if (!resp.ok) return ctx.reply('Не удалось получить события');
            const data = await resp.json();
            const events = data.events || [];
            if (events.length === 0) return ctx.reply('Событий пока нет');
            const e = events[0];
            await ctx.reply(`Ближайшее событие:\n${e.title}\n${e.date} ${e.time}\n${e.location}`);
        } catch (e) {
            console.error('show_events error:', e);
            ctx.reply('Ошибка загрузки событий');
        }
    });

    bot.action('back_to_menu', async (ctx) => {
        return ctx.reply('Главное меню', Markup.inlineKeyboard([
            [Markup.button.callback('📝 Регистрация', 'go_register')],
            [Markup.button.callback('👤 Мой профиль', 'show_profile')],
            [Markup.button.callback('🎭 События', 'show_events')]
        ]));
    });
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
async function initBot() {
  if (!bot) return;
  try {
    console.log('🤖 Initializing Telegram bot...');

    const webhookDomain = process.env.TELEGRAM_WEBHOOK_DOMAIN; // e.g. mafia-bot-web.onrender.com
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegraf-hook';

    if (webhookDomain) {
      // Webhook mode
      const hookPath = `/telegraf/${webhookSecret}`;
      const hookUrl = `https://${webhookDomain}${hookPath}`;
      await bot.telegram.setWebhook(hookUrl, { drop_pending_updates: true });
      app.use(hookPath, express.json(), (req, res) => bot.webhookCallback(hookPath)(req, res));
      console.log(`🪝 Bot webhook set to ${hookUrl}`);
    } else {
      // Long polling mode
      await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      await bot.launch({ dropPendingUpdates: true });
    }

    // Регистрируем команды для меню Telegram
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Запуск и меню' },
      { command: 'register', description: 'Регистрация' },
      { command: 'help', description: 'Справка' }
    ]).catch((e) => console.warn('⚠️ setMyCommands failed:', e.message));

    // Логирование ошибок
    bot.catch((err, ctx) => {
      console.error('❌ Bot error:', err.message || err, 'on update', ctx?.update?.update_id);
    });

    // Простейший лог входящих сообщений (для отладки)
    bot.on('message', (ctx) => {
      const from = ctx.from ? `${ctx.from.id}${ctx.from.username ? ' @'+ctx.from.username : ''}` : 'unknown';
      console.log(`📨 Message from ${from}:`, ctx.message?.text || ctx.updateType);
    });

    const me = await bot.telegram.getMe();
    console.log(`✅ Telegram bot connected as @${me.username} (id=${me.id})`);
  } catch (err) {
    console.error('❌ Bot initialization failed:', err);
  }
}

initBot();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🔗 Web App URL: ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/` : `http://localhost:${PORT}/`}`);
});

// API endpoints
console.log('🔌 Подключение API модуля...');
app.use(apiApp); // Используем без префикса, так как в api.js уже есть /api
console.log('✅ API модуль подключен к основному серверу');

// Bot status endpoint (для быстрой диагностики)
app.get('/api/bot/status', async (req, res) => {
  if (!bot) return res.json({ ok: false, error: 'BOT_TOKEN not set' });
  try {
    const me = await bot.telegram.getMe();
    const hookInfo = await bot.telegram.getWebhookInfo().catch(() => null);
    return res.json({ ok: true, username: me.username, id: me.id, webhook: hookInfo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/bot/test', async (req, res) => {
  if (!bot) return res.status(400).json({ ok: false, error: 'BOT_TOKEN not set' });
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return res.status(400).json({ ok: false, error: 'ADMIN_TELEGRAM_ID not set' });
  try {
    await bot.telegram.sendMessage(adminId, '✅ Bot test message from server');
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Настройка WebSocket
setupWebSocket(server);

if (bot) {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}