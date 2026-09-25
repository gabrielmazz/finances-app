const mockGetDocs = jest.fn();
const mockGetLedgerContext = jest.fn();
const mockGetRelatedUsers = jest.fn();

jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({ getFinancialLedgerContextFirebase: (...args: unknown[]) => mockGetLedgerContext(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: (...args: unknown[]) => mockGetRelatedUsers(...args) }));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => name,
	query: (name: string, ...filters: unknown[]) => ({ name, filters }),
	where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
	orderBy: (field: string, direction: string) => ({ field, direction }),
	Timestamp: { fromDate: (date: Date) => date },
	getDocs: (...args: unknown[]) => mockGetDocs(...args),
}));

import { assistantReportService } from '@/services/lumusAssistant/assistantReportService';

const document = (data: Record<string, unknown>) => ({ data: () => data });
const at = (iso: string) => ({ toDate: () => new Date(iso) });

describe('Lumus targeted financial answers', () => {
	beforeEach(() => {
		mockGetDocs.mockReset();
		mockGetLedgerContext.mockReset().mockResolvedValue(null);
		mockGetRelatedUsers.mockReset().mockResolvedValue({ success: true, data: ['related-user'] });
	});

	it('finds the largest expense across the whole month, not just the six Home movements', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			...Array.from({ length: 8 }, (_, index) => document({ name: `Compra ${index}`, valueInCents: 1000 + index, date: at('2026-09-20T12:00:00.000Z') })),
			document({ name: 'Compra maior', valueInCents: 90000, date: at('2026-09-02T12:00:00.000Z') }),
			document({ name: 'Transferência', valueInCents: 120000, date: at('2026-09-03T12:00:00.000Z'), isBankTransfer: true }),
			document({ name: 'Investimento', valueInCents: 150000, date: at('2026-09-04T12:00:00.000Z'), isInvestmentDeposit: true }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2026-09' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Compra maior: R$ 900,00, em 02/09/2026');
		expect(report.chart).toBeUndefined();
		expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
			{ field: 'personId', operator: 'in', value: ['current-user', 'related-user'] },
			{ field: 'date', operator: '>=', value: new Date('2026-09-01T03:00:00.000Z') },
		]));
	});

	it('uses ledger transactions for a migrated account and ignores transfers', async () => {
		mockGetLedgerContext.mockResolvedValue({ groupId: 'group-1', role: 'member' });
		mockGetDocs.mockResolvedValue({ docs: [
			document({ kind: 'transfer', effectiveAt: at('2026-08-15T12:00:00.000Z'), note: 'Movimento interno', legs: [{ accountId: 'account-1', deltaInCents: -999999 }] }),
			document({ kind: 'expense', effectiveAt: at('2026-08-10T12:00:00.000Z'), note: 'Aluguel', legs: [{ accountId: 'account-1', deltaInCents: -75000 }, { accountId: null, deltaInCents: 75000 }] }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Aluguel: R$ 750,00');
		expect(mockGetRelatedUsers).not.toHaveBeenCalled();
		expect(mockGetDocs.mock.calls[0][0].name).toBe('ledgerTransactions');
		expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
			{ field: 'effectiveAt', operator: '<', value: new Date('2026-09-01T03:00:00.000Z') },
		]));
	});

	it('returns the largest gain from the gain collection', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			document({ name: 'Venda', valueInCents: 12000, date: at('2026-08-05T12:00:00.000Z') }),
			document({ name: 'Rendimento', valueInCents: 30000, date: at('2026-08-09T12:00:00.000Z') }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('Rendimento: R$ 300,00');
		expect(mockGetDocs.mock.calls[0][0].name).toBe('gains');
	});

	it('answers the smallest expense instead of reusing the largest expense', async () => {
		mockGetDocs.mockResolvedValue({ docs: [
			document({ name: 'Conta maior', valueInCents: 90000, date: at('2026-09-20T12:00:00.000Z') }),
			document({ name: 'Compra menor', valueInCents: 750, date: at('2026-09-10T12:00:00.000Z') }),
			document({ name: 'Depósito', valueInCents: 100, date: at('2026-09-11T12:00:00.000Z'), isInvestmentDeposit: true }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'smallest_expense', period: '2026-09' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('menor gasto em setembro de 2026 foi Compra menor: R$ 7,50');
	});

	it('selects the smallest gain from a migrated ledger without counting transfers', async () => {
		mockGetLedgerContext.mockResolvedValue({ groupId: 'group-1', role: 'member' });
		mockGetDocs.mockResolvedValue({ docs: [
			document({ kind: 'income', effectiveAt: at('2026-08-09T12:00:00.000Z'), note: 'Venda maior', legs: [{ accountId: 'account-1', deltaInCents: 50000 }] }),
			document({ kind: 'income', effectiveAt: at('2026-08-10T12:00:00.000Z'), note: 'Venda menor', legs: [{ accountId: 'account-1', deltaInCents: 1200 }] }),
			document({ kind: 'transfer', effectiveAt: at('2026-08-11T12:00:00.000Z'), note: 'Entre contas', legs: [{ accountId: 'account-1', deltaInCents: 100 }] }),
		] });
		const report = await assistantReportService.createReport('current-user', { kind: 'smallest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary.replace(/\u00a0/g, ' ')).toContain('menor ganho em agosto de 2026 foi Venda menor: R$ 12,00');
	});

	it('defaults to the current São Paulo month and excludes future dated records', async () => {
		jest.useFakeTimers().setSystemTime(new Date('2026-09-01T02:30:00.000Z'));
		try {
			mockGetDocs.mockResolvedValue({ docs: [] });
			await assistantReportService.createReport('current-user', { kind: 'largest_expense' }, {});
			expect(mockGetDocs.mock.calls[0][0].filters).toEqual(expect.arrayContaining([
				{ field: 'date', operator: '>=', value: new Date('2026-08-01T03:00:00.000Z') },
				{ field: 'date', operator: '<', value: new Date('2026-09-01T02:30:00.000Z') },
			]));
		} finally {
			jest.useRealTimers();
		}
	});

	it('answers an empty month and rejects a future month without reading transactions', async () => {
		mockGetDocs.mockResolvedValue({ docs: [] });
		const report = await assistantReportService.createReport('current-user', { kind: 'largest_gain', period: '2026-08' }, {});
		expect(report.deterministicSummary).toBe('Não encontrei ganhos registrados em agosto de 2026.');
		await expect(assistantReportService.createReport('current-user', { kind: 'largest_expense', period: '2099-01' }, {}))
			.rejects.toThrow('mês válido');
		expect(mockGetDocs).toHaveBeenCalledTimes(1);
	});
});
