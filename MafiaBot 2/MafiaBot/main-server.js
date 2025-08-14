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
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());
bot.use(stage.middleware());

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

// API endpoints для регистрации пользователей
app.post('/api/players/register', async (req, res) => {
    try {
        const p = req.body;
        console.log('📝 Получен запрос регистрации:', p);
        
        if (!p.telegramId || !p.nickname || !p.realName) {
            return res.status(400).json({ ok: false, error: 'telegramId, nickname, and realName required' });
        }

        // Прямое SQL-выполнение для сохранения пользователя  
        const { db } = require('./server/db.js');
        const { userProfiles } = require('./shared/schema.js');
        
        const playerData = {
            id: String(p.telegramId),
            username: p.username || null,
            firstName: p.firstName || null,
            lastName: p.lastName || null,
            nickname: p.nickname,
            realName: p.realName,
            avatarUrl: p.avatarUrl || null,
            isRegistered: true,
            lastActive: new Date()
        };

        await db.insert(userProfiles)
            .values(playerData)
            .onConflictDoUpdate({
                target: userProfiles.id,
                set: {
                    username: playerData.username,
                    firstName: playerData.firstName,
                    lastName: playerData.lastName,
                    nickname: playerData.nickname,
                    realName: playerData.realName,
                    avatarUrl: playerData.avatarUrl,
                    isRegistered: playerData.isRegistered,
                    lastActive: playerData.lastActive
                }
            });

        console.log('✅ Пользователь успешно зарегистрирован:', playerData.id);
        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Ошибка регистрации пользователя:', error);
        res.status(500).json({ ok: false, error: 'Database error' });
    }
});

app.get('/api/players/:id', async (req, res) => {
    try {
        const { db } = require('./server/db.js');
        const { userProfiles } = require('./shared/schema.js');
        const { eq } = require('drizzle-orm');
        
        const [player] = await db.select().from(userProfiles).where(eq(userProfiles.id, req.params.id));
        if (!player) return res.status(404).json({ ok: false, error: 'Player not found' });
        res.json({ ok: true, profile: player });
    } catch (error) {
        console.error('❌ Ошибка получения профиля:', error);
        res.status(500).json({ ok: false, error: 'Database error' });
    }
});

// Создаём POST endpoint для событий прямо здесь
app.post('/api/events', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== 'Bearer admin-secret') {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    
    try {
        const { title, place, address, dateIso, capacity = 12 } = req.body;
        if (!title || !dateIso) {
            return res.status(400).json({ ok: false, error: 'title & dateIso required' });
        }
        
        // Парсим дату и время из ISO строки
        const eventDate = new Date(dateIso);
        const dateStr = eventDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = eventDate.toTimeString().slice(0, 5); // HH:MM
        
        // Вставка в базу данных
        const { db } = require('./server/db.js');
        const { events } = require('./shared/schema.js');
        
        const eventData = {
            title,
            location: place || 'Не указано',
            address: address || '',
            date: dateStr,
            time: timeStr,
            capacity,
            createdBy: 'admin' // Временно hardcode, можно передавать из req.body
        };

        const [newEvent] = await db.insert(events).values(eventData).returning();
        console.log('✅ Событие создано в базе:', newEvent);
        return res.json({ ok: true, id: newEvent.id, event: newEvent });
        
    } catch (error) {
        console.error('❌ Ошибка создания события в БД:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
    }
});

// GET endpoint для загрузки событий
app.get('/api/events', async (req, res) => {
    try {
        const { db } = require('./server/db.js');
        const { events } = require('./shared/schema.js');
        
        const allEvents = await db.select().from(events).orderBy(events.date);
        console.log('✅ События загружены из базы:', allEvents.length);
        return res.json({ ok: true, events: allEvents });
        
    } catch (error) {
        console.error('❌ Ошибка загрузки событий:', error);
        return res.status(500).json({ ok: false, error: 'Database error' });
    }
});

