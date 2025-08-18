// Telegram Web App API
let tg = window.Telegram.WebApp;
tg.expand();

// ЕДИНЫЙ КАТАЛОГ РОЛЕЙ — источник правды для UI, раздачи и ночных шагов
const ROLES = [
    // Команда мафии
    { key:'don',          label:'Дон',         side:'mafia',  nightStep:'mafia',     ui:true,  defaultOn:true },
    { key:'consigliere',  label:'Консильери',  side:'mafia',  nightStep:'consigliere', ui:true, defaultOn:true, once:true },

    { key:'mafia',        label:'Мафия',       side:'mafia',  nightStep:'mafia',     ui:false }, // не показываем как toggle

    // Мирные и нейтралы
    { key:'sheriff',      label:'Комиссар',    side:'town',   nightStep:'sheriff',   ui:true,  defaultOn:true },
    { key:'jailer',       label:'Тюремщик',    side:'town',   nightStep:'jailer',    ui:true,  defaultOn:true },
    { key:'doctor',       label:'Доктор',      side:'town',   nightStep:'doctor',    ui:true,  defaultOn:true },
    { key:'lover',        label:'Любовница',   side:'town',   nightStep:'lover',     ui:true,  defaultOn:false },
    { key:'bomber',       label:'Подрывник',   side:'town',   nightStep:null,        ui:true,  defaultOn:false }, // шаг ночью не нужен
    { key:'maniac',       label:'Маньяк',      side:'neutral',nightStep:'maniac',    ui:true,  defaultOn:true },
    { key:'kamikaze',     label:'Камикадзе',   side:'neutral',nightStep:'kamikaze',  ui:true,  defaultOn:false, once:true },
    { key:'werewolf',     label:'Оборотень',   side:'neutral',nightStep:null,        ui:true,  defaultOn:false }, // превращение на рассвете

    // Заполнитель
    { key:'civilian',     label:'Мирный',      side:'town',   nightStep:null,        ui:false }
];

// Иконки для бейджей (используются и в ночном UI)
const ROLE_BADGE = {
    mafia:'🔫', don:'👑', consigliere:'🤝',
    sheriff:'🔎', doctor:'💉', lover:'💋', maniac:'🔪',
    bomber:'💣', kamikaze:'💥', werewolf:'🐺', jailer:'🔒', civilian:'⬜️'
};

// Global variables
let selectedPlayerId = null;

// Game state according to new structure
let gameState = {
    id: null, // Will be set when game is created/loaded
    eventId: null,
    // Core game phases: setup, preparation, introduction, firstNight, day, voting, night, results, finished
    phase: 'setup',
    subPhase: null, // For detailed phase tracking
    dayNumber: 1,
    nightNumber: 0,
    isActive: false,
    players: [],
    gameMode: 'hidden', // hidden or open
    
    // Game progress tracking
    orderIndex: 0, // For introductions and voting order
    currentPlayerIndex: 0, // Who's currently acting
    
    // Visual voting system (новая система)
    voting: {
        isActive: false,
        order: [], // [playerId] строго по местам среди живых
        currentVoterIdx: 0,
        votes: {}, // { voterId: targetId | 'abstain' }
        timer: {
            remainingMs: 120000, // 2:00
            running: false,
            startedAt: 0,
            handle: null
        },
        settings: {
            tieMode: 'revote' // 'revote' или 'roulette'
        }
    },
    
    // Night actions tracking
    nightActions: {
        mafiaTarget: null,
        godfatherConfirm: null,
        loverTarget: null,
        doctorTarget: null,
        maniacTarget: null,
        minedTargets: [],
        sheriffChecks: []
    },
    
    // Night sequence tracking
    currentNightRole: null,
    nightRoleIndex: 0,
    nightSequence: ['mafia', 'don', 'consigliere', 'lover', 'doctor', 'maniac', 'bomber', 'commissar'],
    
    // Game log
    log: [],
    
    // Settings
    settings: {
        gameMode: 'hidden',
        enabledRoles: {
            don: true,
            consigliere: false,

            commissar: true,
            doctor: true,
            lover: false,
            bomber: false,
            maniac: false,
            kamikaze: false,
            werewolf: false
        }
    },
    
    // Metadata for save/restore system
    meta: {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
};

// Role definitions - НОВАЯ СТРУКТУРА ПО ТЗ
const roleDefinitions = {
    // Мафия команда
    mafia: { name: 'Мафия', team: 'mafia', emoji: '🔫', color: '#e74c3c', nightOrder: 1 },
    don: { name: 'Дон', team: 'mafia', emoji: '👑', color: '#8b0000', nightOrder: 1 },
    consigliere: { name: 'Консильери', team: 'mafia', emoji: '🤝', color: '#dc143c', nightOrder: 2 },
    
    // Мирные жители
    sheriff: { name: 'Комиссар', team: 'civilian', emoji: '🔎', color: '#3498db', nightOrder: 4 },
    doctor: { name: 'Доктор', team: 'civilian', emoji: '💉', color: '#2ecc71', nightOrder: 5 },
    bomber: { name: 'Подрывник', team: 'civilian', emoji: '💣', color: '#ff6b35', nightOrder: 9 },
    jailer: { name: 'Тюремщик', team: 'civilian', emoji: '🔒', color: '#708090', nightOrder: 3 },
    civilian: { name: 'Мирный', team: 'civilian', emoji: '👤', color: '#74b9ff', nightOrder: null },
    
    // Нейтральные
    maniac: { name: 'Маньяк', team: 'neutral', emoji: '🔪', color: '#8e44ad', nightOrder: 6 },
    lover: { name: 'Любовница', team: 'neutral', emoji: '💋', color: '#e91e63', nightOrder: 7 },
    kamikaze: { name: 'Камикадзе', team: 'neutral', emoji: '💥', color: '#ff4500', nightOrder: 8 },
    werewolf: { name: 'Оборотень', team: 'neutral', emoji: '🐺', color: '#556b2f', nightOrder: 10 }
};

// Avatar color management
function updateAvatarColors() {
    console.log('🎨 Обновляем цвета аватарок для фазы:', gameState.phase);
    
    gameState.players.forEach(player => {
        const seatElement = document.querySelector(`[data-player-id="${player.id}"]`);
        if (!seatElement || player.status !== 'alive') return;
        
        // Add or remove role class based on night phase
        if (gameState.phase === 'night' || gameState.phase === 'firstNight') {
            if (player.role) {
                seatElement.classList.add(player.role);
            }
        } else {
            // Remove all role classes during day phase
            Object.keys(roleDefinitions).forEach(role => {
                seatElement.classList.remove(role);
            });
        }
    });
}

// Night roles - НОВАЯ СТРУКТУРА ПО ТЗ
const nightRoles = {
    mafia: { 
        name: 'Мафия', 
        action: 'выбирает цель для убийства', 
        emoji: '🔫',
        color: '#e74c3c',
        hint: 'Мафия выбрала цель',
        targetIcon: '🔫',
        description: 'Мафия и Дон выбирают одну цель для убийства'
    },
    consigliere: { 
        name: 'Консильери', 
        action: 'вербует нового игрока в мафию', 
        emoji: '🤝',
        color: '#dc143c',
        hint: 'Консильери выбрал цель для вербовки',
        targetIcon: '🤝',
        description: 'Одноразовое действие: вербует мирного в мафию'
    },
    jailer: { 
        name: 'Тюремщик', 
        action: 'арестовывает игрока', 
        emoji: '🔒',
        color: '#708090',
        hint: 'Тюремщик выбрал цель для ареста',
        targetIcon: '🔒',
        description: 'Арестовывает мафию, блокируя её действия'
    },
    sheriff: { 
        name: 'Комиссар', 
        action: 'проверяет игрока', 
        emoji: '🔎',
        color: '#3498db',
        hint: 'Комиссар выбрал цель для проверки',
        targetIcon: '🔎',
        description: 'Проверяет игрока на принадлежность к мафии'
    },
    doctor: { 
        name: 'Доктор', 
        action: 'лечит игрока', 
        emoji: '💉',
        color: '#2ecc71',
        hint: 'Доктор выбрал пациента',
        targetIcon: '💉',
        description: 'Лечит игрока, спасая от убийства мафии или маньяка'
    },
    maniac: { 
        name: 'Маньяк', 
        action: 'выбирает жертву', 
        emoji: '🔪',
        color: '#8e44ad',
        hint: 'Маньяк выбрал жертву',
        targetIcon: '🔪',
        description: 'Убивает одного игрока независимо от мафии'
    },
    lover: { 
        name: 'Любовница', 
        action: 'проводит ночь с игроком', 
        emoji: '💋',
        color: '#e91e63',
        hint: 'Любовница выбрала партнёра',
        targetIcon: '💋',
        description: 'Блокирует и защищает игрока на ночь'
    },
    kamikaze: { 
        name: 'Камикадзе', 
        action: 'атакует мафию ценой своей жизни', 
        emoji: '💥',
        color: '#ff4500',
        hint: 'Камикадзе выбрал цель',
        targetIcon: '💥',
        description: 'Одноразовая атака: убивает мафию, возможно ценой своей жизни'
    },
    bomber: {
        name: 'Подрывник',
        action: 'минирует игрока',
        emoji: '💣',
        color: '#FA8C16',
        hint: 'Подрывник заминировал цель',
        targetIcon: '💣',
        description: 'Помечает игрока для возможного взрыва при смерти Подрывника'
    }
};



// Initialize game

// НОВЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ПО ТЗ
let nightPlan = {
    mafiaTarget: null,
    consigliereTarget: null,
    sheriffTarget: null,
    doctorTarget: null,
    maniacTarget: null,
    loverTarget: null,
    kamikazeTarget: null,
    jailerTarget: null
};

let initialMafiaCount = 0;
let consigliereUsed = false;
let kamikazeUsed = false;
let bomberMinedIds = new Set();
let nightLogs = [];

// Удалено - дубликат переменных

document.addEventListener('DOMContentLoaded', function() {
    loadGameData();
    updateUI();
    addHistoryEntry('🎮 Мини-приложение Наша Мафия загружено');
    updateGameInstructions();
    loadUpcomingEvent(); // Load upcoming event from bot
    initCenterActionsDelegation();
});

function initCenterActionsDelegation() {
    if (window._centerActionsInited) return;
    window._centerActionsInited = true;
    const center = document.getElementById('centerActions');
    if (!center) return;
    center.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        if (!action) return;
        if (action === 'start-voting') {
            try { startVoting(); } catch (err) { console.error('startVoting failed:', err); }
        } else if (action === 'skip-vote') {
            try { skipVote(); } catch (err) { console.error('skipVote failed:', err); }
        } else if (action === 'pause-resume') {
            try { pauseResumeTimer(); } catch (err) { console.error('pauseResumeTimer failed:', err); }
        } else if (action === 'adjust-time') {
            const delta = parseInt(btn.dataset.delta || '0', 10);
            try { adjustTime(delta); } catch (err) { console.error('adjustTime failed:', err); }
        } else if (action === 'count-votes') {
            try { countVotes(); } catch (err) { console.error('countVotes failed:', err); }
        }
    });
}

// Load upcoming event from API
async function loadUpcomingEvent() {
    try {
        console.log('🔄 Загружаем ближайшее событие...');
        
        let e = null;
        try {
            const r1 = await fetch('/api/events/next');
            if (r1.ok) e = await r1.json();
        } catch {}
        if (!e) {
            const r2 = await fetch('/api/events');
            if (!r2.ok) throw new Error('Failed to fetch events');
            const data2 = await r2.json();
            const list = data2 && data2.ok && Array.isArray(data2.events) ? data2.events : [];
            if (!list.length) {
                showNoEventMessage();
                return;
            }
            e = list[0];
        }
        
        currentUpcomingEvent = e;
        console.log('📅 Загружено событие:', currentUpcomingEvent);
        
        // Load registrations for this event
        await loadEventRegistrations(currentUpcomingEvent.id);
        
        displayUpcomingEvent();
        
    } catch (error) {
        console.error('❌ Ошибка загрузки события:', error);
        console.error('Детали ошибки:', error.message);
        showEventError();
    }
}

// Load event registrations
async function loadEventRegistrations(eventId) {
    try {
        const response = await fetch(`/api/events/${eventId}/registrations`);
        if (!response.ok) {
            throw new Error('Failed to fetch registrations');
        }
        
        const json = await response.json();
        eventRegistrations = (json && json.ok && Array.isArray(json.registrations)) ? json.registrations : [];
        console.log('👥 Загружены регистрации:', eventRegistrations);
        
    } catch (error) {
        console.error('❌ Ошибка загрузки регистраций:', error);
        eventRegistrations = [];
    }
}

// Display upcoming event
function displayUpcomingEvent() {
    const eventCard = document.getElementById('upcomingEventCard');
    const eventStatus = document.getElementById('eventStatus');
    const eventDetails = document.getElementById('eventDetails');
    const eventRegistrationsElement = document.getElementById('eventRegistrations');
    
    if (!eventCard || !currentUpcomingEvent) return;
    
    // Calculate time until event
    const eventDate = new Date(`${currentUpcomingEvent.date}T${currentUpcomingEvent.time}`);
    const now = new Date();
    const timeUntil = eventDate - now;
    
    let statusText = '';
    if (timeUntil > 0) {
        const days = Math.floor(timeUntil / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeUntil % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (days > 0) {
            statusText = `Через ${days} дн. ${hours} ч.`;
        } else if (hours > 0) {
            statusText = `Через ${hours} ч.`;
        } else {
            const minutes = Math.floor((timeUntil % (1000 * 60 * 60)) / (1000 * 60));
            statusText = `Через ${minutes} мин.`;
        }
    } else {
        statusText = 'Идет сейчас';
    }
    
    // Update status
    eventStatus.textContent = statusText;
    
    // Update event details
    eventDetails.innerHTML = `
        <div class="event-detail-row">
            <span>📅 Дата:</span>
            <span>${formatDate(currentUpcomingEvent.date)}</span>
        </div>
        <div class="event-detail-row">
            <span>⏰ Время:</span>
            <span>${currentUpcomingEvent.time}</span>
        </div>
        <div class="event-detail-row">
            <span>📍 Место:</span>
            <span>${currentUpcomingEvent.location}</span>
        </div>
        <div class="event-detail-row">
            <span>🏠 Адрес:</span>
            <span>${currentUpcomingEvent.address}</span>
        </div>
        <div class="event-detail-row">
            <span>👥 Мест:</span>
            <span>${currentUpcomingEvent.capacity}</span>
        </div>
    `;
    
    // Update registrations
    const totalPlayers = eventRegistrations.reduce((sum, reg) => sum + reg.playerCount, 0);
    
    if (eventRegistrations.length === 0) {
        eventRegistrationsElement.innerHTML = `
            <div class="registrations-header">👥 Записавшиеся (0)</div>
            <div class="no-event-message">Пока никто не записался</div>
        `;
    } else {
        const registrationsHtml = eventRegistrations.map(reg => `
            <div class="registration-item">
                <span class="player-name">${reg.username ? '@'+reg.username : 'Игрок'}</span>
                <span class="player-count">${reg.playerCount} игр.</span>
            </div>
        `).join('');
        
        eventRegistrationsElement.innerHTML = `
            <div class="registrations-header">👥 Записавшиеся (${totalPlayers}/${currentUpcomingEvent.capacity})</div>
            ${registrationsHtml}
        `;
    }
    
    // Show/hide action buttons based on registrations
    const playBtn = document.getElementById('playEventBtn');
    const loadBtn = document.getElementById('loadEventBtn');
    
    if (eventRegistrations.length >= 4) {
        playBtn.style.display = 'block';
        loadBtn.style.display = 'block';
    } else {
        playBtn.style.display = 'none';
        loadBtn.style.display = 'block';
    }
    
    // Show the event card
    eventCard.style.display = 'block';
}

// Show message when no events
function showNoEventMessage() {
    const eventCard = document.getElementById('upcomingEventCard');
    const eventDetails = document.getElementById('eventDetails');
    
    eventDetails.innerHTML = `
        <div class="no-event-message">
            Нет запланированных событий.<br>
            Попросите администратора создать событие в боте.
        </div>
    `;
    
    document.getElementById('eventStatus').textContent = 'Нет событий';
    document.getElementById('eventRegistrations').innerHTML = '';
    document.getElementById('playEventBtn').style.display = 'none';
    document.getElementById('loadEventBtn').style.display = 'none';
    
    eventCard.style.display = 'block';
}

// Show error message
function showEventError() {
    const eventCard = document.getElementById('upcomingEventCard');
    const eventDetails = document.getElementById('eventDetails');
    
    eventDetails.innerHTML = `
        <div class="no-event-message">
            Ошибка загрузки событий.<br>
            Проверьте подключение к серверу.
        </div>
    `;
    
    document.getElementById('eventStatus').textContent = 'Ошибка';
    document.getElementById('eventRegistrations').innerHTML = '';
    
    eventCard.style.display = 'block';
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { 
        day: 'numeric', 
        month: 'long', 
        weekday: 'short' 
    };
    return date.toLocaleDateString('ru-RU', options);
}

// Refresh upcoming event
async function refreshUpcomingEvent() {
    console.log('🔄 Обновляем событие...');
    document.getElementById('eventStatus').textContent = 'Обновление...';
    await loadUpcomingEvent();
}

// Start game from event
function startGameFromEvent() {
    if (!currentUpcomingEvent || eventRegistrations.length === 0) {
        alert('Нет записавшихся игроков для начала игры');
        return;
    }
    
    const totalPlayers = eventRegistrations.reduce((sum, reg) => sum + reg.playerCount, 0);
    if (totalPlayers < 4) {
        alert('Нужно минимум 4 игрока для начала игры');
        return;
    }
    
    // Load players into game first
    loadEventPlayers();
    
    // Show event info in game setup
    showEventInfoInGameSetup();
    
    // Go directly to game setup section
    showSection('gameSetup');
    
    addHistoryEntry(`🎮 Начинаем игру для события "${currentUpcomingEvent.title}"`);
}

// Load players without showing alert or switching sections
function loadEventPlayers() {
    // Clear current players
    gameState.players = [];
    
    // Add registered players to game
    let seatNumber = 1;
    eventRegistrations.forEach(reg => {
        for (let i = 0; i < reg.playerCount; i++) {
            const playerName = i === 0 ? `@${reg.username}` : `@${reg.username}+${i}`;
            
            const player = {
                id: Date.now() + seatNumber,
                name: playerName,
                username: reg.username,
                telegramId: reg.userId,
                seatNumber: seatNumber,
                role: null,
                status: 'alive',
                actions: []
            };
            
            gameState.players.push(player);
            seatNumber++;
        }
    });
    
    // Update UI silently
    updatePlayersList();
    updateUI();
}

// Show event info in game setup section
function showEventInfoInGameSetup() {
    const eventInfo = document.getElementById('gameEventInfo');
    const eventDetails = document.getElementById('gameEventDetails');
    
    if (!eventInfo || !currentUpcomingEvent) return;
    
    const totalPlayers = eventRegistrations.reduce((sum, reg) => sum + reg.playerCount, 0);
    
    eventDetails.innerHTML = `
        <div class="event-info-row">
            <span>📅 Событие:</span>
            <span>${currentUpcomingEvent.title}</span>
        </div>
        <div class="event-info-row">
            <span>📍 Место:</span>
            <span>${currentUpcomingEvent.location}</span>
        </div>
        <div class="event-info-row">
            <span>👥 Игроков:</span>
            <span>${totalPlayers} из ${currentUpcomingEvent.capacity}</span>
        </div>
        <div class="event-info-row">
            <span>⏰ Время:</span>
            <span>${formatDate(currentUpcomingEvent.date)} в ${currentUpcomingEvent.time}</span>
        </div>
    `;
    
    eventInfo.style.display = 'block';
}

// Load event data into game
async function loadEventToGame() {
    if (!currentUpcomingEvent || eventRegistrations.length === 0) {
        alert('Нет данных для загрузки в игру');
        return;
    }
    
    // Clear current players
    gameState.players = [];
    
    try {
        // Получить профили пользователей из базы данных
        const userIds = eventRegistrations.map(reg => reg.userId);
        const response = await fetch('/api/players/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds })
        });
        
        const profiles = await response.json();
        const profileMap = {};
        profiles.forEach(profile => {
            profileMap[profile.id] = profile;
        });
        
        console.log('📋 Загружены профили игроков:', profileMap);
        
        // Add registered players to game with profile data
        let seatNumber = 1;
        eventRegistrations.forEach(reg => {
            const profile = profileMap[reg.userId];
            for (let i = 0; i < reg.playerCount; i++) {
                const playerName = i === 0 
                    ? (profile?.nickname || `@${reg.username}`)
                    : `${profile?.nickname || `@${reg.username}`}+${i}`;
                
                const player = {
                    id: Date.now() + seatNumber,
                    name: playerName,
                    displayName: profile?.realName || profile?.nickname || reg.username,
                    nickname: profile?.nickname,
                    realName: profile?.realName,
                    username: reg.username,
                    telegramId: reg.userId,
                    avatarUrl: profile?.avatarUrl,
                    isRegistered: profile?.isRegistered,
                    seatNumber: seatNumber,
                    role: null,
                    status: 'alive',
                    actions: []
                };
                
                gameState.players.push(player);
                seatNumber++;
            }
        });
        
    } catch (error) {
        console.error('❌ Ошибка загрузки профилей:', error);
        // Fallback без профилей
        let seatNumber = 1;
        eventRegistrations.forEach(reg => {
            for (let i = 0; i < reg.playerCount; i++) {
                const playerName = i === 0 ? `@${reg.username}` : `@${reg.username}+${i}`;
                
                const player = {
                    id: Date.now() + seatNumber,
                    name: playerName,
                    username: reg.username,
                    telegramId: reg.userId,
                    seatNumber: seatNumber,
                    role: null,
                    status: 'alive',
                    actions: []
                };
                
                gameState.players.push(player);
                seatNumber++;
            }
        });
    }
    
    // Update UI and show players section
    updatePlayersList();
    updateUI();
    showSection('players');
    
    addLogEntry(`Игроки загружены`, `Из события "${currentUpcomingEvent.title}" (${gameState.players.length} игроков)`);
    
    alert(`✅ Загружено ${gameState.players.length} игроков из события "${currentUpcomingEvent.title}"`);
}

