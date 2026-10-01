jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: {} }));
jest.mock('@/functions/RegisterUserFirebase', () => ({}));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({
	getFinancialLedgerContextFirebase: jest.fn(), getFinancialLedgerAccountsFirebase: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
	collection: jest.fn((_db, name) => ({ name })), getDocs: jest.fn(),
	query: jest.fn((source, ...constraints) => ({ name: source.name, constraints })), where: jest.fn((field, operator, value) => ({ field, operator, value })),
}));
import { getBankMovementsByPeriodFirebase, getBankCurrentBalanceInCentsFirebase, getBankMovementBanksFirebase } from '@/functions/BankFirebase';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';
import { getDocs } from 'firebase/firestore';

const accounts = [
	{ id: 'bank-account', groupId: 'group', kind: 'bank', legacyBankId: 'legacy-bank', name: 'Banco migrado', currentBalanceInCents: 12_000, archivedAt: null },
	{ id: 'new-bank', groupId: 'group', kind: 'bank', name: 'Banco novo', currentBalanceInCents: 5_000, archivedAt: null },
	{ id: 'archived', groupId: 'group', kind: 'bank', name: 'Banco arquivado', currentBalanceInCents: 0, archivedAt: true },
];
const event = (id: string, kind: string, delta: number, extra = {}) => ({ id, data: () => ({ groupId: 'group', kind, effectiveAt: { toDate: () => new Date('2026-09-10T12:00:00-03:00') }, legs: [{ accountId: 'bank-account', deltaInCents: delta }, { accountId: kind === 'transfer' ? 'cash' : null, deltaInCents: -delta }], ...extra }) });
beforeEach(() => {
	jest.clearAllMocks();
	(getFinancialLedgerContextFirebase as jest.Mock).mockResolvedValue({ groupId: 'group', role: 'admin' });
	(getFinancialLedgerAccountsFirebase as jest.Mock).mockResolvedValue(accounts);
});

it('uses active ledger banks and their authoritative balances after cutover', async () => {
	const banks = await getBankMovementBanksFirebase('owner');
	expect(banks.data?.map(bank => bank.id)).toEqual(['legacy-bank', 'new-bank']);
	await expect(getBankCurrentBalanceInCentsFirebase('owner', 'legacy-bank')).resolves.toEqual({ success: true, data: 12_000 });
	await expect(getBankCurrentBalanceInCentsFirebase('owner', 'new-bank')).resolves.toEqual({ success: true, data: 5_000 });
	await expect(getBankCurrentBalanceInCentsFirebase('owner', 'archived')).resolves.toMatchObject({ success: false });
});

it('keeps immutable ledger movements and avoids counting a dedicated adjustment twice', async () => {
	(getDocs as jest.Mock).mockResolvedValue({ docs: [event('income', 'income', 500), event('transfer', 'transfer', -200), event('adjustment', 'reconciliation_adjustment', 2_000, { sourceReferences: [{ collection: 'bankBalanceAdjustments', id: 'adjustment' }] }), event('income-reversal', 'reversal', -500, { reversesTransactionId: 'income' })] });
	const result = await getBankMovementsByPeriodFirebase({ personId: 'owner', bankId: 'legacy-bank', startDate: new Date('2026-09-01T00:00:00-03:00'), endDate: new Date('2026-09-30T23:59:59-03:00') });
	expect(result.success).toBe(true);
	expect(result.data?.gains).toHaveLength(1);
	expect(result.data?.expenses).toHaveLength(2);
	expect(result.data?.expenses[0]).toMatchObject({ id: 'transfer', isLedgerMovement: true, isBankTransfer: true, valueInCents: 200 });
	expect(result.data?.expenses[1]).toMatchObject({ id: 'income-reversal', isLedgerMovement: true, isBankTransfer: false, valueInCents: 500 });
	expect(getDocs).toHaveBeenCalledTimes(1);
});
