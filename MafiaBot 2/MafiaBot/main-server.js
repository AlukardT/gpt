const express = require('express');
const path = require('path');
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const { app: apiApp, setupWebSocket } = require('./server/api.js');
require('dotenv').config();

// ===== ENV =====
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN_VALUE = process.env.ADMIN_TOKEN || 'admin-secret';
const BOT_INTERNAL_TOKEN = process.env.BOT_TOKEN_INTERNAL || 'bot-secret';
const BOT_TOKEN = process.env.BOT_TOKEN;

// ====== WIZARD: Регистрация ======
const registrationWizard = new Scenes.WizardScene(
  'registration',
  async (ctx) => {
    await ctx.reply('📝 Введите псевдоним, под которым будете играть:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('❌ Пожалуйста, отправьте текст (ваш псевдоним).');
      return;
    }
    const nickname = ctx.message.text.trim().slice(0, 30);
    if (nickname.length < 2) {
      await ctx.reply('❌ Минимум 2 символа. Попробуйте снова:');
      return;
    }
    ctx.wizard.state.nickname = nickname;
    await ctx.reply('👤 Теперь введите ваше настоящее имя:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('❌ Пожалуйста, отправьте текст (ваше имя).');
      return;
    }
    const realName = ctx.message.text.trim().slice(0, 50);
    if (realName.length < 2) {
      await ctx.reply('❌ Минимум 2 символа. Попробуйте снова:');
      return;
    }
    ctx.wizard.state.realName = realName;
    await ctx.reply('📸 Отправьте вашу фотографию (как «фото», не как «файл»).');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const photos = ctx.message?.photo;
    if (!photos || !photos.length) {
      await ctx.reply('❌ Не вижу фото. Пришлите именно фото.');
      return;
    }
    try {
      const photo = photos[photos.length - 1];
      const fileId = photo.file_id;
      const fileLink = await ctx.telegram.getFileLink(fileId);

      const userId = ctx.from.id;
      const username = ctx.from.username || null;
      const firstName = ctx.from.first_name || '';
      const lastName = ctx.from.last_name || '';

      const resp = await fetch(`${BASE_URL}/api/players/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}`
        },
        body: JSON.stringify({
          telegramId: userId,
          username,
          firstName,
          lastName,
          nickname: ctx.wizard.state.nickname,
          realName: ctx.wizard.state.realName,
          avatarUrl: fileLink.href
        })
      });

      if (resp.ok) {
        const kb = Markup.inlineKeyboard([
          [Markup.button.callback('👤 Мой профиль', 'show_profile')],
          [Markup.button.callback('🎭 События', 'show_events')],
          [Markup.button.callback('🔙 Главное меню', 'back_to_menu')]
        ]);
        await ctx.reply(
          `🎉 Регистрация завершена!\n\n` +
          `🏷️ Псевдоним: ${ctx.wizard.state.nickname}\n` +
          `👤 Имя: ${ctx.wizard.state.realName}\n` +
          `📸 Аватар загружен`,
          kb
        );
      } else {
        await ctx.reply('❌ Ошибка при сохранении регистрации. Попробуйте позже.');
      }
    } catch (e) {
      console.error('Ошибка регистрации:', e);
      await ctx.reply('❌ Ошибка при обработке фото. Попробуйте ещё раз.');
      return;
    }
    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([registrationWizard]);

// ====== Express ======
const app = express();
app.use(express.json());

// Логи окружения для проверки
console.log('🔄 Starting main server with API integration...');
console.log('🔑 Bot token exists:', !!process.env.BOT_TOKEN);
console.log('👤 Admin ID exists:', !!process.env.ADMIN_TELEGRAM_ID);
console.log('👑 Admin ID value:', process.env.ADMIN_TELEGRAM_ID);

