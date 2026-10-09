// Real Firestore/Auth Emulator evidence. Only storage selection and local notification adapters are replaced.
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { getAuth, connectAuthEmulator, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, collection, query, where, doc, getDoc, getDocs, setDoc, deleteDoc, type Firestore } from 'firebase/firestore';
import type { AssistantActionKind, AssistantDraftAction, AssistantResolvedCatalog } from '@/types/lumusAssistant';
let mockDb: Firestore;
let mockAuth: Auth;
jest.mock('@/FirebaseConfig', () => ({ get db() { return mockDb; }, get auth() { return mockAuth; }, get firebaseFunctions() { return jest.requireActual<typeof import('firebase/functions')>('firebase/functions').getFunctions(mockAuth.app, 'southamerica-east1'); } }));
jest.mock('@/functions/FinancialLedgerFirebase', () => ({
	getFinancialLedgerContextFirebase: async () => null, getFinancialLedgerAccountsFirebase: async () => [],
	manageFinancialMetadataFirebase: async (input: Record<string, unknown>) => {
		const sdk = jest.requireActual<typeof import('firebase/functions')>('firebase/functions');
		return (await sdk.httpsCallable(sdk.getFunctions(mockAuth.app, 'southamerica-east1'), 'manageFinancialMetadata')(input)).data;
	},
}));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({ scheduleMandatoryExpenseNotification: async () => undefined, cancelMandatoryExpenseNotification: async () => undefined, suppressMandatoryExpenseNotificationCycle: async () => undefined }));
jest.mock('@/utils/mandatoryGainNotifications', () => ({ scheduleMandatoryGainNotification: async () => undefined, cancelMandatoryGainNotification: async () => undefined, suppressMandatoryGainNotificationCycle: async () => undefined }));
import { deleteTagFirebase } from '@/functions/TagFirebase';
import { addCashRescueFirebase, transferBetweenBanksFirebase } from '@/functions/BankFirebase';
import { addFinanceInvestmentFirebase, moveFinanceInvestmentFirebase, updateFinanceInvestmentFirebase, revertFinanceInvestmentRedemptionFirebase, revertFinanceInvestmentDepositFirebase } from '@/functions/FinancesFirebase';
import { prepareAssistantActions } from '@/services/lumusAssistant/assistantCatalogService';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import { executeLegacyFinancialMovementFirebase } from '@/functions/LegacyFinancialMovementFirebase';
import { createAssistantAuthorizationSession } from '@/services/lumusAssistant/assistantAuthorization';