// History management (compatibility)
function addHistoryEntry(message) {
    addLogEntry(message);
}

// === NEW GAME SYSTEM FUNCTIONS ===

// Log system
function addLogEntry(action, details = '', phase = null) {
    const timestamp = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    const entry = {
        timestamp,
        phase: phase || gameState.phase,
        action,
        details
    };
    
    gameState.log.push(entry);
    updateLogDisplay();
    console.log(`📝 ${timestamp} [${entry.phase}] ${action}`, details);
}

function updateLogDisplay() {
    const logContent = document.getElementById('logContent');
    if (!logContent) return;
    
    const entries = gameState.log.slice(-20).reverse(); // Show last 20 entries
    logContent.innerHTML = entries.map(entry => `
        <div class="log-entry">
            <div class="log-time">${entry.timestamp}</div>
            <div class="log-action">${entry.action}</div>
            ${entry.details ? `<div class="log-details">${entry.details}</div>` : ''}
        </div>
    `).join('');
    
    // Auto-scroll to top
    logContent.scrollTop = 0;
}

// Player status management
function updatePlayerStatus(playerId, status, reason = '') {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    const oldStatus = player.status;
    player.status = status;
    
    if (status === 'eliminated') {
        player.alive = false;
        addLogEntry(`Игрок выбыл`, `${player.name} - ${reason}`, gameState.phase);
    } else if (status === 'alive') {
        player.alive = true;
        addLogEntry(`Игрок в игре`, `${player.name}`, gameState.phase);
    }
    
    updatePlayerDisplay(player);
    updateGameStats();
    scheduleSave(); // Автосохранение при обновлении статуса
    checkGameEnd();
}

function updatePlayerDisplay(player) {
    const seatElement = document.querySelector(`[data-player-id="${player.id}"]`);
    if (!seatElement) return;
    
    // Update classes
    seatElement.className = 'player-seat';
    if (player.status === 'alive') {
        seatElement.classList.add('alive');
    } else if (player.status === 'dead' || player.status === 'eliminated') {
        seatElement.classList.add('dead', 'eliminated');
    }
    
    // Add role-specific styling for night phase
    if ((gameState.phase === 'night' || gameState.phase === 'firstNight') && player.role) {
        seatElement.classList.add(`role-${player.role}`);
        
        // Add active highlighting for current night role
        if (gameState.currentNightRole === player.role) {
            seatElement.classList.add('night-active');
        } else {
            seatElement.classList.remove('night-active');
        }
    } else {
        // Remove role classes when not in night phase
        Object.keys(roleDefinitions).forEach(role => {
            seatElement.classList.remove(`role-${role}`);
        });
        seatElement.classList.remove('night-active');
    }
    
    // Update the content with role badge on avatar
    const roleInfo = player.role ? roleDefinitions[player.role] : null;
    const showRole = gameState.settings.gameMode === 'open' || gameState.phase === 'finished';
    
    // Role badge positioned on top of player name/avatar - only show in open mode or when game finished
    let roleBadge = '';
    if (roleInfo && showRole) {
        roleBadge = `<div class="role-badge" style="
            position: absolute;
            top: -5px;
            right: -5px;
            background: var(--role-${player.role}, #666);
            border-radius: 50%;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8px;
            border: 1px solid white;
            box-shadow: 0 1px 2px rgba(0,0,0,0.3);
            z-index: 5;
        ">${roleInfo.emoji}</div>`;
    }
    
    // Create avatar content - prioritize avatarUrl from registration, fallback to Telegram
    let avatarContent = '👤'; // Default fallback
    if (player.avatarUrl) {
        // Use uploaded avatar from registration
        avatarContent = `<img src="${player.avatarUrl}" 
                         style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                         onerror="this.style.display='none'; this.parentElement.innerHTML='👤' + (this.parentElement.querySelector('.role-badge')?.outerHTML || '');"
                         alt="${player.displayName || player.name}">`;
    } else if (player.telegramId) {
        // Fallback to Telegram avatar
        avatarContent = `<img src="https://t.me/i/userpic/160/${player.username || player.telegramId}.jpg" 
                         style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                         onerror="this.style.display='none'; this.parentElement.innerHTML='👤' + (this.parentElement.querySelector('.role-badge')?.outerHTML || '');"
                         alt="${player.displayName || player.name}">`;
    }
    
    seatElement.innerHTML = `
        <div class="player-avatar" style="position: relative; width: 100%; height: 100%;">
            ${avatarContent}
            ${roleBadge}
        </div>
    `;
    
    // Create name element outside the seat
    const existingNameElement = seatElement.parentElement.querySelector(`[data-name-for="${player.id}"]`);
    if (existingNameElement) {
        existingNameElement.remove();
    }
    
    const nameElement = document.createElement('div');
    nameElement.className = 'player-name-external';
    nameElement.setAttribute('data-name-for', player.id);
    
    // Show nickname from registration if available, otherwise display name or username
    const displayText = player.nickname || player.displayName || player.name;
    nameElement.textContent = displayText.length > 8 ? displayText.substring(0, 8) + '...' : displayText;
    
    // Position name below the seat
    nameElement.style.position = 'absolute';
    nameElement.style.left = seatElement.style.left;
    nameElement.style.top = `calc(${seatElement.style.top} + 68px)`;
    nameElement.style.transform = 'translateX(-50%)';
    nameElement.style.marginLeft = '30px';
    
    seatElement.parentElement.appendChild(nameElement);
    
    // Update badges
    updatePlayerBadges(player);
}

function updatePlayerBadges(player) {
    const seatElement = document.querySelector(`[data-player-id="${player.id}"]`);
    if (!seatElement) return;
    
    // Remove existing badges
    const existingBadges = seatElement.querySelectorAll('.player-badge');
    existingBadges.forEach(badge => badge.remove());
    
    // Add new badges based on flags
    if (player.flags) {
        if (player.flags.protectedByLover) {
            const badge = document.createElement('div');
            badge.className = 'player-badge protected';
            badge.textContent = '💋';
            seatElement.appendChild(badge);
        }
        
        if (player.flags.mined) {
            const badge = document.createElement('div');
            badge.className = 'player-badge mined';
            badge.textContent = '💣';
            seatElement.appendChild(badge);
        }
        
        if (player.flags.checkedBySheriff) {
            const badge = document.createElement('div');
            badge.className = 'player-badge checked';
            badge.textContent = '🔎';
            seatElement.appendChild(badge);
        }
    }
}

// Phase management
function setGamePhase(newPhase, subPhase = null) {
    const oldPhase = gameState.phase;
    gameState.phase = newPhase;
    gameState.subPhase = subPhase;
    
    // Clear voting display when leaving voting phase
    if (oldPhase === 'voting' && newPhase !== 'voting') {
        updateVisualVoting();
    }
    
    addLogEntry(`Смена фазы`, `${oldPhase} → ${newPhase}${subPhase ? ` (${subPhase})` : ''}`, newPhase);
    
    // АВТОМАТИЧЕСКИ запускаем ночную фазу когда переходим к night
    if (newPhase === 'night') {
        console.log('🌙 Автоматически запускаем ночную фазу...');
        setTimeout(() => {
            startNightPhase();
        }, 100);
    }
    
    updatePhaseDisplay();
    updateCenterPanel();
    updateBottomControls();
    updateGameInstructions();
    updateNightPhaseHighlighting();
    updateAvatarColors(); // Обновление цветов аватарок по фазе
    scheduleSave(); // Автосохранение при смене фазы
}

// Add the missing updateGameInstructions function to avoid errors
function updateGameInstructions() {
    const instruction = document.getElementById('phaseInstruction');
    if (!instruction) return;
    
    const instructions = {
        'setup': 'Загрузите игроков для начала',
        'preparation': 'Настройте роли и начните игру',
        'introduction': 'Игроки представляются по кругу',
        'firstNight': 'Первая ночь - мафия знакомится',
        'day': 'Дневная дискуссия',
        'voting': 'Голосование за исключение',
        'night': 'Ночная фаза - действуют роли',
        'results': 'Результаты голосования',
        'finished': 'Игра завершена'
    };
    
    instruction.textContent = instructions[gameState.phase] || 'Неизвестная фаза';
}

// Night phase control functions
function setActiveNightRole(role) {
    // Запрещаем выбор целей в первую ночь — это только знакомство мафии
    if (gameState.phase === 'firstNight') {
        showToast('info', 'ℹ️', 'Первая ночь — только знакомство мафии');
        return;
    }
    gameState.currentNightRole = role;
    console.log(`🌙 Активная роль: ${role}`);
    updateCenterPanel();
    updateNightPhaseHighlighting();
}

function clearActiveNightRole() {
    gameState.currentNightRole = null;
    console.log('🌙 Ночная роль очищена');
    updateCenterPanel();
    updateNightPhaseHighlighting();
}

function confirmNightAction() {
    if (gameState.phase === 'firstNight') {
        // В первую ночь подтверждение действия не требуется — просто кнопка знакомства
        mafiaIntroduced();
        return;
    }
    if (!selectedTargetId || !gameState.currentNightRole) {
        alert('Выберите цель для действия!');
        return;
    }
    
    const targetPlayer = gameState.players.find(p => p.id === selectedTargetId);
    const role = nightRoles[gameState.currentNightRole];
    
    if (!targetPlayer) {
        alert('Игрок не найден!');
        return;
    }
    
    const actionResult = `${role ? role.name : gameState.currentNightRole} ${role ? role.action : 'действует на'}: ${targetPlayer.name}`;
    
    gameState.nightActions.push({
        role: gameState.currentNightRole,
        roleData: role,
        targetId: selectedTargetId,
        targetName: targetPlayer.name,
        actionResult: actionResult,
        timestamp: new Date()
    });
    
    addLogEntry(`${role ? role.emoji : '🌙'} ${actionResult}`);
    
    applyNightAction(gameState.currentNightRole, selectedTargetId);
    
    if (gameState.currentNightRole === 'sheriff') {
        const isMafia = ['mafia','don','consigliere'].includes(targetPlayer.role);
        // make message larger, will be left because of CSS container move
        showToast(isMafia ? 'success' : 'info', isMafia ? '👍' : '👎', isMafia ? 'Этот игрок — мафия' : 'Этот игрок — не мафия');
    }
    
    updateNightHistoryContent();
    scheduleSave();
    
    const centerActions = document.getElementById('centerActions');
    if (centerActions && role) {
        centerActions.innerHTML = `
            <div style="background: ${role.color}; color: white; padding: 20px; border-radius: 15px; text-align: center; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0;">${role.emoji} Действие выполнено!</h3>
                <p style="margin: 0; font-size: 16px; opacity: 0.9;">${role.hint}: ${targetPlayer.name}</p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <p style="color: #2ed573; font-size: 14px;">Переход к следующей роли через 2 секунды...</p>
            </div>
        `;
    }
    
    console.log('✅ Night action confirmed:', actionResult);
    
    setTimeout(() => {
        nextNightRole();
    }, 2000);
}

function switchToDay() {
    gameState.dayNumber++;
    setGamePhase('day');
    addLogEntry('Новый день', `Наступил день ${gameState.dayNumber}`);
    updatePlayerTable();
}

function updatePhaseDisplay() {
    const phaseElement = document.getElementById('currentPhase');
    const instructionElement = document.getElementById('phaseInstruction');
    
    if (!phaseElement) return;
    
    let phaseText = '';
    let instructionText = '';
    
    switch (gameState.phase) {
        case 'setup':
            phaseText = 'Подготовка';
            instructionText = 'Настройте роли и начните игру';
            break;
        case 'preparation':
            phaseText = 'Подготовка к игре';
            instructionText = 'Роли розданы, игра начинается';
            break;
        case 'introduction':
            phaseText = `День ${gameState.dayNumber} - Знакомство`;
            instructionText = `Представляется игрок №${gameState.orderIndex + 1}`;
            break;
        case 'firstNight':
            phaseText = 'Первая ночь';
            instructionText = 'Мафия знакомится';
            break;
        case 'day':
            phaseText = `День ${gameState.dayNumber}`;
            instructionText = 'Обсуждение';
            break;
        case 'voting':
            phaseText = `День ${gameState.dayNumber} - Голосование`;
            instructionText = `Голосует игрок №${gameState.orderIndex + 1}`;
            break;
        case 'night':
            phaseText = `Ночь ${gameState.nightNumber}`;
            const currentRole = gameState.currentNightRole;
            instructionText = currentRole ? `Действует: ${roleDefinitions[currentRole]?.name || currentRole}` : 'Ночные действия';
            break;
        case 'results':
            phaseText = `Утро дня ${gameState.dayNumber}`;
            instructionText = 'Результаты ночи';
            break;
        case 'finished':
            phaseText = 'Игра завершена';
            instructionText = 'Подведение итогов';
            break;
    }
    
    phaseElement.textContent = phaseText;
    if (instructionElement) {
        instructionElement.textContent = instructionText;
    }
}

function updateGameStats() {
    const alivePlayers = gameState.players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.role && roleDefinitions[p.role]?.team === 'mafia');
    
    const aliveCountElement = document.getElementById('aliveCount');
    const mafiaAliveElement = document.getElementById('mafiaAlive');
    const dayDisplayElement = document.getElementById('dayDisplay');
    
    if (aliveCountElement) aliveCountElement.textContent = alivePlayers.length;
    if (mafiaAliveElement) mafiaAliveElement.textContent = aliveMafia.length;
    if (dayDisplayElement) dayDisplayElement.textContent = gameState.dayNumber;
}

// Center panel management
function updateCenterPanel() {
    const centerActions = document.getElementById('centerActions');
    if (!centerActions) return;
    
    let buttons = '';
    
    switch (gameState.phase) {
        case 'setup':
            if (gameState.players.length >= 4) {
                buttons = '<button class="center-action-btn primary" onclick="showSection(\'gameSetup\')">⚙️ Настроить игру</button>';
            }
            break;
        case 'preparation':
            buttons = '<button class="center-action-btn primary" onclick="startIntroduction()">▶️ Начать знакомство</button>';
            break;
        case 'introduction':
            const currentPlayer = getPlayerBySeat(gameState.orderIndex + 1);
            if (currentPlayer) {
                buttons = `
                    <button class="center-action-btn primary" onclick="playerIntroduced()">✅ ${currentPlayer.name} представился</button>
                    <button class="center-action-btn" onclick="skipIntroduction()">⏭️ Пропустить</button>
                `;
            }
            break;
        case 'firstNight':
            if (gameState.currentNightRole) {
                const roleName = roleDefinitions[gameState.currentNightRole]?.name || gameState.currentNightRole;
                buttons = `
                    <div style="text-align: center; margin-bottom: 10px;">
                        <strong>Действует: ${roleName}</strong>
                    </div>
                    <button class="center-action-btn" onclick="clearActiveNightRole()">❌ Отменить</button>
                    <button class="center-action-btn primary" onclick="confirmNightAction()">✅ Подтвердить</button>
                `;
            } else {
                buttons = '<button class="center-action-btn primary" onclick="mafiaIntroduced()">✅ Мафия познакомилась</button>';
            }
            break;
        case 'day':
            buttons = '<button id="btn-start-voting" class="center-action-btn primary" data-action="start-voting" onclick="startVoting()">🗳️ Начать голосование</button>';
            break;
        case 'voting':
            const alivePlayers = gameState.players.filter(p => p.status === 'alive');
            const votedCount = Object.keys(gameState.voting.votes).length;
            const allVoted = votedCount >= alivePlayers.length;
            
            // Верхняя строка статуса
            const mafiaCount = gameState.players.filter(p => p.status === 'alive' && p.role === 'mafia').length;
            const statusLine = `<div style="text-align: center; margin-bottom: 10px; font-size: 12px; color: #ccc;">
                Голосование — День ${gameState.dayNumber} | Живы: ${alivePlayers.length} | Мафия: ${mafiaCount} | Проголосовали: ${votedCount}/${alivePlayers.length}
            </div>`;
            
            // Обновим левый счетчик голосов при каждом рендере панели
            setTimeout(updateVoteSummaryPanel, 0);
            
            if (gameState.voting.currentVoterIdx < gameState.voting.order.length) {
                const currentVoterId = gameState.voting.order[gameState.voting.currentVoterIdx];
                const currentVoter = gameState.players.find(p => p.id === currentVoterId);
                
                if (currentVoter && !gameState.voting.votes[currentVoterId]) {
                    // Текущий голосующий
                    const timeStr = formatTime(gameState.voting.timer.remainingMs);
                    const isWarning = gameState.voting.timer.remainingMs <= 30000;
                    
                    buttons = statusLine + `
                        <div style="text-align: center; margin-bottom: 15px;">
                            <div style="margin-bottom: 8px; font-size: 16px;">
                                <strong>Голосует: ${currentVoter.name}</strong>
                            </div>
                            <div style="font-size: 24px; font-weight: bold; color: ${isWarning ? '#ff6b6b' : '#4CAF50'}; margin-bottom: 8px;">
                                ⏱️ ${timeStr}
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;">
                            <button class="center-action-btn small" data-action="skip-vote" onclick="skipVote()">⏭️ Пропустить</button>
                            <button class="center-action-btn small" data-action="pause-resume" onclick="pauseResumeTimer()">${gameState.voting.timer.running ? '⏸️ Пауза' : '▶️ Продолжить'}</button>
                            <button class="center-action-btn small" data-action="adjust-time" data-delta="-30000" onclick="adjustTime(-30000)">-30с</button>
                            <button class="center-action-btn small" data-action="adjust-time" data-delta="30000" onclick="adjustTime(30000)">+30с</button>
                        </div>
                    `;
                } else {
                    // Следующий
                    nextVoter();
                }
            } else {
                // Все проголосовали — подсчет результатов
                buttons = statusLine + `
                    <div style="text-align: center; margin-top: 10px;">
                        <button class="center-action-btn primary" data-action="count-votes" onclick="countVotes()">📊 Подсчитать голоса</button>
                    </div>
                `;
            }
            break;
        case 'night':
            if (gameState.currentNightRole) {
                const roleName = roleDefinitions[gameState.currentNightRole]?.name || gameState.currentNightRole;
                buttons = `
                    <div style="text-align: center; margin-bottom: 10px;">
                        <strong>Действует: ${roleName}</strong>
                    </div>
                    <button class="center-action-btn" onclick="clearActiveNightRole()">❌ Отменить</button>
                    <button class="center-action-btn primary" onclick="confirmNightAction()">✅ Подтвердить</button>
                `;
            } else {
                buttons = '<button class="center-action-btn primary" onclick="switchToDay()">🌅 Завершить ночь</button>';
            }
            break;
        case 'results':
            buttons = '<button class="center-action-btn primary" onclick="startNewDay()">☀️ Перейти к дню</button>';
            break;
    }
    
    centerActions.innerHTML = buttons;
}

