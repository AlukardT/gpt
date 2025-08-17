const express = require('express');
const path = require('path');
const { Telegraf, Markup, Scenes, session, Input } = require('telegraf');
const { app: apiApp, setupWebSocket } = require('./server/api.js');
require('dotenv').config();

// ===== ENV =====
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_TOKEN_VALUE = process.env.ADMIN_TOKEN || 'admin-secret';
const BOT_INTERNAL_TOKEN = process.env.BOT_TOKEN_INTERNAL || 'bot-secret';
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || null; // e.g. https://mafia-bot-web.onrender.com

function publicUrl(p) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.TELEGRAM_WEBHOOK_DOMAIN ? `https://${process.env.TELEGRAM_WEBHOOK_DOMAIN}` : null);
  if (base) return `${base}${p}`;
  return `http://localhost:${PORT}${p}`;
}

function assetUrl(filename) {
  return publicUrl('/assets/' + encodeURIComponent(filename));
}

function assetPath(filename) {
  return path.join(__dirname, 'assets', filename);
}

// Картинки ролей (ключи как в игре: lover, maniac, kamikaze, ...)
const ROLE_IMAGE_NAMES = {
  lover: ':role_lubovnitsa.PNG',
  maniac: ':role_manyak.PNG',
  kamikaze: ':role_Kamikadze.PNG'
};

function getRoleImage(roleKey) {
  const name = ROLE_IMAGE_NAMES[roleKey];
  return name ? assetUrl(name) : null;
}

