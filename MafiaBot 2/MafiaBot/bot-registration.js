const { Telegraf, Scenes, session, Markup } = require('telegraf');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// Admin user ID and domain configuration.  We read these from environment
// variables so they can be configured on Railway without changing code.
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || '';
const REPLIT_DOMAIN = process.env.REPLIT_DEV_DOMAIN || process.env.WEB_APP_URL || '';

// Простое хранение в памяти для демо
const registeredPlayers = new Map();

// API для отправки в игровое приложение
const fetch = require('node-fetch');
// Base URL for the backend API.  If GAME_API_URL is not provided, fall back
// to the deployed domain (useful in Railway) or localhost during development.
const GAME_API_URL = process.env.GAME_API_URL ||
  (REPLIT_DOMAIN ? `https://${REPLIT_DOMAIN}` : 'http://localhost:5000');
const BOT_TOKEN_INTERNAL = process.env.BOT_TOKEN_INTERNAL || 'bot-secret';

async function upsertInGameApp(profile) {
  try {
    const res = await fetch(`${GAME_API_URL}/api/players/upsert`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${BOT_TOKEN_INTERNAL}` 
      },
      body: JSON.stringify(profile)
    });
    if (!res.ok) {
      console.error(`Game API error: ${res.status} ${res.statusText}`);
    } else {
      console.log('✅ Player profile sent to game app');
    }
  } catch (error) {
    console.error('Error sending to game app:', error.message);
  }
}

// Wizard сцена: ник -> имя -> фото
const regWizard = new Scenes.WizardScene(
  'register',
  async (ctx) => {
    await ctx.reply('Введите псевдоним, который будет виден на столе (например: Марсель).');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) { 
      await ctx.reply('Пожалуйста, отправьте текст (ваш псевдоним).'); 
      return; 
    }
    ctx.wizard.state.nickname = ctx.message.text.trim().slice(0, 40);
    await ctx.reply('Спасибо! Теперь введите ваше настоящее имя (как в жизни).');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message?.text) { 
      await ctx.reply('Пожалуйста, отправьте текст (ваше имя).'); 
      return; 
    }
    ctx.wizard.state.realName = ctx.message.text.trim().slice(0, 60);
    await ctx.reply('Отправьте вашу фотографию (аватар) одним изображением.');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const photos = ctx.message?.photo;
    if (!photos || !photos.length) {
      await ctx.reply('Не вижу фото. Пришлите изображение (не файл, а именно фото).');
      return;
    }
    
    // Берём самое крупное изображение
    const fileId = photos[photos.length - 1].file_id;

    try {
      // Получаем прямую ссылку на файл
      const link = await ctx.telegram.getFileLink(fileId);

      // Сбор профиля
      const profile = {
        telegramId: String(ctx.from.id),
        username: ctx.from.username || null,
        nickname: ctx.wizard.state.nickname,
        realName: ctx.wizard.state.realName,
        avatarUrl: link.href,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Сохраняем локально
      registeredPlayers.set(profile.telegramId, profile);

      // Отправляем в игровое приложение
      await upsertInGameApp(profile);

      await ctx.reply(
        `Готово! 👌\nПсевдоним: ${profile.nickname}\nИмя: ${profile.realName}\nАватар загружен.`,
        Markup.inlineKeyboard([
          Markup.button.callback('Мой профиль', 'my_profile')
        ])
      );

    } catch (error) {
      console.error('Error processing avatar:', error);
      await ctx.reply('Ошибка при обработке фото. Попробуйте ещё раз.');
      return;
    }

    return ctx.scene.leave();
  }
);

const stage = new Scenes.Stage([regWizard]);
bot.use(session());
bot.use(stage.middleware());

// Команды
// /start handler.  Shows registration and profile buttons.  If the current
// user is the admin, also include a button to open the web panel.
bot.start((ctx) => {
  const isAdmin = String(ctx.from.id) === String(ADMIN_ID);
  const buttons = [
    [Markup.button.callback('📝 Регистрация', 'go_register')],
    [Markup.button.callback('👤 Мой профиль', 'my_profile')]
  ];
  if (isAdmin && REPLIT_DOMAIN) {
    const panelUrl = `https://${REPLIT_DOMAIN}/balagan/`;
    buttons.push([Markup.button.webApp('🎮 Веб‑панель', panelUrl)]);
  }
  return ctx.reply('Привет! Я бот клуба Мафии. Нажмите «Регистрация», чтобы создать профиль.',
    Markup.inlineKeyboard(buttons));
});

bot.action('go_register', (ctx) => ctx.scene.enter('register'));

bot.action('my_profile', async (ctx) => {
  const profile = registeredPlayers.get(String(ctx.from.id));
  if (!profile) {
    return ctx.reply('Профиль не найден. Нажмите «Регистрация».');
  }

  try {
    await ctx.replyWithPhoto(profile.avatarUrl, {
      caption: `👤 Псевдоним: ${profile.nickname}\nИмя: ${profile.realName}\nTelegram: @${ctx.from.username || '—'}`
    });
  } catch (error) {
    console.error('Error showing profile photo:', error);
    await ctx.reply(`👤 Псевдоним: ${profile.nickname}\nИмя: ${profile.realName}\nТелеграм: @${ctx.from.username || '—'}\n\n⚠️ Фото недоступно`);
  }
});

// Команда /panel — выдаёт ссылку на веб‑панель ведущему.  Только для администратора.
bot.command('panel', async (ctx) => {
  const isAdmin = String(ctx.from.id) === String(ADMIN_ID);
  if (!isAdmin) {
    return ctx.reply('Команда доступна только ведущему.');
  }
  if (!REPLIT_DOMAIN) {
    return ctx.reply('Домен панели не настроен. Попросите администратора установить переменную REPLIT_DEV_DOMAIN.');
  }
  const panelUrl = `https://${REPLIT_DOMAIN}/balagan/`;
  return ctx.reply('Откройте веб‑панель ведущего:', Markup.inlineKeyboard([
    Markup.button.webApp('🖥 Открыть панель', panelUrl)
  ]));
});

bot.launch();
console.log('🤖 Telegram registration bot started');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));