// GET endpoint для загрузки регистраций события
app.get('/api/events/:eventId/registrations', async (req, res) => {
    try {
        const eventId = parseInt(req.params.eventId);
        const { db } = require('./server/db.js');
        const { eventRegistrations } = require('./shared/schema.js');
        const { eq } = require('drizzle-orm');
        
        const registrations = await db.select()
            .from(eventRegistrations)
            .where(eq(eventRegistrations.eventId, eventId));
            
        console.log(`✅ Регистрации для события ${eventId}:`, registrations.length);
        return res.json(registrations);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки регистраций:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

// POST endpoint для отправки ролей игрокам через бот
app.post('/api/send-roles', async (req, res) => {
    try {
        const { players, gameTitle } = req.body;
        
        if (!players || !Array.isArray(players)) {
            return res.status(400).json({ error: 'Invalid players data' });
        }
        
        let sent = 0;
        let errors = 0;
        
        for (const player of players) {
            try {
                if (!player.telegramId || !player.role) continue;
                
                const roleInfo = getRoleInfo(player.role);
                const roleMessage = `🎭 *${gameTitle || 'Игра в мафию'}*\n\n` +
                                   `${roleInfo.emoji} *Ваша роль: ${roleInfo.name}*\n\n` +
                                   `${roleInfo.description}\n\n` +
                                   `🎯 Игра началась! Следите за указаниями ведущего.`;
                
                // Для ролей с изображениями отправляем фото
                const replicDomain = process.env.REPLIT_DEV_DOMAIN || `127.0.0.1:${PORT}`;
                let imageUrl = null;
                
                if (player.role === 'civilian') {
                    imageUrl = `https://${replicDomain}/assets/civilian_role.png`;
                } else if (player.role === 'mafia') {
                    imageUrl = `https://${replicDomain}/assets/mafia_role.png`;
                } else if (player.role === 'don') {
                    imageUrl = `https://${replicDomain}/assets/don_role.png`;
                } else if (player.role === 'consigliere') {
                    imageUrl = `https://${replicDomain}/assets/consigliere_role.png`;
                } else if (player.role === 'commissar') {
                    imageUrl = `https://${replicDomain}/assets/commissar_role.png`;
                } else if (player.role === 'doctor') {
                    imageUrl = `https://${replicDomain}/assets/doctor_role.png`;
                } else if (player.role === 'lover') {
                    imageUrl = `https://${replicDomain}/assets/lover_role.png`;
                } else if (player.role === 'bomber') {
                    imageUrl = `https://${replicDomain}/assets/bomber_role.png`;
                } else if (player.role === 'kamikaze') {
                    imageUrl = `https://${replicDomain}/assets/kamikaze_role.png`;
                } else if (player.role === 'maniac') {
                    imageUrl = `https://${replicDomain}/assets/maniac_role.png`;
                } else if (player.role === 'werewolf') {
                    imageUrl = `https://${replicDomain}/assets/werewolf_role.png`;
                } else if (player.role === 'jailer') {
                    imageUrl = `https://${replicDomain}/assets/jailer_role.png`;
                }
                
                if (imageUrl) {
                    await bot.telegram.sendPhoto(
                        player.telegramId,
                        imageUrl,
                        {
                            caption: roleMessage,
                            parse_mode: 'Markdown'
                        }
                    );
                } else {
                    await bot.telegram.sendMessage(player.telegramId, roleMessage, { parse_mode: 'Markdown' });
                }
                sent++;
                console.log(`✅ Роль отправлена игроку ${player.name} (${player.telegramId}): ${roleInfo.name}`);
                
                // Небольшая задержка между отправками
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                errors++;
                console.error(`❌ Ошибка отправки роли игроку ${player.name}:`, error.message);
            }
        }
        
        console.log(`📊 Роли отправлены: успешно ${sent}, ошибок ${errors}`);
        return res.json({ sent, errors, total: players.length });
        
    } catch (error) {
        console.error('❌ Ошибка API отправки ролей:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// API endpoint для получения профилей игроков по их Telegram ID
app.post('/api/players/profiles', async (req, res) => {
    try {
        const { userIds } = req.body;
        
        if (!userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ error: 'Invalid userIds data' });
        }
        
        const { db } = require('./server/db.js');
        const { userProfiles } = require('./shared/schema.js');
        const { inArray } = require('drizzle-orm');
        
        const profiles = await db.select({
            id: userProfiles.id,
            username: userProfiles.username,
            nickname: userProfiles.nickname,
            realName: userProfiles.realName,
            avatarUrl: userProfiles.avatarUrl,
            isRegistered: userProfiles.isRegistered,
            gamesPlayed: userProfiles.gamesPlayed
        })
        .from(userProfiles)
        .where(inArray(userProfiles.id, userIds));
        
        console.log(`✅ Загружены профили для ${profiles.length} игроков:`, profiles.map(p => p.nickname || p.username).join(', '));
        return res.json(profiles);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки профилей:', error);
        return res.status(500).json({ error: 'Database error' });
    }
});

// Helper function для информации о ролях
function getRoleInfo(role) {
    const roleMap = {
        'don': { name: 'Дон', emoji: '👑', description: 'Вы лидер мафии. Командуйте своей командой и устраняйте мирных жителей ночью.' },
        'mafia': { name: 'Мафия', emoji: '🔫', description: 'Вы член мафии. Работайте с командой, чтобы уничтожить всех мирных жителей.' },
        'consigliere': { name: 'Консильери', emoji: '🤝', description: 'Вы советник мафии. Можете вербовать игроков в свою команду (одноразово).' },
        'commissar': { name: 'Комиссар', emoji: '🔎', description: 'Вы следователь. Проверяйте игроков ночью, чтобы найти мафию.' },
        'doctor': { name: 'Доктор', emoji: '💉', description: 'Вы лечите игроков ночью. Спасайте жизни и защищайте мирных.' },
        'lover': { name: 'Любовница', emoji: '💋', description: 'Вы блокируете игроков ночью, не давая им действовать.' },
        'bomber': { name: 'Подрывник', emoji: '💣', description: 'Вы минируете игроков. При вашей смерти взорвете последнюю цель.' },
        'jailer': { name: 'Тюремщик', emoji: '🔒', description: 'Вы сажаете игроков в тюрьму ночью, защищая и блокируя их.' },
        'civilian': { name: 'Мирный житель', emoji: '⬜️', description: 'Вы обычный житель города. Голосуйте днем, чтобы найти мафию.' },
        'maniac': { name: 'Маньяк', emoji: '🔪', description: 'Вы играете сам за себя. Убивайте игроков ночью.' },
        'kamikaze': { name: 'Камикадзе', emoji: '💥', description: 'При голосовании за вас днем вы взрываете случайного игрока (одноразово).' },
        'werewolf': { name: 'Оборотень', emoji: '🐺', description: 'Вы нейтральная роль. Убиваете игроков при определенных условиях.' },
        'sheriff': { name: 'Комиссар', emoji: '🔎', description: 'Вы следователь. Проверяйте игроков ночью, чтобы найти мафию.' }
    };
    
    return roleMap[role] || { name: 'Неизвестная роль', emoji: '❓', description: 'Роль не определена.' };
}

// API endpoints
console.log('🔌 Подключение API модуля...');
app.use(apiApp); // Используем без префикса, так как в api.js уже есть /api
console.log('✅ API модуль подключен к основному серверу');

// Статические файлы
app.use(express.static('.'));
app.use('/balagan', express.static(path.join(__dirname, 'mafia-balagan')));
app.use('/assets', express.static(path.join(__dirname, 'server/assets')));

app.get('/', (req, res) => {
  res.redirect('/balagan');
});

// Основной функционал бота (из index.js)
let events = {}; // Store events by ID
let userProfiles = {}; // Store user profiles by Telegram ID
let eventRegistrations = {}; // Store registrations by event ID
let adminId = process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.toString() : null;
let eventIdCounter = 1; // Auto-incrementing event ID

// Helper function to get or create user profile
function getUserProfile(userId, username) {
    if (!userProfiles[userId]) {
        userProfiles[userId] = {
            id: userId,
            username: username || 'Unknown',
            nickname: null,
            gamesPlayed: 0,
            wins: 0,
            losses: 0
        };
    }
    if (username && userProfiles[userId].username !== username) {
        userProfiles[userId].username = username;
    }
    return userProfiles[userId];
}

// Start command - активное меню с регистрацией пользователя
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name || '';
    const lastName = ctx.from.last_name || '';
    
    // Регистрируем/обновляем пользователя в базе данных
    try {
        const response = await fetch(`${BASE_URL}/api/players/upsert`, {
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
                nickname: null, // Будет заполнено при полной регистрации
                realName: null,
                avatarUrl: null
            })
        });
        
        if (response.ok) {
            console.log(`✅ Пользователь ${username} (${userId}) зарегистрирован в системе`);
        }
    } catch (error) {
        console.error('❌ Ошибка регистрации пользователя:', error);
    }
    
    getUserProfile(userId, username);
    
    const isAdmin = userId.toString() === adminId;
    const buttons = [
        [Markup.button.callback('🎭 Афиши', 'show_events')],
        [Markup.button.callback('👤 Профиль', 'show_profile')]
    ];
    
    // Проверяем статус полной регистрации
    try {
        const profileResponse = await fetch(`${BASE_URL}/api/players/${userId}`, {
            headers: { 'Authorization': 'Bearer bot-secret' }
        });
        
        if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            const profile = profileData.ok ? profileData.profile : null;
            
            if (!profile || !profile.isRegistered) {
                buttons.push([Markup.button.callback('📝 Пройти регистрацию', 'start_registration')]);
            }
        }
    } catch (error) {
        console.error('Ошибка проверки профиля:', error);
        buttons.push([Markup.button.callback('📝 Пройти регистрацию', 'start_registration')]);
    }
    
    if (isAdmin) {
        // Используем только HTTPS URL для Telegram Web App
        const domain = process.env.REPLIT_DEV_DOMAIN;
        if (domain) {
            const balaganUrl = `https://${domain}/balagan/`;
            buttons.push([Markup.button.webApp('🎮 Наша Мафия', balaganUrl)]);
        }
        buttons.push([Markup.button.callback('⚙️ Админ панель', 'admin_panel')]);
    }
    
    const keyboard = Markup.inlineKeyboard(buttons);
    const welcomeText = `🍷 Добро пожаловать в клуб "Наша мафия" 🎭

Здесь мы собираемся, чтобы весело провести время за любимой игрой, вкусной едой и в компании приятных людей.

📅 Как всё устроено:
1️⃣ Запишись на ближайшую игру.
2️⃣ Приходи в уютное место, где тебя ждёт атмосфера тепла и дружбы.
3️⃣ Получи свою роль и погрузись в увлекательный сюжет.
4️⃣ Наслаждайся смехом, эмоциями и неожиданными поворотами партии.

✨ Почему тебе понравится:
\t•\tДружелюбная компания и новые знакомства.
\t•\tКрасивое место с вкусной кухней.
\t•\tЛёгкая, ненапряжная атмосфера.
\t•\tЯркие впечатления, которые запомнятся.

💌 Жми кнопку "Записаться на игру" и бронируй своё место за столом!`;
    
    // Отправляем приветственное изображение с текстом
    const replicDomain = process.env.REPLIT_DEV_DOMAIN;
    if (replicDomain) {
        const imageUrl = `https://${replicDomain}/assets/welcome_image.jpeg`;
        await ctx.replyWithPhoto(imageUrl, {
            caption: welcomeText,
            reply_markup: keyboard.reply_markup
        });
    } else {
        ctx.reply(welcomeText, keyboard);
    }
});

