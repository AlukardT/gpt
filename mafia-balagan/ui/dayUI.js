export function mountDayUI(root) {
	root.innerHTML = `
		<h2>День и голосование</h2>
		<textarea id="votes" rows="6" style="width:100%;" placeholder='[{"voterSeat":1,"targetSeat":2}]'></textarea>
		<button id="btn-vote">Отправить</button>
		<pre id="out"></pre>
	`;
	document.getElementById('btn-vote').onclick = async () => {
		let votes = [];
		try { votes = JSON.parse(document.getElementById('votes').value || '[]'); } catch { return alert('Некорректный JSON'); }
		const res = await fetch('/api/session/day/vote', { method: 'POST', headers: { 'Content-Type':'application/json','x-admin-id': window.ADMIN_ID||'' }, body: JSON.stringify({ votes }) });
		const data = await res.json();
		document.getElementById('out').textContent = JSON.stringify(data, null, 2);
	};
}