// Bottom controls management
function updateBottomControls() {
    const stepBackBtn = document.getElementById('stepBackBtn');
    const stepForwardBtn = document.getElementById('stepForwardBtn');
    
    if (stepBackBtn) {
        stepBackBtn.disabled = gameState.log.length === 0;
    }
    
    if (stepForwardBtn) {
        stepForwardBtn.style.display = gameState.phase === 'finished' ? 'none' : 'inline-block';
    }
}

// Helper functions
function getPlayerBySeat(seatNumber) {
    return gameState.players.find(p => p.seatNumber === seatNumber && p.status === 'alive');
}

function checkGameEnd() {
    const alivePlayers = gameState.players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.role && roleDefinitions[p.role]?.team === 'mafia');
    const aliveCivilians = alivePlayers.filter(p => p.role && roleDefinitions[p.role]?.team === 'civilian');
    
    if (aliveMafia.length === 0) {
        endGame('civilians', 'Все мафиози устранены!');
    } else if (aliveMafia.length >= aliveCivilians.length) {
        endGame('mafia', 'Мафия захватила город!');
    }
}

function endGame(winner, reason) {
    setGamePhase('finished');
    addLogEntry('Игра завершена', `Победили: ${winner}. ${reason}`);
    
    // Show results
    updateCenterPanel();
}

// Game phase functions
function startIntroduction() {
    gameState.orderIndex = 0;
    setGamePhase('introduction');
    addLogEntry('Начало знакомства', 'Игроки начинают представляться');
    highlightCurrentPlayer();
}

function playerIntroduced() {
    const currentPlayer = getPlayerBySeat(gameState.orderIndex + 1);
    if (currentPlayer) {
        addLogEntry('Игрок представился', currentPlayer.name);
    }
    
    gameState.orderIndex++;
    const alivePlayers = gameState.players.filter(p => p.status === 'alive');
    
    if (gameState.orderIndex >= alivePlayers.length) {
        // All players introduced, go to first night
        setGamePhase('firstNight');
        addLogEntry('Знакомство завершено', 'Переход к первой ночи');
    } else {
        highlightCurrentPlayer();
        updateCenterPanel();
    }
    scheduleSave(); // Автосохранение при представлении игроков
}

function mafiaIntroduced() {
    gameState.nightNumber = 1;
    setGamePhase('day');
    gameState.dayNumber = 2;
    addLogEntry('Мафия познакомилась', 'Переход ко второму дню');
}



// ========== VISUAL VOTING SYSTEM ==========

function startVoting() {
    setGamePhase('voting');
    
    // Инициализировать новую систему голосования
    gameState.voting.isActive = true;
    gameState.voting.votes = {};
    gameState.voting.currentVoterIdx = 0;
    
    // Порядок голосования строго по местам среди живых
    gameState.voting.order = gameState.players
        .filter(p => p.status === 'alive')
        .sort((a, b) => a.seatNumber - b.seatNumber)
        .map(p => p.id);
    
    addLogEntry('Голосование', `Голосование — День ${gameState.dayNumber}. Участников: ${gameState.voting.order.length}`);
    
    // Начать первый ход
    if (gameState.voting.order.length > 0) {
        startCurrentVoterTurn();
    }
    
    updateVisualVoting();
    updateCenterPanel();
    scheduleSave(); // Автосохранение при старте голосования
    updateVoteSummaryPanel();
    // Форсируем отрисовку мест и повторную установку классов после центра
    updatePlayerTable();
}

function startCurrentVoterTurn() {
    // Всегда останавливаем предыдущий таймер перед началом нового хода
    stopVotingTimer();
    
    if (gameState.voting.currentVoterIdx >= gameState.voting.order.length) {
        // Все проголосовали
        updateVisualVoting();
        updateCenterPanel();
        return;
    }
    
    const voterId = gameState.voting.order[gameState.voting.currentVoterIdx];
    const voter = gameState.players.find(p => p.id === voterId);
    
    if (!voter || voter.status !== 'alive' || gameState.voting.votes[voterId]) {
        // Пропустить если игрок мертв или уже проголосовал
        gameState.voting.currentVoterIdx++;
        startCurrentVoterTurn();
        return;
    }
    
    // Запустить таймер 2:00
    console.log(`🕒 Запускаем таймер для игрока ${voter.name} на 2 минуты`);
    startVotingTimer(() => {
        // Время истекло - воздержание  
        console.log(`⏰ Время истекло для игрока ${voter.name}, автоматическое воздержание`);
        gameState.voting.votes[voterId] = 'abstain';
        addLogEntry('Время истекло', `${voter.name} воздержался`);
        nextVoter();
    });
    
    updateVisualVoting();
    updateCenterPanel();
}

function handleVoteClick(targetId) {
    if (!gameState.voting.isActive) return;
    
    const voterId = gameState.voting.order[gameState.voting.currentVoterIdx];
    const voter = gameState.players.find(p => p.id === voterId);
    const target = gameState.players.find(p => p.id === targetId);
    
    // Валидация
    if (!voter || voter.status !== 'alive') return;
    if (!target || target.status !== 'alive') return;
    if (voterId === targetId) return; // Нельзя за себя
    if (gameState.voting.votes[voterId]) return; // Уже проголосовал
    
    // Показать модальное подтверждение
    showVoteConfirmation(voter, target, () => {
        // Подтверждено - фиксировать голос
        gameState.voting.votes[voterId] = targetId;
        addLogEntry('Голос подан', `${voter.name} голосует против ${target.name}`);
        scheduleSave(); // Автосохранение при подаче голоса
        updateVoteSummaryPanel();
        nextVoter();
    });
}

function showVoteConfirmation(voter, target, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'vote-confirmation-modal';
    modal.innerHTML = `
        <div class="vote-confirmation-content">
            <h3>Подтвердить голос</h3>
            <p><strong>${voter.name}</strong> голосует против <strong>${target.name}</strong></p>
            <div class="modal-buttons">
                <button class="modal-btn confirm" onclick="confirmVote()">Подтвердить</button>
                <button class="modal-btn cancel" onclick="cancelVote()">Отменить</button>
            </div>
        </div>
    `;
    
    // Глобальные функции для кнопок
    window.confirmVote = () => {
        document.body.removeChild(modal);
        delete window.confirmVote;
        delete window.cancelVote;
        onConfirm();
    };
    
    window.cancelVote = () => {
        document.body.removeChild(modal);
        delete window.confirmVote;
        delete window.cancelVote;
    };
    
    document.body.appendChild(modal);
}

function nextVoter() {
    stopVotingTimer();
    gameState.voting.currentVoterIdx++;
    startCurrentVoterTurn();
    updateVoteSummaryPanel();
}

function skipVote() {
    if (!gameState.voting.isActive) return;
    
    const voterId = gameState.voting.order[gameState.voting.currentVoterIdx];
    const voter = gameState.players.find(p => p.id === voterId);
    
    if (voter && !gameState.voting.votes[voterId]) {
        gameState.voting.votes[voterId] = 'abstain';
        addLogEntry('Голос пропущен', `${voter.name} воздержался`);
        nextVoter();
    }
    updateVoteSummaryPanel();
}

function countVotes() {
    if (!gameState.voting.isActive) return;
    
    // Подсчет только голосов против живых (игнорируем abstain)
    const voteCounts = new Map();
    Object.values(gameState.voting.votes).forEach(targetId => {
        if (targetId && targetId !== 'abstain') {
            voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
        }
    });
    
    // Логирование результатов
    let resultsText = 'Результаты голосования:\n';
    voteCounts.forEach((count, targetId) => {
        const player = gameState.players.find(p => p.id === targetId);
        resultsText += `${player?.name}: ${count} голос(ов)\n`;
    });
    
    const abstainCount = Object.values(gameState.voting.votes).filter(v => v === 'abstain').length;
    if (abstainCount > 0) {
        resultsText += `Воздержались: ${abstainCount}`;
    }
    
    addLogEntry('Подсчет голосов', resultsText);
    
    if (voteCounts.size === 0) {
        addLogEntry('Результат', 'Никто не получил голосов');
        endVoting();
        
        // ПРИНУДИТЕЛЬНО переходим к ночной фазе если никто не получил голосов
        setTimeout(() => {
            setGamePhase('night');
            updateCenterPanel();
        }, 3000);
        return;
    }
    
    // Найти лидеров
    let maxVotes = 0;
    let leaders = [];
    voteCounts.forEach((count, targetId) => {
        if (count > maxVotes) {
            maxVotes = count;
            leaders = [targetId];
        } else if (count === maxVotes) {
            leaders.push(targetId);
        }
    });
    
    if (leaders.length === 1) {
        // Единоличный лидер - исключение
        const eliminatedId = leaders[0];
        const eliminated = gameState.players.find(p => p.id === eliminatedId);
        
        updatePlayerStatus(eliminatedId, 'dead', `Исключен голосованием (${maxVotes} голосов)`);
        addLogEntry('Исключение', `💀 ${eliminated.name} исключен голосованием (${maxVotes} голосов)`);
        
        endVoting();
        
        // ПРИНУДИТЕЛЬНО переходим к следующей фазе после проверки окончания игры
        setTimeout(() => {
            if (!checkGameEnd()) {
                setGamePhase('night');
                updateCenterPanel();
            }
        }, 3000);
        
    } else {
        // Ничья - обработка по настройкам
        const tiedNames = leaders.map(id => gameState.players.find(p => p.id === id)?.name).join(', ');
        
        if (gameState.voting.settings.tieMode === 'revote') {
            addLogEntry('Ничья', `Ничья между: ${tiedNames}. Повторное голосование`);
            startVoting(); // Перезапуск
        } else if (gameState.voting.settings.tieMode === 'roulette') {
            addLogEntry('Ничья', `Ничья между: ${tiedNames}. Русская рулетка`);
            const randomWinner = leaders[Math.floor(Math.random() * leaders.length)];
            const eliminated = gameState.players.find(p => p.id === randomWinner);
            
            updatePlayerStatus(randomWinner, 'dead', 'Исключен русской рулеткой');
            addLogEntry('Русская рулетка', `💀 ${eliminated.name} исключен русской рулеткой`);
            
            endVoting();
            
            // ПРИНУДИТЕЛЬНО переходим к следующей фазе после проверки окончания игры
            setTimeout(() => {
                if (!checkGameEnd()) {
                    setGamePhase('night');
                    updateCenterPanel();
                }
            }, 3000);
        }
    }
}

function endVoting() {
    gameState.voting.isActive = false;
    stopVotingTimer();
    setGamePhase('results');
    updateVisualVoting(); // Очистить визуальные эффекты
    updateCenterPanel();
    const panel = document.getElementById('vote-summary-panel');
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
}

// НОВЫЙ ПРОСТОЙ ТАЙМЕР С ВИЗУАЛЬНЫМ ОБНОВЛЕНИЕМ
// ---- Voting timer (unified implementation) ----
function startVotingTimer(onExpire) {
    stopVotingTimer();

    const DURATION = 120000; // 2 минуты
    const now = Date.now();

    gameState.voting.timer.running = true;
    gameState.voting.timer.startedAt = now;
    gameState.voting.timer.endTime = now + DURATION;     // добавляем поле endTime
    gameState.voting.timer.remainingMs = DURATION;

    console.log('🕒 Unified таймер голосования запущен на 120 секунд (2 минуты)');

    // 1) Авто-истечение
    gameState.voting.timer.handle = setTimeout(() => {
        gameState.voting.timer.running = false;
        updateVisualTimer();
        onExpire?.();
    }, DURATION);

    // 2) Тик для UI раз в секунду
    gameState.voting.timer.visualInterval = setInterval(() => {
        if (!gameState.voting.timer.running) return;
        const rest = Math.max(0, gameState.voting.timer.endTime - Date.now());
        gameState.voting.timer.remainingMs = rest;
        updateCenterPanel();
        updateVisualTimer();
    }, 1000);
}

function stopVotingTimer() {
    gameState.voting.timer.running = false;
    if (gameState.voting.timer.handle) {
        clearTimeout(gameState.voting.timer.handle);
        gameState.voting.timer.handle = null;
    }
    if (gameState.voting.timer.visualInterval) {
        clearInterval(gameState.voting.timer.visualInterval);
        gameState.voting.timer.visualInterval = null;
    }
}

function pauseVotingTimer() {
    if (!gameState.voting.timer.running) return;
    gameState.voting.timer.running = false;

    // Сохраняем остаток и чистим таймеры
    gameState.voting.timer.remainingMs = Math.max(0, gameState.voting.timer.endTime - Date.now());
    if (gameState.voting.timer.handle) clearTimeout(gameState.voting.timer.handle);
    gameState.voting.timer.handle = null;
    if (gameState.voting.timer.visualInterval) clearInterval(gameState.voting.timer.visualInterval);
    gameState.voting.timer.visualInterval = null;

    updateVisualTimer();
}

function resumeVotingTimer(onExpire) {
    if (gameState.voting.timer.running) return;
    if (gameState.voting.timer.remainingMs <= 0) return;

    const now = Date.now();
    gameState.voting.timer.running = true;
    gameState.voting.timer.startedAt = now;
    gameState.voting.timer.endTime = now + gameState.voting.timer.remainingMs;

    // перезапускаем основной таймер и тики UI
    gameState.voting.timer.handle = setTimeout(() => {
        gameState.voting.timer.running = false;
        updateVisualTimer();
        onExpire?.();
    }, gameState.voting.timer.remainingMs);

    gameState.voting.timer.visualInterval = setInterval(() => {
        if (!gameState.voting.timer.running) return;
        const rest = Math.max(0, gameState.voting.timer.endTime - Date.now());
        gameState.voting.timer.remainingMs = rest;
        updateCenterPanel();
        updateVisualTimer();
    }, 1000);
}

function pauseResumeTimer() {
    if (gameState.voting.timer.running) {
        pauseVotingTimer();
    } else {
        resumeVotingTimer(() => {
            const voterId = gameState.voting.order[gameState.voting.currentVoterIdx];
            const voter = gameState.players.find(p => p.id === voterId);
            gameState.voting.votes[voterId] = 'abstain';
            addLogEntry('Время истекло', `${voter?.name || 'Игрок'} воздержался`);
            nextVoter();
        });
    }
    updateCenterPanel();
}

function adjustTime(ms) {
    gameState.voting.timer.remainingMs = Math.max(0, gameState.voting.timer.remainingMs + ms);
    if (gameState.voting.timer.running) {
        gameState.voting.timer.endTime = Date.now() + gameState.voting.timer.remainingMs;
    }
    updateCenterPanel();
}

function resetVotingTimer() {
    // Полный ресет (не во время хода) — просто перезапуск с 2:00
    startVotingTimer(() => {
        const voterId = gameState.voting.order[gameState.voting.currentVoterIdx];
        const voter = gameState.players.find(p => p.id === voterId);
        gameState.voting.votes[voterId] = 'abstain';
        addLogEntry('Время истекло', `${voter?.name || 'Игрок'} воздержался`);
        nextVoter();
    });
}

function updateVisualVoting() {
    // Очистить все визуальные эффекты
    document.querySelectorAll('.player-seat').forEach(seat => {
        seat.classList.remove('voting-current', 'voting-target', 'voting-complete', 'vote-transition', 'voting-timer-warning');
        
        const oldLabel = seat.querySelector('.vote-label');
        if (oldLabel) oldLabel.remove();
        
        const oldTimer = seat.querySelector('.voting-timer-ring');
        if (oldTimer) oldTimer.remove();
        
        const oldTimerText = seat.querySelector('.voting-timer-text');
        if (oldTimerText) oldTimerText.remove();
    });
    
    if (!gameState.voting.isActive) return;
    
    const currentVoterId = gameState.voting.order[gameState.voting.currentVoterIdx];
    
    gameState.players.forEach(player => {
        const seat = document.querySelector(`[data-seat-number="${player.seatNumber}"]`);
        if (!seat) return;
        
        // Текущий голосующий - бирюзовое свечение + увеличение + таймер
        if (player.id === currentVoterId && player.status === 'alive' && !gameState.voting.votes[player.id]) {
            seat.classList.add('voting-current');
            
            // Добавить круговой таймер на карточку
            addVotingTimer(seat);
            
            // Предупреждение при последних 10 секундах
            if (gameState.voting.timer.remainingMs <= 10000) {
                seat.classList.add('voting-timer-warning');
            }
        }
        // Доступные цели - белая рамка
        else if (player.status === 'alive' && player.id !== currentVoterId) {
            seat.classList.add('voting-target');
        }
        
        // Показать результат голоса
        const vote = gameState.voting.votes[player.id];
        if (vote) {
            seat.classList.add('voting-complete');
            
            const voteLabel = document.createElement('div');
            voteLabel.className = 'vote-label';
            
            if (vote === 'abstain') {
                voteLabel.textContent = 'воздержался';
            } else {
                const target = gameState.players.find(p => p.id === vote);
                voteLabel.textContent = `против: ${target?.name}`;
            }
            
            seat.appendChild(voteLabel);
        }
    });
}

function addVotingTimer(seat) {
    // Круговое кольцо таймера
    const timerRing = document.createElement('div');
    timerRing.className = 'voting-timer-ring';
    seat.appendChild(timerRing);
    
    // Текст времени
    const timerText = document.createElement('div');
    timerText.className = 'voting-timer-text';
    seat.appendChild(timerText);
    
    updateTimerRing(timerRing, timerText);
}

function updateVisualTimer() {
    // Обновить круговой таймер на карточке текущего голосующего
    const currentVoterId = gameState.voting.order[gameState.voting.currentVoterIdx];
    const currentVoter = gameState.players.find(p => p.id === currentVoterId);
    if (currentVoter) {
        const seat = document.querySelector(`[data-seat-number="${currentVoter.seatNumber}"]`);
        if (seat) {
            const ring = seat.querySelector('.voting-timer-ring');
            const text = seat.querySelector('.voting-timer-text');
            if (ring && text) {
                updateTimerRing(ring, text);
            }
            
            // Добавить предупреждение на последних 10 секундах
            if (gameState.voting.timer.remainingMs <= 10000 && gameState.voting.timer.remainingMs > 0) {
                seat.classList.add('voting-timer-warning');
            }
        }
    }
}

