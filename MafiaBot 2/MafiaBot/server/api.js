const express = require('express');
const cors = require('cors');
const { db } = require('./db.js');
const { eq } = require('drizzle-orm');
// Import all needed tables from the schema.  Note: eventRegistrations was missing previously
// which caused a ReferenceError when fetching registrations.
const { userProfiles, events, eventRegistrations, activeGames } = require('../shared/schema.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

console.log('🔧 API module initializing...');

// Test route для отладки
app.get('/api/test', (req, res) => {
  res.json({ ok: true, message: 'API module is working' });
});

console.log('🔍 API routes loaded. Testing basic route...');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';
const BOT_TOKEN_INTERNAL = process.env.BOT_TOKEN_INTERNAL || 'bot-secret';

// Утилиты
const ok = (res, data = {}) => res.json({ ok: true, ...data });
const bad = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

const adminAuth = (req, res, next) => {
  if ((req.headers.authorization || '') === `Bearer ${ADMIN_TOKEN}`) return next();
  return bad(res, 401, 'Unauthorized');
};

const botAuth = (req, res, next) => {
  if ((req.headers.authorization || '') === `Bearer ${BOT_TOKEN_INTERNAL}`) return next();
  return bad(res, 401, 'Unauthorized');
};

// WebSocket хаб
const sockets = new Set();
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  sockets.forEach(ws => { 
    try { 
      if (ws.readyState === 1) ws.send(msg); 
    } catch {} 
  });
}

// ── PLAYERS API ──
app.post('/api/players/upsert', botAuth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.telegramId) return bad(res, 400, 'telegramId required');

    const playerData = {
      id: String(p.telegramId),
      username: p.username || null,
      firstName: p.firstName || null,
      lastName: p.lastName || null,
      nickname: p.nickname || null,
      realName: p.realName || null,
      avatarUrl: p.avatarUrl || null,
      isRegistered: false, // Базовая регистрация при /start
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
          lastActive: playerData.lastActive
        }
      });

    broadcast('player.upsert', { telegramId: String(p.telegramId) });
    return ok(res);
  } catch (error) {
    console.error('Error upserting player:', error);
    return bad(res, 500, 'Database error');
  }
});

// Полная регистрация пользователя с данными wizard
app.post('/api/players/register', botAuth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.telegramId || !p.nickname || !p.realName) {
      return bad(res, 400, 'telegramId, nickname, and realName required');
    }

    const playerData = {
      id: String(p.telegramId),
      username: p.username || null,
      firstName: p.firstName || null,
      lastName: p.lastName || null,
      nickname: p.nickname,
      realName: p.realName,
      avatarUrl: p.avatarUrl || null,
      isRegistered: true, // Полная регистрация
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

    broadcast('player.register', { telegramId: String(p.telegramId) });
    return ok(res);
  } catch (error) {
    console.error('Error registering player:', error);
    return bad(res, 500, 'Database error');
  }
});