// Статика и главная
app.use('/balagan', express.static(path.join(__dirname, 'mafia-balagan')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Спец-эндпоинт для получения профилей пачкой
app.post('/api/players/profiles', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'userIds array required' });
    }
    const { db } = require('./server/db.js');
    const { userProfiles } = require('./shared/schema.js');
    const { inArray } = require('drizzle-orm');
    const users = await db
      .select()
      .from(userProfiles)
      .where(inArray(userProfiles.id, userIds.map(String)));
    res.json({ ok: true, profiles: users });
  } catch (error) {
    console.error('❌ Ошибка получения профилей:', error);
    res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// ====== Подключаем API-модуль ======
console.log('🔌 Подключение API модуля...');
app.use(apiApp);
console.log('✅ API модуль подключен к основному серверу');

// ====== Telegram Bot ======
let bot = null;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  bot.use(session());
  bot.use(stage.middleware());

  // Базовые обработчики, чтобы бот отвечал
  bot.start(async (ctx) => {
    try {
      // Лёгкая upsert регистрации
      const userId = ctx.from.id;
      const username = ctx.from.username || null;
      const firstName = ctx.from.first_name || '';
      const lastName = ctx.from.last_name || '';
      fetch(`${BASE_URL}/api/players/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}`
        },
        body: JSON.stringify({ telegramId: userId, username, firstName, lastName })
      }).catch(() => {});
    } catch {}

    const welcomeText = `🍷 Добро пожаловать в клуб "Наша мафия" 🎭\n\n` +
      `Здесь мы собираемся, чтобы весело провести время за любимой игрой, вкусной едой и в компании приятных людей.\n\n` +
      `📅 Как всё устроено:\n` +
      `1️⃣ Запишись на ближайшую игру.\n` +
      `2️⃣ Приходи в уютное место, где тебя ждёт атмосфера тепла и дружбы.\n` +
      `3️⃣ Получи свою роль и погрузись в увлекательный сюжет.\n` +
      `4️⃣ Наслаждайся смехом, эмоциями и неожиданными поворотами партии.\n\n` +
      `✨ Почему тебе понравится:\n` +
      ` • Дружелюбная компания и новые знакомства.\n` +
      ` • Красивое место с вкусной кухней.\n` +
      ` • Лёгкая, ненапряжная атмосфера.\n` +
      ` • Яркие впечатления, которые запомнятся.\n\n` +
      `💌 Жми кнопку "Записаться на игру" и бронируй своё место за столом!`;

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('👤 Мой профиль', 'show_profile')],
      [Markup.button.callback('📝 Записаться на игру', 'show_events')]
    ]);

    const img = process.env.WELCOME_IMAGE_URL;
    if (img) {
      try {
        await ctx.replyWithPhoto(img, { caption: welcomeText });
        return ctx.reply('Выберите действие:', kb);
      } catch {
        // Fallback на текст
        return ctx.reply(welcomeText, kb);
      }
    } else {
      return ctx.reply(welcomeText, kb);
    }
  });

  bot.command('register', (ctx) => ctx.scene.enter('registration'));
  bot.command('help', (ctx) => ctx.reply('Доступные команды:\n/start — меню\n/register — регистрация'));

  // Убираем кнопку/экшен регистрации из инлайн-меню — регистрация только командой
  // bot.action('go_register', (ctx) => ctx.scene.enter('registration'));

  bot.action('show_profile', async (ctx) => {
    try {
      const userId = ctx.from.id;
      const resp = await fetch(`${BASE_URL}/api/players/${userId}`, {
        headers: { 'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}` }
      });
      if (!resp.ok) return ctx.reply('Профиль не найден. Отправьте /register для регистрации.');
      const data = await resp.json();
      const p = data.profile || (data.ok && data.profile);
      if (!p) return ctx.reply('Профиль не найден. Отправьте /register для регистрации.');
      const caption = [
        `👤 Псевдоним: ${p.nickname || '—'}`,
        `🎮 Игр сыграно: ${p.gamesPlayed ?? 0}`
      ].join('\n');
      if (p.avatarUrl) {
        try {
          await ctx.replyWithPhoto(p.avatarUrl, { caption });
          return;
        } catch (e) {
          console.warn('Avatar send failed, fallback to text:', e.message);
        }
      }
      await ctx.reply(caption);
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

  // Инициализация бота с webhook или polling
  async function initBot() {
    try {
      console.log('🤖 Initializing Telegram bot...');

      const webhookDomain = process.env.TELEGRAM_WEBHOOK_DOMAIN; // e.g. mafia-bot-web.onrender.com
      const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegraf-hook';

      if (webhookDomain) {
        // Webhook mode
        const hookPath = `/telegraf/${webhookSecret}`;
        const hookUrl = `https://${webhookDomain}${hookPath}`;
        await bot.telegram.setWebhook(hookUrl, { secret_token: webhookSecret, drop_pending_updates: true });
        app.use(hookPath, express.json(), (req, res) => bot.webhookCallback(hookPath, { secretToken: webhookSecret })(req, res));
        console.log(`🪝 Bot webhook set to ${hookUrl}`);
      } else {
        // Long polling mode
        await bot.telegram.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
        await bot.launch({ dropPendingUpdates: true });
      }

      // Команды для меню Telegram
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Запуск и меню' },
        { command: 'register', description: 'Регистрация' },
        { command: 'help', description: 'Справка' }
      ]).catch((e) => console.warn('⚠️ setMyCommands failed:', e.message));

      // Логирование ошибок и входящих сообщений
      bot.catch((err, ctx) => {
        console.error('❌ Bot error:', err.message || err, 'on update', ctx?.update?.update_id);
      });
      bot.on('message', (ctx) => {
        const from = ctx.from ? `${ctx.from.id}${ctx.from.username ? ' @' + ctx.from.username : ''}` : 'unknown';
        console.log(`📨 Message from ${from}:`, ctx.message?.text || ctx.updateType);
      });

      const me = await bot.telegram.getMe();
      console.log(`✅ Telegram bot connected as @${me.username} (id=${me.id})`);
    } catch (err) {
      console.error('❌ Bot initialization failed:', err);
    }
  }
  initBot();

  // SIG
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.warn('⚠️ BOT_TOKEN is not set. Telegram bot is disabled.');
}

// ====== Bot status/test endpoints ======
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

// ====== Server listen ======
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🔗 Web App URL: http://localhost:${PORT}/`);
});

// ====== WebSocket (заглушка) ======
setupWebSocket(server);