// Команда полной регистрации через wizard
bot.command('register', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Проверяем, есть ли уже полная регистрация
        const response = await fetch(`${BASE_URL}/api/players/${userId}`, {
            headers: { 'Authorization': 'Bearer bot-secret' }
        });
        
        if (response.ok) {
            const data = await response.json();
            const profile = data.ok ? data.profile : null;
            
            if (profile && profile.isRegistered) {
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('👤 Мой профиль', 'show_profile')],
                    [Markup.button.callback('🎭 События', 'show_events')],
                    [Markup.button.callback('🔙 Главное меню', 'back_to_menu')]
                ]);
                
                ctx.reply(
                    `✅ Вы уже полностью зарегистрированы!\n\n` +
                    `🏷️ Псевдоним: ${profile.nickname}\n` +
                    `👤 Имя: ${profile.realName}\n` +
                    `📸 Аватар: ${profile.avatarUrl ? '✅ Загружен' : '❌ Нет'}\n\n` +
                    `💡 Используйте меню для участия в играх.`,
                    keyboard
                );
                return;
            }
        }
        
        // Если нет полной регистрации, запускаем wizard
        ctx.scene.enter('registration');
        
    } catch (error) {
        console.error('Ошибка проверки регистрации:', error);
        ctx.scene.enter('registration');
    }
});

