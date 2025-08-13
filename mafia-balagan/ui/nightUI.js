export function mountNightUI(root) {
	root.innerHTML = `
		<h2>Ночь</h2>
		<div class="grid">
			<label>mafiaTarget <input id="mafiaTarget" type="number" min="1" max="20"></label>
			<label>jailerTarget <input id="jailerTarget" type="number" min="1" max="20"></label>
			<label>consigliereTarget <input id="consigliereTarget" type="number" min="1" max="20"></label>
			<label>loverTarget <input id="loverTarget" type="number" min="1" max="20"></label>
			<label>doctorTarget <input id="doctorTarget" type="number" min="1" max="20"></label>
			<label>maniacTarget <input id="maniacTarget" type="number" min="1" max="20"></label>
			<label>kamikazeTarget <input id="kamikazeTarget" type="number" min="1" max="20"></label>
			<label>sheriffTarget <input id="sheriffTarget" type="number" min="1" max="20"></label>
			<label>bomberTargets (через запятую) <input id="bomberTargets" type="text" placeholder="3,5"></label>
		</div>
		<button id="btn-confirm-night">Подтвердить ночь</button>
		<pre id="night-out"></pre>
	`;

	document.getElementById('btn-confirm-night').onclick = async () => {
		const draft = {};
		for (const k of ['mafiaTarget','jailerTarget','consigliereTarget','loverTarget','doctorTarget','maniacTarget','kamikazeTarget','sheriffTarget']) {
			const v = Number(document.getElementById(k).value);
			if (v) draft[k] = v;
		}
		const bt = document.getElementById('bomberTargets').value.trim();
		if (bt) draft.bomberTargets = bt.split(',').map(s=>Number(s.trim())).filter(Boolean);
		const res = await fetch('/api/session/night/resolve', { method: 'POST', headers: { 'Content-Type':'application/json','x-admin-id': window.ADMIN_ID||'' }, body: JSON.stringify({ draft }) });
		const summary = await res.json();
		document.getElementById('night-out').textContent = JSON.stringify(summary, null, 2);
	};
}