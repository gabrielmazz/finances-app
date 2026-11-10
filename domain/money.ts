export const MAX_ACCOUNT_CENTS = 9_000_000_000_000;

export function validCents(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_ACCOUNT_CENTS;
}

// Decimal text is converted through integers; malformed values are never silently rounded.
export function reaisToCents(input: string): number {
	if (input.length > 64) throw Error('banks/invalid-money');
	const text = input
		.trim()
		.replace(/^(-?)R\$\s*/, '$1')
		.replace(/\u00a0/g, '');
	if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) throw Error('banks/invalid-money');
	const negative = text.startsWith('-');
	const [whole, fraction = ''] = text.replace(/^-/, '').split(',');
	const value = BigInt(whole.replace(/\./g, '')) * 100n + BigInt(fraction.padEnd(2, '0'));
	if (value > BigInt(MAX_ACCOUNT_CENTS)) throw Error('banks/money-limit');
	return Number(negative ? -value : value);
}

export function formatCents(value: number): string {
	if (!Number.isSafeInteger(value)) throw Error('banks/money-limit');
	const digits = BigInt(value < 0 ? -value : value);
	const whole = (digits / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
	return `${value < 0 ? '-' : ''}R$\u00a0${whole},${(digits % 100n).toString().padStart(2, '0')}`;
}

export function sumCents(values: number[]): number {
	const value = values.reduce((sum, amount) => {
		if (!Number.isSafeInteger(amount)) throw Error('banks/invalid-money');
		return sum + BigInt(amount);
	}, 0n);
	if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER))
		throw Error('banks/money-limit');
	return Number(value);
}
