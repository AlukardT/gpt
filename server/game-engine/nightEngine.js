import { NIGHT_ORDER, BOMBER_RULES } from '../../shared/constants.js';
import { ROLES } from '../../shared/roles.js';

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function bySeatMap(players) {
	const map = new Map();
	for (const p of players) map.set(p.seat, p);
	return map;
}

function isAlive(player) { return !!player && player.alive !== false; }

function isJailedAtNight(state, player) {
	return player.jailedUntilDay != null && (state.dayNumber + 1) <= player.jailedUntilDay;
}

function isJailedDuringDay(state, player) {
	return player.jailedUntilDay != null && state.dayNumber <= player.jailedUntilDay;
}

function isMafiaAligned(player, state) {
	if (!player) return false;
	if (player.role === ROLES.MAFIA || player.role === ROLES.DON || player.role === ROLES.CONSIGLIERE) return true;
	if (player.role === ROLES.WEREWOLF) return !!state.werewolfConverted;
	return false;
}

function countAlive(players, predicate = () => true) {
	return players.filter(p => isAlive(p) && predicate(p)).length;
}

export function resolveNight(state, draft) {
	const current = clone(state);
	const next = clone(state);
	const players = next.players;
	const bySeat = bySeatMap(players);
	const living = players.filter(isAlive);
	const nextDayNumber = (next.dayNumber || 0) + 1;

	// Apply werewolf pending conversion at the START of this night
	if (current.werewolfShouldConvertNextNight) {
		next.werewolfConverted = true;
		next.werewolfShouldConvertNextNight = false;
	}

	const summary = {
		deaths: [],
		jailed: [],
		loved: [],
		healed: [],
		recruited: null,
		mined: [],
		werewolfNotice: false
	};

	// Normalize draft
	draft = draft || {};
	const mafiaTarget = draft.mafiaTarget ? Number(draft.mafiaTarget) : null;
	const jailerTarget = draft.jailerTarget ? Number(draft.jailerTarget) : null;
	const consigTarget = draft.consigliereTarget ? Number(draft.consigliereTarget) : null;
	const loverTarget = draft.loverTarget ? Number(draft.loverTarget) : null;
	const doctorTarget = draft.doctorTarget ? Number(draft.doctorTarget) : null;
	const maniacTarget = draft.maniacTarget ? Number(draft.maniacTarget) : null;
	const kamikazeTarget = draft.kamikazeTarget ? Number(draft.kamikazeTarget) : null;
	const sheriffTarget = draft.sheriffTarget ? Number(draft.sheriffTarget) : null;
	const bomberTargets = Array.isArray(draft.bomberTargets) ? draft.bomberTargets.map(Number) : [];

	// Determine roles holders
	const roleHolder = (role) => players.find(p => isAlive(p) && p.role === role) || null;
	const hasAliveMafia = countAlive(players, p => isMafiaAligned(p, next)) > 0;

	const protectByLover = new Set();
	const protectByDoctor = new Set();
	const deathIntents = []; // { seat, cause }

	// Process in the given order, but only record intents and protections
	// 1) mafia
	if (hasAliveMafia && mafiaTarget && bySeat.has(mafiaTarget)) {
		const target = bySeat.get(mafiaTarget);
		if (isAlive(target) && !isJailedAtNight(current, target)) {
			deathIntents.push({ seat: mafiaTarget, cause: 'mafia' });
		}
	}

	// 2) jailer -> jail for night and next day
	if (jailerTarget && bySeat.has(jailerTarget)) {
		const target = bySeat.get(jailerTarget);
		if (isAlive(target)) {
			// Hold this night and the next day; release at morning of day+1
			target.jailedUntilDay = nextDayNumber;
			summary.jailed.push(jailerTarget);
		}
	}

	// 3) consigliere
	if (!next.consigliereAttemptUsed && consigTarget && bySeat.has(consigTarget)) {
		const mafiaAlive = countAlive(players, p => isMafiaAligned(p, next));
		const aliveCount = countAlive(players);
		const canUse = aliveCount > 0 && (mafiaAlive / aliveCount) < 0.3;
		next.consigliereAttemptUsed = true; // attempt is consumed regardless of success per spec
		const target = bySeat.get(consigTarget);
		if (canUse && isAlive(target) && !isJailedAtNight(current, target) && target.role === ROLES.CIVILIAN) {
			target.role = ROLES.MAFIA;
			summary.recruited = { seat: consigTarget, success: true };
		} else {
			summary.recruited = { seat: consigTarget || null, success: false };
		}
	}

	// 4) lover protects
	if (loverTarget && bySeat.has(loverTarget)) {
		const target = bySeat.get(loverTarget);
		if (isAlive(target)) {
			protectByLover.add(loverTarget);
			summary.loved.push(loverTarget);
		}
	}

	// 5) doctor protects
	if (doctorTarget && bySeat.has(doctorTarget)) {
		const target = bySeat.get(doctorTarget);
		if (isAlive(target)) {
			protectByDoctor.add(doctorTarget);
			summary.healed.push(doctorTarget);
		}
	}

	// 6) maniac kill intent
	if (maniacTarget && bySeat.has(maniacTarget)) {
		const target = bySeat.get(maniacTarget);
		if (isAlive(target) && !isJailedAtNight(current, target)) {
			// cannot kill werewolf before conversion
			if (!(target.role === ROLES.WEREWOLF && !next.werewolfConverted)) {
				deathIntents.push({ seat: maniacTarget, cause: 'maniac' });
			}
		}
	}

	// 7) kamikaze
	if (kamikazeTarget && bySeat.has(kamikazeTarget)) {
		const kamikaze = roleHolder(ROLES.KAMIKAZE);
		const target = bySeat.get(kamikazeTarget);
		if (kamikaze && isAlive(kamikaze) && isAlive(target)) {
			const targetJailed = isJailedAtNight(current, target);
			if (!targetJailed && isMafiaAligned(target, next)) {
				// both die, protections do not work
				deathIntents.push({ seat: kamikaze.seat, cause: 'kamikaze' });
				deathIntents.push({ seat: kamikazeTarget, cause: 'kamikaze' });
			}
		}
	}

	// 8) sheriff check -> write to history immediately
	if (sheriffTarget && bySeat.has(sheriffTarget)) {
		const target = bySeat.get(sheriffTarget);
		const isMafia = isMafiaAligned(target, next);
		next.history.checks.push({ night: next.nightNumber || 1, targetSeat: sheriffTarget, isMafia });
	}

	// 9) bomber mines
	const bomber = roleHolder(ROLES.BOMBER);
	if (bomber && isAlive(bomber)) {
		const mayMine = [1, 2].includes(next.nightNumber || 1);
		if (mayMine) {
			if (next.bomberMaxMined == null) {
				const cap = Math.floor(living.length * BOMBER_RULES.MAX_MINED_PERCENT_PER_TWO_NIGHTS);
				next.bomberMaxMined = Math.max(0, cap);
			}
			const already = new Set(next.bomberMinedSeats || []);
			for (const s of bomberTargets) {
				if (!bySeat.has(s)) continue;
				if (!isAlive(bySeat.get(s))) continue;
				if (already.has(s)) continue;
				if ((already.size) >= next.bomberMaxMined) break;
				already.add(s);
				summary.mined.push(s);
			}
			next.bomberMinedSeats = Array.from(already);
		}
	}

	// Resolve intents with protections
	const deaths = new Set();
	for (const intent of deathIntents) {
		const seat = intent.seat;
		const player = bySeat.get(seat);
		if (!player || !isAlive(player)) continue;
		if (isJailedAtNight(current, player)) continue; // jailed cannot die at night
		if (intent.cause === 'kamikaze') {
			deaths.add(seat);
			continue;
		}
		// Mafia/maniac can be prevented by lover/doctor
		if (intent.cause === 'mafia' || intent.cause === 'maniac') {
			if (protectByLover.has(seat) || protectByDoctor.has(seat)) continue;
			deaths.add(seat);
		}
	}

	// Check if bomber dies this night
	const bomberDying = bomber && deaths.has(bomber.seat);
	if (bomberDying) {
		for (const s of next.bomberMinedSeats || []) {
			const player = bySeat.get(s);
			if (!player || !isAlive(player)) continue;
			// Ignore protections, but respect jail
			if (isJailedAtNight(current, player)) continue;
			deaths.add(s);
		}
	}

	// Apply deaths
	for (const seat of deaths) {
		const p = bySeat.get(seat);
		if (p && isAlive(p)) {
			p.alive = false;
			summary.deaths.push(seat);
		}
	}

	// After night, check werewolf conversion condition
	const mafiaAliveAfter = countAlive(players, p => isMafiaAligned(p, next));
	const hasWerewolfAlive = countAlive(players, p => p.role === ROLES.WEREWOLF) > 0;
	if (mafiaAliveAfter === 0 && hasWerewolfAlive) {
		next.werewolfShouldConvertNextNight = true;
		summary.werewolfNotice = true;
	}

	// Advance to day
	next.phase = 'day';
	next.dayNumber = nextDayNumber;
	next.history.nights.push({ num: next.nightNumber || 1, draft, summary });

	return { state: next, summary };
}