const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
const functionsEmulatorHost = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? '';
const enabled = [firestoreEmulatorHost, authEmulatorHost, functionsEmulatorHost].every(host => /^127\.0\.0\.1:\d+$/.test(host));
const suite = enabled ? describe : describe.skip;
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-lumus-financas';
const [firestoreHost, firestorePort] = firestoreEmulatorHost.split(':');
const [functionsHost, functionsPort] = functionsEmulatorHost.split(':');
const runId = Date.now().toString(36);
let actor: string;
let app: ReturnType<typeof initializeApp>;
const execute = (draft: AssistantDraftAction, catalog: AssistantResolvedCatalog) => {
	const session = createAssistantAuthorizationSession(actor); session.recordUserMessage('user-confirmation', 'Sim');
	return financeCommandService.execute(actor, { ...draft, status: 'confirming' }, catalog, session.authorize(draft, 'user-confirmation', 'confirmation')!);
};
async function fixture(prefix: string): Promise<AssistantResolvedCatalog> {
	const date = new Date('2026-10-01T15:00:00Z');
	const source = async (name: string, handle: string, data: Record<string, unknown>) => {
		const id = prefix + '-' + handle; const persisted = { personId: actor, ...data };
		await setDoc(doc(mockDb, name, id), persisted);
		return { collection: name, realId: id, handle, label: String(data.name ?? handle), data: persisted };
	};
	const bankId = prefix + '-b1'; const investmentId = prefix + '-i1';
	const banks = [await source('banks', 'b1', { name: 'Banco 1', isActive: true }), await source('banks', 'b2', { name: 'Banco 2', isActive: true })];
	await source('monthlyBalances', 'opening', { bankId, year: 2026, month: 10, valueInCents: 100_000 });
	const categories = [await source('tags', 'c1', { name: 'Categoria', usageType: 'both', isMandatoryExpense: true, isMandatoryGain: true })];
	const expenses = [await source('expenses', 'e1', { name: 'Despesa', valueInCents: 500, bankId, date })];
	const gains = [await source('gains', 'g1', { name: 'Receita', valueInCents: 500, bankId, date })];
	const investments = [await source('financeInvestments', 'i1', { name: 'CDB', bankId, currentValueInCents: 1_000, initialValueInCents: 1_000, date })];
	const mandatoryExpenses = [await source('mandatoryExpenses', 'me1', { name: 'Internet', valueInCents: 300, dueDay: 10 })];
	const mandatoryGains = [await source('mandatoryGains', 'mg1', { name: 'Salário', valueInCents: 300, dueDay: 10 })];
	const cashWithdrawals = [await source('cashRescues', 'w1', { name: 'Saque', bankId, valueInCents: 200, date })];
	const investmentDeposits = [await source('expenses', 'id1', { name: 'Aporte', investmentId, bankId, date, valueInCents: 200, isInvestmentDeposit: true })];
	const investmentRedemptions = [await source('gains', 'ir1', { name: 'Resgate', investmentId, bankId, date, valueInCents: 200, isInvestmentRedemption: true })];
	const investmentSyncs = [await source('financeInvestmentSyncs', 'is1', { name: 'Sincronização', investmentId, previousValueInCents: 900, syncedValueInCents: 1_000, deltaInCents: 100, date })];
	return { banks, categories, expenseCategories: categories, gainCategories: categories, mandatoryExpenseCategories: categories, mandatoryGainCategories: categories, expenses, gains, investments, mandatoryExpenses, mandatoryGains, cashWithdrawals, investmentDeposits, investmentRedemptions, investmentSyncs };
}
const commonMovement = { name: 'Registro novo', valueInCents: 700, date: '2026-10-02', bankRef: 'b1', categoryRef: 'c1' };
const recurring = { name: 'Recorrência nova', valueInCents: 700, dueDay: 10, categoryRef: 'c1' };
const legacyCases: Array<[AssistantActionKind, Record<string, unknown>, string, Record<string, unknown> | null]> = [
	['create_expense', commonMovement, 'expenses/', { name: 'Registro novo', valueInCents: 700 }],
	['create_gain', commonMovement, 'gains/', { name: 'Registro novo', valueInCents: 700 }],
	['update_expense', { recordRef: 'e1', valueInCents: 800 }, 'expenses/e1', { valueInCents: 800 }],
	['update_gain', { recordRef: 'g1', valueInCents: 800 }, 'gains/g1', { valueInCents: 800 }],
	['delete_expense', { recordRef: 'e1' }, 'expenses/e1', null],
	['delete_gain', { recordRef: 'g1' }, 'gains/g1', null],
	['upsert_monthly_balance', { bankRef: 'b1', cycle: '2026-10', valueInCents: 9_000 }, 'monthlyBalances/', { valueInCents: 9_000, month: 10 }],
	['create_transfer', { sourceBankRef: 'b1', targetBankRef: 'b2', valueInCents: 700, date: '2026-10-02' }, 'bankTransfers/', { sourceBankId: 'b1', targetBankId: 'b2', valueInCents: 700 }],
	['create_cash_withdrawal', { bankRef: 'b1', valueInCents: 700, date: '2026-10-02' }, 'cashRescues/', { bankId: 'b1', valueInCents: 700 }],
	['undo_cash_withdrawal', { recordRef: 'w1' }, 'cashRescues/w1', null],
	['create_mandatory_expense', recurring, 'mandatoryExpenses/', { name: 'Recorrência nova', valueInCents: 700 }],
	['create_mandatory_gain', recurring, 'mandatoryGains/', { name: 'Recorrência nova', valueInCents: 700 }],
	['update_mandatory_expense', { recordRef: 'me1', valueInCents: 800 }, 'mandatoryExpenses/me1', { valueInCents: 800 }],
	['update_mandatory_gain', { recordRef: 'mg1', valueInCents: 800 }, 'mandatoryGains/mg1', { valueInCents: 800 }],
	['delete_mandatory_expense', { recordRef: 'me1' }, 'mandatoryExpenses/me1', null],
	['delete_mandatory_gain', { recordRef: 'mg1' }, 'mandatoryGains/mg1', null],
	['pay_mandatory_expense', { recordRef: 'me1', bankRef: 'b1', date: '2026-10-02' }, 'mandatoryExpenses/me1', { lastPaymentCycle: '2026-10' }],
	['receive_mandatory_gain', { recordRef: 'mg1', bankRef: 'b1', date: '2026-10-02' }, 'mandatoryGains/mg1', { lastReceiptCycle: '2026-10' }],
	['create_investment', { name: 'Investimento novo', initialValueInCents: 700, cdiPercentageInBasisPoints: 10_000, redemptionTerm: 'anytime', bankRef: 'b1', date: '2026-10-02' }, 'financeInvestments/', { name: 'Investimento novo', initialValueInCents: 700 }],
	['update_investment', { recordRef: 'i1', cdiPercentageInBasisPoints: 11_000 }, 'financeInvestments/i1', { cdiPercentageInBasisPoints: 11_000 }],
	['delete_investment', { recordRef: 'i1' }, 'financeInvestments/i1', null],
	['deposit_investment', { investmentRef: 'i1', valueInCents: 200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['redeem_investment', { investmentRef: 'i1', valueInCents: 200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 800 }],
	['sync_investment', { investmentRef: 'i1', syncedValueInCents: 1_200, date: '2026-10-02' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['undo_investment_deposit', { recordRef: 'id1' }, 'financeInvestments/i1', { currentValueInCents: 800 }],
	['undo_investment_redemption', { recordRef: 'ir1' }, 'financeInvestments/i1', { currentValueInCents: 1_200 }],
	['undo_investment_sync', { recordRef: 'is1' }, 'financeInvestments/i1', { currentValueInCents: 900 }],
	['upsert_cdi_rate', { annualRateInBasisPoints: 1_400, effectiveFrom: '2026-10-02' }, 'investmentCdiRates/', { annualRateInBasisPoints: 1_400 }],
	['create_bank', { bankName: 'Banco novo', initialBalanceInCents: 9_000, initialBalanceCycle: '2026-10' }, 'banks/', { name: 'Banco novo' }],
	['update_bank', { recordRef: 'b1', isActive: false }, 'banks/b1', { isActive: false }],
	['delete_bank', { recordRef: 'b1' }, 'banks/b1', null],
	['create_category', { categoryName: 'Categoria nova', usageType: 'both', iconLabel: 'Café' }, 'tags/', { name: 'Categoria nova', iconFamily: 'ionicons', iconName: 'cafe-outline' }],
	['update_category', { recordRef: 'c1', categoryName: 'Categoria atualizada', iconLabel: 'Mercado' }, 'tags/c1', { name: 'Categoria atualizada', iconFamily: 'material-community', iconName: 'shopping-outline' }],
	['delete_category', { recordRef: 'c1' }, 'tags/c1', null],
];
suite('Legacy finance executor with real Emulator persistence', () => {
	beforeAll(async () => {
		app = initializeApp({ apiKey: 'test-only-key', projectId }, 'assistant-legacy-' + runId);
		mockAuth = getAuth(app); connectAuthEmulator(mockAuth, `http://${authEmulatorHost}`, { disableWarnings: true });
		actor = (await signInAnonymously(mockAuth)).user.uid;
		connectFunctionsEmulator(getFunctions(app, 'southamerica-east1'), functionsHost, Number(functionsPort));
		mockDb = getFirestore(app); connectFirestoreEmulator(mockDb, firestoreHost, Number(firestorePort));
		const response = await fetch(`http://${firestoreEmulatorHost}/v1/projects/${projectId}/databases/(default)/documents/users/${actor}`, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { relatedIdUsers: { arrayValue: { values: [] } } } }) });
		if (!response.ok) throw new Error('Could not seed the synthetic Emulator user.');
	});
	afterAll(async () => { await deleteApp(app); });
	it.each(legacyCases)('%s commits its actual domain records and reconciles a response-loss retry', async (kind, payload, target, expected) => {
		const prefix = runId + '-' + kind; const catalog = await fixture(prefix);
		if (kind === 'delete_investment') { await deleteDoc(doc(mockDb, 'expenses', prefix + '-id1')); await deleteDoc(doc(mockDb, 'gains', prefix + '-ir1')); }
		const draft = (await prepareAssistantActions(actor, [{ kind, payload }], catalog)).actions[0]!;
		const outcome = await execute(draft, catalog);
		if (!outcome.success) throw new Error(kind + ': ' + JSON.stringify(outcome));
		expect(outcome.success).toBe(true);
		const [name, handle] = target.split('/');
		const read = async () => {
			if (handle) return (await getDoc(doc(mockDb, name!, prefix + '-' + handle))).data();
			const records = await getDocs(query(collection(mockDb, name!), where('personId', '==', actor)));
			return records.docs.map(item => item.data()).filter(data => data.assistantActionId === draft.clientActionId || kind === 'upsert_monthly_balance' && data.bankId === prefix + '-b1' && data.month === 10 || kind === 'upsert_cdi_rate' && data.annualRateInBasisPoints === 1_400);
		};
		const persisted = await read();
		if (expected === null) expect(persisted).toBeUndefined();
		else if (handle) expect(persisted).toMatchObject(expected);
		else expect(persisted).toEqual(expect.arrayContaining([expect.objectContaining({ ...expected, ...(kind === 'create_transfer' ? { sourceBankId: prefix + '-b1', targetBankId: prefix + '-b2' } : kind === 'create_cash_withdrawal' ? { bankId: prefix + '-b1' } : {}) })]));
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: true });
		expect(await read()).toEqual(persisted);
	}, 20_000);
	it('manual form services share the same real atomic legacy movement executor', async () => {
		const prefix = runId + '-form'; await fixture(prefix); const date = new Date('2026-10-02T15:00:00Z');
		await expect(transferBetweenBanksFirebase({ personId: actor, sourceBankId: prefix + '-b1', targetBankId: prefix + '-b2', valueInCents: 100, date })).resolves.toMatchObject({ success: true });
		await expect(addCashRescueFirebase({ personId: actor, bankId: prefix + '-b1', bankNameSnapshot: 'Banco 1', valueInCents: 100, date })).resolves.toMatchObject({ success: true });
		const created = await addFinanceInvestmentFirebase({ personId: actor, bankId: prefix + '-b1', name: 'Abertura por formulário', initialValueInCents: 1_000, cdiPercentage: 100, redemptionTerm: 'anytime', date });
		expect(created.success).toBe(true); expect(created.investmentId).toEqual(expect.any(String));
		const deposit = await moveFinanceInvestmentFirebase({ investmentId: created.investmentId!, valueInCents: 200, date, type: 'deposit', expectedCurrentValueInCents: 1_000 });
		if (!deposit.success) throw new Error(JSON.stringify(deposit));
		expect(deposit.success).toBe(true);
		await expect(moveFinanceInvestmentFirebase({ investmentId: created.investmentId!, valueInCents: 100, date, type: 'redemption', expectedCurrentValueInCents: 1_200 })).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, 'financeInvestments', created.investmentId!))).data()?.currentValueInCents).toBe(1_100);
		await expect(moveFinanceInvestmentFirebase({ investmentId: created.investmentId!, valueInCents: 100, date, type: 'redemption', expectedCurrentValueInCents: 1_200 })).resolves.toMatchObject({ success: false });
	}, 20_000);
	it('category deletion from the existing form uses the authoritative reference guard', async () => {
		const prefix = runId + '-category-form'; await fixture(prefix);
		await setDoc(doc(mockDb, 'expenses', prefix + '-e1'), { tagId: prefix + '-c1' }, { merge: true });
		await expect(deleteTagFirebase(prefix + '-c1')).resolves.toMatchObject({ success: false });
		expect((await getDoc(doc(mockDb, 'tags', prefix + '-c1'))).exists()).toBe(true);
		await deleteDoc(doc(mockDb, 'expenses', prefix + '-e1'));
		await expect(deleteTagFirebase(prefix + '-c1')).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, 'tags', prefix + '-c1'))).exists()).toBe(false);
	}, 20_000);
	it('principal correction shares the bank transaction with competing withdrawals', async () => {
		const prefix = runId + '-principal-race'; const catalog = await fixture(prefix);
		const drafts = (await prepareAssistantActions(actor, [{ kind: 'update_investment', payload: { recordRef: 'i1', initialValueInCents: 60_000 } }, { kind: 'create_cash_withdrawal', payload: { bankRef: 'b1', valueInCents: 60_000, date: '2026-10-03' } }], catalog)).actions;
		const outcomes = await Promise.all(drafts.map(draft => execute(draft, catalog)));
		expect(outcomes.filter(outcome => outcome.success)).toHaveLength(1);
		expect(outcomes.filter(outcome => !outcome.success)).toHaveLength(1);
		const current = (await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()!;
		const withdrawals = await getDocs(query(collection(mockDb, 'cashRescues'), where('personId', '==', actor), where('assistantActionId', '==', drafts[1]!.clientActionId)));
		expect(100_000 - current.initialValueInCents - 200 - withdrawals.docs.reduce((sum, item) => sum + item.data().valueInCents, 0)).toBeGreaterThanOrEqual(0);
		await expect(execute(drafts[outcomes.findIndex(outcome => outcome.success)]!, catalog)).resolves.toMatchObject({ success: true });
	}, 20_000);
	it('reducing an initial principal can repair an existing negative legacy balance without adding a debit', async () => {
		const prefix = runId + '-principal-reduce'; await fixture(prefix);
		await setDoc(doc(mockDb, 'monthlyBalances', prefix + '-opening'), { valueInCents: 500 }, { merge: true });
		await expect(updateFinanceInvestmentFirebase({ investmentId: prefix + '-i1', initialValueInCents: 900 })).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()).toMatchObject({ initialValueInCents: 900, currentValueInCents: 900 });
		await expect(updateFinanceInvestmentFirebase({ investmentId: prefix + '-i1', initialValueInCents: 1000 })).resolves.toMatchObject({ success: false });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.initialValueInCents).toBe(900);
	}, 20_000);
	it('bank reassignment validates the complete destination balance and preserves the original on refusal', async () => {
		const prefix = runId + '-principal-bank'; await fixture(prefix);
		await setDoc(doc(mockDb, 'monthlyBalances', prefix + '-target-opening'), { personId: actor, bankId: prefix + '-b2', year: 2026, month: 10, valueInCents: 500 });
		await expect(updateFinanceInvestmentFirebase({ investmentId: prefix + '-i1', bankId: prefix + '-b2' })).resolves.toMatchObject({ success: false });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.bankId).toBe(prefix + '-b1');
		await setDoc(doc(mockDb, 'monthlyBalances', prefix + '-target-opening'), { valueInCents: 2_000 }, { merge: true });
		await expect(updateFinanceInvestmentFirebase({ investmentId: prefix + '-i1', bankId: prefix + '-b2', initialValueInCents: 1_500 })).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()).toMatchObject({ bankId: prefix + '-b2', initialValueInCents: 1_500, initialInvestedInCents: 1_500, currentValueInCents: 1_500 });
	}, 20_000);
	it('redemption reversal refuses already-spent proceeds and reconciles the later persisted retry', async () => {
		const prefix = runId + '-undo-spent'; const catalog = await fixture(prefix);
		await setDoc(doc(mockDb, 'monthlyBalances', prefix + '-opening'), { valueInCents: 1_000 }, { merge: true });
		await setDoc(doc(mockDb, 'gains', prefix + '-spent-income'), { personId: actor, bankId: prefix + '-b1', date: new Date('2026-10-02T15:00:00Z'), valueInCents: 100 });
		const draft = (await prepareAssistantActions(actor, [{ kind: 'undo_investment_redemption', payload: { recordRef: 'ir1' } }], catalog)).actions[0]!;
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: 'insufficient-bank-balance' });
		expect((await getDoc(doc(mockDb, 'gains', prefix + '-ir1'))).exists()).toBe(true);
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(1_000);
		await expect(revertFinanceInvestmentRedemptionFirebase(prefix + '-ir1')).resolves.toMatchObject({ success: false });
		await setDoc(doc(mockDb, 'gains', prefix + '-restored-income'), { personId: actor, bankId: prefix + '-b1', date: new Date('2026-10-02T15:00:00Z'), valueInCents: 500 });
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: true });
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, 'gains', prefix + '-ir1'))).exists()).toBe(false);
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(1_200);
	}, 20_000);
	it('deposit reversal refuses a redeemed principal and preserves every cent and linked record', async () => {
		const prefix = runId + '-undo-used-deposit'; const catalog = await fixture(prefix);
		await setDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'), { currentValueInCents: 100 }, { merge: true });
		const draft = (await prepareAssistantActions(actor, [{ kind: 'undo_investment_deposit', payload: { recordRef: 'id1' } }], catalog)).actions[0]!;
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: 'insufficient-investment-balance' });
		await expect(revertFinanceInvestmentDepositFirebase(prefix + '-id1')).resolves.toMatchObject({ success: false });
		expect((await getDoc(doc(mockDb, 'expenses', prefix + '-id1'))).data()?.valueInCents).toBe(200);
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(100);
		expect((await getDoc(doc(mockDb, 'banks', prefix + '-b1'))).data()?.financialMovementRevision).toBeUndefined();
	}, 20_000);
	it('redemption reversal and a withdrawal serialize against the same bank proceeds', async () => {
		const prefix = runId + '-undo-race'; const catalog = await fixture(prefix);
		await setDoc(doc(mockDb, 'monthlyBalances', prefix + '-opening'), { valueInCents: 1_500 }, { merge: true });
		const drafts = (await prepareAssistantActions(actor, [{ kind: 'undo_investment_redemption', payload: { recordRef: 'ir1' } }, { kind: 'create_cash_withdrawal', payload: { bankRef: 'b1', valueInCents: 400, date: '2026-10-03' } }], catalog)).actions;
		const outcomes = await Promise.all(drafts.map(draft => execute(draft, catalog)));
		expect(outcomes.filter(outcome => outcome.success)).toHaveLength(1);
		expect(outcomes.filter(outcome => !outcome.success)).toHaveLength(1);
		const gainExists = (await getDoc(doc(mockDb, 'gains', prefix + '-ir1'))).exists();
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(gainExists ? 1_000 : 1_200);
	}, 20_000);
	it.each(['update_investment', 'undo_investment_redemption', 'undo_investment_deposit'] as const)('%s reconciles concurrent retry before stale targets', async kind => {
		const prefix = runId + '-retry-' + kind; const catalog = await fixture(prefix);
		const payload = kind === 'update_investment' ? { recordRef: 'i1', initialValueInCents: 1_500 } : { recordRef: kind === 'undo_investment_deposit' ? 'id1' : 'ir1' };
		const draft = (await prepareAssistantActions(actor, [{ kind, payload }], catalog)).actions[0]!;
		const outcomes = await Promise.all([execute(draft, catalog), execute(draft, catalog)]);
		expect(outcomes).toEqual([expect.objectContaining({ success: true }), expect.objectContaining({ success: true })]);
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(kind === 'update_investment' ? 1_500 : kind === 'undo_investment_deposit' ? 800 : 1_200);
		const receipts = await getDocs(query(collection(mockDb, 'assistantOperationReceipts'), where('personId', '==', actor), where('clientActionId', '==', draft.clientActionId)));
		expect(receipts.size).toBe(1);
	}, 20_000);
	it.each(['update_investment', 'undo_investment_redemption', 'undo_investment_deposit'] as const)('%s refuses stale investment versions without touching the bank', async kind => {
		const prefix = runId + '-guard-' + kind; await fixture(prefix); const before = (await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()!;
		const command = kind === 'update_investment' ? { kind, investmentId: prefix + '-i1', expectedFingerprint: 'stale', fields: { initialValueInCents: 2000 } } : { kind, movementId: prefix + (kind === 'undo_investment_deposit' ? '-id1' : '-ir1'), expectedMovementFingerprint: createAssistantRecordFingerprint((await getDoc(doc(mockDb, kind === 'undo_investment_deposit' ? 'expenses' : 'gains', prefix + (kind === 'undo_investment_deposit' ? '-id1' : '-ir1')))).data()!), expectedInvestmentFingerprint: 'stale' };
		await expect(executeLegacyFinancialMovementFirebase({ ...command, expectedActorId: actor, date: new Date('2026-10-03T15:00:00Z') })).rejects.toMatchObject({ code: 'functions/failed-precondition', details: { reason: 'stale-record' } });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()).toEqual(before);
		expect((await getDoc(doc(mockDb, 'banks', prefix + '-b1'))).data()?.financialMovementRevision).toBeUndefined();
	}, 20_000);
	it.each(['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment'] as const)('%s serializes competing real requests against the confirmed balance', async kind => {
		const prefix = runId + '-competing-' + kind; const catalog = await fixture(prefix);
		const payload = { ...legacyCases.find(entry => entry[0] === kind)![1], ...(kind === 'create_investment' ? { initialValueInCents: 60_000 } : { valueInCents: kind === 'redeem_investment' ? 700 : 60_000 }) };
		const drafts = (await prepareAssistantActions(actor, [{ kind, payload }, { kind, payload }], catalog)).actions;
		const outcomes = await Promise.all(drafts.map(draft => execute(draft, catalog)));
		expect(outcomes.filter(result => result.success)).toHaveLength(1);
		expect(outcomes.filter(result => !result.success)).toHaveLength(1);
		const name = kind === 'create_transfer' ? 'bankTransfers' : kind === 'create_cash_withdrawal' ? 'cashRescues' : kind === 'create_investment' ? 'financeInvestments' : kind === 'deposit_investment' ? 'expenses' : 'gains';
		const records = await getDocs(query(collection(mockDb, name), where('personId', '==', actor), where('assistantActionId', 'in', drafts.map(draft => draft.clientActionId))));
		expect(records.size).toBe(1);
		if (kind === 'deposit_investment' || kind === 'redeem_investment') expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(kind === 'deposit_investment' ? 61_000 : 300);
	}, 20_000);
	it.each(['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment'] as const)('%s reconciles simultaneous resubmission of the same real request', async kind => {
		const prefix = runId + '-duplicate-' + kind; const catalog = await fixture(prefix);
		const draft = (await prepareAssistantActions(actor, [{ kind, payload: legacyCases.find(entry => entry[0] === kind)![1] }], catalog)).actions[0]!;
		const outcomes = await Promise.all([execute(draft, catalog), execute(draft, catalog)]);
		expect(outcomes.every(result => result.success)).toBe(true);
		const name = kind === 'create_transfer' ? 'bankTransfers' : kind === 'create_cash_withdrawal' ? 'cashRescues' : kind === 'create_investment' ? 'financeInvestments' : kind === 'deposit_investment' ? 'expenses' : 'gains';
		const records = await getDocs(query(collection(mockDb, name), where('personId', '==', actor), where('assistantActionId', '==', draft.clientActionId)));
		expect(records.size).toBe(1);
	}, 20_000);
	it.each(['create_transfer', 'create_cash_withdrawal', 'create_investment', 'deposit_investment', 'redeem_investment'] as const)('%s revalidates the active bank at commit', async kind => {
		const prefix = runId + '-inactive-' + kind; const catalog = await fixture(prefix);
		const payload = legacyCases.find(entry => entry[0] === kind)![1];
		const draft = (await prepareAssistantActions(actor, [{ kind, payload }], catalog)).actions[0]!;
		await setDoc(doc(mockDb, 'banks', prefix + '-b1'), { isActive: false }, { merge: true });
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: 'inactive-account' });
		expect((await getDoc(doc(mockDb, 'financeInvestments', prefix + '-i1'))).data()?.currentValueInCents).toBe(1_000);
	}, 20_000);
	it.each(['inactive-bank', 'missing-category', 'wrong-category-use'] as const)('rejects a stale %s reference before a real legacy commit', async reason => {
		const prefix = runId + '-stale-' + reason; const catalog = await fixture(prefix);
		const draft = (await prepareAssistantActions(actor, [{ kind: 'create_expense', payload: commonMovement }], catalog)).actions[0]!;
		if (reason === 'inactive-bank') await setDoc(doc(mockDb, 'banks', prefix + '-b1'), { isActive: false }, { merge: true });
		else if (reason === 'missing-category') await deleteDoc(doc(mockDb, 'tags', prefix + '-c1'));
		else await setDoc(doc(mockDb, 'tags', prefix + '-c1'), { usageType: 'gain' }, { merge: true });
		await expect(execute(draft, catalog)).resolves.toMatchObject({ success: false, errorCode: reason === 'inactive-bank' ? 'inactive-account' : reason === 'missing-category' ? 'not-found' : 'invalid-reference' });
		const records = await getDocs(query(collection(mockDb, 'expenses'), where('personId', '==', actor), where('assistantActionId', '==', draft.clientActionId)));
		expect(records.empty).toBe(true);
	}, 20_000);
	it.each(['expense', 'gain'] as const)('settles and reverses a real legacy %s cycle without repeating the successful write', async type => {
		const prefix = runId + '-undo-' + type; const catalog = await fixture(prefix); const source = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
		const item = catalog[source]![0]!;
		const settlement = (await prepareAssistantActions(actor, [{ kind: type === 'expense' ? 'pay_mandatory_expense' : 'receive_mandatory_gain', payload: { recordRef: item.handle, bankRef: 'b1', date: '2026-10-02' } }], catalog)).actions[0]!;
		await expect(execute(settlement, catalog)).resolves.toMatchObject({ success: true });
		catalog[source]![0] = { ...item, data: (await getDoc(doc(mockDb, source, item.realId!))).data()! };
		const undo = (await prepareAssistantActions(actor, [{ kind: type === 'expense' ? 'undo_mandatory_expense_payment' : 'undo_mandatory_gain_receipt', payload: { recordRef: item.handle } }], catalog)).actions[0]!;
		await expect(execute(undo, catalog)).resolves.toMatchObject({ success: true });
		await expect(execute(undo, catalog)).resolves.toMatchObject({ success: true });
		expect((await getDoc(doc(mockDb, source, item.realId!))).data()?.[type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle']).toBeNull();
	}, 20_000);
});
