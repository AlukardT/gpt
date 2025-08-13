import express from 'express';
import { stateStore } from '../game-engine/stateStore.js';

const router = express.Router();

router.get('/:telegramId', async (req, res) => {
	const profile = await stateStore.getProfileById(String(req.params.telegramId));
	if (!profile) return res.status(404).json({ error: 'not found' });
	res.json(profile);
});

router.post('/:telegramId', async (req, res) => {
	const id = String(req.params.telegramId);
	const update = req.body || {};
	const profile = await stateStore.getOrCreateProfile({ userId: id });
	Object.assign(profile, update);
	await stateStore.saveProfile(profile);
	res.json(profile);
});

export default router;