import { Telegraf, Markup, session } from 'telegraf';
import dotenv from 'dotenv';
import { stateStore } from './game-engine/stateStore.js';

dotenv.config();

let botInstance = null;

const adminId = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;

function isAdmin(userId) {
	return adminId && Number(userId) === adminId;
}

export async function ensureBot(app) {
	if (botInstance) return botInstance;
	const token = process.env.BOT_TOKEN;
	if (!token) {
		console.warn('[bot] BOT_TOKEN not set, bot disabled');
		return null;
	}
	const bot = new Telegraf(token);
	botInstance = bot;

	bot.use(session());

	bot.start(async (ctx) => {
		const firstName = ctx.from.first_name || 'друг';
		await ctx.reply(`Привет, ${firstName}! Я бот игры «Наша мафия».`, Markup.keyboard([
			['Афиша', 'Записаться'],
			['Мой профиль', 'Регистрация']
		]).resize());
	});

	bot.hears('Афиша', async (ctx) => {
		const event = await stateStore.getNextEvent();
		if (!event) return ctx.reply('Ближайший ивент не найден.');
		const count = event.registrations?.length || 0;
		await ctx.reply(`Ивент: ${event.title}\nКогда: ${new Date(event.startsAt).toLocaleString()}\nЗаписано: ${count}`,
			Markup.inlineKeyboard([
				[Markup.button.callback('Посмотреть игроков', `event_players:${event.id}`)],
				[Markup.button.callback('Записаться (я)', `signup:1:${event.id}`), Markup.button.callback('+1', `signup:2:${event.id}`), Markup.button.callback('+2', `signup:3:${event.id}`), Markup.button.callback('+3', `signup:4:${event.id}`)],
				[Markup.button.callback('Отменить запись', `cancel_signup:${event.id}`)]
			]));
	});

	bot.hears('Записаться', async (ctx) => {
		const event = await stateStore.getNextEvent();
		if (!event) return ctx.reply('Нет активных ивентов');
		await ctx.reply('Сколько мест записать?', Markup.inlineKeyboard([
			[Markup.button.callback('Я', `signup:1:${event.id}`), Markup.button.callback('+1', `signup:2:${event.id}`), Markup.button.callback('+2', `signup:3:${event.id}`), Markup.button.callback('+3', `signup:4:${event.id}`)]
		]));
	});

	bot.action(/event_players:(.+)/, async (ctx) => {
		const eventId = ctx.match[1];
		const event = await stateStore.getEventById(eventId);
		if (!event) return ctx.answerCbQuery('Ивент не найден');
		const list = (event.registrations || []).map((r, i) => `${i + 1}. ${r.username || r.firstName || r.userId}`).join('\n') || 'Пока никого';
		await ctx.reply(`Список записанных:\n${list}`);
		await ctx.answerCbQuery();
	});

	bot.action(/signup:(\d+):(.+)/, async (ctx) => {
		const count = Number(ctx.match[1]);
		const eventId = ctx.match[2];
		const user = ctx.from;
		const profile = await stateStore.getOrCreateProfile({ userId: user.id, username: user.username, firstName: user.first_name });
		await stateStore.signupForEvent(eventId, profile, count);
		await ctx.reply('Запись обновлена. До встречи на игре!');
		await ctx.answerCbQuery('Записаны');
	});

	bot.action(/cancel_signup:(.+)/, async (ctx) => {
		const eventId = ctx.match[1];
		await stateStore.cancelSignup(eventId, ctx.from.id);
		await ctx.reply('Запись отменена.');
		await ctx.answerCbQuery('Готово');
	});

	bot.hears('Мой профиль', async (ctx) => {
		const profile = await stateStore.getOrCreateProfile({ userId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name });
		await ctx.reply(`Профиль:\nНик: @${profile.username || '-'}\nИмя: ${profile.firstName || '-'}\nПобед: ${profile.wins || 0}`);
	});

	// Простейшая регистрация: ник, имя. Фото опционально
	bot.hears('Регистрация', async (ctx) => {
		ctx.session = ctx.session || {};
		ctx.session.step = 'name';
		await ctx.reply('Отправьте ваше имя (текстом):');
	});

	bot.on('text', async (ctx, next) => {
		ctx.session = ctx.session || {};
		if (ctx.session.step === 'name') {
			const firstName = ctx.message.text.trim();
			ctx.session.step = 'username';
			ctx.session.firstName = firstName;
			return ctx.reply('Отправьте ваш ник (без @):');
		}
		if (ctx.session.step === 'username') {
			const username = ctx.message.text.trim().replace(/^@/, '');
			const profile = await stateStore.getOrCreateProfile({ userId: ctx.from.id });
			profile.firstName = ctx.session.firstName;
			profile.username = username;
			await stateStore.saveProfile(profile);
			ctx.session = {};
			return ctx.reply('Профиль сохранён!');
		}
		return next();
	});

	// Admin commands
	bot.command('create_event', async (ctx) => {
		if (!isAdmin(ctx.from.id)) return ctx.reply('Недостаточно прав');
		const text = ctx.message.text.split(' ').slice(1).join(' ');
		const title = text || `Игра ${new Date().toLocaleDateString()}`;
		const startsAt = Date.now() + 24 * 3600 * 1000;
		const event = await stateStore.createEvent({ title, startsAt });
		await ctx.reply(`Создан ивент: ${event.title} (id: ${event.id})`);
	});

	bot.command('start_game', async (ctx) => {
		if (!isAdmin(ctx.from.id)) return ctx.reply('Недостаточно прав');
		const parts = ctx.message.text.trim().split(/\s+/);
		const id = parts[1];
		const session = await stateStore.startSessionFromEvent(id);
		if (!session) return ctx.reply('Не удалось стартовать игру');
		await ctx.reply(`Игра запущена. Игроков за столом: ${session.players.length}`);
	});

	bot.command('send_roles', async (ctx) => {
		if (!isAdmin(ctx.from.id)) return ctx.reply('Недостаточно прав');
		const session = await stateStore.loadLatestSession();
		if (!session) return ctx.reply('Нет активной сессии');
		for (const p of session.players) {
			if (!p.telegramId || !p.role) continue;
			const roleText = p.role;
			try {
				await bot.telegram.sendMessage(p.telegramId, `Ваша роль: ${roleText}`);
			} catch (e) {
				console.warn('send role failed for', p.telegramId, e.message);
			}
		}
		await ctx.reply('Роли разосланы.');
	});

	const shouldLaunch = true;
	if (shouldLaunch) {
		await bot.launch();
	}

	process.once('SIGINT', () => bot.stop('SIGINT'));
	process.once('SIGTERM', () => bot.stop('SIGTERM'));

	return bot;
}