function updateTimerRing(ring, text) {
    if (!ring || !text) return;
    
    // Правильное вычисление прогресса с учетом endTime
    const totalDuration = gameState.voting.timer.endTime ? 
        (gameState.voting.timer.endTime - gameState.voting.timer.startedAt) : 120000;
    const progress = Math.max(0, gameState.voting.timer.remainingMs / totalDuration);
    const timeStr = formatTime(gameState.voting.timer.remainingMs);
    
    // Обновить цвет кольца от зеленого к красному
    let color;
    if (progress > 0.5) {
        const ratio = (progress - 0.5) * 2;
        color = `rgb(${Math.round(255 * (1 - ratio))}, 255, 0)`;
    } else {
        const ratio = progress * 2;
        color = `rgb(255, ${Math.round(255 * ratio)}, 0)`;
    }
    
    const degrees = progress * 360;
    ring.style.background = `conic-gradient(from 0deg, ${color} ${degrees}deg, rgba(255,255,255,0.1) ${degrees}deg)`;
    
    text.textContent = timeStr;
}

function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startNight() {
    gameState.nightNumber++;
    setGamePhase('night');
    addLogEntry('Ночная фаза', `Наступила ночь ${gameState.nightNumber}`);
    updateCenterPanel();
    updatePlayerTable();
}

function highlightCurrentPlayer() {
    // Remove current class from all players
    document.querySelectorAll('.player-seat').forEach(seat => {
        seat.classList.remove('current');
    });
    
    // Add current class to active player during introduction
    const currentPlayer = getPlayerBySeat(gameState.orderIndex + 1);
    if (currentPlayer && gameState.phase === 'introduction') {
        const seat = document.querySelector(`[data-player-id="${currentPlayer.id}"]`);
        if (seat) {
            seat.classList.add('current');
        }
    }
}

// Bottom control functions
function stepBack() {
    if (gameState.log.length === 0) return;
    
    // For now, just show previous log entry
    const lastEntry = gameState.log[gameState.log.length - 1];
    addLogEntry('Шаг назад', `Отменено: ${lastEntry.action}`);
}

function stepForward() {
    // Move to next logical phase based on current state
    switch (gameState.phase) {
        case 'setup':
            if (gameState.players.length >= 4) {
                showSection('gameSetup');
            }
            break;
        case 'preparation':
            startIntroduction();
            break;
        case 'introduction':
            playerIntroduced();
            break;
        case 'firstNight':
            mafiaIntroduced();
            break;
        case 'day':
            startVoting();
            break;
        case 'voting':
            skipVote();
            break;
        case 'night':
            // For now, skip to results
            setGamePhase('results');
            break;
        case 'results':
            startNewDay();
            break;
    }
}



function togglePause() {
    const gameTable = document.getElementById('gameTable');
    const pauseBtn = document.getElementById('pauseBtn');
    
    if (gameTable && pauseBtn) {
        if (gameTable.classList.contains('game-paused')) {
            gameTable.classList.remove('game-paused');
            pauseBtn.textContent = '⏸️ Пауза';
            addLogEntry('Игра возобновлена', '');
        } else {
            gameTable.classList.add('game-paused');
            pauseBtn.textContent = '▶️ Продолжить';
            addLogEntry('Игра приостановлена', '');
        }
    }
}

function toggleLog() {
    const logContent = document.getElementById('logContent');
    const logToggle = document.querySelector('.log-toggle');
    
    if (logContent && logToggle) {
        if (logContent.style.display === 'none') {
            logContent.style.display = 'block';
            logToggle.textContent = '_';
        } else {
            logContent.style.display = 'none';
            logToggle.textContent = '+';
        }
    }
}

function showRules() {
    // Create a popup with rules
    const rulesModal = document.createElement('div');
    rulesModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    rulesModal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 15px;
            padding: 30px;
            max-width: 400px;
            color: white;
            text-align: center;
        ">
            <h2>📖 Правила игры</h2>
            <p>Краткие правила Мафии:</p>
            <ul style="text-align: left; margin: 20px 0;">
                <li>День: обсуждение и голосование</li>
                <li>Ночь: мафия выбирает жертву</li>
                <li>Специальные роли действуют ночью</li>
                <li>Цель мирных: найти всю мафию</li>
                <li>Цель мафии: стать большинством</li>
            </ul>
            <button onclick="this.parentElement.parentElement.remove()" 
                style="
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 20px;
                    cursor: pointer;
                ">
                Закрыть
            </button>
        </div>
    `;
    
    document.body.appendChild(rulesModal);
}

function saveLog() {
    const logText = gameState.log.map(entry => 
        `[${entry.timestamp}] ${entry.action}${entry.details ? ': ' + entry.details : ''}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mafia-game-log-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    addLogEntry('Лог сохранен', 'Файл загружен на устройство');
}



function startNewDay() {
    gameState.dayNumber++;
    gameState.nightNumber++;
    setGamePhase('day');
    addLogEntry('Новый день', `Начался день ${gameState.dayNumber}`);
}

// Load game data from Telegram WebApp
function loadGameData() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');
    
    if (eventId) {
        fetchGameData(eventId);
    } else {
        // Demo mode
        updateUI();
    }
    
    // Initialize roles settings
    renderRolesSettings();
}

// Fetch game data from server
async function fetchGameData(eventId) {
    try {
        const response = await fetch(`/api/balagan/game/${eventId}`);
        if (response.ok) {
            const data = await response.json();
            gameState.players = data.players || [];
            gameState.phase = data.phase || 'setup';
            gameState.isActive = data.isActive || false;
            updateUI();
            addHistoryEntry(`📥 Данные игры загружены (событие ${eventId})`);
        }
    } catch (error) {
        console.error('Error loading game data:', error);
        addHistoryEntry('❌ Ошибка загрузки данных игры');
    }
}

// UI Management
// Dynamic roles UI functions
function renderRolesSettings() {
    const wrap = document.getElementById('roles-settings');
    if (!wrap) return;
    
    wrap.innerHTML = '';

    ROLES.filter(r => r.ui).forEach(role => {
        const id = `role_${role.key}`;
        const label = document.createElement('label');
        label.className = 'role-toggle';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.checked = !!role.defaultOn;

        input.addEventListener('change', () => {
            gameState.enabledRoles[role.key] = input.checked;
        });

        const span = document.createElement('span');
        span.textContent = role.label;

        label.appendChild(input);
        label.appendChild(span);
        wrap.appendChild(label);
    });

    // начальное состояние enabledRoles
    gameState.enabledRoles = {};
    ROLES.filter(r => r.ui).forEach(r => gameState.enabledRoles[r.key] = !!r.defaultOn);
}

function readEnabledRolesFromUI() {
    ROLES.filter(r => r.ui).forEach(r => {
        const el = document.getElementById(`role_${r.key}`);
        if (el) gameState.enabledRoles[r.key] = el.checked;
    });
}

function afterRolesAssigned() {
    gameState.initialMafiaCount = gameState.players.filter(p =>
        ['mafia','don','consigliere'].includes(p.role)
    ).length;
    gameState.consigliereUsed = false;
    gameState.kamikazeUsed = false;
}

// Show/hide sections
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section, .game-table-container, .main-menu').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show requested section
    if (sectionId === 'game') {
        document.getElementById('gameTable').style.display = 'flex';
    } else if (sectionId === 'menu') {
        document.getElementById('mainMenu').style.display = 'block';
    } else {
        const sectionMap = {
            'players': 'playersSection',
            'gameSetup': 'gameSetupSection',
            'rules': 'rulesSection',
            'history': 'historySection'
        };
        const element = document.getElementById(sectionMap[sectionId]);
        if (element) element.style.display = 'block';
    }
    
    if (sectionId === 'players') {
        updatePlayersList();
    } else if (sectionId === 'history') {
        updateHistoryDisplay();
    } else if (sectionId === 'gameSetup') {
        renderRolesSettings();
    }
}

function showMainMenu() {
    showSection('menu');
}

function updateUI() {
    updatePhaseDisplay();
    updateGameStats();
    updatePlayerTable();
    updateCenterPanel();
    updateBottomControls();
    updateLogDisplay();
}

function updateGameStatus() {
    const phaseIndicator = document.getElementById('phaseIndicator');
    const playerCount = document.getElementById('playerCount');
    const currentPhase = document.getElementById('currentPhase');
    const aliveCount = document.getElementById('aliveCount');
    const mafiaAlive = document.getElementById('mafiaAlive');
    
    const phaseNames = {
        setup: 'Подготовка',
        day: `День ${gameState.dayNumber}`,
        night: `Ночь ${gameState.dayNumber}`,
        voting: `Голосование День ${gameState.dayNumber}`,
        finished: 'Игра завершена'
    };
    
    if (phaseIndicator) phaseIndicator.textContent = phaseNames[gameState.phase] || gameState.phase;
    if (playerCount) playerCount.textContent = gameState.players.length;
    if (currentPhase) currentPhase.textContent = phaseNames[gameState.phase] || gameState.phase;
    
    const alivePlayers = gameState.players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.role && (p.role === 'mafia' || p.role === 'don' || p.role === 'consigliere'));
    
    if (aliveCount) aliveCount.textContent = alivePlayers.length;
    if (mafiaAlive) mafiaAlive.textContent = aliveMafia.length;
}

// Player Management
function addPlayer() {
    const nameInput = document.getElementById('playerName');
    const usernameInput = document.getElementById('playerUsername');
    const seatInput = document.getElementById('seatNumber');
    
    const name = nameInput.value.trim();
    const username = usernameInput.value.trim();
    const seatNumber = parseInt(seatInput.value);
    
    if (!name) {
        alert('Введите имя игрока!');
        return;
    }
    
    if (!seatNumber || seatNumber < 1 || seatNumber > 20) {
        alert('Введите номер места от 1 до 20!');
        return;
    }
    
    // Check if seat is taken
    if (gameState.players.some(p => p.seatNumber === seatNumber)) {
        alert('Это место уже занято!');
        return;
    }
    
    const player = {
        id: Date.now(),
        name: name,
        username: username,
        telegramId: document.getElementById('telegramId').value.trim(),
        seatNumber: seatNumber,
        role: null,
        status: 'alive',
        actions: []
    };
    
    gameState.players.push(player);
    gameState.players.sort((a, b) => a.seatNumber - b.seatNumber);
    
    // Clear inputs
    nameInput.value = '';
    usernameInput.value = '';
    document.getElementById('telegramId').value = '';
    seatInput.value = '';
    
    updatePlayersList();
    updateUI();
    addHistoryEntry(`➕ Добавлен игрок: ${name} (место ${seatNumber})`);
    updateGameInstructions();
    scheduleSave(); // Автосохранение при добавлении игрока
}

function removePlayer(playerId) {
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
        const player = gameState.players[playerIndex];
        gameState.players.splice(playerIndex, 1);
        updatePlayersList();
        updateUI();
        addHistoryEntry(`➖ Удален игрок: ${player.name}`);
        updateGameInstructions();
    }
}

function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    if (!playersList) return;
    
    if (gameState.players.length === 0) {
        playersList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">Нет добавленных игроков</p>';
        return;
    }
    
    playersList.innerHTML = gameState.players.map(player => {
        // Используем данные из регистрации для отображения
        const displayName = player.nickname || player.displayName || player.name;
        const realNameInfo = player.realName ? ` (${player.realName})` : '';
        
        // Определяем аватарку - приоритет загруженной из регистрации
        let avatarContent = displayName.charAt(0).toUpperCase();
        if (player.avatarUrl) {
            avatarContent = `<img src="${player.avatarUrl}" 
                             style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                             onerror="this.outerHTML='${displayName.charAt(0).toUpperCase()}';" 
                             alt="${displayName}">`;
        } else if (player.telegramId) {
            avatarContent = `<img src="https://t.me/i/userpic/160/${player.username || player.telegramId}.jpg" 
                             style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                             onerror="this.outerHTML='${displayName.charAt(0).toUpperCase()}';" 
                             alt="${displayName}">`;
        }
        
        return `
            <div class="player-item ${player.status === 'dead' ? 'dead-player' : ''}">
                <div class="player-info">
                    <div class="player-avatar">${avatarContent}</div>
                    <div class="player-details">
                        <h4>${displayName}${realNameInfo} ${player.status === 'dead' ? '💀' : ''}</h4>
                        <p>Место: ${player.seatNumber} ${player.username ? `| @${player.username}` : ''}</p>
                        ${player.telegramId ? `<p>ID: ${player.telegramId}</p>` : ''}
                        ${player.role ? `<p>Роль: ${roleDefinitions[player.role]?.name}</p>` : ''}
                        <p>Статус: ${player.status === 'alive' ? '✅ Жив' : '💀 Мертв'}</p>
                    </div>
                </div>
                <div class="player-actions">
                    <button class="status-btn ${player.status === 'alive' ? 'kill-btn' : 'revive-btn'}" 
                            onclick="togglePlayerStatus(${player.id})">
                        ${player.status === 'alive' ? '💀 Убить' : '💚 Вернуть'}
                    </button>
                    <button class="remove-btn" onclick="removePlayer(${player.id})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Role Assignment
function assignRoles() {
    if (gameState.players.length < 4) {
        alert('Нужно минимум 4 игрока для начала игры!');
        return;
    }
    
    // Read enabled roles from UI
    readEnabledRolesFromUI();
    
    // Get game mode
    const gameModeRadios = document.getElementsByName('gameMode');
    gameState.gameMode = Array.from(gameModeRadios).find(r => r.checked)?.value || 'hidden';
    
    // Assign roles
    const roles = calculateRoles(gameState.players.length);
    const shuffledPlayers = [...gameState.players].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffledPlayers.length; i++) {
        shuffledPlayers[i].role = roles[i];
        shuffledPlayers[i].status = 'alive';
    }
    
    // Fix initial mafia count and reset single-use abilities
    afterRolesAssigned();
    
    gameState.phase = 'day';
    gameState.dayNumber = 1;
    gameState.isActive = true;
    
    // Send roles to players (if connected to Telegram bot)
    sendRolesToPlayers();
    
    // Create game ID if needed and schedule save
    if (!gameState.id) {
        createNewGame();
    } else {
        scheduleSave();
    }
    
    updateUI();
    showSection('game');
    addLogEntry('Роли разданы', 'Игра началась!');
    
    if (gameState.settings.gameMode === 'open') {
        addLogEntry('Режим игры', 'Открытые роли');
    } else {
        addLogEntry('Режим игры', 'Скрытые роли');
    }
    
    setGamePhase('preparation');
}

function calculateRoles(playerCount) {
    const roles = [];

    // 1) сформировать пул мафии (~треть стола)
    let mafiaPool = Math.max(1, Math.floor(playerCount / 3));

    // приоритетные маф-ролей (дон/консильери) — если включены
    const mafiaSpecials = ['don','consigliere'].filter(k => gameState.enabledRoles[k]);
    mafiaSpecials.forEach(k => {
        if (mafiaPool > 0) { roles.push(k); mafiaPool--; }
    });

    // добить пул обычной мафией
    while (mafiaPool-- > 0) roles.push('mafia');

    // 2) спец-роли (кроме «мафии» и «мирного»)
    ROLES.forEach(r => {
        if (!r.ui) return; // пропускаем скрытые тумблеры (mafia/civilian)
        if (['don','consigliere'].includes(r.key)) return; // уже учли
        if (gameState.enabledRoles[r.key]) roles.push(r.key);
    });

    // 3) добиваем мирными
    while (roles.length < playerCount) roles.push('civilian');

    // перемешаем
    roles.sort(() => Math.random() - 0.5);
    return roles;
}

async function sendRolesToPlayers() {
    try {
        const response = await fetch('/api/send-roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                players: gameState.players,
                gameTitle: 'Mafia Game'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.sent > 0) {
                addLogEntry('Роли отправлены', `Успешно: ${result.sent}, ошибок: ${result.errors}`);
            } else {
                addLogEntry('Роли не отправлены', 'Игроки должны запустить бота командой /start');
            }
            console.log('✅ Roles sent to players:', result);
        } else {
            addLogEntry('Ошибка отправки', 'Не удалось отправить роли в личные сообщения');
            console.error('❌ Failed to send roles');
        }
    } catch (error) {
        console.error('Error sending roles:', error);
        addLogEntry('Ошибка отправки', 'Ошибка отправки ролей');
    }
}

// Player Table Management
function updatePlayerTable() {
    const playerSeats = document.getElementById('playerSeats');
    if (!playerSeats) return;
    
    playerSeats.innerHTML = '';
    
    // Показываем только занятые места плюс один пустой для добавления
    const occupiedSeats = gameState.players.length;
    const totalSeats = Math.max(occupiedSeats + 1, 8); // минимум 8 мест
    
    // Создаем только нужное количество мест
    for (let i = 1; i <= totalSeats; i++) {
        const player = gameState.players.find(p => p.seatNumber === i);
        const seat = document.createElement('div');
        seat.className = 'player-seat';
        seat.dataset.seatNumber = i;
        
        // Позиционируем вокруг овального стола с увеличенным радиусом
        const angle = ((i - 1) / totalSeats) * 2 * Math.PI - Math.PI / 2;
        const radiusX = 360; // увеличенный горизонтальный радиус
        const radiusY = 260; // увеличенный вертикальный радиус
        const x = 350 + radiusX * Math.cos(angle);
        const y = 250 + radiusY * Math.sin(angle);
        
        // Уменьшенные размеры карточек
        seat.style.left = `${x - 30}px`;
        seat.style.top = `${y - 30}px`;
        seat.style.position = 'absolute';
        seat.style.width = '60px';
        seat.style.height = '60px';
        
        if (player) {
            seat.dataset.playerId = player.id;
            seat.classList.add(player.status);
            
            // Add role class for night highlighting
            if (player.role) {
                seat.classList.add(player.role);
            }
            
            const roleInfo = player.role ? roleDefinitions[player.role] : null;
            const showRole = gameState.settings.gameMode === 'open' || gameState.phase === 'finished';
            
            // Role badge positioned on avatar - only show in open mode or when game finished
            let roleBadge = '';
            if (roleInfo && showRole) {
                roleBadge = `<div class="role-badge" style="
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: var(--role-${player.role}, #666);
                    border-radius: 50%;
                    width: 16px;
                    height: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 8px;
                    border: 1px solid white;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    z-index: 5;
                ">${roleInfo.emoji}</div>`;
            }
            
            // Create avatar content - prioritize avatarUrl from registration, fallback to Telegram
            let avatarContent = '👤'; // Default fallback
            if (player.avatarUrl) {
                // Use uploaded avatar from registration
                avatarContent = `<img src="${player.avatarUrl}" 
                                 style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='👤' + (this.parentElement.querySelector('.role-badge')?.outerHTML || '');"
                                 alt="${player.displayName || player.name}">`;
            } else if (player.telegramId) {
                // Fallback to Telegram avatar
                avatarContent = `<img src="https://t.me/i/userpic/160/${player.username || player.telegramId}.jpg" 
                                 style="width: 100%; height: 100%; border-radius: 8px; object-fit: cover;" 
                                 onerror="this.style.display='none'; this.parentElement.innerHTML='👤' + (this.parentElement.querySelector('.role-badge')?.outerHTML || '');"
                                 alt="${player.displayName || player.name}">`;
            }
            
            seat.innerHTML = `
                <div class="player-avatar" style="position: relative; width: 100%; height: 100%;">
                    ${avatarContent}
                    ${roleBadge}
                </div>
            `;
            
            // Create name element outside the seat
            const existingNameElement = playerSeats.querySelector(`[data-name-for="${player.id}"]`);
            if (existingNameElement) {
                existingNameElement.remove();
            }
            
            const nameElement = document.createElement('div');
            nameElement.className = 'player-name-external';
            nameElement.setAttribute('data-name-for', player.id);
            
            // Show nickname from registration if available, otherwise display name or username
            const displayText = player.nickname || player.displayName || player.name;
            nameElement.textContent = displayText.length > 8 ? displayText.substring(0, 8) + '...' : displayText;
            
            // Position name below the seat using seat's position
            nameElement.style.position = 'absolute';
            nameElement.style.left = seat.style.left;
            nameElement.style.top = seat.style.top;
            nameElement.style.transform = 'translateX(-50%) translateY(68px)';
            nameElement.style.marginLeft = '30px';
            
            playerSeats.appendChild(nameElement);
            
            seat.onclick = () => handlePlayerClick(player.id);
            
            // Add special state classes for night phase
            updatePlayerNightStates(seat, player);
            
            // Update player display and badges
            updatePlayerDisplay(player);
            
            // Apply avatar color based on current phase
            if (gameState.phase === 'night' || gameState.phase === 'firstNight') {
                if (player.role && player.status === 'alive') {
                    seat.classList.add(player.role);
                }
            }
        } else {
            seat.classList.add('empty');
            seat.innerHTML = `
                <div class="seat-number">${i}</div>
                <div class="player-name">Пусто</div>
            `;
        }
        
        playerSeats.appendChild(seat);
    }
    
    // Apply night phase styling to table container
    updateNightPhaseHighlighting();
    // Применяем визуальные классы голосования после отрисовки мест
    if (gameState.phase === 'voting') {
        updateVisualVoting();
    }
}