// Показать события из базы данных
bot.action('show_events', async (ctx) => {
    try {
        const response = await fetch(`${BASE_URL}/api/events`);
        const data = await response.json();
        const events = data.ok ? (data.events || []) : [];
        
        if (events.length === 0) {
            const messageText = '🎭 Афиши событий\n\n📝 События пока не созданы\n\n💡 Администратор может создать событие через команду /create_event';
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Обновить', 'show_events')],
                [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
            ]);
            await ctx.editMessageText(messageText, keyboard);
            return;
        }

        // Показываем первое событие как афишу с кнопками
        const event = events[0];
        console.log('📋 Показываем событие:', event);
        
        // Получаем количество записавшихся для отображения в кнопке
        const registrationsResponse = await fetch(`${BASE_URL}/api/events/${event.id}/registrations`);
        const regData = await registrationsResponse.json();
        const registrations = regData.ok ? (regData.registrations || []) : [];
        const registeredCount = registrations.reduce((sum, reg) => sum + (reg.playerCount || 1), 0);
        
        // Форматируем дату события
        const eventDate = new Date(`${event.date} ${event.time}`);
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        const formattedDate = eventDate.toLocaleDateString('ru-RU', options);
        
        // Новый красивый текст афиши
        const messageText = `🎭 Ближайшая игра клуба "Наша мафия" 🍷

📅 Дата: ${formattedDate}
🕖 Время: ${event.time}
📍 Место: ${event.location}

🔥 Что тебя ждёт:
\t•\tАтмосфера настоящего детектива
\t•\tВкусная еда и уютная обстановка
\t•\tСмех, интриги и неожиданные повороты
\t•\tНовые знакомства и яркие эмоции

🎟 Количество мест ограничено!

💌 Жми "Записаться", бронируй своё место за столом и приходи разгадывать загадку!`;

        // Проверяем, записан ли пользователь на это событие
        const userId = ctx.from.id.toString();
        const isUserRegistered = registrations.some(reg => reg.userId === userId);
        
        // Формируем клавиатуру в зависимости от статуса регистрации
        const keyboardButtons = [];
        if (isUserRegistered) {
            keyboardButtons.push([Markup.button.callback('❌ Отменить запись', `cancel_event_${event.id}`)]);
        } else {
            keyboardButtons.push([Markup.button.callback('📝 Записаться', `register_event_${event.id}`)]);
        }
        
        keyboardButtons.push([Markup.button.callback(`👥 Игроки (${registeredCount}/${event.capacity})`, `show_players_${event.id}`)]);
        keyboardButtons.push([Markup.button.callback('➡️ Следующее', 'next_event')]);
        keyboardButtons.push([Markup.button.callback('🔙 Назад', 'back_to_menu')]);
        
        const keyboard = Markup.inlineKeyboard(keyboardButtons);
        
        console.log('🎯 Отправляем афишу с изображением');
        
        // Отправляем красивую афишу с изображением
        const replicDomain = process.env.REPLIT_DEV_DOMAIN;
        if (replicDomain) {
            const imageUrl = `https://${replicDomain}/assets/event_poster.png`;
            
            // Проверяем, есть ли фото в исходном сообщении
            if (ctx.callbackQuery?.message?.photo) {
                // Если это сообщение с фото, удаляем его и отправляем новое
                try {
                    await ctx.deleteMessage();
                    await ctx.replyWithPhoto(imageUrl, {
                        caption: messageText,
                        reply_markup: keyboard.reply_markup
                    });
                } catch (deleteError) {
                    // Если не можем удалить, отправляем новое сообщение
                    await ctx.replyWithPhoto(imageUrl, {
                        caption: messageText,
                        reply_markup: keyboard.reply_markup
                    });
                }
            } else {
                // Если это текстовое сообщение, удаляем и отправляем фото
                try {
                    await ctx.deleteMessage();
                    await ctx.replyWithPhoto(imageUrl, {
                        caption: messageText,
                        reply_markup: keyboard.reply_markup
                    });
                } catch (deleteError) {
                    // Если не можем удалить, отправляем новое сообщение
                    await ctx.replyWithPhoto(imageUrl, {
                        caption: messageText,
                        reply_markup: keyboard.reply_markup
                    });
                }
            }
        } else {
            // Fallback на текстовое сообщение если нет домена
            if (ctx.callbackQuery?.message?.photo) {
                try {
                    await ctx.deleteMessage();
                    await ctx.reply(messageText, keyboard);
                } catch (deleteError) {
                    await ctx.reply(messageText, keyboard);
                }
            } else {
                await ctx.editMessageText(messageText, keyboard);
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки событий:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
        ]);
        
        // Обрабатываем ошибку с fallback на текстовое сообщение
        const errorText = '❌ Ошибка загрузки событий\n\nПопробуйте позже';
        if (ctx.callbackQuery?.message?.photo) {
            try {
                await ctx.deleteMessage();
                await ctx.reply(errorText, keyboard);
            } catch (deleteError) {
                await ctx.reply(errorText, keyboard);
            }
        } else {
            await ctx.editMessageText(errorText, keyboard);
        }
    }
});

