export function mountAdminPanel(root) {
	root.innerHTML = `
		<h2>Админ-панель</h2>
		<div id="event"></div>
		<div style="margin:8px 0;">
			<button id="btn-create">Создать ивент</button>
			<button id="btn-start">Начать игру</button>
		</div>
		<h3>Роли</h3>
		<div id="roles"></div>
		<button id="btn-apply-roles">Раздать роли (всем CIVILIAN)</button>
		<h3>Ночь</h3>
		<textarea id="night-draft" rows="6" style="width:100%;" placeholder='{"mafiaTarget":1,"jailerTarget":2}'></textarea>
		<button id="btn-resolve-night">Подтвердить ночь</button>
		<pre id="night-summary"></pre>
		<h3>День / Голосование</h3>
		<textarea id="day-votes" rows="4" style="width:100%;" placeholder='[{"voterSeat":1,"targetSeat":3}]'></textarea>
		<button id="btn-day-vote">Отправить голоса</button>
		<pre id="day-result"></pre>
	`;

	async function fetchJSON(url, opts) {
		const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', 'x-admin-id': window.ADMIN_ID || '' } });
		if (!res.ok) throw new Error(await res.text());
		return await res.json();
	}

	async function loadEvent() {
		const evt = await fetchJSON('/api/events/next');
		document.getElementById('event').textContent = evt ? `Ближайший: ${evt.title} (${new Date(evt.startsAt).toLocaleString()}) id=${evt.id}` : 'Нет ивентов';
	}

	document.getElementById('btn-create').onclick = async () => {
		await fetchJSON('/api/events', { method: 'POST', body: JSON.stringify({ title: 'Игра', startsAt: Date.now() + 3600_000 }) });
		await loadEvent();
	};

	document.getElementById('btn-start').onclick = async () => {
		const evt = await fetchJSON('/api/events/next');
		if (!evt) return alert('Сначала создайте ивент');
		await fetchJSON('/api/session/start', { method: 'POST', body: JSON.stringify({ eventId: evt.id }) });
		alert('Сессия запущена');
	};

	document.getElementById('btn-apply-roles').onclick = async () => {
		const state = await fetchJSON('/api/session/state');
		if (!state) return alert('Нет сессии');
		const rolesBySeat = {};
		for (const p of state.players) rolesBySeat[p.seat] = 'civilian';
		await fetchJSON('/api/session/roles', { method: 'POST', body: JSON.stringify({ rolesBySeat }) });
		alert('Роли применены');
	};

	document.getElementById('btn-resolve-night').onclick = async () => {
		const draftText = document.getElementById('night-draft').value;
		let draft = {};
		try { draft = JSON.parse(draftText || '{}'); } catch { return alert('Некорректный JSON'); }
		const summary = await fetchJSON('/api/session/night/resolve', { method: 'POST', body: JSON.stringify({ draft }) });
		document.getElementById('night-summary').textContent = JSON.stringify(summary, null, 2);
	};

	document.getElementById('btn-day-vote').onclick = async () => {
		const votesText = document.getElementById('day-votes').value;
		let votes = [];
		try { votes = JSON.parse(votesText || '[]'); } catch { return alert('Некорректный JSON'); }
		const res = await fetchJSON('/api/session/day/vote', { method: 'POST', body: JSON.stringify({ votes }) });
		document.getElementById('day-result').textContent = JSON.stringify(res, null, 2);
	};

	loadEvent();
}