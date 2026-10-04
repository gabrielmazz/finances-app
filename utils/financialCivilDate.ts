const formatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
	hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

const parts = (date: Date) => {
	const values = formatter.formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) => Number(values.find(part => part.type === type)?.value);
	return [value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second')] as const;
};

/** Calendar adapter for pure calculators whose Date getters use the device timezone. */
export const toFinancialCivilDate = (instant: Date): Date => {
	const [year, month, day, hour, minute, second] = parts(instant);
	return new Date(year, month, day, hour, minute, second, instant.getMilliseconds());
};

/** Convert calculator civil boundaries back to real São Paulo query instants. */
export const fromFinancialCivilDate = (date: Date): Date => {
	const target = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
	let instant = new Date(target);
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const [year, month, day, hour, minute, second] = parts(instant);
		const difference = target - Date.UTC(year, month, day, hour, minute, second, instant.getMilliseconds());
		if (!difference) return instant;
		instant = new Date(instant.getTime() + difference);
	}
	throw new Error('Data civil financeira inválida em São Paulo.');
};

/** Financial records dated today are included for the entire São Paulo civil day. */
export const endOfFinancialCivilDay = (instant: Date): Date => {
	const civil = toFinancialCivilDate(instant);
	return fromFinancialCivilDate(new Date(civil.getFullYear(), civil.getMonth(), civil.getDate(), 23, 59, 59, 999));
};