// Обработчики для кнопок афиш
bot.action(/register_event_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name || 'Игрок';
    
    try {
        // Проверяем, существует ли событие
        const { db } = require('./server/db.js');
        const { events, eventRegistrations } = require('./shared/schema.js');
        const { eq, and } = require('drizzle-orm');
        
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        if (!event) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 К афишам', 'show_events')]
            ]);
            await ctx.editMessageText(`❌ Событие не найдено`, keyboard);
            return;
        }
        
        // Проверяем, не зарегистрирован ли уже пользователь
        const [existingReg] = await db.select()
            .from(eventRegistrations)
            .where(and(
                eq(eventRegistrations.eventId, eventId),
                eq(eventRegistrations.userId, userId)
            ));
            
        if (existingReg) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('❌ Отменить регистрацию', `unregister_event_${eventId}`)],
                [Markup.button.callback('🔙 К афишам', 'show_events')]
            ]);
            await ctx.editMessageText(`✅ Вы уже зарегистрированы на "${event.title}"\n\n📅 ${event.date} в ${event.time}\n📍 ${event.location}`, keyboard);
            return;
        }
        
        // Проверяем количество свободных мест
        const registrationsCount = await db.select()
            .from(eventRegistrations)
            .where(eq(eventRegistrations.eventId, eventId));
            
        const totalRegistered = registrationsCount.reduce((sum, reg) => sum + (reg.playerCount || 1), 0);
        
        if (totalRegistered >= event.capacity) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 К афишам', 'show_events')]
            ]);
            await ctx.editMessageText(`❌ Все места заняты\n\n"${event.title}"\nСвободно: 0/${event.capacity} мест`, keyboard);
            return;
        }
        
        // Регистрируем пользователя
        await db.insert(eventRegistrations).values({
            eventId: eventId,
            userId: userId,
            username: username,
            playerCount: 1
        });
        
        const newTotal = totalRegistered + 1;
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👥 Список игроков', `show_players_${eventId}`)],
            [Markup.button.callback('❌ Отменить регистрацию', `unregister_event_${eventId}`)],
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        
        await ctx.editMessageText(
            `✅ Регистрация успешна!\n\n` +
            `🎭 "${event.title}"\n` +
            `📅 ${event.date} в ${event.time}\n` +
            `📍 ${event.location}\n` +
            `👥 Зарегистрировано: ${newTotal}/${event.capacity}`,
            keyboard
        );
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        await ctx.editMessageText(`❌ Ошибка регистрации\n\nПопробуйте позже`, keyboard);
    }
});

