/** Interpret the bank statement's civil time in São Paulo, independent of device timezone. */
export function referenceInstant(date: string, time: string): Date {
	if (!date) throw Error('banks/reference-date-required');
	if (!time) throw Error('banks/reference-time-required');
	const day = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
	const clock = /^(\d{2}):(\d{2})$/.exec(time);
	if (!day || !clock) throw Error('banks/invalid-date');
	const [d, m, y, h, min] = [Number(day[1]), Number(day[2]), Number(day[3]), Number(clock[1]), Number(clock[2])];
	const civil = Date.UTC(y, m - 1, d, h, min);
	const check = new Date(civil);
	if (y < 1900 || check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || h > 23 || min > 59)
		throw Error('banks/invalid-date');
	const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
	const matches: number[] = [];
	// Accept the common São Paulo offsets only; reject ambiguous, nonexistent or unsupported historical times.
	for (const hours of [2, 3]) {
		const instant = civil + hours * 60 * 60 * 1000;
		const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
		if (+parts.year === y && +parts.month === m && +parts.day === d && +parts.hour === h && +parts.minute === min) matches.push(instant);
	}
	if (matches.length !== 1) throw Error('banks/reference-time-ambiguous');
	if (matches[0] > Date.now()) throw Error('banks/reference-time-future');
	return new Date(matches[0]);
}