function selectPlayer(playerId) {
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => seat.classList.remove('selected'));
    
    const player = gameState.players.find(p => p.id === playerId);
    if (player && player.status === 'alive') {
        const seat = document.querySelector(`[data-seat-number="${player.seatNumber}"]`);
        if (seat) {
            seat.classList.add('selected');
        }
    }
}

// Обработчик кликов по игрокам с учетом текущего контекста
function handlePlayerClick(playerId) {
    console.log('Клик по игроку:', playerId);
    console.log('Текущая фаза:', gameState.phase);
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
        console.log('Игрок не найден');
        return;
    }
    
    // Visual voting - cast vote
    if (gameState.phase === 'voting' && gameState.voting.isActive) {
        handleVoteClick(playerId);
        return;
    }
    
    // Night phase - select target for NEW night action system
    if (gameState.phase === 'night' && gameState.currentNightRole) {
        if (player.status !== 'alive') {
            console.log('Нельзя выбрать мертвого игрока для ночного действия');
            return;
        }
        // Используем новую функцию выбора цели
        selectTarget(playerId);
        return;
    } 
    else {
        // УБИРАЕМ popup во время ночной фазы - используем только центральный интерфейс
        if (gameState.phase === 'night') {
            console.log('Night phase: no popup, using center interface only');
            return;
        }
        // General player selection - show management controls only for non-night phases
        selectedPlayerId = playerId;
        selectPlayer(playerId);
        showPlayerManagementPopup(player);
    }
}



function selectNightTarget(targetId) {
    const targetPlayer = gameState.players.find(p => p.id === targetId);
    if (!targetPlayer) return;
    
    const currentRole = gameState.currentNightRole;
    if (!currentRole) return;
    
    const roleInfo = roleDefinitions[currentRole];
    
    // Check role-specific restrictions
    switch (currentRole) {
        case 'mafia':
        case 'don':
            if (targetPlayer.role === 'mafia' || targetPlayer.role === 'don') {
                alert('Мафия не может убить свою команду!');
                return;
            }
            // Execute kill
            updatePlayerStatus(targetId, 'dead', `Убит ${roleInfo?.name || currentRole}`);
            addLogEntry('Ночное убийство', `${roleInfo?.name || currentRole} убивает ${targetPlayer.name}`);
            break;
            
        case 'commissar':
            // Check player
            const isMafia = targetPlayer.role === 'mafia' || targetPlayer.role === 'don';
            markPlayerChecked(targetId, true);
            addLogEntry('Проверка Комиссара', `${targetPlayer.name} - ${isMafia ? 'МАФИЯ' : 'НЕ МАФИЯ'}`);
            break;
            
        case 'doctor':
            // Heal/protect player
            markPlayerProtected(targetId, true);
            addLogEntry('Лечение', `Доктор лечит ${targetPlayer.name}`);
            break;
            
        case 'lover':
            // Block player for the night
            markPlayerProtected(targetId, true);
            addLogEntry('Блокировка', `Любовница блокирует ${targetPlayer.name}`);
            break;
            
        case 'maniac':
            // Maniac kill
            updatePlayerStatus(targetId, 'dead', 'Убит маньяком');
            addLogEntry('Убийство маньяка', `Маньяк убивает ${targetPlayer.name}`);
            break;
            
        case 'bomber':
            // Mine player
            markPlayerMined(targetId, true);
            addLogEntry('Минирование', `Подрывник минирует ${targetPlayer.name}`);
            break;
            
        default:
            addLogEntry('Ночное действие', `${roleInfo?.name || currentRole} выбрал ${targetPlayer.name}`);
    }
    
    // Store the action
    if (!gameState.nightActions) gameState.nightActions = {};
    gameState.nightActions[currentRole + 'Target'] = targetId;
    
    // Clear active role and update UI
    clearActiveNightRole();
    updateCenterPanel();
    updatePlayerTable();
}

function showPlayerManagementPopup(player) {
    // Remove any existing popups
    document.querySelectorAll('.player-management-popup').forEach(popup => popup.remove());
    
    // Create management popup
    const popup = document.createElement('div');
    popup.className = 'player-management-popup';
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 15px;
        padding: 20px;
        color: white;
        z-index: 1000;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        max-width: 300px;
    `;
    
    const roleInfo = player.role ? roleDefinitions[player.role] : null;
    const statusText = player.status === 'alive' ? '🟢 Жив' : '💀 Мертв';
    
    let nightActions = '';
    if ((gameState.phase === 'night' || gameState.phase === 'firstNight') && player.status === 'alive') {
        nightActions = `
            <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 10px;">
                <h4 style="margin-bottom: 10px;">Ночные эффекты:</h4>
                <button onclick="markPlayerProtected(${player.id}, !${player.effects?.protected || false}); this.parentElement.parentElement.parentElement.remove();" 
                        style="background: var(--role-lover); color: white; border: none; padding: 8px 12px; border-radius: 8px; margin: 2px; cursor: pointer; font-size: 12px;">
                    ${player.effects?.protected ? '❌ Снять защиту' : '💋 Защитить'}
                </button>
                <button onclick="markPlayerMined(${player.id}, !${player.effects?.mined || false}); this.parentElement.parentElement.parentElement.remove();" 
                        style="background: var(--role-bomber); color: white; border: none; padding: 8px 12px; border-radius: 8px; margin: 2px; cursor: pointer; font-size: 12px;">
                    ${player.effects?.mined ? '❌ Снять мину' : '💣 Заминировать'}
                </button>
                <button onclick="markPlayerChecked(${player.id}, !${player.effects?.checked || false}); this.parentElement.parentElement.parentElement.remove();" 
                        style="background: var(--role-commissar); color: white; border: none; padding: 8px 12px; border-radius: 8px; margin: 2px; cursor: pointer; font-size: 12px;">
                    ${player.effects?.checked ? '❌ Снять отметку' : '🔎 Пометить проверенным'}
                </button>
            </div>
        `;
    }
    
    popup.innerHTML = `
        <h3>${player.name}</h3>
        <p>${roleInfo ? `${roleInfo.emoji} ${roleInfo.name}` : '🎭 Нет роли'}</p>
        <p>${statusText}</p>
        ${nightActions}
        <div style="margin-top: 15px;">
            ${player.status === 'alive' ? 
                '<button onclick="eliminatePlayer(' + player.id + ')" style="background: #ff6b6b; color: white; border: none; padding: 10px 15px; border-radius: 10px; margin: 5px; cursor: pointer;">💀 Исключить</button>' :
                '<button onclick="revivePlayer(' + player.id + ')" style="background: #2ed573; color: white; border: none; padding: 10px 15px; border-radius: 10px; margin: 5px; cursor: pointer;">✨ Вернуть</button>'
            }
            <button onclick="this.remove()" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 10px 15px; border-radius: 10px; margin: 5px; cursor: pointer;">❌ Закрыть</button>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Auto-close popup after 10 seconds
    setTimeout(() => {
        if (popup.parentNode) popup.remove();
    }, 10000);
}

function eliminatePlayer(playerId) {
    updatePlayerStatus(playerId, 'eliminated', 'Исключен вручную');
    // Remove popup
    document.querySelectorAll('[style*="fixed"]').forEach(el => {
        if (el.innerHTML.includes('Исключить') || el.innerHTML.includes('Вернуть')) {
            el.remove();
        }
    });
}

function revivePlayer(playerId) {
    updatePlayerStatus(playerId, 'alive', 'Возвращен в игру');
    // Remove popup
    document.querySelectorAll('[style*="fixed"]').forEach(el => {
        if (el.innerHTML.includes('Исключить') || el.innerHTML.includes('Вернуть')) {
            el.remove();
        }
    });
}

// Night phase highlighting functions
function updateNightPhaseHighlighting() {
    const gameTable = document.querySelector('.game-table-container');
    if (!gameTable) {
        // If no container found, try the main table
        const mainTable = document.getElementById('gameTable');
        if (mainTable) {
            mainTable.classList.toggle('night-phase', gameState.phase === 'night' || gameState.phase === 'firstNight');
        }
        return;
    }
    
    // Add or remove night-phase class based on current phase
    if (gameState.phase === 'night' || gameState.phase === 'firstNight') {
        gameTable.classList.add('night-phase');
        // Special highlighting for first night: show only mafia roles
        if (gameState.phase === 'firstNight') {
            gameTable.classList.add('mafia-intro');
        } else {
            gameTable.classList.remove('mafia-intro');
        }
        console.log('🌙 Night phase highlighting activated');
    } else {
        gameTable.classList.remove('night-phase');
        gameTable.classList.remove('mafia-intro');
        console.log('☀️ Night phase highlighting deactivated');
    }
}

function updatePlayerNightStates(seatElement, player) {
    if (!seatElement || !player) return;
    
    // Clear previous state classes
    seatElement.classList.remove('active-role', 'target-selectable', 'protected', 'mined', 'checked');
    
    // Jail persistent overlay
    if (player.jailed) {
        seatElement.classList.add('jailed');
    } else {
        seatElement.classList.remove('jailed');
    }
    
    // Add active role highlighting if this player's role is currently acting
    if (gameState.phase === 'night' && gameState.currentNightRole === player.role) {
        seatElement.classList.add('active-role');
    }
    
    // Add target selection highlighting for night actions
    if (gameState.phase === 'night' && gameState.currentNightRole && player.status === 'alive' && player.role !== gameState.currentNightRole) {
        seatElement.classList.add('target-selectable');
    }
    
    // Add status badges based on night effects
    updatePlayerBadges(seatElement, player);
}

function updatePlayerBadges(seatElement, player) {
    // Проверяем что seatElement это DOM элемент
    if (!seatElement || typeof seatElement.querySelectorAll !== 'function') {
        console.error('updatePlayerBadges: seatElement не является DOM элементом', seatElement);
        return;
    }
    
    // Remove existing badges
    const existingBadges = seatElement.querySelectorAll('.player-badge');
    existingBadges.forEach(badge => badge.remove());
    
    // Add badges based on player states
    const badges = [];
    
    // Protection by lover
    if (player.effects && player.effects.protected) {
        badges.push({ type: 'protected', emoji: '💋', tooltip: 'Защищен Любовницей' });
    }
    
    // Mined by bomber
    if (player.effects && player.effects.mined) {
        badges.push({ type: 'mined', emoji: '💣', tooltip: 'Заминирован' });
    }
    
    // Checked by commissar
    if (player.effects && player.effects.checked) {
        badges.push({ type: 'checked', emoji: '🔎', tooltip: 'Проверен Комиссаром' });
    }
    
    // Create badge elements
    badges.forEach((badgeData, index) => {
        const badge = document.createElement('div');
        badge.className = `player-badge ${badgeData.type}`;
        badge.textContent = badgeData.emoji;
        badge.title = badgeData.tooltip;
        
        // Position badges in different corners to avoid overlap
        switch (index) {
            case 0:
                badge.style.top = '-3px';
                badge.style.right = '-3px';
                break;
            case 1:
                badge.style.top = '-3px';
                badge.style.left = '-3px';
                break;
            case 2:
                badge.style.bottom = '-3px';
                badge.style.right = '-3px';
                break;
        }
        
        seatElement.appendChild(badge);
    });
}

function setActiveNightRole(roleType) {
    // Единый интерфейс: применимо ко всем ролям, но не в первую ночь (знакомство)
    if (gameState.phase === 'firstNight') {
        showToast('info', 'ℹ️', 'Первая ночь — только знакомство мафии');
        return;
    }
    gameState.currentNightRole = roleType;
    updatePlayerTable();
    addLogEntry('Ночное действие', `Активная роль: ${roleDefinitions[roleType]?.name || roleType}`);
}

function clearActiveNightRole() {
    gameState.currentNightRole = null;
    updatePlayerTable();
}

// Quick action functions for night management
function markPlayerProtected(playerId, protect = true) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    if (!player.effects) player.effects = {};
    player.effects.protected = protect;
    
    updatePlayerTable();
    addLogEntry('Защита', `${player.name} ${protect ? 'защищен' : 'снята защита'}`);
}

function markPlayerMined(playerId, mined = true) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    if (!player.effects) player.effects = {};
    player.effects.mined = mined;
    
    updatePlayerTable();
    addLogEntry('Минирование', `${player.name} ${mined ? 'заминирован' : 'снята мина'}`);
}

function markPlayerChecked(playerId, checked = true) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    if (!player.effects) player.effects = {};
    player.effects.checked = checked;
    
    updatePlayerTable();
    addLogEntry('Проверка', `${player.name} ${checked ? 'проверен Комиссаром' : 'снята отметка'}`);
}

// Обновление информации о выбранном игроке и показ всплывающего окна
function updateSelectedPlayerInfo(player) {
    const selectedPlayerInfo = document.getElementById('selectedPlayerInfo');
    const killBtn = document.getElementById('killBtn');
    const reviveBtn = document.getElementById('reviveBtn');
    const popup = document.getElementById('playerControlPopup');
    
    // Обновляем информацию о игроке
    if (selectedPlayerInfo && player) {
        const roleInfo = player.role ? roleDefinitions[player.role]?.name || 'Нет роли' : 'Нет роли';
        const statusText = player.status === 'alive' ? '🟢 Жив' : '💀 Мертв';
        selectedPlayerInfo.innerHTML = `
            <div>${player.name}</div>
            <div style="font-size: 14px; color: #95a5a6; margin-top: 5px;">${roleInfo} • ${statusText}</div>
        `;
    }
    
    // Настраиваем кнопки в зависимости от статуса игрока
    if (killBtn && reviveBtn && player) {
        if (player.status === 'alive') {
            killBtn.disabled = false;
            killBtn.style.opacity = '1';
            killBtn.style.background = '#ff4757';
            reviveBtn.disabled = true;
            reviveBtn.style.opacity = '0.5';
            reviveBtn.style.background = '#57606f';
        } else {
            killBtn.disabled = true;
            killBtn.style.opacity = '0.5';
            killBtn.style.background = '#57606f';
            reviveBtn.disabled = false;
            reviveBtn.style.opacity = '1';
            reviveBtn.style.background = '#2ed573';
        }
    }
    
    // Показываем всплывающее окно управления игроком
    if (popup && player) {
        popup.style.display = 'block';
        console.log('✅ Всплывающее окно управления игроком показано для:', player.name);
    }
}

// Убить выбранного игрока
function killSelectedPlayer() {
    if (!selectedPlayerId) {
        alert('Сначала выберите игрока на столе!');
        return;
    }
    
    const player = gameState.players.find(p => p.id === selectedPlayerId);
    if (!player) return;
    
    if (player.status === 'dead') {
        alert('Игрок уже мертв!');
        return;
    }
    
    togglePlayerStatus(selectedPlayerId);
    closePlayerControl();
}

// Вернуть выбранного игрока
function reviveSelectedPlayer() {
    if (!selectedPlayerId) {
        alert('Сначала выберите игрока на столе!');
        return;
    }
    
    const player = gameState.players.find(p => p.id === selectedPlayerId);
    if (!player) return;
    
    if (player.status === 'alive') {
        alert('Игрок уже жив!');
        return;
    }
    
    togglePlayerStatus(selectedPlayerId);
    closePlayerControl();
}

// Закрыть всплывающее окно управления игроком
function closePlayerControl() {
    const popup = document.getElementById('playerControlPopup');
    if (popup) {
        popup.style.display = 'none';
        console.log('✅ Всплывающее окно управления игроком закрыто');
    }
    
    // Убираем выделение с игроков
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => seat.classList.remove('selected'));
    
    // Сбрасываем выбранного игрока
    selectedPlayerId = null;
}

// Game Controls
function updateGameControls() {
    const dayBtn = document.getElementById('dayBtn');
    const nightBtn = document.getElementById('nightBtn');
    const voteBtn = document.getElementById('voteBtn');
    
    if (!gameState.isActive) {
        dayBtn.style.display = 'none';
        nightBtn.style.display = 'none';
        voteBtn.style.display = 'none';
        return;
    }
    
    dayBtn.style.display = gameState.phase !== 'day' ? 'inline-block' : 'none';
    nightBtn.style.display = gameState.phase !== 'night' ? 'inline-block' : 'none';
    voteBtn.style.display = gameState.phase === 'day' ? 'inline-block' : 'none';
}

// Game Phases
function startDayPhase() {
    gameState.phase = 'day';
    
    // Безопасно скрываем элементы если они существуют
    const nightPanel = document.getElementById('nightPanel');
    if (nightPanel) nightPanel.style.display = 'none';
    
    closeNightHistory(); // Закрываем историю при переходе к дню
    
    const votingPanel = document.getElementById('votingPanel');
    if (votingPanel) votingPanel.style.display = 'none';
    
    const voteCounter = document.getElementById('voteCounter');
    if (voteCounter) voteCounter.style.display = 'none';
    updateUI();
    addHistoryEntry(`☀️ Начался День ${gameState.dayNumber}`);
    updateGameInstructions();
}

function startNightPhase() {
    console.log('🌙 Запуск ночной фазы...');
    gameState.phase = 'night';
    gameState.nightActions = [];
    gameState.currentNightRole = null;
    gameState.nightRoleQueue = []; // Очередь ролей для ночи
    gameState.currentNightRoleIndex = 0;
    
    // УБИРАЕМ лишнее окно nightPanel - используем только centerPanel
    const nightPanel = document.getElementById('nightPanel');
    if (nightPanel) {
        nightPanel.style.display = 'none';
        console.log('🚫 Ночная панель скрыта - используем только centerPanel');
    }
    
    // Update night day number
    const nightDayNumber = document.getElementById('nightDayNumber');
    if (nightDayNumber) {
        nightDayNumber.textContent = gameState.dayNumber;
    }
    
    // Инициализируем переменные состояния игры по ТЗ
    initialMafiaCount = gameState.players.filter(p => 
        ['mafia', 'don', 'consigliere'].includes(p.role)
    ).length;
    consigliereUsed = false;
    kamikazeUsed = false;
    bomberMinedIds.clear();
    nightPlan = {
        mafiaTarget: null,
        consigliereTarget: null,
        sheriffTarget: null,
        doctorTarget: null,
        maniacTarget: null,
        loverTarget: null,
        kamikazeTarget: null,
        jailerTarget: null
    };
    
    console.log(`🎯 Инициализация ночи: изначально мафии=${initialMafiaCount}, консильери_использован=${consigliereUsed}, камикадзе_использован=${kamikazeUsed}`);
    
    // НАЧИНАЕМ ПОШАГОВЫЙ СЦЕНАРИЙ ВМЕСТО ВЫБОРА РОЛЕЙ
    startNightSequence();
    updateUI();
    addLogEntry(`🌙 Началась Ночь ${gameState.dayNumber}`);
    updateGameInstructions();
    
    // УБИРАЕМ автоматическое открытие истории ночных ходов
}