bot.action(/show_players_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    
    try {
        const { db } = require('./server/db.js');
        const { events, eventRegistrations } = require('./shared/schema.js');
        const { eq } = require('drizzle-orm');
        
        // Получаем событие
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        if (!event) {
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 К афишам', 'show_events')]
            ]);
            await ctx.editMessageText(`❌ Событие не найдено`, keyboard);
            return;
        }
        
        // Получаем список зарегистрированных игроков
        const registrations = await db.select()
            .from(eventRegistrations)
            .where(eq(eventRegistrations.eventId, eventId));
            
        let messageText = `👥 Игроки на "${event.title}"\n`;
        messageText += `📅 ${event.date} в ${event.time}\n\n`;
        
        if (registrations.length === 0) {
            messageText += `📝 Пока никто не зарегистрирован\n`;
        } else {
            const totalPlayers = registrations.reduce((sum, reg) => sum + (reg.playerCount || 1), 0);
            messageText += `Зарегистрировано: ${totalPlayers}/${event.capacity}\n\n`;
            
            // Получаем профили игроков для отображения псевдонимов и имен с кликабельными ссылками
            for (let i = 0; i < registrations.length; i++) {
                const reg = registrations[i];
                try {
                    const profileResponse = await fetch(`${BASE_URL}/api/players/${reg.userId}`, {
                        headers: { 'Authorization': 'Bearer bot-secret' }
                    });
                    const profileData = await profileResponse.json();
                    const profile = profileData.ok ? profileData.profile : null;
                    
                    let displayName;
                    if (profile && profile.nickname && profile.realName) {
                        // Формат: псевдоним (имя) с ссылкой на Telegram
                        displayName = `[${profile.nickname} (${profile.realName})](tg://user?id=${reg.userId})`;
                    } else if (profile && profile.nickname) {
                        // Только псевдоним с ссылкой
                        displayName = `[${profile.nickname}](tg://user?id=${reg.userId})`;
                    } else if (profile && profile.realName) {
                        // Только имя с ссылкой
                        displayName = `[${profile.realName}](tg://user?id=${reg.userId})`;
                    } else if (reg.username) {
                        // Fallback к username с ссылкой через @username если есть
                        displayName = `[@${reg.username}](tg://user?id=${reg.userId})`;
                    } else {
                        // Крайний fallback - просто ссылка "Игрок"
                        displayName = `[Игрок](tg://user?id=${reg.userId})`;
                    }
                    
                    messageText += `${i + 1}. ${displayName}\n`;
                } catch (profileError) {
                    console.error(`❌ Ошибка загрузки профиля для ${reg.userId}:`, profileError);
                    // При ошибке показываем username с ссылкой
                    const fallbackName = reg.username ? `@${reg.username}` : 'Игрок';
                    messageText += `${i + 1}. [${fallbackName}](tg://user?id=${reg.userId})\n`;
                }
            }
        }
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📝 Записаться', `register_event_${eventId}`)],
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        
        // Проверяем, есть ли фото в исходном сообщении
        if (ctx.callbackQuery?.message?.photo) {
            // Если это сообщение с фото, удаляем его и отправляем новое текстовое
            try {
                await ctx.deleteMessage();
                await ctx.reply(messageText, {
                    ...keyboard,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            } catch (deleteError) {
                // Если не можем удалить, отправляем новое сообщение
                await ctx.reply(messageText, {
                    ...keyboard,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
        } else {
            // Если это обычное текстовое сообщение, редактируем его
            await ctx.editMessageText(messageText, {
                ...keyboard,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки игроков:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        
        // Обрабатываем ошибку с учетом типа сообщения
        const errorText = '❌ Ошибка загрузки списка игроков';
        if (ctx.callbackQuery?.message?.photo) {
            try {
                await ctx.deleteMessage();
                await ctx.reply(errorText, keyboard);
            } catch (deleteError) {
                await ctx.reply(errorText, keyboard);
            }
        } else {
            await ctx.editMessageText(errorText, keyboard);
        }
    }
});

// Обработчик отмены регистрации из афиши
bot.action(/cancel_event_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    
    try {
        const { db } = require('./server/db.js');
        const { events, eventRegistrations } = require('./shared/schema.js');
        const { eq, and } = require('drizzle-orm');
        
        // Удаляем регистрацию
        await db.delete(eventRegistrations)
            .where(and(
                eq(eventRegistrations.eventId, eventId),
                eq(eventRegistrations.userId, userId)
            ));
        
        ctx.answerCbQuery('✅ Регистрация отменена!');
        
        // Возвращаем к обновленной афише
        const response = await fetch(`${BASE_URL}/api/events`);
        const data = await response.json();
        const events_list = data.ok ? (data.events || []) : [];
        
        if (events_list.length > 0) {
            // Вызываем show_events для обновления афиши
            ctx.callbackQuery.data = 'show_events';
            return bot.handleUpdate({ 
                update_id: ctx.update.update_id, 
                callback_query: ctx.callbackQuery 
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка отмены регистрации:', error);
        ctx.answerCbQuery('❌ Ошибка отмены регистрации');
    }
});

// Обработчик отмены регистрации
bot.action(/unregister_event_(\d+)/, async (ctx) => {
    const eventId = parseInt(ctx.match[1]);
    const userId = ctx.from.id.toString();
    
    try {
        const { db } = require('./server/db.js');
        const { events, eventRegistrations } = require('./shared/schema.js');
        const { eq, and } = require('drizzle-orm');
        
        // Удаляем регистрацию
        await db.delete(eventRegistrations)
            .where(and(
                eq(eventRegistrations.eventId, eventId),
                eq(eventRegistrations.userId, userId)
            ));
        
        const [event] = await db.select().from(events).where(eq(events.id, eventId));
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📝 Записаться снова', `register_event_${eventId}`)],
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        
        await ctx.editMessageText(
            `❌ Регистрация отменена\n\n` +
            `🎭 "${event?.title || 'Событие'}"\n` +
            `Вы можете зарегистрироваться снова в любое время`,
            keyboard
        );
        
    } catch (error) {
        console.error('❌ Ошибка отмены регистрации:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 К афишам', 'show_events')]
        ]);
        await ctx.editMessageText(`❌ Ошибка отмены регистрации`, keyboard);
    }
});

bot.action('next_event', async (ctx) => {
    // Пока что возвращаем к списку событий
    await ctx.answerCbQuery('💡 Навигация между событиями в разработке');
    // Не используем scene.enter, так как это не сцена
});

// Новые обработчики действий
bot.action('show_profile', async (ctx) => {
    const userId = ctx.from.id;
    try {
        const response = await fetch(`${BASE_URL}/api/players/${userId}`, {
            headers: {
                'Authorization': 'Bearer bot-secret'
            }
        });
        
        const data = await response.json();
        const profile = data.ok ? data.profile : null;
        
        if (profile && profile.isRegistered) {
            // Отправляем аватар если он есть
            if (profile.avatarUrl) {
                try {
                    console.log(`🖼️ Попытка загрузки аватара с file_id: ${profile.avatarUrl}`);
                    
                    // Пробуем несколько способов отправки аватара
                    if (profile.avatarUrl.startsWith('http')) {
                        // Если это URL, используем его напрямую
                        await ctx.replyWithPhoto({ url: profile.avatarUrl }, {
                            caption: `👤 **${profile.nickname}**\n\n💫 ${profile.realName}\n🎮 Игр сыграно: ${profile.gamesPlayed || 0}`,
                            parse_mode: 'Markdown',
                            reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]])
                        });
                    } else {
                        // Если это file_id, используем его
                        await ctx.replyWithPhoto(profile.avatarUrl, {
                            caption: `👤 **${profile.nickname}**\n\n💫 ${profile.realName}\n🎮 Игр сыграно: ${profile.gamesPlayed || 0}`,
                            parse_mode: 'Markdown',
                            reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]])
                        });
                    }
                    console.log('✅ Аватар успешно отправлен');
                    return;
                } catch (photoError) {
                    console.error('❌ Ошибка загрузки аватара:', photoError.message);
                    console.error('Аватар данные:', profile.avatarUrl);
                    
                    // Попробуем получить новый file_id, если пользователь недавно загружал фото
                    if (ctx.chat && ctx.chat.id === userId) {
                        console.log('🔄 Запрашиваем повторную загрузку аватара');
                        ctx.reply('📸 Кажется, ваш аватар устарел. Пожалуйста, отправьте фотографию заново, чтобы обновить профиль:', 
                            Markup.inlineKeyboard([[Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]]));
                        return;
                    }
                }
            }
            
            // Текстовая версия профиля
            const messageText = `👤 **${profile.nickname}**\n\n` +
                               `💫 ${profile.realName}\n` +
                               `🎮 Игр сыграно: ${profile.gamesPlayed || 0}`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
            ]);
            ctx.editMessageText(messageText, { keyboard, parse_mode: 'Markdown' });
            
        } else {
            // Пользователь не зарегистрирован полностью
            const messageText = '📝 **Профиль не завершен**\n\n' +
                               '💡 Пройдите полную регистрацию для создания профиля с аватаром и статистикой';
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📝 Пройти регистрацию', 'start_registration')],
                [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
            ]);
            ctx.editMessageText(messageText, { keyboard, parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки профиля:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
        ]);
        ctx.editMessageText('❌ Ошибка загрузки профиля', keyboard);
    }
});

