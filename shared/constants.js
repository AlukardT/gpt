export const NIGHT_ORDER = [
	"mafia",
	"jailer",
	"consigliere",
	"lover",
	"doctor",
	"maniac",
	"kamikaze",
	"sheriff",
	"bomber"
];

export const ALIGNMENTS = {
	CIVIL: "civil",
	MAFIA: "mafia",
	NEUTRAL: "neutral",
	WEREWOLF: "werewolf"
};

export const GAME_PHASES = {
	SETUP: "setup",
	NIGHT: "night",
	DAY: "day",
	ENDED: "ended"
};

export const JAIL_RULES = {
	// Ночь N и день N+1 под решёткой, освобождение утром N+2
	NIGHT_AND_NEXT_DAY: true
};

export const BOMBER_RULES = {
	NIGHT_MINABLE: [1, 2],
	MAX_MINED_PERCENT_PER_TWO_NIGHTS: 0.25
};

export const DEFAULT_TIMERS = {
	speechSeconds: 120,
	voteSeconds: 120
};

export const MAX_SEATS = 20;

export const SESSION_AUTOSAVE_INTERVAL_MS = 2500;