// Возвращает последовательность ШАГОВ ночи - жесткая функция согласно исправлениям
function buildNightSteps(state) {
    const hasAlive = role => state.players.some(p => p.status === 'alive' && !p.jailed && p.role === role);
    
    const steps = [];
    
    // 1) Мафия (дон ходит внутри)
    if (state.players.some(p => p.status === 'alive' && ['mafia','don','consigliere'].includes(p.role))) {
        steps.push({ kind: 'mafia' });
    }
    
    // 2) Консильери (одноразово и только если мафии стало меньше стартовой)
    if (canConsigliereAct(state)) {
        steps.push({ kind: 'consigliere' });
    }
    
    // 3) Тюремщик
    if (hasAlive('jailer')) {
        steps.push({ kind: 'jailer' });
    }
    
    // 4) Комиссар
    if (hasAlive('sheriff')) {
        steps.push({ kind: 'sheriff' });
    }
    
    // 5) Доктор
    if (hasAlive('doctor')) {
        steps.push({ kind: 'doctor' });
    }
    
    // 6) Маньяк
    if (hasAlive('maniac')) {
        steps.push({ kind: 'maniac' });
    }
    
    // 7) Любовница
    if (hasAlive('lover')) {
        steps.push({ kind: 'lover' });
    }
    
    // 8) Камикадзе (разово)
    if (hasAlive('kamikaze') && !state.kamikazeUsed) {
        steps.push({ kind: 'kamikaze' });
    }

    // 9) Подрывник — теперь есть шаг минирования
    if (hasAlive('bomber')) {
        steps.push({ kind: 'bomber' });
    }
    
    // 10) Итоги
    steps.push({ kind: 'summary' });
    
    return steps;
}

// Жёсткие условия для Консильери согласно исправлениям пользователя
function canConsigliereAct(state = gameState) {
    if (!state.enabledRoles || !state.enabledRoles['consigliere']) return false;
    if (state.consigliereUsed) return false;
    const aliveConsig = state.players.some(p => p.status === 'alive' && !p.jailed && p.role === 'consigliere');
    if (!aliveConsig) return false;

    const mafiaAlive = state.players.filter(p => p.status === 'alive' && ['mafia','don','consigliere'].includes(p.role)).length;
    const start = state.initialMafiaCount ?? mafiaAlive;
    return mafiaAlive < start; // только если мафии стало меньше, чем при старте игры
}

// Валидация целей для Консильери
function validateConsigliereTarget(state, targetId) {
    const t = state.players.find(p => p.id === targetId);
    if (!t || t.status !== 'alive') return { ok: false, reason: 'Цель невалидна' };
    if (t.role === 'mafia' || t.role === 'don') return { ok: false, reason: 'Нельзя вербовать мафию' };

    // можно вербовать ТОЛЬКО мирного
    const isCivilian = t.role === 'civilian';
    if (!isCivilian) {
        return { ok: true, result: 'fail' }; // промах — сгорает попытка
    }
    return { ok: true, result: 'success' };
}

// Фильтры целей для всех ролей
function getTargetsForStep(state, stepKind) {
    const isAliveFree = p => p.status === 'alive' && !p.jailed;

    switch (stepKind) {
        case 'mafia':
            // все живые и не мафия, не в тюрьме
            return state.players.filter(p => isAliveFree(p) && p.role !== 'mafia' && p.role !== 'don');

        case 'consigliere':
            if (!canConsigliereAct(state)) return [];
            return state.players.filter(p => p.status === 'alive' && p.role !== 'mafia' && p.role !== 'don');

        case 'jailer':
            // можно выбрать любого живого
            return state.players.filter(p => p.status === 'alive');

        case 'sheriff':
            // можно любого живого
            return state.players.filter(p => p.status === 'alive');

        case 'doctor':
            return state.players.filter(p => isAliveFree(p));

        case 'maniac':
            return state.players.filter(p => isAliveFree(p));

        case 'lover':
            return state.players.filter(p => isAliveFree(p));

        case 'kamikaze':
            return state.players.filter(p => isAliveFree(p));

        default:
            return [];
    }
}

// НОВАЯ ПОШАГОВАЯ СИСТЕМА НОЧНЫХ ДЕЙСТВИЙ
function startNightSequence() {
    // СТРОГАЯ ФУНКЦИЯ buildNightSteps согласно исправлениям пользователя
    const steps = buildNightSteps(gameState);
    
    gameState.nightRoleQueue = steps.filter(step => step.kind !== 'summary').map(step => step.kind);
    
    gameState.currentNightRoleIndex = 0;
    
    console.log('🌙 Очередь ночных ролей:', gameState.nightRoleQueue);
    console.log('🔍 Отладка ролей в игре:', gameState.players.map(p => `${p.name}: ${p.role} (${p.status})`));
    
    // ОТЛАДКА: покажем детали каждого шага
    console.log('🔍 Все возможные шаги:', steps);
    steps.forEach(step => {
        const hasRole = gameState.players.some(p => p.status === 'alive' && !p.jailed && p.role === step.kind);
        console.log(`🔍 ${step.kind}: есть_живые=${hasRole}`);
    });
    
    if (gameState.nightRoleQueue.length > 0) {
        showCurrentNightRole();
    } else {
        // Если нет ночных ролей, сразу завершаем ночь
        console.log('🌙 Нет активных ночных ролей, завершаем ночь');
        setTimeout(() => finishNight(), 1000);
    }
}

function showCurrentNightRole() {
    if (gameState.currentNightRoleIndex >= gameState.nightRoleQueue.length) {
        // Все роли отыграли, завершаем ночь
        setTimeout(() => finishNight(), 2000);
        return;
    }
    
    const currentRoleKey = gameState.nightRoleQueue[gameState.currentNightRoleIndex];
    const currentRole = nightRoles[currentRoleKey];
    
    // На первой ночи пропускаем действия мафии (только знакомство)
    if (gameState.phase === 'firstNight' && (currentRoleKey === 'mafia' || currentRoleKey === 'don' || currentRoleKey === 'consigliere')) {
        nextNightRole();
        return;
    }
    if (!currentRole) {
        nextNightRole();
        return;
    }
    
    // Проверяем что роль существует
    if (!currentRole) {
        console.error(`❌ Роль не найдена в nightRoles: ${currentRoleKey}`);
        console.error(`❌ Доступные роли:`, Object.keys(nightRoles));
        nextNightRole(); // Пропускаем неизвестную роль
        return;
    }
    
    gameState.currentNightRole = currentRoleKey;
    
    // Находим игроков с этой ролью (для мафии учитываем и дона)
    let playersWithRole;
    if (currentRoleKey === 'mafia') {
        playersWithRole = gameState.players.filter(p => 
            (p.role === 'mafia' || p.role === 'don') && p.status === 'alive'
        );
    } else {
        playersWithRole = gameState.players.filter(p => p.role === currentRoleKey && p.status === 'alive');
    }
    
    console.log(`🌙 Ход роли: ${currentRole.name}`, playersWithRole);
    
    // ИСПОЛЬЗУЕМ только центральную панель, убираем отдельное окно nightAction
    selectNightRole(currentRoleKey);
    
    // Добавляем информацию о игроках с этой ролью в консоль
    console.log(`🌙 Активная роль: ${currentRole.name}`, playersWithRole);
    
    // Подсвечиваем игроков с текущей ролью
    highlightActiveRole(currentRoleKey);
}

function highlightActiveRole(roleKey) {
    // Убираем предыдущие подсветки
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => {
        seat.classList.remove('night-active-role', 'night-target-available', 'valid-target');
        seat.style.cursor = '';
        seat.style.opacity = '';
    });
    
    // Подсвечиваем игроков с активной ролью и валидные цели
    gameState.players.forEach(player => {
        const seat = document.querySelector(`[data-seat-number="${player.seatNumber}"]`);
        if (seat) {
            // Для мафии подсвечиваем и мафию и дона вместе
            const isActiveRole = (roleKey === 'mafia') 
                ? (player.role === 'mafia' || player.role === 'don') && player.status === 'alive'
                : player.role === roleKey && player.status === 'alive';
                
            if (isActiveRole) {
                seat.classList.add('night-active-role');
            } else if (player.status === 'alive') {
                // Проверяем валидность цели для текущей роли
                const validation = isValidTarget(roleKey, player);
                if (validation.valid) {
                    seat.classList.add('valid-target');
                    seat.style.cursor = 'pointer';
                } else {
                    seat.style.cursor = 'not-allowed';
                    seat.style.opacity = '0.5';
                }
                seat.classList.add('night-target-available');
            }
        }
    });
}

function skipCurrentNightRole() {
    const currentRoleKey = gameState.nightRoleQueue[gameState.currentNightRoleIndex];
    const currentRole = nightRoles[currentRoleKey];
    
    if (currentRole) {
        addLogEntry(`Пропуск роли`, `${currentRole.name} пропустили ход`);
    } else {
        addLogEntry(`Пропуск роли`, `${currentRoleKey} пропустили ход`);
    }
    
    nextNightRole();
}

function nextNightRole() {
    gameState.currentNightRoleIndex++;
    selectedTargetId = null;
    
    // НЕ убираем визуальные эффекты действий - они должны остаться до конца ночи
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => {
        seat.classList.remove('night-active-role', 'night-target-available', 'selected', 'targeted');
        // Оставляем эффекты действий: healed, loved, recruited, checked, blocked, mined, jailed, markedForDeath
    });
    
    // Переходим к следующей роли
    setTimeout(() => {
        showCurrentNightRole();
    }, 1000);
}

function getAvailableNightRoles() {
    // Получаем все роли которые есть среди живых игроков
    const availableRoles = Object.keys(nightRoles).filter(roleKey => 
        gameState.players.some(p => p.role === roleKey && p.status === 'alive')
    );
    
    console.log('🌙 Доступные ночные роли:', availableRoles);
    console.log('🌙 Живые игроки:', gameState.players.filter(p => p.status === 'alive').map(p => p.role));
    
    return availableRoles;
}

function selectNightRole(roleKey) {
    gameState.currentNightRole = roleKey;
    const role = nightRoles[roleKey];
    
    console.log(`🌙 Обновляем интерфейс для роли: ${role ? role.name : roleKey}`);
    
    // КОМПАКТНЫЙ УНИФИЦИРОВАННЫЙ ИНТЕРФЕЙС для ВСЕХ ролей
    const centerActions = document.getElementById('centerActions');
    if (centerActions && role) {
        centerActions.innerHTML = `
            <div style="background: linear-gradient(135deg, ${role.color}, ${role.color}99); color: white; padding: 15px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); margin-bottom: 15px; text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 8px;">
                    <span style="font-size: 24px;">${role.emoji}</span>
                    <h3 style="margin: 0; font-size: 18px; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">${role.name}</h3>
                </div>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">${role.action}</p>
            </div>
            
            <div id="selectedTarget" style="min-height: 40px; margin: 10px 0;">
                <div style="background: rgba(255,255,255,0.1); border: 2px dashed #ccc; border-radius: 8px; padding: 15px; text-align: center; color: #666; font-size: 14px;">
                    Выберите цель из стола игроков
                </div>
            </div>
            
            <div style="text-align: center; margin: 15px 0;">
                <button id="confirmActionBtn" onclick="confirmNightAction()" disabled style="
                    background: #95a5a6; 
                    color: white; 
                    border: none; 
                    padding: 10px 25px; 
                    border-radius: 20px; 
                    font-size: 14px; 
                    font-weight: bold; 
                    cursor: not-allowed;
                    opacity: 0.6;
                    transition: all 0.3s ease;
                ">
                    Подтвердить действие
                </button>
            </div>
            
            <div id="actionHint" style="display: none; background: rgba(255,255,255,0.95); border: 2px solid ${role.color}; border-radius: 8px; padding: 10px; margin-top: 10px; text-align: center;">
                <div id="hintText" style="font-size: 14px; font-weight: bold; color: ${role.color};"></div>
            </div>
        `;
        console.log(`✅ Интерфейс обновлен для ${role.name}`);
    } else {
        console.error('❌ centerActions или role не найдены:', {
            centerActions: !!centerActions,
            role: !!role,
            roleKey: roleKey
        });
    }
}

// Новая переменная для хранения выбранной цели
let selectedTargetId = null;

// Обработчик выбора цели с визуальными подсказками
function selectTarget(playerId) {
    if (!gameState.currentNightRole) return;
    
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    // НОВАЯ ВАЛИДАЦИЯ ПО ТЗ
    const validation = isValidTarget(gameState.currentNightRole, player);
    if (!validation.valid) {
        alert(`❌ Нельзя выбрать ${player.name}: ${validation.reason}`);
        return;
    }
    
    selectedTargetId = playerId;
    const role = nightRoles[gameState.currentNightRole];
    
    const targetDisplay = document.getElementById('selectedTarget');
    const actionHint = document.getElementById('actionHint');
    const hintText = document.getElementById('hintText');
    
    if (targetDisplay && player) {
        targetDisplay.innerHTML = `
            <div style="background: rgba(52, 152, 219, 0.1); border: 2px solid #3498db; border-radius: 8px; padding: 10px; text-align: center;">
                Выбранная цель: <strong>${player.name}</strong>
            </div>
        `;
    }
    
    // Показываем визуальную подсказку
    if (actionHint && hintText && role) {
        hintText.textContent = `${role.hint}: ${player.name}`;
        actionHint.style.display = 'block';
        actionHint.style.borderColor = role.color;
        actionHint.querySelector('div').style.color = role.color;
    }
    
    // Выделяем выбранного игрока на столе и показываем предварительный эффект
    selectPlayer(playerId);
    updatePlayerVisualEffects(playerId, 'targeted', gameState.currentNightRole);
    
    // Активируем кнопку подтверждения
    const confirmBtn = document.getElementById('confirmActionBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.style.background = role ? role.color : '#2ed573';
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';
        console.log('✅ Confirm button activated for target:', player.name);
    }
}

// Обработка действия через клик по столу
function handleNightAction(playerId) {
    selectTarget(playerId);
}

// Применение эффектов ночных действий к игрокам - РАСШИРЕННАЯ ВЕРСИЯ
function applyNightAction(roleType, targetId) {
    const targetPlayer = gameState.players.find(p => p.id === targetId);
    if (!targetPlayer) return;
    
    console.log(`🌙 Применяем действие ${roleType} к игроку ${targetPlayer.name}`);
    
    switch (roleType) {
        case 'mafia':
            nightPlan.mafiaTarget = targetId;
            updatePlayerVisualEffects(targetId, 'targeted', roleType);
            addLogEntry(`🔫 Мафия выбрала цель: ${targetPlayer.name}`);
            break;
        case 'consigliere':
            nightPlan.consigliereTarget = targetId;
            updatePlayerVisualEffects(targetId, 'targeted', roleType);
            addLogEntry(`🤝 Консильери выбрал цель для вербовки: ${targetPlayer.name}`);
            break;
        case 'jailer':
            nightPlan.jailerTarget = targetId;
            updatePlayerVisualEffects(targetId, 'targeted', roleType);
            addLogEntry(`🔒 Тюремщик выбрал цель для ареста: ${targetPlayer.name}`);
            break;
        case 'sheriff':
            nightPlan.sheriffTarget = targetId;
            updatePlayerVisualEffects(targetId, 'checked', roleType);
            addLogEntry(`🔎 Комиссар проверяет: ${targetPlayer.name}`);
            if (!targetPlayer.flags) targetPlayer.flags = {};
            targetPlayer.flags.checkedBySheriff = true;
            break;
        case 'doctor':
            nightPlan.doctorTarget = targetId;
            updatePlayerVisualEffects(targetId, 'healed', roleType);
            addLogEntry(`💉 Доктор выбрал для лечения: ${targetPlayer.name}`);
            break;
        case 'maniac':
            nightPlan.maniacTarget = targetId;
            updatePlayerVisualEffects(targetId, 'targeted', roleType);
            addLogEntry(`🔪 Маньяк выбрал жертву: ${targetPlayer.name}`);
            break;
        case 'lover':
            nightPlan.loverTarget = targetId;
            updatePlayerVisualEffects(targetId, 'loved', roleType);
            addLogEntry(`💋 Любовница выбрала партнера: ${targetPlayer.name}`);
            break;
        case 'kamikaze':
            nightPlan.kamikazeTarget = targetId;
            gameState.kamikazeUsed = true;
            updatePlayerVisualEffects(targetId, 'targeted', roleType);
            addLogEntry(`💥 Камикадзе выбрал цель для атаки: ${targetPlayer.name}`);
            break;
        case 'bomber':
            // Пометить цель как заминированную
            bomberMinedIds.add(targetId);
            if (!targetPlayer.effects) targetPlayer.effects = {};
            targetPlayer.effects.mined = true;
            updatePlayerVisualEffects(targetId, 'mined', roleType);
            addLogEntry(`💣 Подрывник заминировал: ${targetPlayer.name}`);
            break;
        default:
            console.log(`⚠️ Неизвестная роль: ${roleType}`);
            addLogEntry(`⚠️ Неизвестная роль: ${roleType}`);
    }
    
    updatePlayerTable();
}

// Функция валидации целей согласно ТЗ
function isValidTarget(roleKey, targetPlayer) {
    if (!targetPlayer || targetPlayer.status !== 'alive') {
        return { valid: false, reason: 'Цель мертва' };
    }
    
    // Основные ограничения по ТЗ
    switch (roleKey) {
        case 'mafia':
            // Мафия не может убивать: заключенных, мафию
            if (targetPlayer.jailed) return { valid: false, reason: 'Цель в тюрьме' };
            if (['mafia', 'don', 'consigliere'].includes(targetPlayer.role)) {
                return { valid: false, reason: 'Мафия не выбирает мафию' };
            }
            return { valid: true };
            
        case 'consigliere':
            // Консильери: только не мафия, не заключенных
            if (targetPlayer.jailed) return { valid: false, reason: 'Цель в тюрьме' };
            if (['mafia', 'don', 'consigliere'].includes(targetPlayer.role)) {
                return { valid: false, reason: 'Нельзя вербовать мафию' };
            }
            return { valid: true };
            
        case 'maniac':
        case 'kamikaze':
        case 'lover':
            // Убийцы и Любовница не могут выбирать заключенных
            if (targetPlayer.jailed) return { valid: false, reason: 'Цель в тюрьме' };
            return { valid: true };
            
        case 'sheriff':
        case 'doctor':
        case 'jailer':
            // Комиссар, Доктор, Тюремщик могут выбирать всех живых
            return { valid: true };
            
        default:
            return { valid: true };
    }
}

// УБИРАЕМ автоматическое подтверждение - только для совместимости
function nextNightAction() {
    // НЕ автоматически подтверждаем - требуется ручное нажатие кнопки
    console.log('nextNightAction called - waiting for manual confirmation');
}