function getRoleImagePath(roleKey) {
  const name = ROLE_IMAGE_NAMES[roleKey];
  return name ? assetPath(name) : null;
}

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
      // Сохраняем именно file_id, чтобы не истекал (URL Telegram краткоживущий)

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
          avatarUrl: `file_id:${fileId}`
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
          `${ctx.wizard.state.nickname}\n` +
          `${ctx.wizard.state.realName}\n` +
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
app.use('/assets', express.static(path.join(__dirname, 'assets')));
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
      [Markup.button.callback('🎭 Афиши', 'show_events')]
    ]);

    const img = process.env.WELCOME_IMAGE_URL || assetUrl('Welcome.JPG') || assetUrl('welcome.jpg');
    if (img) {
      try {
        await ctx.replyWithPhoto(img, { caption: welcomeText, ...kb });
        return;
      } catch {
        try {
          await ctx.replyWithPhoto(Input.fromLocalFile(assetPath('Welcome.JPG')), { caption: welcomeText, ...kb });
          return;
        } catch {
          // Fallback на текст
          return ctx.reply(welcomeText, kb);
        }
      }
    } else {
      return ctx.reply(welcomeText, kb);
    }
  });

  bot.command('register', (ctx) => ctx.scene.enter('registration'));
  bot.command('help', (ctx) => ctx.reply('Доступные команды:\n/start — меню\n/register — регистрация\n/create_event — создать событие (только админ)'));

  // Быстрый тест картинок ролей: /role_test <role>
  bot.command('role_test', async (ctx) => {
    const parts = (ctx.message?.text || '').trim().split(/\s+/);
    const key = (parts[1] || '').toLowerCase();
    if (!key) return ctx.reply('Использование: /role_test <lover|maniac|kamikaze>');
    const url = getRoleImage(key);
    if (!url) return ctx.reply(`Картинка для роли "${key}" не найдена.`);
    try {
      await ctx.replyWithPhoto(url, { caption: `Роль: ${key}` });
    } catch (e) {
      console.warn('role_test URL failed, falling back to local file:', e.message);
      try {
        const filePath = getRoleImagePath(key);
        if (!filePath) return ctx.reply('Локальный файл изображения не найден.');
        await ctx.replyWithPhoto(Input.fromLocalFile(filePath), { caption: `Роль: ${key}` });
      } catch (e2) {
        console.error('role_test local fallback error:', e2);
        ctx.reply('Не удалось отправить изображение. Проверьте доступность файла.');
      }
    }
  });

  // Команда создания события (только админ)
  bot.command('create_event', async (ctx) => {
    try {
      const adminId = String(process.env.ADMIN_TELEGRAM_ID || '');
      const fromId = String(ctx.from?.id || '');
      if (!adminId || fromId !== adminId) {
        return ctx.reply('Команда доступна только администратору.');
      }
      const lines = (ctx.message?.text || '').split('\n').slice(1).map(s => s.trim()).filter(Boolean);
      // Ожидаем 5 строк: title, location, address, date, time
      if (lines.length < 5) {
        return ctx.reply('Формат:\n/create_event\nНазвание\nЛокация\nАдрес\nYYYY-MM-DD\nHH:MM');
      }
      let [title, location, address, dateStr, timeStr] = lines;
      // Убираем возможные префиксы
      const stripPref = (s) => s.replace(/^\s*(Локация:|Адрес:|Дата:|Время:)\s*/i, '').trim();
      location = stripPref(location);
      address = stripPref(address);
      dateStr = stripPref(dateStr);
      timeStr = stripPref(timeStr);

      // Валидируем дату и время
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return ctx.reply('Дата должна быть в формате YYYY-MM-DD');
      }
      if (!/^\d{2}:\d{2}$/.test(timeStr)) {
        return ctx.reply('Время должно быть в формате HH:MM');
      }
      const dateIso = `${dateStr}T${timeStr}:00.000Z`;

      const resp = await fetch(`${BASE_URL}/api/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ADMIN_TOKEN_VALUE}`
        },
        body: JSON.stringify({ title, location, address, dateIso, capacity: 12 })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) {
        return ctx.reply('❌ Ошибка создания события');
      }
      return ctx.reply(`✅ Событие создано (#${data.id})\n${title}\n${dateStr} ${timeStr}\n${location}`);
    } catch (e) {
      console.error('create_event error:', e);
      return ctx.reply('❌ Ошибка обработки команды');
    }
  });

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
      const caption = `${p.nickname || p.username || '—'}`;

      let sent = false;
      if (p.avatarUrl) {
        try {
          if (String(p.avatarUrl).startsWith('file_id:')) {
            const fid = String(p.avatarUrl).slice('file_id:'.length);
            await ctx.replyWithPhoto(fid, { caption });
          } else {
            await ctx.replyWithPhoto(p.avatarUrl, { caption });
          }
          sent = true;
        } catch (e) {
          console.warn('Avatar send failed, try Telegram photo:', e.message);
        }
      }

      if (!sent) {
        try {
          const photos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
          if (photos?.total_count > 0) {
            const sizes = photos.photos[0];
            const best = sizes[sizes.length - 1];
            const link = await ctx.telegram.getFileLink(best.file_id);
            await ctx.replyWithPhoto(link.href, { caption });
            sent = true;
          }
        } catch (e) {
          console.warn('Telegram profile photo not available:', e.message);
        }
      }

      if (!sent) {
        await ctx.reply(caption);
      }
    } catch (e) {
      console.error('show_profile error:', e);
      ctx.reply('Ошибка загрузки профиля');
    }
  });

  // ===== Helpers for Events UI =====
  async function fetchEventsList() {
    const resp = await fetch(`${BASE_URL}/api/events`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN_VALUE}` }
    });
    if (!resp.ok) throw new Error('events fetch failed');
    const data = await resp.json();
    return data.events || [];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildEventCaption(e) {
    return (
      `${e.title || ''}\n\n` +
      `Локация: ${e.location || '—'}\n` +
      `Адрес: ${e.address || '—'}\n` +
      `Дата: ${e.date || '—'}\n` +
      `Время: ${e.time || '—'}`
    );
  }

  async function getRegistrationsCount(eventId) {
    const resp = await fetch(`${BASE_URL}/api/events/${eventId}/registrations`, {
      headers: { 'Authorization': `Bearer ${ADMIN_TOKEN_VALUE}` }
    });
    if (!resp.ok) return { total: 0, regs: [] };
    const data = await resp.json();
    const regs = data.registrations || [];
    const total = regs.reduce((sum, r) => sum + (r.playerCount || 1), 0);
    return { total, regs };
  }

  function buildEventsKeyboard(e, count) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🎟 Записаться на игру', `event_register:${e.id}`)],
      [Markup.button.callback(`👥 Игроки ${count}/${e.capacity}`, `event_players:${e.id}`)],
      [
        Markup.button.callback('⬅️ Назад', 'back_to_menu'),
        Markup.button.callback('➡️ Дальше', 'event_next')
      ]
    ]);
  }

  async function renderEventCard(ctx, index) {
    const evState = ctx.session.events || { list: [], index: 0 };
    const list = evState.list || [];
    if (!list.length) return ctx.reply('Событий пока нет');
    const i = ((index % list.length) + list.length) % list.length; // safe modulo
    evState.index = i;
    ctx.session.events = evState;
    const e = list[i];
    const { total } = await getRegistrationsCount(e.id);
    const caption = buildEventCaption(e);
    const poster = process.env.EVENT_POSTER_URL || assetUrl('Event.PNG') || assetUrl('posters/default.jpg');
    const kb = buildEventsKeyboard(e, total);
    try {
      await ctx.replyWithPhoto(poster, { caption, ...kb });
    } catch {
      try {
        await ctx.replyWithPhoto(Input.fromLocalFile(assetPath('Event.PNG')), { caption, ...kb });
      } catch {
        await ctx.reply(caption, kb);
      }
    }
  }

  bot.action('show_events', async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      const list = await fetchEventsList();
      ctx.session.events = { list, index: 0 };
      if (!list.length) return ctx.reply('Событий пока нет');
      await renderEventCard(ctx, 0);
    } catch (e) {
      console.error('show_events error:', e);
      ctx.reply('Ошибка загрузки событий');
    }
  });

  bot.action('event_next', async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      const evState = ctx.session.events || { list: [], index: 0 };
      if (!evState.list.length) return ctx.reply('Событий пока нет');
      await renderEventCard(ctx, (evState.index || 0) + 1);
    } catch (e) {
      console.error('event_next error:', e);
      ctx.reply('Ошибка переключения события');
    }
  });

  bot.action(/^event_register:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      const eventId = Number(ctx.match[1]);
      const body = { userId: ctx.from.id, username: ctx.from.username || null, playerCount: 1 };
      const resp = await fetch(`${BASE_URL}/api/events/${eventId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}`
        },
        body: JSON.stringify(body)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.ok) return ctx.reply('❌ Не удалось записаться на игру');
      const evState = ctx.session.events || { list: [], index: 0 };
      const e = evState.list.find(x => x.id === eventId);
      const capacity = e?.capacity || 20;
      await ctx.reply(`✅ Вы записаны. Участников: ${data.count}/${capacity}`);
    } catch (e) {
      console.error('event_register error:', e);
      ctx.reply('Ошибка записи на событие');
    }
  });

  bot.action(/^event_players:(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      const eventId = Number(ctx.match[1]);
      const regsResp = await fetch(`${BASE_URL}/api/events/${eventId}/registrations`, {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN_VALUE}` }
      });
      if (!regsResp.ok) return ctx.reply('Не удалось получить список игроков');
      const regsData = await regsResp.json();
      const regs = regsData.registrations || [];
      if (regs.length === 0) return ctx.reply('Пока никто не записался');

      const userIds = regs.map(r => String(r.userId));
      const profResp = await fetch(`${BASE_URL}/api/players/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BOT_INTERNAL_TOKEN}`
        },
        body: JSON.stringify({ userIds })
      });
      const profData = await profResp.json().catch(() => ({}));
      const profiles = profData.profiles || profData.players || [];
      const byId = Object.fromEntries(profiles.map(p => [String(p.id), p]));

      const lines = regs.map(r => {
        const p = byId[String(r.userId)] || {};
        const nick = p.nickname || p.username || 'Игрок';
        const real = p.realName || [p.firstName, p.lastName].filter(Boolean).join(' ') || '';
        const name = real ? `${nick} (${real})` : nick;
        const href = `tg://user?id=${r.userId}`;
        return `• <a href=\"${escapeHtml(href)}\">${escapeHtml(name)}</a>`;
      });
      await ctx.reply(`<b>Игроки события:</b>\n${lines.join('\n')}`, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) {
      console.error('event_players error:', e);
      ctx.reply('Ошибка получения списка игроков');
    }
  });

  bot.action('back_to_menu', async (ctx) => {
    return ctx.reply('Главное меню', Markup.inlineKeyboard([
      [Markup.button.callback('👤 Мой профиль', 'show_profile')],
      [Markup.button.callback('🎭 Афиши', 'show_events')]
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

// Вернуть URL картинки роли для интеграции фронтенда
app.get('/api/roles/:role/image', (req, res) => {
  const key = String(req.params.role || '').toLowerCase();
  const url = getRoleImage(key);
  if (!url) return res.status(404).json({ ok: false, error: 'not found' });
  return res.json({ ok: true, role: key, url });
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