// Обработчик кнопки "Пройти регистрацию"
bot.action('start_registration', (ctx) => {
    ctx.scene.enter('registration');
});

bot.action('admin_panel', (ctx) => {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📊 Статистика системы', 'system_stats')],
        [Markup.button.callback('👥 Список игроков', 'players_list')],
        [Markup.button.callback('🎮 Активные игры', 'active_games')],
        [Markup.button.callback('📅 Создать событие', 'create_event_help')],
        [Markup.button.callback('🔙 Назад в меню', 'back_to_menu')]
    ]);
    ctx.editMessageText('⚙️ **Панель администратора**\n\nВыберите действие:', { keyboard, parse_mode: 'Markdown' });
});

bot.action('create_event_help', (ctx) => {
    ctx.editMessageText(`📅 **Создание события**

Используйте команду \`/create_event\` в следующем формате:

\`/create_event
Название события
Место проведения
Полный адрес
YYYY-MM-DD
HH:MM
Количество мест\`

**Пример:**
\`/create_event
Еженедельная Мафия
Парк Горького
ул. Парковая, 123, Москва
2025-08-15
19:00
12\`

💡 После создания событие появится в веб-приложении и будет доступно для регистрации игроков.`, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Панель админа', 'admin_panel')]
        ])
    });
});

bot.action('system_stats', async (ctx) => {
    try {
        const [playersResponse, eventsResponse, gamesResponse] = await Promise.all([
            fetch(`${BASE_URL}/api/players`, { headers: { 'Authorization': 'Bearer admin' } }),
            fetch(`${BASE_URL}/api/events`, { headers: { 'Authorization': 'Bearer admin' } }),
            fetch(`${BASE_URL}/api/games/active`, { headers: { 'Authorization': 'Bearer admin' } })
        ]);
        
        const playersData = await playersResponse.json();
        const eventsData = await eventsResponse.json();
        const gamesData = await gamesResponse.json();
        
        const playersCount = playersData.ok ? playersData.players?.length || 0 : 0;
        const eventsCount = eventsData.ok ? eventsData.events?.length || 0 : 0;
        const hasActiveGame = gamesData.ok && gamesData.data;
        
        const messageText = `📊 **Статистика системы**\n\n` +
                          `👥 Зарегистрированных игроков: ${playersCount}\n` +
                          `🎭 Созданных событий: ${eventsCount}\n` +
                          `🎮 Активная игра: ${hasActiveGame ? '✅ Есть' : '❌ Нет'}\n` +
                          `🕐 Время проверки: ${new Date().toLocaleTimeString('ru-RU')}`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Обновить', 'system_stats')],
            [Markup.button.callback('🔙 Панель админа', 'admin_panel')]
        ]);
        ctx.editMessageText(messageText, { keyboard, parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🔙 Панель админа', 'admin_panel')]
        ]);
        ctx.editMessageText('❌ Ошибка загрузки статистики', keyboard);
    }
});