// Функция для обновления визуальных эффектов игроков - РАСШИРЕННАЯ ВЕРСИЯ
function updatePlayerVisualEffects(playerId, effect, roleType = null) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
        console.log('❌ Игрок не найден для визуального эффекта:', playerId);
        return;
    }
    
    const seat = document.querySelector(`[data-seat-number="${player.seatNumber}"]`);
    if (!seat) {
        console.log('❌ Место игрока не найдено:', player.seatNumber);
        return;
    }
    
    console.log(`🎨 Применяем визуальный эффект ${effect} к игроку ${player.name} (место ${player.seatNumber})`);
    
    // Убираем только временные эффекты (targeted), постоянные эффекты остаются
    if (effect === 'targeted') {
        // Для targeted убираем предыдущие targeted эффекты
        seat.classList.remove('targeted');
        const existingTargetedIcons = seat.querySelectorAll('.effect-icon.targeted');
        existingTargetedIcons.forEach(icon => icon.remove());
    } else {
        // Для постоянных эффектов убираем все старые и добавляем новый
        seat.classList.remove('marked-for-death', 'healed', 'loved', 'recruited', 'checked', 'blocked', 'mined', 'jailed');
        const existingIcons = seat.querySelectorAll('.effect-icon:not(.targeted)');
        existingIcons.forEach(icon => icon.remove());
    }
    
    // Получаем правильную иконку из роли
    const role = nightRoles[roleType];
    let iconText = '❓';
    if (role && role.targetIcon) {
        iconText = role.targetIcon;
    }
    
    // Добавляем новый эффект
    switch (effect) {
        case 'markedForDeath':
            seat.classList.add('marked-for-death');
            addEffectIcon(seat, iconText, '#ff0000');
            console.log(`💀 Метка смерти добавлена к игроку ${player.name}`);
            break;
            
        case 'healed':
            seat.classList.add('healed');
            addEffectIcon(seat, '➕', '#2ecc71');
            console.log(`⚕️ Лечение добавлено к игроку ${player.name}`);
            break;
            
        case 'loved':
            seat.classList.add('loved');
            addEffectIcon(seat, '💋', '#e91e63', false, 'br');
            console.log(`💋 Поцелуй добавлен к игроку ${player.name}`);
            break;
            
        case 'recruited':
            seat.classList.add('recruited');
            addEffectIcon(seat, '🤝', '#dc143c');
            console.log(`🤝 Вербовка к игроку ${player.name}`);
            break;
            
        case 'checked':
            seat.classList.add('checked');
            addEffectIcon(seat, '🔍', '#3498db');
            console.log(`🔍 Проверка к игроку ${player.name}`);
            break;
            
        case 'blocked':
            seat.classList.add('blocked');
            addEffectIcon(seat, '💋', '#e91e63');
            console.log(`💋 Блокировка к игроку ${player.name}`);
            break;
            
        case 'mined':
            seat.classList.add('mined');
            addEffectIcon(seat, '💣', '#ff6b35');
            console.log(`💣 Минирование к игроку ${player.name}`);
            break;
            
        case 'targeted':
            seat.classList.add('targeted');
            addEffectIcon(seat, iconText, role ? role.color : '#333333', true); // true = временная иконка
            console.log(`🎯 Цель выбрана к игроку ${player.name}`);
            break;
            
        case 'jailed':
            seat.classList.add('jailed');
            addEffectIcon(seat, '🔒', '#708090');
            console.log(`🔒 Заключение к игроку ${player.name}`);
            break;
    }
}

// Вспомогательная функция для добавления иконок эффектов
function addEffectIcon(seat, iconText, color, isTemporary = false, position = 'tr') {
    const effectIcon = document.createElement('div');
    effectIcon.className = isTemporary ? 'effect-icon targeted' : 'effect-icon';
    effectIcon.style.cssText = `
        position: absolute;
        ${position === 'br' ? 'bottom: 5px;' : 'top: 5px;'}
        right: 5px;
        font-size: 20px;
        z-index: 100;
        color: ${color};
        text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        pointer-events: none;
        background: rgba(255,255,255,0.95);
        border-radius: 50%;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    effectIcon.textContent = iconText;
    seat.appendChild(effectIcon);
    return effectIcon;
}

// НОВАЯ ФУНКЦИЯ РАЗРЕШЕНИЯ НОЧИ ПО ТЗ - СТРОГИЙ ПОРЯДОК ПРИОРИТЕТОВ
function resolveNight(state = gameState) {
    console.log('🌙 Разрешение ночи по приоритетам ТЗ...');
    
    // 0) Снимок "до" применения ночных эффектов
    const beforeAliveIds = new Set(state.players.filter(p => p.status === 'alive').map(p => p.id));
    const beforeJailedIds = new Set(state.players.filter(p => p.jailed).map(p => p.id));
    
    nightLogs = []; // Очищаем логи для новой сводки
    
    // 1. ТЮРЬМА - применяется первой
    if (nightPlan.jailerTarget) {
        const target = gameState.players.find(p => p.id === nightPlan.jailerTarget);
        if (target && ['mafia', 'don', 'consigliere'].includes(target.role)) {
            // Освобождаем предыдущего заключенного
            gameState.players.forEach(p => { if (p.jailed) p.jailed = false; });
            // Сажаем нового
            target.jailed = true;
            nightLogs.push(`🔒 Тюремщик арестовал: ${target.name} (мафия)`);
            console.log(`🔒 ${target.name} заключен в тюрьму`);
        } else if (target) {
            nightLogs.push(`🔒 Тюремщик: без эффекта (${target.name} не мафия)`);
        }
    }
    
    // 2. ЛЮБОВНИЦА - блок + защита
    if (nightPlan.loverTarget) {
        const target = gameState.players.find(p => p.id === nightPlan.loverTarget);
        if (target) {
            if (!target.effects) target.effects = {};
            target.effects.lovedThisNight = true;
            nightLogs.push(`💋 Любовница: ночь с ${target.name} (блок + защита)`);
            console.log(`💋 ${target.name} заблокирован и защищен Любовницей`);
        }
    }
    
    // 3. ДОКТОР - лечение
    if (nightPlan.doctorTarget) {
        const target = gameState.players.find(p => p.id === nightPlan.doctorTarget);
        if (target) {
            if (!target.effects) target.effects = {};
            target.effects.doctorHealed = true;
            nightLogs.push(`💉 Доктор вылечил: ${target.name}`);
            console.log(`💉 ${target.name} под защитой Доктора`);
        }
    }
    
    // 4. КОНСИЛЬЕРИ - вербовка (одноразовая, только если мафии стало меньше стартового числа)
    if (nightPlan.consigliereTarget && !gameState.consigliereUsed) {
        const allowed = canConsigliereAct(gameState);
        const target = gameState.players.find(p => p.id === nightPlan.consigliereTarget);

        if (!allowed) {
            nightLogs.push('🤝 Консильери: ход недоступен (мафия не уменьшилась / уже использовано)');
        } else if (target && target.role === 'civilian' && target.status === 'alive') {
            target.role = 'mafia';
            nightLogs.push(`🤝 Консильери: завербовал ${target.name}`);
        } else if (target) {
            nightLogs.push(`🤝 Консильери: промахнулся (${target.name} не мирный)`);
        }

        gameState.consigliereUsed = true;
    }
    
    // 5. КАМИКАДЗЕ - разовая атака
    if (nightPlan.kamikazeTarget && !gameState.kamikazeUsed) {
        const target = gameState.players.find(p => p.id === nightPlan.kamikazeTarget);
        const kamikaze = gameState.players.find(p => p.role === 'kamikaze' && p.status === 'alive');
        
        if (target && kamikaze) {
            if (['mafia', 'don', 'consigliere'].includes(target.role)) {
                // Цель - мафия
                if (target.effects?.lovedThisNight) {
                    // Цель защищена Любовницей
                    kamikaze.status = 'dead';
                    nightLogs.push(`💥 Камикадзе атаковал ${target.name} → цель выжила под защитой Любовницы, камикадзе погиб`);
                } else {
                    // Оба погибают
                    target.status = 'dead';
                    kamikaze.status = 'dead';
                    nightLogs.push(`💥 Камикадзе атаковал ${target.name} → оба погибли`);
                }
            } else {
                // Цель не мафия - никто не умирает
                nightLogs.push(`💥 Камикадзе атаковал ${target.name} → никто не погиб (цель не мафия)`);
            }
        }
        gameState.kamikazeUsed = true;
    }
    
    // 6. УБИЙСТВО МАФИИ
    if (nightPlan.mafiaTarget) {
        const target = gameState.players.find(p => p.id === nightPlan.mafiaTarget);
        if (target && target.status === 'alive') {
            if (target.effects?.lovedThisNight) {
                nightLogs.push(`🔫 Мафия: отменено (${target.name} под защитой Любовницы)`);
            } else if (target.effects?.doctorHealed) {
                nightLogs.push(`🔫 Мафия: отменено (${target.name} вылечен Доктором)`);
            } else {
                target.status = 'dead';
                nightLogs.push(`🔫 Мафия убила: ${target.name}`);
                console.log(`🔫 ${target.name} убит мафией`);
            }
        }
    }
    
    // 7. УБИЙСТВО МАНЬЯКА
    if (nightPlan.maniacTarget) {
        const target = gameState.players.find(p => p.id === nightPlan.maniacTarget);
        if (target && target.status === 'alive') {
            if (target.effects?.lovedThisNight) {
                nightLogs.push(`🔪 Маньяк: отменено (${target.name} под защитой Любовницы)`);
            } else if (target.effects?.doctorHealed) {
                nightLogs.push(`🔪 Маньяк: отменено (${target.name} вылечен Доктором)`);
            } else {
                target.status = 'dead';
                nightLogs.push(`🔪 Маньяк убил: ${target.name}`);
                console.log(`🔪 ${target.name} убит маньяком`);
            }
        }
    }
    
    // 8. ВЗРЫВ ПОДРЫВНИКА (если подрывник умер)
    const bomber = gameState.players.find(p => p.role === 'bomber');
    if (bomber && bomber.status === 'dead' && bomberMinedIds.size > 0) {
        const victims = [];
        bomberMinedIds.forEach(minedId => {
            const victim = gameState.players.find(p => p.id === minedId);
            if (victim && victim.status === 'alive') {
                victim.status = 'dead';
                victims.push(victim.name);
            }
        });
        if (victims.length > 0) {
            nightLogs.push(`💣 Подрывник пал → взрыв унёс: ${victims.join(', ')}`);
        }
    }
    
    // 9. ПРЕВРАЩЕНИЕ ОБОРОТНЯ
    const aliveMafia = gameState.players.filter(p => 
        ['mafia', 'don', 'consigliere'].includes(p.role) && p.status === 'alive'
    );
    const werewolf = gameState.players.find(p => p.role === 'werewolf' && p.status === 'alive');
    if (aliveMafia.length === 0 && werewolf) {
        werewolf.role = 'mafia';
        nightLogs.push(`🐺 Оборотень вступил в мафию`);
        console.log(`🐺 Оборотень превратился в мафию`);
    }
    
    // 10. СБРОС НОЧНЫХ МЕТОК
    clearNightEffects();
    
    // 1) Вычисляем изменения "после" применения всех эффектов
    const afterAliveIds = new Set(state.players.filter(p => p.status === 'alive').map(p => p.id));
    const afterJailedIds = new Set(state.players.filter(p => p.jailed).map(p => p.id));

    // Кто умер этой ночью (был жив, стал мёртв)
    const diedTonight = state.players
        .filter(p => beforeAliveIds.has(p.id) && !afterAliveIds.has(p.id))
        .map(p => p.name || p.nickname || p.username);

    // Кто отправился в тюрьму этой ночью (не был jailed, стал jailed)
    const jailedTonight = state.players
        .filter(p => !beforeJailedIds.has(p.id) && afterJailedIds.has(p.id))
        .map(p => p.name || p.nickname || p.username);

    // 2) Две строки-шапки сводки
    const header = [];
    if (diedTonight.length) header.push(`🕯️ Эту ночь не пережили: ${diedTonight.join(', ')}`);
    if (jailedTonight.length) header.push(`🚔 В тюрьму отправляется: ${jailedTonight.join(', ')}`);

    // 3) Собираем итог: сначала шапка, потом детальные логи
    const summary = [...header, ...nightLogs];

    console.log('🌙 Разрешение ночи завершено, сводка:', summary);
    scheduleSave(); // Автосохранение после разрешения ночи
    return summary;
}

// Очистка ночных эффектов
function clearNightEffects() {
    gameState.players.forEach(player => {
        if (player.effects) {
            delete player.effects.lovedThisNight;
            delete player.effects.doctorHealed;
        }
    });
    
    // Очищаем план ночи
    nightPlan = {
        mafiaTarget: null,
        consigliereTarget: null,
        sheriffTarget: null,
        doctorTarget: null,
        maniacTarget: null,
        loverTarget: null,
        kamikazeTarget: null,
        jailerTarget: null
    };
}

// Функция для применения всех отложенных эффектов в конце ночи
function applyEndOfNightEffects() {
    console.log('🌙 Применяем отложенные эффекты смерти...');
    
    gameState.players.forEach(player => {
        if (player.effects && player.effects.markedForDeath && player.status === 'alive') {
            // Проверяем, не защищен ли игрок
            if (!player.effects.protected) {
                updatePlayerStatus(player.id, 'dead', `Убит мафией`);
                addLogEntry(`💀 Мафия убивает: ${player.name}`);
                console.log(`💀 Игрок ${player.name} убит мафией`);
            } else {
                addLogEntry(`⚕️ ${player.name} был спасен от смерти!`);
                console.log(`⚕️ Игрок ${player.name} спасен`);
            }
        }
        
        // Очищаем все ночные эффекты
        if (player.effects) {
            delete player.effects.markedForDeath;
            delete player.effects.doctorHealed;
            delete player.effects.protected;
            delete player.effects.blocked;
        }
    });
    
    // Убираем все визуальные эффекты ночи
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => {
        seat.classList.remove('marked-for-death', 'healed', 'loved', 'recruited', 'checked', 'blocked', 'mined', 'jailed', 'targeted');
        const effectIcons = seat.querySelectorAll('.effect-icon');
        effectIcons.forEach(icon => icon.remove());
    });
    
    // Обновляем отображение
    updatePlayerTable();
}

function finishNight() {
    console.log('🌙 Forcing night phase completion...');
    
    // НОВОЕ РАЗРЕШЕНИЕ НОЧИ ПО ТЗ
    const nightSummary = resolveNight();
    
    // Показываем итоговую сводку ночи
    showNightSummary(nightSummary);
    
    // Принудительно завершаем ночь независимо от текущего состояния
    const nightPanel = document.getElementById('nightPanel');
    if (nightPanel) nightPanel.style.display = 'none';
    closeNightHistory(); // Закрываем историю при завершении ночи
    
    // Сбрасываем все ночные состояния
    selectedTargetId = null;
    gameState.currentNightRole = null;
    
    // Убираем выделение с игроков
    const allSeats = document.querySelectorAll('.player-seat');
    allSeats.forEach(seat => seat.classList.remove('selected'));
    
    // Очищаем визуальные эффекты
    clearNightVisualEffects();
    
    // Переходим к дню
    gameState.dayNumber++;
    startDayPhase();
    addHistoryEntry(`🌅 Ночь ${gameState.dayNumber - 1} завершена`);
    
    // Check win conditions
    checkWinConditions();
    updateGameInstructions();
    
    console.log('✅ Night phase forcefully completed');
}

// Показ итоговой сводки ночи согласно ТЗ
function showNightSummary(logs) {
    // Построить структурированную сводку
    const parsed = parseNightSummary(logs || []);
    showNightSummaryModal(parsed);
    
    // Также добавляем в историю игры
    (logs || []).forEach(log => addLogEntry(log));
}

function parseNightSummary(logs) {
    const byMafia = [];
    const byManiac = [];
    const byBomb = [];
    const byKamikaze = [];
    const savedByDoctor = [];
    const savedByLover = [];
    const jailed = [];
    
    logs.forEach(line => {
        if (line.includes('🔫 Мафия убила:')) byMafia.push(line.split(':').slice(1).join(':').trim());
        if (line.includes('🔪 Маньяк убил:')) byManiac.push(line.split(':').slice(1).join(':').trim());
        if (line.includes('💣 Подрывник пал')) {
            const names = line.split('унёс:')[1]?.trim();
            if (names) byBomb.push(names);
        }
        if (line.includes('💥 Камикадзе атаковал') && line.includes('оба погибли')) {
            const name = line.split('Камикадзе атаковал')[1]?.split('→')[0]?.trim();
            if (name) byKamikaze.push(name);
        }
        if (line.includes('💉 Доктор вылечил:')) savedByDoctor.push(line.split(':').slice(1).join(':').trim());
        if (line.includes('под защитой Любовницы') || line.includes('Любовница: ночь с')) {
            const name = line.includes('Любовница: ночь с') ? line.split('ночь с')[1]?.trim() : line.split('(')[1]?.split(')')[0];
            if (name) savedByLover.push(name);
        }
        if (line.includes('🔒 Тюремщик арестовал:')) jailed.push(line.split(':').slice(1).join(':').trim());
    });
    
    return { byMafia, byManiac, byBomb, byKamikaze, savedByDoctor, savedByLover, jailed };
}

function showNightSummaryModal(summary) {
    // Удаляем предыдущий модал если есть
    const prev = document.getElementById('nightSummaryOverlay');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    
    const overlay = document.createElement('div');
    overlay.id = 'nightSummaryOverlay';
    overlay.className = 'night-summary-overlay';
    
    const content = document.createElement('div');
    content.className = 'night-summary-content';
    
    let deathsSection = '';
    const anyDeaths = summary.byMafia.length || summary.byManiac.length || summary.byBomb.length || summary.byKamikaze.length;
    if (!anyDeaths) {
        deathsSection = `<div class="summary-line">🌙 В эту ночь никто не умер</div>`;
    } else {
        if (summary.byMafia.length) {
            deathsSection += `<div class="summary-line">🔫 Убиты мафией: <strong>${summary.byMafia.join(', ')}</strong></div>`;
        }
        if (summary.byManiac.length) {
            deathsSection += `<div class="summary-line">🔪 Убиты маньяком: <strong>${summary.byManiac.join(', ')}</strong></div>`;
        }
        if (summary.byBomb.length) {
            deathsSection += `<div class="summary-line">💣 Взрыв унёс: <strong>${summary.byBomb.join(', ')}</strong></div>`;
        }
        if (summary.byKamikaze.length) {
            deathsSection += `<div class="summary-line">💥 Камикадзе забрал: <strong>${summary.byKamikaze.join(', ')}</strong></div>`;
        }
    }
    
    let footerSection = '';
    const footLines = [];
    if (summary.savedByLover.length) footLines.push(`💋 Любовница спасла: <strong>${[...new Set(summary.savedByLover)].join(', ')}</strong>`);
    if (summary.savedByDoctor.length) footLines.push(`💉 Доктор вылечил: <strong>${[...new Set(summary.savedByDoctor)].join(', ')}</strong>`);
    if (summary.jailed.length) footLines.push(`🔒 Тюремщик арестовал: <strong>${[...new Set(summary.jailed)].join(', ')}</strong>`);
    if (footLines.length) {
        footerSection = `<div class="summary-divider"></div><div class="summary-footer">${footLines.map(l => `<div class="summary-line">${l}</div>`).join('')}</div>`;
    }
    
    content.innerHTML = `
        <h3 class="night-summary-title">🌙 Итоги ночи</h3>
        <div class="night-summary-body">
            ${deathsSection}
        </div>
        ${footerSection}
        <div class="night-summary-actions">
            <button class="modal-btn confirm" id="closeNightSummaryBtn">OK</button>
        </div>
    `;
    
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    
    const closeBtn = document.getElementById('closeNightSummaryBtn');
    if (closeBtn) closeBtn.onclick = () => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
}

// Простая система всплывающих подсказок справа
function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(kind, emoji, text) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${kind || 'info'}`;
    toast.innerHTML = `<span class="emoji">${emoji || 'ℹ️'}</span><span>${text}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
    }, 5000); // longer visibility
}

// Night History Management
function toggleNightHistory() {
    const historyPanel = document.getElementById('nightHistoryPanel');
    
    if (historyPanel.style.display === 'none' || !historyPanel.style.display) {
        showNightHistory();
    } else {
        closeNightHistory();
    }
}

function showNightHistory() {
    const historyPanel = document.getElementById('nightHistoryPanel');
    const historyContent = document.getElementById('nightHistoryContent');
    
    if (historyPanel && historyContent) {
        historyPanel.style.display = 'block';
        updateNightHistoryContent();
        console.log('📜 Night history panel opened');
    }
}

function closeNightHistory() {
    const historyPanel = document.getElementById('nightHistoryPanel');
    if (historyPanel) {
        historyPanel.style.display = 'none';
        console.log('📜 Night history panel closed');
    }
}

function updateNightHistoryContent() {
    const historyContent = document.getElementById('nightHistoryContent');
    if (!historyContent) return;
    
    // Фильтруем историю для отображения важных событий
    const relevantHistory = gameState.log.filter(entry => {
        const text = entry.action.toLowerCase();
        return text.includes('🌙') || text.includes('☀️') || text.includes('💀') || 
               text.includes('🗳️') || text.includes('🎭') || text.includes('🌅') ||
               text.includes('убит') || text.includes('голосует') || text.includes('проверил') ||
               text.includes('лечит') || text.includes('блокирует') || text.includes('минирует');
    });
    
    if (relevantHistory.length === 0) {
        historyContent.innerHTML = `
            <div style="text-align: center; color: rgba(255,255,255,0.6); padding: 20px;">
                История пуста<br>
                <small>Действия игры будут отображаться здесь</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    relevantHistory.slice(-20).reverse().forEach((entry, index) => {
        const entryClass = getHistoryEntryClass(entry.action);
        
        html += `
            <div class="history-entry ${entryClass}">
                <div class="history-entry-time">${entry.timestamp}</div>
                <div class="history-entry-text">${entry.action}${entry.details ? ': ' + entry.details : ''}</div>
            </div>
        `;
    });
    
    historyContent.innerHTML = html;
}

