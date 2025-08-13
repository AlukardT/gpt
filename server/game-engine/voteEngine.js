function isJailedDuringDay(state, player) {
	return player.jailedUntilDay != null && state.dayNumber != null && state.dayNumber <= player.jailedUntilDay;
}

export function computeVoteResult(state, votes) {
	const eligibleSeats = state.players
		.filter(p => p.alive && !isJailedDuringDay(state, p))
		.map(p => p.seat)
		.sort((a, b) => a - b);
	const tally = new Map();
	for (const v of votes) {
		if (!eligibleSeats.includes(v.voterSeat)) continue;
		if (!eligibleSeats.includes(v.targetSeat)) continue;
		tally.set(v.targetSeat, (tally.get(v.targetSeat) || 0) + 1);
	}
	let max = 0; let leaders = [];
	for (const [seat, count] of tally) {
		if (count > max) { max = count; leaders = [seat]; }
		else if (count === max) { leaders.push(seat); }
	}
	if (leaders.length === 0) return { eliminatedId: null, revoteNeeded: true, leaders: [] };
	if (leaders.length > 1) return { eliminatedId: null, revoteNeeded: true, leaders };
	const eliminatedSeat = leaders[0];
	const eliminatedPlayer = state.players.find(p => p.seat === eliminatedSeat);
	return { eliminatedId: eliminatedPlayer?.telegramId || null, revoteNeeded: false, leaders: [eliminatedSeat] };
}