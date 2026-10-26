const mockDocuments: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {};
const mockLedger = jest.fn();
const mockAccounts = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {} }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: async () => null }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: async () => ({ success: true, data: [] }) }));
jest.mock('@/functions/BankFirebase', () => ({ getLegacyBankBalancesInCentsFirebase: async () => ({ success: true, data: { bank: 1000 } }) }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({
	getFinancialLedgerContextFirebase: (...args: unknown[]) => mockLedger(...args),
	getFinancialLedgerAccountsFirebase: (...args: unknown[]) => mockAccounts(...args),
	getFinancialLedgerTransactionsFirebase: async () => (mockDocuments.ledgerTransactions ?? []).map(item => ({ id: item.id, ...item.data })),
}));
jest.mock('@/functions/InvestmentCdiRateFirebase', () => ({ getInvestmentCdiRatesByPersonIdsFirebase: async () => ({ success: true, data: [] }) }));
jest.mock('firebase/firestore', () => ({
	collection: (_db: unknown, name: string) => ({ name }), query: (source: unknown) => source,
	where: jest.fn(), Timestamp: { fromDate: (value: Date) => value },
	getDocs: async ({ name }: { name: string }) => ({ docs: (mockDocuments[name] ?? []).map(item => ({ id: item.id, data: () => item.data })) }),
}));
import { getHomeSnapshotFirebase } from '@/functions/HomeFirebase';
const date = new Date('2026-10-10T12:00:00-03:00');
const row = (id: string, data: Record<string, unknown> = {}) => ({ id, data: { personId: 'owner', date, bankId: 'bank', ...data } });
const timeline = async () => {
	const result = await getHomeSnapshotFirebase('owner');
	if (!result.success || !result.data.movements.success) throw new Error('Timeline indisponível');
	return result.data.movements.data.timelineMovements;
};
beforeEach(() => {
	jest.useFakeTimers().setSystemTime(date);
	for (const key of Object.keys(mockDocuments)) delete mockDocuments[key];
	mockDocuments.banks = [row('bank', { name: 'Banco' })];
	mockLedger.mockReset().mockResolvedValue(null);
	mockAccounts.mockReset().mockResolvedValue([]);
});
afterEach(() => { jest.useRealTimers(); });

test('preserva os IDs executáveis e dados de saque, aporte, aplicação inicial e sincronização', async () => {
	mockDocuments.cashRescues = [row('withdrawal', { valueInCents: 1500, bankNameSnapshot: 'Banco' })];
	mockDocuments.expenses = [row('deposit', { valueInCents: 2000, isInvestmentDeposit: true, investmentId: 'investment', investmentNameSnapshot: 'Reserva' })];
	mockDocuments.financeInvestments = [row('investment', { name: 'Reserva', initialValueInCents: 10000, cdiPercentage: 105, redemptionTerm: 'anytime', description: 'Aplicação' })];
	mockDocuments.financeInvestmentSyncs = [row('sync', { investmentId: 'investment', syncedValueInCents: 12300, previousValueInCents: 12000, reason: 'manual' })];
	const items = await timeline();
	expect(items).toEqual(expect.arrayContaining([
		expect.objectContaining({ id: 'withdrawal', isCashRescue: true, isBankTransfer: false, cashRescueSourceBankName: 'Banco' }),
		expect.objectContaining({ id: 'deposit', investmentId: 'investment', isInvestmentDeposit: true }),
		expect.objectContaining({ id: 'investment', isFinanceInvestment: true, investmentId: 'investment', investmentCdiPercentage: 105, investmentRedemptionTerm: 'anytime', explanation: 'Aplicação' }),
		expect.objectContaining({ id: 'sync', investmentId: 'investment', isFinanceInvestmentSync: true, investmentSyncPreviousValueInCents: 12000, valueInCents: 12300 }),
	]));
});

test('inclui ajustes com dono e estado, mantendo categoria e vínculo obrigatório', async () => {
	mockDocuments.bankBalanceAdjustments = [row('adjustment', { differenceInCents: -500, previousBalanceInCents: 1000, targetBalanceInCents: 500, status: 'active', description: 'Conferência' })];
	mockDocuments.expenses = [row('paid', { name: 'Aluguel', valueInCents: 90000, tagId: 'rent', paymentFormats: ['pix'] })];
	mockDocuments.tags = [row('rent', { name: 'Moradia', iconFamily: 'ionicons', iconName: 'home' })];
	mockDocuments.mandatoryExpenses = [row('plan', { lastPaymentExpenseId: 'paid', lastPaymentCycle: '2026-10' })];
	expect(await timeline()).toEqual(expect.arrayContaining([
		expect.objectContaining({ id: 'adjustment', personId: 'owner', isBalanceAdjustment: true, adjustmentStatus: 'active', valueInCents: 500, type: 'expense', adjustmentPreviousBalanceInCents: 1000, adjustmentTargetBalanceInCents: 500 }),
		expect.objectContaining({ id: 'paid', isFromMandatory: true, tagName: 'Moradia', tagIconName: 'home', paymentFormats: ['pix'] }),
	]));
});

test('recorta seis itens após combinar as fontes, sem incluir meses anteriores nem dias futuros', async () => {
	mockDocuments.expenses = Array.from({ length: 8 }, (_, index) => row(`expense-${index}`, { valueInCents: 100, date: new Date(`2026-10-0${index + 1}T12:00:00-03:00`) }));
	mockDocuments.bankBalanceAdjustments = [row('newest', { differenceInCents: 500 }), row('future', { date: new Date('2026-10-11T12:00:00-03:00'), differenceInCents: 1000 }), row('old', { date: new Date('2026-09-30T12:00:00-03:00'), differenceInCents: 1000 })];
	const items = await timeline();
	expect(items.map(item => item.id)).toEqual(['newest', 'expense-7', 'expense-6', 'expense-5', 'expense-4', 'expense-3']);
});

test('histórico do razão conserva estornos e marca os registros como imutáveis', async () => {
	mockLedger.mockResolvedValue({ groupId: 'group' });
	mockAccounts.mockResolvedValue([{ id: 'bank', kind: 'bank', name: 'Banco', currentBalanceInCents: 1000 }]);
	const event = (id: string, kind: string, deltaInCents: number, extra = {}) => row(id, { kind, groupId: 'group', actorId: 'owner', effectiveAt: date, legs: [{ accountId: 'bank', deltaInCents }, { accountId: null, deltaInCents: -deltaInCents }], ...extra });
	mockDocuments.ledgerTransactions = [event('original', 'income', 1000), event('reversal', 'reversal', -1000, { reversesTransactionId: 'original' }), event('reference', 'reconciliation_adjustment', 500)];
	expect(await timeline()).toEqual(expect.arrayContaining([
		expect.objectContaining({ id: 'original', isLedgerMovement: true, type: 'gain' }),
		expect.objectContaining({ id: 'reversal', isLedgerMovement: true, type: 'expense' }),
		expect.objectContaining({ id: 'reference', isLedgerMovement: true, isBalanceAdjustment: true }),
	]));
});
