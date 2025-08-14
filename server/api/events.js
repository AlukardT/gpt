import express from 'express';
import dotenv from 'dotenv';
import { stateStore } from '../game-engine/stateStore.js';

dotenv.config();

const router = express.Router();

function isAdmin(req) {
	const adminId = process.env.ADMIN_TELEGRAM_ID;
	const key = req.headers['x-admin-id'];
	return adminId && key && String(key) === String(adminId);
}

router.get('/next', async (req, res) => {
	const next = await stateStore.getNextEvent();
	res.json(next || null);
});

router.post('/', async (req, res) => {
	if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
	const { title, startsAt } = req.body || {};
	try {
		const event = await stateStore.createEvent({ title, startsAt });
		res.json(event);
	} catch (e) {
		res.status(400).json({ error: e.message });
	}
});

export default router;