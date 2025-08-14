export const ROLES = {
	CIVILIAN: "civilian",
	MAFIA: "mafia",
	DON: "don",
	JAILER: "jailer",
	CONSIGLIERE: "consigliere",
	LOVER: "lover",
	DOCTOR: "doctor",
	MANIAC: "maniac",
	KAMIKAZE: "kamikaze",
	SHERIFF: "sheriff",
	BOMBER: "bomber",
	WEREWOLF: "werewolf"
};

export const ROLE_TO_ALIGNMENT = {
	[ROLES.CIVILIAN]: "civil",
	[ROLES.MAFIA]: "mafia",
	[ROLES.DON]: "mafia",
	[ROLES.CONSIGLIERE]: "mafia",
	[ROLES.WEREWOLF]: "werewolf",
	[ROLES.JAILER]: "civil",
	[ROLES.LOVER]: "civil",
	[ROLES.DOCTOR]: "civil",
	[ROLES.MANIAC]: "neutral",
	[ROLES.KAMIKAZE]: "neutral",
	[ROLES.SHERIFF]: "civil",
	[ROLES.BOMBER]: "neutral"
};

export const ROLE_DESCRIPTIONS = {
	[ROLES.MAFIA]: "Команда мафии, общий ночной килл.",
	[ROLES.DON]: "Лидер мафии, отдельного хода нет.",
	[ROLES.CONSIGLIERE]: "1 попытка вербовки мирного при мафии <30% живых.",
	[ROLES.JAILER]: "Сажает в тюрьму на ночь и следующий день.",
	[ROLES.LOVER]: "Защищает цель от мафии/маньяка/оборотня.",
	[ROLES.DOCTOR]: "Лечит цель от смертей ночью, вкл. самолечение.",
	[ROLES.MANIAC]: "Убивает цель ночью.",
	[ROLES.KAMIKAZE]: "Пытается взорвать мафию ценой своей жизни.",
	[ROLES.SHERIFF]: "Проверяет мафия/не мафия. Результат сразу в историю.",
	[ROLES.BOMBER]: "Минирует в ночи 1–2 до 25% живых. Взрыв при смерти.",
	[ROLES.WEREWOLF]: "Пассивно: обращается к мафии, если мафии не осталось."
};