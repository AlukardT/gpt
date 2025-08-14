import express from 'express';
import dotenv from 'dotenv';
import { stateStore } from '../game-engine/stateStore.js';
import { resolveNight } from '../game-engine/nightEngine.js';
import { computeVoteResult } from '../game-engine/voteEngine.js';

dotenv.config();

const router = express.Router();

function isAdmin(req) {
	const adminId = process.env.ADMIN_TELEGRAM_ID;
	const key = req.headers['x-admin-id'];
	return adminId && key && String(key) === String(adminId);
}

router.get('/state', async (req, res) => {
	const session = await stateStore.loadLatestSession();
	res.json(session || null);
});

router.post('/start', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
	const { eventId } = req.body;
	try {
		const session = await stateStore.startSessionFromEvent(eventId);
		res.json(session);
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

router.post('/roles', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
	const { rolesBySeat } = req.body; // { seatNumber: role }
	try {
		const session = await stateStore.applyRoles(rolesBySeat);
		res.json(session);
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

router.post('/night/resolve', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
	const { draft } = req.body;
	try {
		const session = await stateStore.loadLatestSession();
		if (!session) return res.status(400).json({ error: 'no session' });
		const result = resolveNight(session, draft || {});
		await stateStore.saveSession(result.state);
		res.json(result.summary);
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

router.post('/day/vote', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
	const { votes } = req.body; // [{voterSeat, targetSeat}]
	try {
		const session = await stateStore.loadLatestSession();
		if (!session) return res.status(400).json({ error: 'no session' });
		const result = computeVoteResult(session, votes || []);
		if (result.eliminatedId) {
			await stateStore.markEliminated(result.eliminatedId);
		}
		res.json(result);
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

export default router;