// Команда создания события (только для админов)
bot.command('create_event', async (ctx) => {
    const userId = ctx.from.id.toString();
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    
    console.log(`🔍 Admin check: User ID = ${userId}, Admin ID = ${adminId}`);
    
    if (userId !== adminId) {
        ctx.reply(`❌ Только администраторы могут создавать события!\n\n🆔 Ваш ID: ${userId}\n👑 Админ ID: ${adminId || 'не установлен'}\n\n💡 Используйте веб-приложение для создания событий`);
        return;
    }
    
    const args = ctx.message.text.split('\n').slice(1); // Skip the command line
    
    if (args.length < 6) {
        ctx.reply(`❌ Пожалуйста, укажите все детали события в этом формате:
/create_event
Название
Место
Адрес
Дата (YYYY-MM-DD)
Время (HH:MM)
Кол-во мест

Пример:
/create_event
Еженедельная Мафия
Парк Горького
ул. Парковая, 123, Москва
2025-08-15
19:00
12`);
        return;
    }
    
    const [title, location, address, date, time, capacity] = args;
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        ctx.reply('❌ Используйте формат YYYY-MM-DD для даты!');
        return;
    }
    
    // Validate time format
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(time)) {
        ctx.reply('❌ Используйте формат HH:MM для времени!');
        return;
    }
    
    // Validate capacity
    const capacityNum = parseInt(capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
        ctx.reply('❌ Количество мест должно быть положительным числом!');
        return;
    }
    
    try {
        // Create event via API
        const response = await fetch(`${BASE_URL}/api/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer admin-secret'
            },
            body: JSON.stringify({
                title: title.trim(),
                place: location.trim(),
                address: address.trim(),
                dateIso: `${date.trim()}T${time.trim()}:00.000Z`,
                capacity: capacityNum
            })
        });
        
        const result = await response.json();
        
        if (result.ok && result.id) {
            ctx.reply(`✅ Событие успешно создано!
🎯 **${title.trim()}**
📍 ${location.trim()}
🏠 ${address.trim()}
📅 ${date.trim()} в ${time.trim()}
👥 Мест: ${capacityNum} игроков
🆔 ID события: ${result.id}

💡 Пользователи могут увидеть это событие в разделе "🎭 События"`, { parse_mode: 'Markdown' });
        } else {
            console.error('API ответ:', result);
            ctx.reply('❌ Ошибка создания события. Попробуйте позже.');
        }
        
    } catch (error) {
        console.error('❌ Ошибка создания события:', error);
        ctx.reply('❌ Ошибка создания события. Проверьте подключение к серверу.');
    }
});

bot.action('back_to_menu', async (ctx) => {
    const isAdmin = ctx.from.id.toString() === adminId;
    const firstName = ctx.from.first_name || '';
    
    const buttons = [
        [Markup.button.callback('🎭 Афиши', 'show_events')],
        [Markup.button.callback('👤 Профиль', 'show_profile')]
    ];
    
    if (isAdmin) {
        // Используем только HTTPS URL для Telegram Web App
        const domain = process.env.REPLIT_DEV_DOMAIN;
        if (domain) {
            const balaganUrl = `https://${domain}/balagan/`;
            buttons.push([Markup.button.webApp('🎮 Наша Мафия', balaganUrl)]);
        }
        buttons.push([Markup.button.callback('⚙️ Админ панель', 'admin_panel')]);
    }
    
    const keyboard = Markup.inlineKeyboard(buttons);
    const welcomeText = isAdmin 
        ? `👑 Добро пожаловать, администратор!\n\n🎭 Система "Наша Мафия" готова к работе\n\n✨ Используйте меню для управления событиями и играми:`
        : `🎭 Добро пожаловать в "Наша Мафия", ${firstName}!\n\n🎮 Здесь вы можете:\n• Участвовать в играх Мафия\n• Регистрироваться на события\n• Отслеживать свою статистику\n\n🔽 Выберите действие:`;
    
    // Проверяем тип сообщения для правильного обновления
    try {
        if (ctx.callbackQuery?.message?.photo || ctx.callbackQuery?.message?.caption) {
            // Если это сообщение с фото, удаляем и отправляем новое
            try {
                await ctx.deleteMessage();
                await ctx.reply(welcomeText, keyboard);
            } catch (deleteError) {
                // Если не можем удалить, отправляем новое сообщение
                await ctx.reply(welcomeText, keyboard);
            }
        } else {
            // Если это обычное текстовое сообщение, редактируем
            await ctx.editMessageText(welcomeText, keyboard);
        }
    } catch (error) {
        console.error('❌ Ошибка обработки back_to_menu:', error);
        // В случае ошибки просто отправляем новое сообщение
        await ctx.reply(welcomeText, keyboard);
    }
});

// Запуск бота
bot.launch()
  .then(() => console.log('✅ Telegram bot connected successfully!'))
  .catch(err => console.error('❌ Bot connection failed:', err));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${PORT}`);
  console.log(`🔗 Web App URL: ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/` : `http://localhost:${PORT}/`}`);
});

// Настройка WebSocket
setupWebSocket(server);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));