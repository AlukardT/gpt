import dotenv from 'dotenv';
import { ensureBot } from './bot.js';

dotenv.config();

(async () => {
	try {
		await ensureBot();
		console.log('[bot-standalone] running...');
	} catch (e) {
		console.error('[bot-standalone] failed:', e);
		process.exit(1);
	}
})();