function getHistoryEntryClass(entry) {
    const text = entry.toLowerCase();
    
    if (text.includes('🌙') || text.includes('ночь')) {
        return 'night-action';
    } else if (text.includes('☀️') || text.includes('день')) {
        return 'day-action';
    } else if (text.includes('🗳️') || text.includes('голосует')) {
        return 'voting-action';
    } else {
        return 'game-event';
    }
}

// Старая система полностью удалена - используется VISUAL VOTING SYSTEM выше



// Win Conditions
function checkWinConditions() {
    const alivePlayers = gameState.players.filter(p => p.status === 'alive');
    const aliveMafia = alivePlayers.filter(p => p.role && ['mafia', 'don', 'consigliere'].includes(p.role));
    const aliveCivilians = alivePlayers.filter(p => p.role && ['civilian', 'commissar', 'doctor', 'lover', 'bomber'].includes(p.role));
    
    if (aliveMafia.length === 0) {
        gameState.phase = 'finished';
        gameState.isActive = false;
        addHistoryEntry('🎉 МИРНЫЕ ЖИТЕЛИ ПОБЕДИЛИ!');
        updateUI();
        updateGameInstructions();
    } else if (aliveMafia.length >= aliveCivilians.length) {
        gameState.phase = 'finished';
        gameState.isActive = false;
        addHistoryEntry('😈 МАФИЯ ПОБЕДИЛА!');
        updateUI();
        updateGameInstructions();
    }
}

function updateHistoryDisplay() {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (gameState.log.length === 0) {
        historyContent.innerHTML = '<p class="no-history">История пуста. Начните игру чтобы увидеть действия.</p>';
        return;
    }
    
    historyContent.innerHTML = gameState.log.slice().reverse().map(entry => `
        <div class="history-entry">
            <div class="history-time">${entry.timestamp} - ${entry.phase}</div>
            <div>${entry.action}${entry.details ? ': ' + entry.details : ''}</div>
        </div>
    `).join('');
}

// Telegram WebApp Integration
tg.onEvent('mainButtonClicked', function() {
    updateUI();
});

tg.onEvent('backButtonClicked', function() {
    if (gameState.phase === 'night') {
        const nightPanel = document.getElementById('nightPanel');
        if (nightPanel) nightPanel.style.display = 'none';
        startDayPhase();
    } else if (gameState.phase === 'voting') {
        const votingPanel = document.getElementById('votingPanel');
        if (votingPanel) votingPanel.style.display = 'none';
        startDayPhase();
    } else {
        showMainMenu();
    }
});

// Setup Telegram WebApp buttons
tg.MainButton.setText('Обновить');
tg.MainButton.onClick(function() {
    updateUI();
});
tg.MainButton.show();

// Добавить 16 тестовых игроков для демонстрации
function addTestPlayers() {
    if (gameState.players.length > 0) {
        if (!confirm('Добавить тестовых игроков? Это добавит игроков к существующим.')) {
            return;
        }
    }
    
    const testPlayers = [
        'Алексей', 'Мария', 'Дмитрий', 'Анна', 'Сергей', 'Елена',
        'Михаил', 'Ольга', 'Андрей', 'Наталья', 'Владимир', 'Татьяна',
        'Николай', 'Ирина', 'Павел', 'Екатерина'
    ];
    
    let startSeat = 1;
    // Найти первое свободное место
    while (gameState.players.some(p => p.seatNumber === startSeat) && startSeat <= 20) {
        startSeat++;
    }
    
    let addedCount = 0;
    for (let i = 0; i < testPlayers.length && addedCount < 16; i++) {
        const seatNumber = startSeat + i;
        
        if (seatNumber > 20) break; // Не больше 20 мест
        
        // Проверить, не занято ли место
        if (gameState.players.some(p => p.seatNumber === seatNumber)) {
            continue;
        }
        
        const newPlayer = {
            id: Date.now() + Math.random(), // Уникальный ID
            name: testPlayers[i],
            username: `test_${testPlayers[i].toLowerCase()}`,
            seatNumber: seatNumber,
            role: null,
            status: 'alive'
        };
        
        gameState.players.push(newPlayer);
        addedCount++;
    }
    
    updatePlayersList();
    updatePlayerTable();
    updateGameStatus();
    saveGameData();
    scheduleSave(); // Автосохранение при добавлении тестовых игроков
    addHistoryEntry(`🎮 Добавлено ${addedCount} тестовых игроков`);
    
    alert(`Добавлено ${addedCount} тестовых игроков! Теперь назначьте им роли в разделе "Начать игру".`);
}

// Очистить всех игроков
function clearAllPlayers() {
    if (gameState.players.length === 0) {
        alert('Список игроков уже пуст!');
        return;
    }
    
    if (confirm(`Удалить всех ${gameState.players.length} игроков? Это действие нельзя отменить.`)) {
        const removedCount = gameState.players.length;
        gameState.players = [];
        gameState.phase = 'setup';
        gameState.isActive = false;
        gameState.dayNumber = 1;
        
        updatePlayersList();
        updatePlayerTable();
        updateGameStatus();
        saveGameData();
        scheduleSave(); // Автосохранение при очистке игроков
        addHistoryEntry(`🗑️ Удалены все игроки (${removedCount})`);
        
        alert('Все игроки удалены!');
    }
}

// Функция сохранения данных игры (заглушка)
function saveGameData() {
    // Локальное сохранение в localStorage
    localStorage.setItem('mafiaGameState', JSON.stringify(gameState));
    // Планируем автосохранение на сервер
    scheduleSave();
}

// Функция загрузки данных игры
function loadGameData() {
    try {
        const saved = localStorage.getItem('mafiaGameState');
        if (saved) {
            const savedState = JSON.parse(saved);
            // Загружаем только основные данные, не перезаписываем настройки
            if (savedState.players) gameState.players = savedState.players;
            if (savedState.log) gameState.log = savedState.log;
            if (savedState.phase) gameState.phase = savedState.phase;
            if (savedState.dayNumber) gameState.dayNumber = savedState.dayNumber;
            if (savedState.isActive) gameState.isActive = savedState.isActive;
        }
    } catch (e) {
        console.error('Ошибка загрузки данных:', e);
    }
}

// Функция ручного исключения/возвращения игрока
function togglePlayerStatus(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return;
    
    const newStatus = player.status === 'alive' ? 'dead' : 'alive';
    player.status = newStatus;
    
    const action = newStatus === 'dead' ? 'исключен' : 'возвращен в игру';
    addHistoryEntry(`⚡ ${player.name} ${action} администратором`);
    
    // Обновляем отображение
    updatePlayerTable();
    updatePlayersList();
    saveGameData();
    scheduleSave(); // Автосохранение при изменении статуса игрока
    
    // Проверяем условия победы после изменения
    if (gameState.isActive) {
        checkWinConditions();
    }
}

// ========== СИСТЕМА АВТОСОХРАНЕНИЯ ==========

let saveTimer = null;
let lastSaveStatus = null;

// Планировщик сохранения с дебаунсом
function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 700);
}

// Сохранение состояния игры на сервер
async function persist() {
    if (!gameState?.id) {
        console.log('⚠️ Нет ID игры для сохранения');
        return;
    }
    
    try {
        const response = await fetch(`/api/games/${gameState.id}/save`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ADMIN_TOKEN || 'admin-secret'}`
            },
            body: JSON.stringify(gameState)
        });
        
        if (response.ok) {
            const data = await response.json();
            gameState.meta.updatedAt = data.updatedAt || new Date().toISOString();
            localStorage.setItem('lastGameId', gameState.id);
            lastSaveStatus = { success: true, time: new Date().toLocaleTimeString() };
            updateSaveStatus('Автосохранение: ' + lastSaveStatus.time);
            console.log('💾 Игра автосохранена:', lastSaveStatus.time);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Ошибка автосохранения:', error);
        lastSaveStatus = { success: false, error: error.message };
        updateSaveStatus('Ошибка сохранения');
        
        // Локальное резервное сохранение
        try {
            localStorage.setItem(`draft:${gameState.id}`, JSON.stringify(gameState));
            console.log('💿 Локальное резервное сохранение выполнено');
        } catch (localError) {
            console.error('❌ Ошибка локального сохранения:', localError);
        }
    }
}

// Обновление статуса сохранения в UI
function updateSaveStatus(message) {
    let statusElement = document.getElementById('saveStatus');
    if (!statusElement) {
        statusElement = document.createElement('div');
        statusElement.id = 'saveStatus';
        statusElement.style.cssText = `
            position: fixed; top: 10px; right: 10px; z-index: 1000;
            background: rgba(0,0,0,0.7); color: white; padding: 5px 10px;
            border-radius: 4px; font-size: 12px; opacity: 0.8;
        `;
        document.body.appendChild(statusElement);
    }
    statusElement.textContent = message;
    
    // Скрыть через 3 секунды
    setTimeout(() => {
        if (statusElement.textContent === message) {
            statusElement.style.opacity = '0';
        }
    }, 3000);
    statusElement.style.opacity = '0.8';
}

// Проверка активной игры и кнопка "Продолжить"
async function checkActiveGame() {
    try {
        const response = await fetch('/api/games/active', {
            headers: { 'Authorization': `Bearer ${ADMIN_TOKEN || 'admin-secret'}` }
        });
        const activeGame = await response.json();
        
        let continueBtn = document.getElementById('btn-continue');
        if (!continueBtn) {
            continueBtn = document.createElement('button');
            continueBtn.id = 'btn-continue';
            continueBtn.className = 'btn primary';
            continueBtn.innerHTML = '▶ Продолжить игру';
            continueBtn.style.cssText = 'margin: 10px; display: none;';
            
            const mainMenu = document.querySelector('.main-menu, .game-setup, body');
            if (mainMenu) mainMenu.appendChild(continueBtn);
        }
        
        if (activeGame && activeGame.phase !== 'finished') {
            continueBtn.style.display = 'block';
            continueBtn.onclick = () => resumeGame(activeGame);
            console.log('🎮 Найдена активная игра для восстановления');
        } else {
            continueBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ Ошибка проверки активной игры:', error);
    }
}

// Восстановление игры из сохранения
function resumeGame(state) {
    console.log('🔄 Восстанавливаем игру:', state.phase);
    gameState = state;
    
    // Восстановление по фазе игры
    switch (gameState.phase) {
        case 'setup':
            showSetupScreen();
            break;
        case 'firstNight':
        case 'night':
            renderTableFromState();
            showNightBoard();
            break;
        case 'day':
            renderTableFromState();
            showDayBoard();
            restoreVotingUI();
            break;
        case 'voting':
            renderTableFromState();
            restoreVotingUI();
            break;
        default:
            renderTableFromState();
            updateUI();
    }
    
    updateSaveStatus('Игра восстановлена');
    console.log('✅ Игра успешно восстановлена');
}

// Восстановление состояния таблицы
function renderTableFromState() {
    if (!gameState.players || gameState.players.length === 0) return;
    
    updatePlayerTable();
    updatePlayersList();
    updateUI();
}

// Восстановление интерфейса голосования
function restoreVotingUI() {
    if (gameState.voting && gameState.voting.isActive) {
        // Восстановление голосования
        showVotingInterface();
        updateVotingDisplay();
        
        // Восстановление таймера если был активен
        if (gameState.voting.timer && gameState.voting.timer.running) {
            const remaining = gameState.voting.timer.remainingMs;
            if (remaining > 0) {
                startVotingTimer(Math.floor(remaining / 1000));
            }
        }
    }
}

// Завершение игры с очисткой автосохранения
function finishGame(reason) {
    gameState.phase = 'finished';
    addLogEntry(`🏁 Игра завершена: ${reason}`);
    
    persist().then(() => {
        localStorage.removeItem('lastGameId');
        localStorage.removeItem(`draft:${gameState.id}`);
        updateSaveStatus('Игра завершена и сохранена');
        
        // Возврат на главную
        setTimeout(() => {
            showMainMenu();
            checkActiveGame();
        }, 2000);
    });
}

// Создание новой игры с ID
function createNewGame() {
    // Генерируем уникальный ID для игры
    gameState.id = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    gameState.meta.createdAt = new Date().toISOString();
    gameState.meta.updatedAt = new Date().toISOString();
    
    console.log('🆕 Создана новая игра:', gameState.id);
    scheduleSave(); // Первое сохранение
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM загружен, инициализируем игру...');
    
    // Создаем отсутствующие элементы для счетчика голосов
    let voteCounter = document.getElementById('voteCounter');
    let voteCountContent = document.getElementById('voteCountContent');
    
    if (!voteCounter) {
        console.log('Creating missing voteCounter element');
        voteCounter = document.createElement('div');
        voteCounter.id = 'voteCounter';
        voteCounter.style.display = 'none';
        document.body.appendChild(voteCounter);
    }
    
    if (!voteCountContent) {
        console.log('Creating missing voteCountContent element');
        voteCountContent = document.createElement('div');
        voteCountContent.id = 'voteCountContent';
        if (voteCounter) voteCounter.appendChild(voteCountContent);
    }
    
    // Контейнер всплывающих подсказок справа
    ensureToastContainer();
    
    // Панель сводки голосов слева
    ensureVoteSummaryPanel();
    
    // Проверяем активные игры
    checkActiveGame();
    
    loadGameData();
    updateUI();
    
    console.log('✅ Игра инициализирована');
});

// Функция для Telegram main button
function onMainButtonClick() {
    refreshUpcomingEvent();
}

// Left-side vote summary panel
function ensureVoteSummaryPanel() {
    let panel = document.getElementById('voteSummaryPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'voteSummaryPanel';
        panel.className = 'vote-summary-panel';
        document.body.appendChild(panel);
    }
    return panel;
}

function updateVoteSummary() {
    const panel = ensureVoteSummaryPanel();
    if (!gameState.voting || !gameState.voting.isActive) {
        panel.style.display = 'none';
        panel.innerHTML = '';
        return;
    }
    const counts = new Map();
    Object.values(gameState.voting.votes).forEach(targetId => {
        if (targetId && targetId !== 'abstain') {
            counts.set(targetId, (counts.get(targetId) || 0) + 1);
        }
    });
    const entries = [...counts.entries()].sort((a,b) => b[1]-a[1]);
    if (entries.length === 0) {
        panel.style.display = 'block';
        panel.innerHTML = '<div class="vote-summary-title">Голоса</div><div class="vote-summary-empty">Пока нет голосов</div>';
        return;
    }
    const lines = entries.map(([id, cnt]) => {
        const p = gameState.players.find(pp => pp.id === id);
        const name = p?.name || p?.nickname || p?.username || `Игрок ${id}`;
        return `<div class="vote-summary-row"><span class="name">${name}</span><span class="count">${cnt}</span></div>`;
    }).join('');
    panel.style.display = 'block';
    panel.innerHTML = `<div class="vote-summary-title">Голоса</div>${lines}`;
}

// Подрывник — поддержать минирование 3-5 целей за ночь и «переминирование» спустя 3 хода
let bomberNightMines = new Map(); // nightNumber -> Set of targetIds
let bomberRearmCounter = 0; // ходы до возможного переминирования

// В начале ночи сбрасываем ночные минирования
const _origStartNightPhase = typeof startNightPhase === 'function' ? startNightPhase : null;
if (_origStartNightPhase) {
    window.startNightPhase = function() {
        bomberNightMines.set(gameState.nightNumber, new Set());
        if (bomberRearmCounter > 0) bomberRearmCounter--;
        return _origStartNightPhase.call(this);
    };
}

// Разрешаем бомбера минировать 3-5 игроков за ночь
function canBomberMineMoreThisNight() {
    const set = bomberNightMines.get(gameState.nightNumber) || new Set();
    return set.size < 5; // максимум 5
}

function registerBomberMineThisNight(targetId) {
    let set = bomberNightMines.get(gameState.nightNumber);
    if (!set) {
        set = new Set();
        bomberNightMines.set(gameState.nightNumber, set);
    }
    set.add(targetId);
}

// Перехватываем применение действия бомбера для учёта лимита и переминирования
const _origApplyNightAction = applyNightAction;
window.applyNightAction = function(roleType, targetId) {
    if (roleType === 'bomber') {
        // Ограничение 3-5 целей за ночь: не даём больше 5, разрешаем минимум 3 — UI не принуждаем, но лог ограничит до 5
        if (!canBomberMineMoreThisNight()) {
            showToast('info', '💣', 'Лимит минирований на ночь достигнут (5)');
            return;
        }
        registerBomberMineThisNight(targetId);
        bomberRearmCounter = Math.max(bomberRearmCounter, 3); // через 3 хода можно переминировать
    }
    return _origApplyNightAction.call(this, roleType, targetId);
};

// Разрешаем «переминировать» после истечения трёх ходов (дней)
const _origStartNewDay = typeof startNewDay === 'function' ? startNewDay : null;
if (_origStartNewDay) {
    window.startNewDay = function() {
        if (bomberRearmCounter > 0) bomberRearmCounter--;
        return _origStartNewDay.call(this);
    };
}

// Валидация цели бомбера: если старая мина есть и не прошло 3 хода — запрещаем «переминировать» того же игрока
const _origIsValidTarget = typeof isValidTarget === 'function' ? isValidTarget : null;
if (_origIsValidTarget) {
    window.isValidTarget = function(roleKey, player) {
        const res = _origIsValidTarget.call(this, roleKey, player) || { valid: true };
        if (roleKey === 'bomber') {
            if (player.effects?.mined && bomberRearmCounter > 0) {
                return { valid: false, reason: 'Переминировать можно через 3 хода' };
            }
            const set = bomberNightMines.get(gameState.nightNumber) || new Set();
            if (set.size >= 5 && !set.has(player.id)) {
                return { valid: false, reason: 'Лимит минирований этой ночью' };
            }
        }
        return res;
    };
}
