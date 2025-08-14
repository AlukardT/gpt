import { Telegraf, Markup, session } from 'telegraf';
import dotenv from 'dotenv';
import { stateStore } from './game-engine/stateStore.js';

dotenv.config();

let botInstance = null;

const adminId = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null;

function isAdmin(userId) { return adminId && Number(userId) === adminId; }

function escapeHtml(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function formatEventCard(evt) {
	const d = new Date(evt.startsAt);
	return [
		'🎭 Мафия — ближайшая игра!',
		`📅 Дата: ${d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
		`🕖 Время: ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`,
		`📍 Место: Локация: «${evt.locationTitle || 'Наш Бар'}»`,
		`📍 Адрес: Адрес: ${evt.address || 'Уточняется'}`,
		'',
		'Приходи на захватывающую игру в Мафию!',
		'Погрузись в атмосферу интриг, неожиданных союзов и громких разоблачений.',
		'',
		'💡 Что тебя ждёт:',
		'        • Новые роли и неожиданные повороты сюжета',
		'        • Живое общение и море эмоций',
		'        • Удобный контроль через Telegram',
		'',
		'🎟 Записаться: нажми кнопку "Записаться" ниже.',
		'Количество мест ограничено — успей занять своё место за столом!'
	].join('\n');
}

function mainInlineMenu() {
	return Markup.inlineKeyboard([
		[Markup.button.callback('Афиши', 'menu:afisha'), Markup.button.callback('Профиль', 'menu:profile')]
	]);
}

async function renderEventMessage(ctx, idx = 0) {
	const events = await stateStore.listEventsSorted();
	if (events.length === 0) return ctx.reply('Нет ближайших ивентов.', mainInlineMenu());
	idx = Math.min(Math.max(0, idx), events.length - 1);
	const evt = events[idx];
	const regCount = (evt.registrations || []).reduce((acc, r) => acc + (Number(r.slots) || 1), 0);
	const isRegistered = await stateStore.isUserRegistered(evt.id, ctx.from.id);
	const signBtn = isRegistered ? Markup.button.callback('Отменить запись', `cancel:${evt.id}:${idx}`) : Markup.button.callback('Записаться на игру', `signup:1:${evt.id}:${idx}`);
	const playersBtn = Markup.button.callback(`Игроки (${regCount}/20)`, `players:${evt.id}:${idx}`);
	const nextPrev = [Markup.button.callback('« Назад', `nav:${Math.max(0, idx-1)}`), Markup.button.callback('Вперёд »', `nav:${Math.min(events.length-1, idx+1)}`)];
	await ctx.reply(formatEventCard(evt), Markup.inlineKeyboard([
		[signBtn],
		[nextPrev[0], nextPrev[1]],
		[playersBtn]
	]));
}

export async function ensureBot() {
	if (botInstance) return botInstance;
	const token = process.env.BOT_TOKEN;
	if (!token) {
		console.warn('[bot] BOT_TOKEN not set, bot disabled');
		return null;
	}
	const bot = new Telegraf(token);
	botInstance = bot;
	bot.use(session());

	bot.catch((err) => {
		console.error('[bot] error', err);
	});

	bot.start(async (ctx) => {
		await ctx.reply(' ', Markup.removeKeyboard());
		await ctx.reply(
			'🍷 Добро пожаловать в клуб "Наша мафия" 🎭\n\n' +
			'Здесь мы собираемся, чтобы весело провести время за любимой игрой, вкусной едой и в компании приятных людей.\n\n' +
			'📅 Как всё устроено:\n' +
			'1️⃣ Запишись на ближайшую игру.\n' +
			'2️⃣ Приходи в уютное место, где тебя ждёт атмосфера тепла и дружбы.\n' +
			'3️⃣ Получи свою роль и погрузись в увлекательный сюжет.\n' +
			'4️⃣ Наслаждайся смехом, эмоциями и неожиданными поворотами партии.\n\n' +
			'✨ Почему тебе понравится:\n' +
			' • Дружелюбная компания и новые знакомства.\n' +
			' • Красивое место с вкусной кухней.\n' +
			' • Лёгкая, ненапряжная атмосфера.\n' +
			' • Яркие впечатления, которые запомнятся.\n\n' +
			'💌 Жми кнопку "Записаться на игру" и бронируй своё место за столом!',
			mainInlineMenu()
		);
	});

	bot.action('menu:afisha', async (ctx) => { await ctx.answerCbQuery(); return renderEventMessage(ctx, 0); });
	bot.action('menu:profile', async (ctx) => {
		await ctx.answerCbQuery();
		const profile = await stateStore.getOrCreateProfile({ userId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name });
		const name = profile.nickname || profile.username || '-';
		await ctx.reply(`Профиль:\nПсевдоним: ${name}\nИмя: ${profile.realName || profile.firstName || '-'}\nПобед: ${profile.wins || 0}`);
	});

	bot.action(/nav:(\d+)/, async (ctx) => {
		await ctx.answerCbQuery();
		const idx = Number(ctx.match[1]);
		await renderEventMessage(ctx, idx);
	});

	bot.action(/players:([^:]+):(\d+)/, async (ctx) => {
		const eventId = ctx.match[1];
		const idx = Number(ctx.match[2]);
		const evt = await stateStore.getEventById(eventId);
		if (!evt) return ctx.answerCbQuery('Ивент не найден');
		const lines = (evt.registrations || []).map(r => {
			const profileLink = r.username ? `https://t.me/${r.username}` : null;
			const display = `${r.username ? '@'+r.username : (r.firstName||r.userId)} (${r.firstName||''})`;
			return profileLink ? `<a href="${escapeHtml(profileLink)}">${escapeHtml(display)}</a>` : escapeHtml(display);
		});
		await ctx.replyWithHTML(lines.length ? lines.join('<br/>') : 'Пока никого');
		await ctx.answerCbQuery();
	});

	bot.action(/signup:(\d+):([^:]+):(\d+)/, async (ctx) => {
		const count = Number(ctx.match[1]);
		const eventId = ctx.match[2];
		const idx = Number(ctx.match[3]);
		const user = ctx.from;
		const profile = await stateStore.getOrCreateProfile({ userId: user.id, username: user.username, firstName: user.first_name });
		await stateStore.signupForEvent(eventId, profile, count);
		await ctx.answerCbQuery('Записаны');
		await renderEventMessage(ctx, idx);
	});

	bot.action(/cancel:([^:]+):(\d+)/, async (ctx) => {
		const eventId = ctx.match[1];
		const idx = Number(ctx.match[2]);
		await stateStore.cancelSignup(eventId, ctx.from.id);
		await ctx.answerCbQuery('Запись отменена');
		await renderEventMessage(ctx, idx);
	});

	bot.command('register', async (ctx) => {
		ctx.session = { step: 'ask_nickname' };
		await ctx.reply('Введите ваш псевдоним:');
	});

	bot.on('text', async (ctx, next) => {
		ctx.session = ctx.session || {};
		if (ctx.session.step === 'ask_nickname') {
			ctx.session.nickname = ctx.message.text.trim();
			ctx.session.step = 'ask_realname';
			return ctx.reply('Введите ваше имя:');
		}
		if (ctx.session.step === 'ask_realname') {
			ctx.session.realName = ctx.message.text.trim();
			ctx.session.step = 'ask_photo';
			return ctx.reply('Отправьте фото (аватар) одним изображением:');
		}
		return next();
	});

	bot.on('photo', async (ctx, next) => {
		ctx.session = ctx.session || {};
		if (ctx.session.step === 'ask_photo') {
			const file = ctx.message.photo[ctx.message.photo.length - 1];
			const fileId = file.file_id;
			const profile = await stateStore.getOrCreateProfile({ userId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name });
			profile.nickname = ctx.session.nickname;
			profile.realName = ctx.session.realName;
			profile.avatarFileId = fileId;
			await stateStore.saveProfile(profile);
			ctx.session = {};
			await ctx.reply('Регистрация завершена! ✅');
			return ctx.reply('Выберите действие:', mainInlineMenu());
		}
		return next();
	});

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
			try { await bot.telegram.sendMessage(p.telegramId, `Ваша роль: ${p.role}`); } catch (e) { /* ignore */ }
		}
		await ctx.reply('Роли разосланы.');
	});

	try {
		await bot.telegram.deleteWebhook({ drop_pending_updates: true });
	} catch (e) {
		console.warn('[bot] deleteWebhook warning:', e.message);
	}
	await bot.launch();
	console.log('[bot] launched via long polling');
	process.once('SIGINT', () => bot.stop('SIGINT'));
	process.once('SIGTERM', () => bot.stop('SIGTERM'));
	return bot;
}