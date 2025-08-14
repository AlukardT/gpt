import { ROLE_TO_ALIGNMENT } from '../../shared/roles.js';

function roleToBorderClass(role) {
	const align = ROLE_TO_ALIGNMENT[role] || 'civil';
	return `role-border-${align}`;
}

export function mountTable(root, state) {
	const seats = new Array(20).fill(0).map((_, i) => i + 1);
	const playersBySeat = new Map((state?.players || []).map(p => [p.seat, p]));
	const container = document.createElement('div');
	container.style.display = 'flex';
	container.style.flexWrap = 'wrap';
	container.style.maxWidth = '700px';
	seats.forEach(seat => {
		const p = playersBySeat.get(seat);
		const div = document.createElement('div');
		div.className = `seat ${p?.alive === false ? 'dead' : ''} ${p?.jailedUntilDay ? 'jailed' : ''} ${p?.role ? roleToBorderClass(p.role) : ''}`;
		div.title = p ? (p.username || p.firstName || p.telegramId) : `Место ${seat}`;
		const img = document.createElement('img');
		img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#243042"/><text x="64" y="74" font-size="38" text-anchor="middle" fill="#9fb3c8">${seat}</text></svg>`);
		const badge = document.createElement('div');
		badge.className = 'badge';
		badge.textContent = seat;
		div.appendChild(img);
		div.appendChild(badge);
		container.appendChild(div);
	});
	root.innerHTML = '';
	root.appendChild(container);
}