// Разрешаем доступ к профилям как боту, так и админу
const publicAuth = (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${ADMIN_TOKEN}` || auth === `Bearer ${BOT_TOKEN_INTERNAL}`) {
    return next();
  }
  return bad(res, 401, 'Unauthorized');
};

app.get('/api/players/:id', publicAuth, async (req, res) => {
  try {
    const [player] = await db.select().from(userProfiles).where(eq(userProfiles.id, req.params.id));
    if (!player) return bad(res, 404, 'Player not found');
    return ok(res, { profile: player });
  } catch (error) {
    console.error('Error fetching player profile:', error);
    return bad(res, 500, 'Database error');
  }
});

app.get('/api/players', async (req, res) => {
  try {
    const allPlayers = await db.select().from(userProfiles).orderBy(userProfiles.lastActive);
    return ok(res, { players: allPlayers });
  } catch (error) {
    console.error('Error fetching players:', error);
    return bad(res, 500, 'Database error');
  }
});

// ── EVENTS API ──
app.post('/api/events', adminAuth, async (req, res) => {
  try {
    // Extract fields from request.  Both `location` and legacy `place` are accepted for compatibility.
    const { title, location, place, address, dateIso, capacity = 20, createdBy } = req.body;
    if (!title || !dateIso) return bad(res, 400, 'title & dateIso required');

    // Parse ISO date into separate date and time strings
    let dateStr, timeStr;
    try {
      const eventDate = new Date(dateIso);
      if (isNaN(eventDate.getTime())) {
        return bad(res, 400, 'Invalid dateIso format');
      }
      dateStr = eventDate.toISOString().split('T')[0];
      timeStr = eventDate.toTimeString().slice(0, 5);
    } catch {
      return bad(res, 400, 'Invalid dateIso value');
    }

    const eventData = {
      title,
      location: location || place || '',
      address: address || '',
      date: dateStr,
      time: timeStr,
      capacity,
      createdBy: createdBy || 'admin'
    };

    const [newEvent] = await db.insert(events).values(eventData).returning();
    broadcast('event.created', { id: newEvent.id });
    return ok(res, { id: newEvent.id, event: newEvent });
  } catch (error) {
    console.error('Error creating event:', error);
    return bad(res, 500, 'Database error');
  }
});

app.get('/api/events', publicAuth, async (req, res) => {
  try {
    // Order events by date then time
    const allEvents = await db
      .select()
      .from(events)
      .orderBy(events.date)
      .orderBy(events.time);
    return ok(res, { events: allEvents });
  } catch (error) {
    console.error('Error fetching events:', error);
    return bad(res, 500, 'Database error');
  }
});

app.get('/api/events/next', publicAuth, async (req, res) => {
  try {
    // Determine current date and time strings
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    // Select the next event whose date is after today or on today but time is later
    const [nextEvent] = await db
      .select()
      .from(events)
      .where(`(date > '${todayStr}') OR (date = '${todayStr}' AND time >= '${timeStr}')`)
      .orderBy(events.date)
      .orderBy(events.time)
      .limit(1);
    res.json(nextEvent || null);
  } catch (error) {
    console.error('Error fetching next event:', error);
    return bad(res, 500, 'Database error');
  }
});

// Добавляем недостающие endpoints для совместимости с веб-приложением
app.get('/api/games/active', publicAuth, async (req, res) => {
  try {
    const [activeGame] = await db.select().from(activeGames).limit(1);
    if (!activeGame) {
      return res.json(null);
    }
    return res.json(activeGame);
  } catch (error) {
    console.error('Error fetching active game:', error);
    return bad(res, 500, 'Database error');
  }
});

app.post('/api/games/:id/save', publicAuth, async (req, res) => {
  try {
    const gameId = req.params.id;
    const gameData = req.body;
    
    await db.insert(activeGames)
      .values({
        id: gameId,
        ...gameData,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: activeGames.id,
        set: {
          ...gameData,
          updatedAt: new Date()
        }
      });
    
    return ok(res, { updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error saving game:', error);
    return bad(res, 500, 'Database error');
  }
});

app.get('/api/events/:id/registrations', publicAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const registrations = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId));
    console.log(`✅ Регистрации для события ${eventId}:`, registrations.length);
    return ok(res, { registrations });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    return bad(res, 500, 'Database error');
  }
});

// ── GAMES API ──
app.post('/api/games', adminAuth, async (req, res) => {
  try {
    const { eventId } = req.body;
    
    const gameState = {
      phase: 'setup',
      nightNumber: 0,
      players: [],
      votes: {},
      log: []
    };

    const gameData = {
      eventId: eventId || null,
      gameData: gameState,
      phase: 'setup'
    };

    const [newGame] = await db.insert(activeGames).values(gameData).returning();
    return ok(res, { id: newGame.id, state: gameState });
  } catch (error) {
    console.error('Error creating game:', error);
    return bad(res, 500, 'Database error');
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const [game] = await db.select().from(activeGames).where(eq(activeGames.id, req.params.id));
    if (!game) return bad(res, 404, 'game not found');
    
    res.json(JSON.parse(game.gameData));
  } catch (error) {
    console.error('Error fetching game:', error);
    return bad(res, 500, 'Database error');
  }
});

async function saveGameState(gameId, state) {
  try {
    await db.update(activeGames)
      .set({
        gameData: JSON.stringify(state),
        lastUpdated: new Date()
      })
      .where(eq(activeGames.id, gameId));
    
    broadcast('game.update', { id: gameId, patch: state });
  } catch (error) {
    console.error('Error saving game state:', error);
  }
}

app.post('/api/games/:id/assignRoles', adminAuth, async (req, res) => {
  try {
    const [game] = await db.select().from(activeGames).where(eq(activeGames.id, req.params.id));
    if (!game) return bad(res, 404, 'game not found');
    
    const state = JSON.parse(game.gameData);
    const { seats } = req.body;
    
    const allPlayers = await db.select().from(userProfiles);
    const byTid = Object.fromEntries(allPlayers.map(p => [p.id, p]));

    state.players = seats.map((s, i) => {
      const p = byTid[String(s.telegramId)];
      return {
        id: String(s.telegramId),
        telegramId: String(s.telegramId),
        nickname: p?.nickname || p?.username || `Игрок ${i+1}`,
        realName: p?.realName || null,
        avatarUrl: p?.avatarUrl || null,
        seat: s.seat,
        role: 'civilian',
        status: 'alive',
        jailed: false
      };
    });

    state.phase = 'firstNight';
    state.nightNumber = 1;
    state.log.push({ t: Date.now(), m: 'Роли розданы. Первая ночь.' });
    
    await saveGameState(req.params.id, state);
    return ok(res, { state });
  } catch (error) {
    console.error('Error assigning roles:', error);
    return bad(res, 500, 'Database error');
  }
});

app.post('/api/games/:id/nightAction', adminAuth, async (req, res) => {
  try {
    const [game] = await db.select().from(activeGames).where(eq(activeGames.id, req.params.id));
    if (!game) return bad(res, 404, 'game not found');
    
    const state = JSON.parse(game.gameData);
    const { kind, actorId, targetId, meta } = req.body;
    
    state.pending = state.pending || [];
    state.pending.push({ kind, actorId, targetId, meta, at: Date.now() });

    await saveGameState(req.params.id, state);
    return ok(res);
  } catch (error) {
    console.error('Error recording night action:', error);
    return bad(res, 500, 'Database error');
  }
});

app.post('/api/games/:id/resolveNight', adminAuth, async (req, res) => {
  try {
    const [game] = await db.select().from(activeGames).where(eq(activeGames.id, req.params.id));
    if (!game) return bad(res, 404, 'game not found');
    
    const state = JSON.parse(game.gameData);

    // Здесь можно вызвать resolveNight(state) из игрового движка
    // const summary = resolveNight(state);

    state.phase = 'day';
    state.log.push({ t: Date.now(), m: 'Ночь завершена.' });
    
    await saveGameState(req.params.id, state);
    return ok(res, { state, summary: state.summary || [] });
  } catch (error) {
    console.error('Error resolving night:', error);
    return bad(res, 500, 'Database error');
  }
});

app.post('/api/games/:id/vote', adminAuth, async (req, res) => {
  try {
    const [game] = await db.select().from(activeGames).where(eq(activeGames.id, req.params.id));
    if (!game) return bad(res, 404, 'game not found');
    
    const state = JSON.parse(game.gameData);
    const { voterId, targetId } = req.body;
    
    state.votes = state.votes || {};
    state.votes[voterId] = targetId || 'abstain';

    await saveGameState(req.params.id, state);
    return ok(res);
  } catch (error) {
    console.error('Error recording vote:', error);
    return bad(res, 500, 'Database error');
  }
});

// Save game state endpoint
app.post('/api/games/:id/save', adminAuth, async (req, res) => {
  try {
    const state = req.body;
    if (!state || state.id !== req.params.id) {
      return bad(res, 400, 'Invalid state data');
    }
    
    // Ensure meta fields exist
    if (!state.meta) {
      state.meta = {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      state.meta.updatedAt = new Date().toISOString();
    }
    
    await saveGameState(req.params.id, state);
    return ok(res, { saved: true, updatedAt: state.meta.updatedAt });
  } catch (error) {
    console.error('Error saving game state:', error);
    return bad(res, 500, 'Database error');
  }
});

// Get active (not finished) game
app.get('/api/games/active', adminAuth, async (req, res) => {
  try {
    const games = await db.select().from(activeGames).orderBy(activeGames.lastUpdated);
    
    for (const game of games.reverse()) { // Get latest first
      try {
        const state = JSON.parse(game.gameData);
        if (state.phase !== 'finished' && state.isActive) {
          state.id = game.id; // Добавляем ID для фронтенда
          return ok(res, state);
        }
      } catch (parseError) {
        console.error('Error parsing game data:', parseError);
        continue;
      }
    }
    
    return ok(res, null); // No active games
  } catch (error) {
    console.error('Error getting active game:', error);
    return bad(res, 500, 'Database error');
  }
});

function setupWebSocket(server) {
  // WebSocket setup will be added later
  console.log('WebSocket server setup placeholder');
}

module.exports = { app, broadcast, setupWebSocket };