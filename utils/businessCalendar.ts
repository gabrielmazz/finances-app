export type BrazilNationalHoliday = {
	id: string;
	name: string;
	date: Date;
	dateKey: string;
};

export type ResolvedMonthlyOccurrence = {
	date: Date;
	dateKey: string;
	requestedDay: number;
	resolvedDay: number;
	usesBusinessDays: boolean;
	holiday: BrazilNationalHoliday | null;
	wasClampedToMonthEnd: boolean;
	wasClampedToBusinessDayCount: boolean;
};

export const MAX_MONTHLY_BUSINESS_DAY = 23;

const createLocalDate = (year: number, monthIndex: number, day: number) =>
	new Date(year, monthIndex, day, 12, 0, 0, 0);

const addDays = (date: Date, amount: number) => {
	const nextDate = createLocalDate(date.getFullYear(), date.getMonth(), date.getDate());
	nextDate.setDate(nextDate.getDate() + amount);
	return nextDate;
};

const formatDateKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};

const normalizeDueDay = (value: number) => {
	const normalized = Math.trunc(value) || 1;
	return Math.max(1, normalized);
};

const getDaysInMonth = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0).getDate();

const getEasterSunday = (year: number) => {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;

	return createLocalDate(year, month - 1, day);
};

const buildHoliday = (id: string, name: string, date: Date): BrazilNationalHoliday => ({
	id,
	name,
	date,
	dateKey: formatDateKey(date),
});

export const getBrazilNationalHolidays = (year: number): BrazilNationalHoliday[] => {
	const easterSunday = getEasterSunday(year);
	const goodFriday = addDays(easterSunday, -2);

	return [
		buildHoliday('confraternizacao-universal', 'Confraternização Universal', createLocalDate(year, 0, 1)),
		buildHoliday('paixao-de-cristo', 'Paixão de Cristo', goodFriday),
		buildHoliday('tiradentes', 'Tiradentes', createLocalDate(year, 3, 21)),
		buildHoliday('dia-do-trabalho', 'Dia do Trabalho', createLocalDate(year, 4, 1)),
		buildHoliday('independencia-do-brasil', 'Independência do Brasil', createLocalDate(year, 8, 7)),
		buildHoliday('nossa-senhora-aparecida', 'Nossa Senhora Aparecida', createLocalDate(year, 9, 12)),
		buildHoliday('finados', 'Finados', createLocalDate(year, 10, 2)),
		buildHoliday('proclamacao-da-republica', 'Proclamação da República', createLocalDate(year, 10, 15)),
		buildHoliday('consciencia-negra', 'Dia Nacional de Zumbi e da Consciência Negra', createLocalDate(year, 10, 20)),
		buildHoliday('natal', 'Natal', createLocalDate(year, 11, 25)),
	];
};

export const getBrazilNationalHolidayMap = (year: number) =>
	Object.fromEntries(getBrazilNationalHolidays(year).map(holiday => [holiday.dateKey, holiday]));

export const getBrazilNationalHolidayByDate = (date: Date) =>
	getBrazilNationalHolidayMap(date.getFullYear())[formatDateKey(date)] ?? null;

export const getBrazilNationalHolidaysForMonth = (referenceDate: Date) =>
	getBrazilNationalHolidays(referenceDate.getFullYear()).filter(
		holiday =>
			holiday.date.getFullYear() === referenceDate.getFullYear() &&
			holiday.date.getMonth() === referenceDate.getMonth(),
	);

export const isWeekend = (date: Date) => {
	const weekday = date.getDay();
	return weekday === 0 || weekday === 6;
};

export const isBusinessDay = (date: Date) => !isWeekend(date) && !getBrazilNationalHolidayByDate(date);

const getBusinessDaysOfMonth = (year: number, monthIndex: number) => {
	const totalDays = getDaysInMonth(year, monthIndex);
	const businessDays: Date[] = [];

	for (let day = 1; day <= totalDays; day += 1) {
		const date = createLocalDate(year, monthIndex, day);
		if (isBusinessDay(date)) {
			businessDays.push(date);
		}
	}

	return businessDays;
};

export const resolveMonthlyOccurrence = ({
	referenceDate = new Date(),
	dueDay,
	usesBusinessDays = false,
}: {
	referenceDate?: Date;
	dueDay: number;
	usesBusinessDays?: boolean;
}): ResolvedMonthlyOccurrence => {
	const year = referenceDate.getFullYear();
	const monthIndex = referenceDate.getMonth();
	const requestedDay = normalizeDueDay(dueDay);

	// Segue [[Despesas Fixas]] e [[Receitas Fixas]]: quando o template usa dia útil,
	// fins de semana e feriados nacionais não contam na resolução do mês.
	if (usesBusinessDays) {
		const normalizedBusinessDay = Math.min(requestedDay, MAX_MONTHLY_BUSINESS_DAY);
		const businessDays = getBusinessDaysOfMonth(year, monthIndex);
		const resolvedIndex = Math.min(normalizedBusinessDay, businessDays.length) - 1;
		const date = businessDays[Math.max(0, resolvedIndex)] ?? createLocalDate(year, monthIndex, 1);

		return {
			date,
			dateKey: formatDateKey(date),
			requestedDay: normalizedBusinessDay,
			resolvedDay: date.getDate(),
			usesBusinessDays: true,
			holiday: null,
			wasClampedToMonthEnd: false,
			wasClampedToBusinessDayCount: normalizedBusinessDay > businessDays.length,
		};
	}

	const daysInMonth = getDaysInMonth(year, monthIndex);
	const resolvedDay = Math.min(requestedDay, daysInMonth);
	const date = createLocalDate(year, monthIndex, resolvedDay);

	return {
		date,
		dateKey: formatDateKey(date),
		requestedDay,
		resolvedDay,
		usesBusinessDays: false,
		holiday: getBrazilNationalHolidayByDate(date),
		wasClampedToMonthEnd: requestedDay > daysInMonth,
		wasClampedToBusinessDayCount: false,
	};
};

export const formatConfiguredMonthlyDueLabel = (dueDay: number, usesBusinessDays = false) => {
	const normalizedDay = normalizeDueDay(dueDay);
	return usesBusinessDays ? `${normalizedDay}º dia útil` : `dia ${String(normalizedDay).padStart(2, '0')}`;
};

export const formatResolvedMonthDayLabel = (date: Date) => `dia ${String(date.getDate()).padStart(2, '0')}`;

export const formatResolvedMonthDateLabel = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
	}).format(date);
