import { formatCents, reaisToCents, sumCents, MAX_ACCOUNT_CENTS } from '../domain/money';
import { openingTimestamp, parseBank, validateCreation, validateMetadata } from '../domain/banks';
import { errorMessage } from '../application/errors';
const metadata = {
	name: 'Conta principal',
	institutionKey: 'nubank',
	institutionName: 'Nubank',
	accountType: 'checking' as const,
	colorHex: null,
};
const scope = { kind: 'personal' as const, id: 'owner', uid: 'owner' };
const timestamp = { toDate: () => new Date('2025-01-01T00:00:00Z') };
describe('bank money and opening domain', () => {
	it.each([
		['100', 10000],
		['1.250,50', 125050],
		['0,01', 1],
		['-0,01', -1],
		['R$ 1.500,00', 150000],
		['90.000.000.000,00', MAX_ACCOUNT_CENTS],
	])('converts %s with exact integer cents', (text, cents) => expect(reaisToCents(text)).toBe(cents));
	it.each(['', 'NaN', '1,001', '1.25', '1.000,000', '1,2,3', 'R$ --1', '1e3', '90000000000,01'])(
		'rejects malformed, fractional or excessive money %s',
		(text) => expect(() => reaisToCents(text)).toThrow(),
	);
	it('formats one cent, negatives and large sums without floating point arithmetic', () => {
		expect(formatCents(1)).toBe('R$\u00a00,01');
		expect(formatCents(-150050)).toBe('-R$\u00a01.500,50');
		expect(formatCents(MAX_ACCOUNT_CENTS)).toBe('R$\u00a090.000.000.000,00');
		expect(sumCents([1, 2, -1, 150000])).toBe(150002);
		expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow();
		expect(() => formatCents(0.1)).toThrow();
	});
	it('validates metadata and removes nonmetadata fields before persistence', () => {
		expect(validateMetadata({ ...metadata, name: ' Conta principal ' })).toEqual(metadata);
		for (const patch of [
			{ name: ' ' },
			{ name: 'x'.repeat(101) },
			{ institutionName: '' },
			{ institutionKey: '../victim' },
			{ accountType: 'admin' },
			{ colorHex: 'red' },
		])
			expect(() => validateMetadata({ ...metadata, ...patch } as any)).toThrow();
	});
	it('validates actual calendar dates and opening debt justification', () => {
		expect(openingTimestamp('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
		for (const date of ['2025-02-29', '2025-13-01', '2099-01-01', '01/01/2025'])
			expect(() => openingTimestamp(date)).toThrow();
		const opening = { ...metadata, initialBalanceCents: 0, openingDate: '2025-01-01', reason: '' };
		expect(validateCreation(opening).initialBalanceCents).toBe(0);
		for (const value of [0.1, NaN, Infinity, MAX_ACCOUNT_CENTS + 1])
			expect(() => validateCreation({ ...opening, initialBalanceCents: value })).toThrow();
		expect(() => validateCreation({ ...opening, initialBalanceCents: -1 })).toThrow('reason');
		expect(
			validateCreation({ ...opening, initialBalanceCents: -1, reason: 'Limite utilizado' })
				.initialBalanceCents,
		).toBe(-1);
	});
	it('reads new model and preserves legacy identity without inventing a balance', () => {
		const fresh = {
			...metadata,
			schemaVersion: 1,
			scopeKind: 'personal',
			scopeId: 'owner',
			initialBalanceCents: 150000,
			openingDate: timestamp,
			createdAt: timestamp,
			updatedAt: timestamp,
			createdBy: 'owner',
			updatedBy: 'owner',
			status: 'active',
			revision: 0,
		};
		expect(parseBank('new', 'new', fresh, scope).balanceInCents).toBe(150000);
		const old = parseBank(
			'original-id',
			'legacy',
			{ name: 'Banco antigo', personId: 'owner', valueInCents: 999999, createdAt: timestamp },
			scope,
		);
		expect(old.id).toBe('original-id');
		expect(old.balanceInCents).toBeNull();
		expect(old.issue).toContain('conciliação');
		expect(() => parseBank('foreign', 'legacy', { name: 'Outro', personId: 'victim' }, scope)).toThrow();
		expect(() => parseBank('missing', 'legacy', { personId: 'owner' }, scope)).toThrow();
		expect(() => parseBank('bad', 'new', { ...fresh, initialBalanceCents: 0.5 }, scope)).toThrow();
	});
	it('distinguishes network, conflict, reconciliation and blocked production errors', () => {
		const texts = [
			'banks/conflict',
			'banks/reconciliation-required',
			'banks/nonzero-archive',
			'banks/not-released',
			'unavailable',
			'permission-denied',
		].map((code) => errorMessage({ code }));
		expect(new Set(texts).size).toBe(texts.length);
	});
});
