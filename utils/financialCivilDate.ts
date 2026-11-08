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
