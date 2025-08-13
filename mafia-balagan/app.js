import { mountAdminPanel } from './ui/adminPanel.js';
import { mountTable } from './ui/table.js';
import { mountNightUI } from './ui/nightUI.js';
import { mountDayUI } from './ui/dayUI.js';

window.ADMIN_ID = (window.ADMIN_ID || '994036142');

const app = document.getElementById('app');

async function fetchJSON(url, opts = {}) {
	const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
	if (!res.ok) throw new Error(await res.text());
	return await res.json();
}

async function getState() {
	return await fetchJSON('/api/session/state').catch(() => null);
}

function navbar(active) {
	return `
		<nav style="display:flex; gap:8px; margin-bottom:12px;">
			<button data-view="admin" ${active==='admin'?'disabled':''}>Админ</button>
			<button data-view="table" ${active==='table'?'disabled':''}>Стол</button>
			<button data-view="night" ${active==='night'?'disabled':''}>Ночь</button>
			<button data-view="day" ${active==='day'?'disabled':''}>День</button>
		</nav>
		<div id="view"></div>
	`;
}

async function render(view = 'admin') {
	app.innerHTML = navbar(view);
	const viewRoot = document.getElementById('view');
	app.querySelectorAll('button[data-view]').forEach(btn => btn.onclick = () => render(btn.getAttribute('data-view')));
	if (view === 'admin') return mountAdminPanel(viewRoot);
	if (view === 'table') return mountTable(viewRoot, await getState());
	if (view === 'night') return mountNightUI(viewRoot);
	if (view === 'day') return mountDayUI(viewRoot);
}

render();