import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import eventsRouter from './api/events.js';
import sessionRouter from './api/session.js';
import profilesRouter from './api/profiles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Health
app.get('/health', (req, res) => {
	res.status(200).json({ ok: true });
});

// API
app.use('/api/events', eventsRouter);
app.use('/api/session', sessionRouter);
app.use('/api/profiles', profilesRouter);

// Static front-end
const publicDir = path.join(__dirname, '..', 'mafia-balagan');
app.use(express.static(publicDir));
app.get('/', (req, res) => {
	res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;

app.listen(port, async () => {
	console.log(`[server] Listening on port ${port}`);
});