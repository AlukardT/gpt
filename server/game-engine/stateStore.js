import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', '..', 'data');
const eventsFile = path.join(dataDir, 'events.json');
const profilesFile = path.join(dataDir, 'profiles.json');
const sessionsDir = path.join(dataDir, 'sessions');

async function ensureDataFiles() {
	await fs.mkdir(dataDir, { recursive: true });
	await fs.mkdir(sessionsDir, { recursive: true });
	for (const f of [eventsFile, profilesFile]) {
		try {
			await fs.access(f);
		} catch {
			await fs.writeFile(f, JSON.stringify([], null, 2));
		}
	}
}

function generateId(prefix = 'id') {
	return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

async function readJson(file, fallback) {
	try {
		const buf = await fs.readFile(file, 'utf8');
		return JSON.parse(buf || 'null') ?? fallback;
	} catch {
		return fallback;
	}
}

async function writeJson(file, data) {
	await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function loadEvents() {
	await ensureDataFiles();
	return await readJson(eventsFile, []);
}

async function saveEvents(events) {
	await writeJson(eventsFile, events);
}

async function loadProfiles() {
	await ensureDataFiles();
	return await readJson(profilesFile, []);
}

async function saveProfiles(profiles) {
	await writeJson(profilesFile, profiles);
}

async function loadLatestSessionFile() {
	await ensureDataFiles();
	const files = await fs.readdir(sessionsDir);
	const jsonFiles = files.filter(f => f.endsWith('.json'));
	if (jsonFiles.length === 0) return null;
	jsonFiles.sort();
	return path.join(sessionsDir, jsonFiles[jsonFiles.length - 1]);
}

async function saveSessionToFile(session) {
	await ensureDataFiles();
	const name = `${String(session.startedAt || Date.now())}_${session.id}.json`;
	const file = path.join(sessionsDir, name);
	await writeJson(file, session);
	return file;
}

class StateStore {
	constructor() {
		this._latestSession = null;
	}

	async listEventsSorted() {
		const events = await loadEvents();
		return [...events].sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0));
	}

	async getNextEvent() {
		const events = await loadEvents();
		const now = Date.now();
		const upcoming = events
			.filter(e => e.startsAt && e.startsAt >= now)
			.sort((a, b) => a.startsAt - b.startsAt)[0];
		return upcoming || events.sort((a, b) => (a.startsAt || 0) - (b.startsAt || 0))[0] || null;
	}

	async getEventById(id) {
		const events = await loadEvents();
		return events.find(e => e.id === id) || null;
	}

	async createEvent({ title, startsAt, locationTitle, address }) {
		const events = await loadEvents();
		const event = {
			id: generateId('evt'),
			title: title || 'Игра',
			startsAt: startsAt ? Number(startsAt) : Date.now() + 24 * 3600 * 1000,
			createdAt: Date.now(),
			locationTitle: locationTitle || 'Наш Бар',
			address: address || 'Адрес уточняется',
			registrations: []
		};
		events.push(event);
		await saveEvents(events);
		return event;
	}

	async signupForEvent(eventId, profile, count) {
		const events = await loadEvents();
		const event = events.find(e => e.id === eventId);
		if (!event) throw new Error('event not found');
		const existing = (event.registrations || []).find(r => String(r.userId) === String(profile.userId));
		if (existing) {
			existing.slots = count;
			existing.username = profile.username;
			existing.firstName = profile.firstName;
		} else {
			event.registrations = event.registrations || [];
			event.registrations.push({
				userId: String(profile.userId),
				username: profile.username || null,
				firstName: profile.firstName || null,
				slots: count
			});
		}
		await saveEvents(events);
		return event;
	}

	async isUserRegistered(eventId, telegramId) {
		const events = await loadEvents();
		const event = events.find(e => e.id === eventId);
		if (!event) return false;
		return (event.registrations || []).some(r => String(r.userId) === String(telegramId));
	}

	async cancelSignup(eventId, telegramId) {
		const events = await loadEvents();
		const event = events.find(e => e.id === eventId);
		if (!event) throw new Error('event not found');
		event.registrations = (event.registrations || []).filter(r => String(r.userId) !== String(telegramId));
		await saveEvents(events);
		return event;
	}

	async getOrCreateProfile({ userId, username, firstName }) {
		const profiles = await loadProfiles();
		let p = profiles.find(x => String(x.telegramId) === String(userId));
		if (!p) {
			p = {
				telegramId: String(userId),
				username: username || null,
				firstName: firstName || null,
				nickname: null,
				realName: null,
				avatarFileId: null,
				wins: 0,
				createdAt: Date.now()
			};
			profiles.push(p);
			await saveProfiles(profiles);
		}
		return p;
	}

	async saveProfile(profile) {
		const profiles = await loadProfiles();
		const idx = profiles.findIndex(x => String(x.telegramId) === String(profile.telegramId));
		if (idx >= 0) profiles[idx] = profile;
		else profiles.push(profile);
		await saveProfiles(profiles);
		return profile;
	}

	async getProfileById(id) {
		const profiles = await loadProfiles();
		return profiles.find(p => String(p.telegramId) === String(id)) || null;
	}

	async startSessionFromEvent(eventId) {
		const event = await this.getEventById(eventId);
		if (!event) throw new Error('event not found');
		const players = (event.registrations || []).flatMap(r => {
			const count = Math.max(1, Number(r.slots || 1));
			const arr = [];
			for (let i = 0; i < count; i++) {
				arr.push({
					telegramId: r.userId,
					username: r.username,
					firstName: r.firstName,
					seat: null,
					alive: true,
					jailedUntilDay: null,
					role: null
				});
			}
			return arr;
		});
		// Assign seats 1..N
		players.forEach((p, idx) => p.seat = idx + 1);
		const session = {
			id: generateId('sess'),
			startedAt: Date.now(),
			eventId: event.id,
			phase: 'night',
			nightNumber: 1,
			dayNumber: 0,
			players,
			history: { checks: [], nights: [], days: [] },
			werewolfShouldConvertNextNight: false,
			werewolfConverted: false,
			consigliereAttemptUsed: false,
			bomberMinedSeats: [],
			bomberMaxMined: null
		};
		this._latestSession = session;
		await saveSessionToFile(session);
		return session;
	}

	async loadLatestSession() {
		if (this._latestSession) return this._latestSession;
		const file = await loadLatestSessionFile();
		if (!file) return null;
		const json = await readJson(file, null);
		this._latestSession = json;
		return json;
	}

	async saveSession(session) {
		this._latestSession = session;
		await saveSessionToFile(session);
		return session;
	}

	async applyRoles(rolesBySeat) {
		const session = await this.loadLatestSession();
		if (!session) throw new Error('no session');
		for (const p of session.players) {
			const role = rolesBySeat?.[String(p.seat)] || rolesBySeat?.[p.seat];
			p.role = role || p.role || 'civilian';
		}
		await this.saveSession(session);
		return session;
	}

	async markEliminated(playerIdOrSeat) {
		const session = await this.loadLatestSession();
		if (!session) throw new Error('no session');
		const player = session.players.find(p => String(p.telegramId) === String(playerIdOrSeat) || String(p.seat) === String(playerIdOrSeat));
		if (player) player.alive = false;
		await this.saveSession(session);
		return session;
	}
}

export const stateStore = new StateStore();