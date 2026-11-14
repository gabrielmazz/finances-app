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

// Find the first instant of a São Paulo calendar day, including days whose
// midnight was skipped by an historical daylight-saving transition.
export function financialDayStart(day: Date): Date {
  if (!Number.isFinite(day.getTime())) throw Error('movements/invalid-date');
  const target = day.getUTCFullYear() * 10000 + (day.getUTCMonth() + 1) * 100 + day.getUTCDate();
  const dayOf = (instant: number) => {
    const [year, month, date] = parts(new Date(instant));
    return year * 10000 + (month + 1) * 100 + date;
  };
  const approximate = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  let lower = approximate - 86400000, upper = approximate + 86400000;
  while (upper - lower > 1) {
    const middle = Math.floor((lower + upper) / 2);
    if (dayOf(middle) < target) lower = middle;
    else upper = middle;
  }
  if (dayOf(upper) !== target) throw Error('movements/invalid-date');
  return new Date(upper);
}
