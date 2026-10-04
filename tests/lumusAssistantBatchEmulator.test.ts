// Opt-in: RUN_ASSISTANT_BATCH_EMULATOR=1. Model interpretation and device notifications are seams;
// catalog, schemas, grants, storage dispatch, executors, Firebase SDK and callables are real.
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, deleteUser, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, terminate, where, type Firestore } from 'firebase/firestore';
import type { AssistantActionKind, AssistantAiConversationResponse, AssistantDraftAction, AssistantModelActionProposal, AssistantResolvedCatalog, FinanceCommandService } from '@/types/lumusAssistant';

let mockDb: Firestore;
let mockAuth: Auth;
let mockFunctions: Functions;
const mockCalls = { getDoc: 0, getDocs: 0, transactions: 0, transactionReads: 0, transactionWrites: 0, callables: 0 };
let mockActiveCallables = 0;
let mockPeakCallables = 0;
jest.mock('firebase/firestore', () => {
	const actual = jest.requireActual('firebase/firestore');
	return { ...actual,
		getDoc: (...args: unknown[]) => { mockCalls.getDoc++; return actual.getDoc(...args); },
		getDocs: (...args: unknown[]) => { mockCalls.getDocs++; return actual.getDocs(...args); },
		runTransaction: (db: unknown, callback: (transaction: unknown) => unknown, ...args: unknown[]) => actual.runTransaction(db, (transaction: any) => {
			mockCalls.transactions++;
			return callback(new Proxy(transaction, { get(target, property) {
				if (property === 'get') return (...values: unknown[]) => { mockCalls.transactionReads++; return target.get(...values); };
				if (['set', 'update', 'delete'].includes(String(property))) return (...values: unknown[]) => { mockCalls.transactionWrites++; return target[property](...values); };
				const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
			} }));
		}, ...args),
	};
});
jest.mock('firebase/functions', () => {
	const actual = jest.requireActual('firebase/functions');
	return { ...actual, httpsCallable: (...args: unknown[]) => { const callable = actual.httpsCallable(...args); return async (...values: unknown[]) => {
		mockCalls.callables++; mockActiveCallables++; mockPeakCallables = Math.max(mockPeakCallables, mockActiveCallables);
		try { return await callable(...values); } finally { mockActiveCallables--; }
	}; } };
});
jest.mock('@/FirebaseConfig', () => ({ get db() { return mockDb; }, get auth() { return mockAuth; }, get firebaseFunctions() {
	// Ledger wrappers capture Functions at module initialization; the stable context delegates to the current real SDK app.
	return new Proxy({}, { get(_target, property) { const value = (mockFunctions as any)[property]; return typeof value === 'function' ? value.bind(mockFunctions) : value; } });
} }));
jest.mock('@/utils/mandatoryExpenseNotifications', () => ({ scheduleMandatoryExpenseNotification: async () => undefined, cancelMandatoryExpenseNotification: async () => undefined, suppressMandatoryExpenseNotificationCycle: async () => undefined }));
jest.mock('@/utils/mandatoryGainNotifications', () => ({ scheduleMandatoryGainNotification: async () => undefined, cancelMandatoryGainNotification: async () => undefined, suppressMandatoryGainNotificationCycle: async () => undefined }));

import { createAssistantConversation } from '@/services/lumusAssistant/assistantConversationService';
import { financeCommandService } from '@/services/lumusAssistant/financeCommandService';
import { getHomeBalancesFirebase } from '@/functions/HomeFirebase';
import { createAssistantAuthorizationSession, validateAssistantExecutionAuthorization } from '@/services/lumusAssistant/assistantAuthorization';
import { formatCycleKey, formatIsoDate, parseIsoDateAtLocalNoon } from '@/utils/lumusAssistant';

const project = 'demo-lumus-financas';
const baseUrl = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const resourcePrefix = `projects/${project}/databases/(default)/documents/`;
const COUNT = 211;
type Row = { id: string; data: Record<string, any> };
type Seed = { path: string; data: Record<string, unknown> };
type Family = 'expense' | 'gain' | 'recurring_expense' | 'recurring_gain' | 'bank' | 'category' | 'opening' | 'adjustment' | 'transfer' | 'cash' | 'investment' | 'cdi' | 'ledger_correction';
const families: Family[] = ['expense', 'gain', 'recurring_expense', 'recurring_gain', 'bank', 'category', 'opening', 'adjustment', 'transfer', 'cash', 'investment', 'cdi', 'ledger_correction'];
const selectedFamilies = process.env.ASSISTANT_BATCH_EMULATOR_FAMILIES?.split(',');
const selected = families.filter(family => !selectedFamilies || selectedFamilies.includes(family));
const suite = process.env.RUN_ASSISTANT_BATCH_EMULATOR === '1' ? describe : describe.skip;
let app: FirebaseApp;
let uid: string;
let prefix: string;
let date: string;
let cycle: string;
let bankId: string;
let tagId: string;
let groupId: string | undefined;
const seededPaths = new Set<string>();

const encode = (value: unknown): Record<string, any> => {
	if (value === null) return { nullValue: 'NULL_VALUE' };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (typeof value === 'string') return { stringValue: value };
	if (typeof value === 'boolean') return { booleanValue: value };
	if (typeof value === 'number' && Number.isSafeInteger(value)) return { integerValue: String(value) };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
	if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)])) } };
	throw new Error('Invalid isolated demo fixture.');
};
const decode = (value: Record<string, any>): any => {
	if ('stringValue' in value) return value.stringValue;
	if ('integerValue' in value) return Number(value.integerValue);
	if ('booleanValue' in value) return value.booleanValue;
	if ('timestampValue' in value) return value.timestampValue;
	if ('nullValue' in value) return null;
	if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
	return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, item]) => [key, decode(item as Record<string, any>)]));
};
async function commitSeeds(seeds: Seed[]) {
	for (let offset = 0; offset < seeds.length; offset += 400) {
		const chunk = seeds.slice(offset, offset + 400);
		const response = await fetch(baseUrl + ':commit', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: chunk.map(seed => ({ update: { name: resourcePrefix + seed.path, fields: encode(seed.data).mapValue.fields } })) }) });
		if (!response.ok) throw new Error(`Isolated demo seed failed: ${response.status}.`);
		chunk.forEach(seed => seededPaths.add(seed.path));
	}
}
async function readRows(name: string, field = 'personId', scope = uid): Promise<Row[]> {
	const result = await getDocs(query(collection(mockDb, name), where(field, '==', scope)));
	return result.docs.map(document => ({ id: document.id, data: document.data() })).sort((a, b) => a.id.localeCompare(b.id));
}
// Admin REST is restricted to the demo endpoint and fixture scope; receipt collections are backend-only.
async function readPrivateRows(name: string, field: string, scope: string): Promise<Array<Row & { path: string }>> {
	const response = await fetch(baseUrl + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: name }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: scope } } } } }) });
	if (!response.ok) throw new Error(`Isolated demo inspection failed: ${response.status}.`);
	return (await response.json() as Array<{ document?: { name: string; fields: Record<string, any> } }>).flatMap(item => item.document ? [{ id: item.document.name.split('/').at(-1)!, path: item.document.name.slice(resourcePrefix.length), data: decode({ mapValue: { fields: item.document.fields } }) }] : []);
}

async function seedFamily(family: Family) {
	const [year, month] = cycle.split('-').map(Number);
	const civilDate = parseIsoDateAtLocalNoon(date)!;
	const seeds: Seed[] = [
		{ path: `users/${uid}`, data: { name: 'Isolated batch fixture', relatedIdUsers: [] } },
		{ path: `banks/${bankId}`, data: { personId: uid, name: 'Banco principal', isActive: true } },
		{ path: `monthlyBalances/${prefix}-opening`, data: { personId: uid, bankId, year, month, valueInCents: 100_000_000 } },
		{ path: `tags/${tagId}`, data: { personId: uid, name: 'Categoria principal', usageType: 'both', isMandatoryExpense: true, isMandatoryGain: true } },
	];
	for (let index = 0; index < COUNT; index++) {
		const id = `${prefix}-item-${String(index).padStart(3, '0')}`;
		const common = { personId: uid, name: `${prefix} item ${index}`, date: civilDate };
		if (family === 'expense' || family === 'gain') seeds.push({ path: `${family === 'expense' ? 'expenses' : 'gains'}/${id}`, data: { ...common, bankId, tagId, valueInCents: 100 } });
		if (family === 'recurring_expense' || family === 'recurring_gain') seeds.push({ path: `${family === 'recurring_expense' ? 'mandatoryExpenses' : 'mandatoryGains'}/${id}`, data: { ...common, categoryId: tagId, tagId, valueInCents: 100, dueDay: 1, installmentTotal: 3, installmentsCompleted: 0, installmentStartDate: `${cycle}-01`, installmentEndDate: `${year + 1}-12-31`, completedCycles: {} } });
		if (['bank', 'opening', 'adjustment', 'transfer', 'cash'].includes(family)) {
			seeds.push({ path: `banks/${id}`, data: { ...common, isActive: true } });
			seeds.push({ path: `monthlyBalances/${id}-opening`, data: { personId: uid, bankId: id, year, month, valueInCents: 100_000 } });
		}
		if (family === 'category') seeds.push({ path: `tags/${id}`, data: { ...common, usageType: 'both' } });
		if (family === 'investment') seeds.push({ path: `financeInvestments/${id}`, data: { ...common, bankId, currentValueInCents: 1_000, initialValueInCents: 1_000, initialInvestedInCents: 1_000, cdiPercentageInBasisPoints: 10_000, redemptionTerm: 'anytime', assetType: 'fixed_income', valuationMethod: 'cdi' } });
	}
	if (family === 'ledger_correction') {
		groupId = prefix + '-group';
		seeds[0] = { path: `users/${uid}`, data: { name: 'Isolated migrated member', relatedIdUsers: [], financialGroupId: groupId, financialGroupRole: 'member' } };
		seeds.push({ path: `financialGroups/${groupId}`, data: { status: 'active', members: { [uid]: 'member', [`${uid}-foreign`]: 'member' } } },
			{ path: `financialAccounts/${bankId}`, data: { groupId, personId: uid, kind: 'bank', name: 'Banco principal', isActive: true, archivedAt: null, currentBalanceInCents: 78_800 } });
		for (let index = 0; index <= COUNT; index++) seeds.push({ path: `ledgerTransactions/${prefix}-original-${index}`, data: { groupId, actorId: index === COUNT ? `${uid}-foreign` : uid, clientActionId: `${prefix}-seed-${index}`, kind: 'expense', categoryId: tagId, note: `${prefix} item ${index}`, effectiveAt: civilDate, legs: [{ accountId: bankId, deltaInCents: -100 }, { accountId: null, deltaInCents: 100 }] } });
	}
	await commitSeeds(seeds);
}

function measuredConversation(kind: AssistantActionKind, payload: Record<string, unknown>, queryText = prefix, propose?: (catalog: AssistantResolvedCatalog) => AssistantModelActionProposal[], executionBoundary?: FinanceCommandService['execute']) {
	const durations: number[] = [];
	const attempts: string[] = [];
	let modelInterpretations = 0;
	let invalidations = 0;
	const finance: FinanceCommandService = { ...financeCommandService, execute: async (actor, draft, catalog, grant) => {
		expect(validateAssistantExecutionAuthorization(actor, draft, grant)).toBe(true);
		attempts.push(draft.clientActionId);
		const started = performance.now();
		try { return await (executionBoundary ?? financeCommandService.execute)(actor, draft, catalog, grant); }
		finally { durations.push(performance.now() - started); }
	} };
	const conversation = createAssistantConversation({ uid, finance, onChange: () => {}, onCommit: async () => { invalidations++; }, report: async () => '', interpret: async (_text, state): Promise<AssistantAiConversationResponse> => {
		modelInterpretations++;
		const bank = state.catalog.banks?.find(item => item.realId === bankId)!;
		if (propose) return { text: '', actions: propose(state.catalog), reportRequests: [], toolCallCount: 1 };
		return { text: '', actions: [], reportRequests: [], toolCallCount: 1, batchRequests: [{ kind, query: queryText, payload: { ...payload, ...(payload.bankRef === 'principal' ? { bankRef: bank.handle } : {}), ...(payload.targetBankRef === 'principal' ? { targetBankRef: bank.handle } : {}) } }] };
	} });
	return { conversation, attempts, durations, interpretations: () => modelInterpretations, invalidations: () => invalidations };
}

async function runSelection(kind: AssistantActionKind, payload: Record<string, unknown>, family: string, queryText = prefix) {
	const harness = measuredConversation(kind, payload, queryText);
	mockPeakCallables = 0;
	const before = { ...mockCalls };
	const started = performance.now();
	await harness.conversation.send('Altere todos os itens do conjunto sintético conforme o pedido');
	expect(harness.attempts).toHaveLength(0);
	expect(harness.conversation.snapshot().drafts).toHaveLength(COUNT);
	expect(harness.conversation.snapshot().drafts.every(item => item.status === 'ready')).toBe(true);
	await harness.conversation.send('confirmo');
	const elapsed = performance.now() - started;
	const failures = harness.conversation.snapshot().drafts.filter(item => item.status !== 'succeeded');
	if (failures.length) throw new Error(`${family}: ${failures.length} failures; ${JSON.stringify(failures.slice(0, 3).map(item => ({ kind: item.kind, status: item.status, error: item.error })))}`);
	expect(harness.attempts).toHaveLength(COUNT);
	expect(new Set(harness.attempts).size).toBe(COUNT);
	expect(harness.invalidations()).toBe(1);
	if (kind === 'upsert_balance_adjustment') expect(mockPeakCallables).toBeLessThanOrEqual(8);
	else expect(mockPeakCallables).toBeLessThanOrEqual(1);
	const messages = harness.conversation.snapshot().messages.flatMap(item => 'text' in item ? [item.text] : []);
	expect(messages.filter(text => text.includes('Posso registrar este conjunto?'))).toHaveLength(1);
	expect(messages).toContain('210 de 211 concluídas.');
	expect(messages).toContain('211 de 211 concluídas.');
	await harness.conversation.send('sim');
	expect(harness.attempts).toHaveLength(COUNT);
	const sorted = [...harness.durations].sort((a, b) => a - b);
	const measurement = { family, kind, items: COUNT, batchMs: Number(elapsed.toFixed(2)), itemSamples: sorted.length, itemP50Ms: Number(sorted[105]!.toFixed(2)), itemP95Ms: Number(sorted[200]!.toFixed(2)), sdk: Object.fromEntries(Object.entries(mockCalls).map(([key, value]) => [key, value - before[key as keyof typeof before]])), interpreterSeamCalls: harness.interpretations(), networkModelCalls: 0, executionConcurrency: 1, peakCallableConcurrency: mockPeakCallables };
	console.info('LUMUS_BATCH_REAL_METRICS ' + JSON.stringify(measurement));
	return { ...harness, measurement };
}

async function runCdiChunks() {
	let next = 0;
	const dateAt = (index: number) => formatIsoDate(new Date(Date.UTC(2026, 0, 1 + index, 15)));
	const harness = measuredConversation('upsert_cdi_rate', {}, prefix, () => {
		const start = next; next = Math.min(COUNT, next + 20);
		return Array.from({ length: next - start }, (_, offset) => ({ kind: 'upsert_cdi_rate', payload: { annualRateInBasisPoints: 1400 + start + offset, effectiveFrom: dateAt(start + offset) } }));
	});
	const before = { ...mockCalls };
	const started = performance.now();
	for (let offset = 0; offset < COUNT; offset += 20) {
		const entries = Array.from({ length: Math.min(20, COUNT - offset) }, (_, index) => `${dateAt(offset + index)}: ${(1400 + offset + index) / 100}%`).join('; ');
		await harness.conversation.send('Salve as taxas CDI destes períodos: ' + entries);
		expect(harness.attempts).toHaveLength(0);
	}
	expect(harness.conversation.snapshot().drafts).toHaveLength(211);
	await harness.conversation.send('retome');
	await harness.conversation.send('confirmo');
	const elapsed = performance.now() - started;
	const failed = harness.conversation.snapshot().drafts.filter(draft => draft.status !== 'succeeded');
	if (failed.length) throw new Error('CDI batch failed: ' + JSON.stringify(failed.slice(0, 3).map(draft => draft.error)));
	expect(harness.attempts).toHaveLength(211);
	expect(new Set(harness.attempts).size).toBe(211);
	expect(harness.invalidations()).toBe(1);
	const progress = harness.conversation.snapshot().messages.flatMap(item => 'text' in item ? [item.text] : []);
	expect(progress).toContain('210 de 211 concluídas.');
	expect(progress).toContain('211 de 211 concluídas.');
	await harness.conversation.send('sim'); expect(harness.attempts).toHaveLength(211);
	const sorted = [...harness.durations].sort((a, b) => a - b);
	console.info('LUMUS_BATCH_REAL_METRICS ' + JSON.stringify({ family: 'cdi', kind: 'upsert_cdi_rate', items: 211, inputParts: 11, proposalsPerPart: 20, acceptedConfirmations: 1, batchMs: Number(elapsed.toFixed(2)), itemSamples: 211, itemP50Ms: Number(sorted[105]!.toFixed(2)), itemP95Ms: Number(sorted[200]!.toFixed(2)), sdk: Object.fromEntries(Object.entries(mockCalls).map(([key, value]) => [key, value - before[key as keyof typeof before]])), interpreterSeamCalls: harness.interpretations(), networkModelCalls: 0, concurrency: 1 }));
	return harness;
}

async function assertReceipts(harness: ReturnType<typeof measuredConversation>, adjustment = false) {
	const drafts = harness.conversation.snapshot().drafts;
	if (adjustment) {
		const receipts = await readPrivateRows('bankBalanceAdjustmentOperations', 'personId', uid);
		for (const draft of drafts) expect(receipts.some(row => row.id === `${uid}_${draft.clientActionId}`)).toBe(true);
	} else if (groupId) {
		const receipts = await getDocs(collection(mockDb, 'financialGroups', groupId, 'operations'));
		for (const draft of drafts) expect(receipts.docs.some(row => row.id === draft.clientActionId && row.data().actorId === uid)).toBe(true);
	} else {
		const receipts = await readRows('assistantOperationReceipts');
		for (const draft of drafts) expect(receipts.filter(row => row.data.clientActionId === draft.clientActionId)).toHaveLength(1);
	}
	const session = createAssistantAuthorizationSession(uid);
	session.recordUserMessage('repeat-confirmation', 'confirmo');
	for (const index of [0, 105, 210]) {
		const draft = { ...drafts[index]!, status: 'ready' as const };
		await expect(financeCommandService.execute(uid, draft, harness.conversation.snapshot().catalog, session.authorize(draft, 'repeat-confirmation', 'confirmation')!)).resolves.toMatchObject({ success: true });
	}
	session.dispose();
}

async function assertBalances(mainBank: number, targetBanks?: number, cash?: number) {
	const result = await getHomeBalancesFirebase(uid);
	if (!result.success) throw result.error;
	expect(result.data.bankBalances.find(item => item.id === bankId)?.balanceInCents).toBe(mainBank);
	if (targetBanks !== undefined) {
		const targets = result.data.bankBalances.filter(item => item.id.includes('-item-'));
		expect(targets).toHaveLength(211); expect(targets.every(item => item.balanceInCents === targetBanks)).toBe(true);
	}
	if (cash !== undefined) expect(result.data.cashSummary?.balanceInCents).toBe(cash);
}

suite('financial batches with real local demo persistence', () => {
	beforeEach(async () => {
		uid = ''; groupId = undefined; seededPaths.clear();
		app = initializeApp({ projectId: project, apiKey: 'test-key' }, 'batch-proof-' + Date.now() + '-' + Math.random());
		mockAuth = getAuth(app); connectAuthEmulator(mockAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
		uid = (await signInAnonymously(mockAuth)).user.uid;
		mockDb = getFirestore(app); connectFirestoreEmulator(mockDb, '127.0.0.1', 8080);
		mockFunctions = getFunctions(app, 'southamerica-east1'); connectFunctionsEmulator(mockFunctions, '127.0.0.1', 5001);
		prefix = uid + '-batch'; bankId = prefix + '-bank'; tagId = prefix + '-tag';
		date = formatIsoDate(new Date()); cycle = formatCycleKey(new Date()); groupId = undefined; seededPaths.clear();
	}, 30000);
	afterEach(async () => {
		try {
		if (!uid) return;
		const ownedCollections = ['banks', 'tags', 'expenses', 'gains', 'monthlyBalances', 'mandatoryExpenses', 'mandatoryGains', 'cashRescues', 'bankTransfers', 'financeInvestments', 'financeInvestmentSyncs', 'investmentCdiRates', 'bankBalanceAdjustments', 'bankBalanceAdjustmentOperations', 'assistantOperationReceipts'];
		for (const name of ownedCollections) for (const row of await readPrivateRows(name, 'personId', uid)) seededPaths.add(row.path);
		for (const row of await readPrivateRows('financialAuditEvents', 'actorId', uid)) seededPaths.add(row.path);
		if (groupId) {
			for (const name of ['financialAccounts', 'ledgerTransactions', 'accountReconciliations', 'financeMonthlySummaries', 'financialAuditEvents']) for (const row of await readPrivateRows(name, 'groupId', groupId)) seededPaths.add(row.path);
			const operations = await getDocs(collection(mockDb, 'financialGroups', groupId, 'operations')); operations.docs.forEach(row => seededPaths.add(row.ref.path));
		}
		const paths = [...seededPaths];
		for (let offset = 0; offset < paths.length; offset += 400) {
			const response = await fetch(baseUrl + ':commit', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: paths.slice(offset, offset + 400).map(path => ({ delete: resourcePrefix + path })) }) });
			if (!response.ok) throw new Error('Isolated batch cleanup failed.');
		}
		} finally {
			if (mockAuth.currentUser) await deleteUser(mockAuth.currentUser).catch(() => undefined);
			if (uid) await terminate(mockDb);
			await deleteApp(app);
		}
	}, 60000);

	(selected.length ? it : it.skip).each(selected.length ? selected : families.slice(0, 1))('%s preserves all 211 selected records, effects and operation identities', async family => {
		await seedFamily(family);
		if (family === 'expense' || family === 'gain' || family === 'ledger_correction') {
			const harness = await runSelection(family === 'gain' ? 'update_gain' : 'update_expense', { valueInCents: 200 }, family);
			if (groupId) {
				const events = await readRows('ledgerTransactions', 'groupId', groupId);
				expect(events.filter(row => row.data.kind === 'reversal')).toHaveLength(211);
				expect(events.filter(row => row.data.kind === 'expense' && row.data.legs.some((leg: { deltaInCents: number }) => leg.deltaInCents === -200))).toHaveLength(211);
				expect((await getDoc(doc(mockDb, 'financialAccounts', bankId))).data()?.currentBalanceInCents).toBe(57_700);
				expect(harness.conversation.snapshot().messages.some(item => 'text' in item && item.text.includes('1 sem permissão'))).toBe(true);
				await assertBalances(57_700);
			} else {
				const rows = await readRows(family === 'gain' ? 'gains' : 'expenses');
				expect(rows).toHaveLength(211); expect(rows.every(row => row.data.valueInCents === 200)).toBe(true);
				await assertBalances(family === 'gain' ? 100_042_200 : 99_957_800, undefined, 0);
			}
			await assertReceipts(harness); harness.conversation.dispose();
			return;
		}
		if (family === 'recurring_expense' || family === 'recurring_gain') {
			const expense = family === 'recurring_expense';
			const source = expense ? 'mandatoryExpenses' : 'mandatoryGains';
			const movements = expense ? 'expenses' : 'gains';
			const settled = await runSelection(expense ? 'pay_mandatory_expense' : 'receive_mandatory_gain', { bankRef: 'principal', date, installmentsToAdvance: 2 }, family + '_settle');
			let templates = await readRows(source);
			expect(templates).toHaveLength(211);
			expect(templates.every(row => row.data.installmentsCompleted === 2 && row.data[expense ? 'lastPaymentCycle' : 'lastReceiptCycle'] === cycle && Object.hasOwn(row.data.completedCycles, cycle))).toBe(true);
			const paid = await readRows(movements);
			expect(paid).toHaveLength(211); expect(paid.every(row => row.data.valueInCents === 200)).toBe(true);
			await assertBalances(expense ? 99_957_800 : 100_042_200, undefined, 0);
			await assertReceipts(settled);
			expect(await readRows(movements)).toEqual(paid);
			settled.conversation.dispose();
			const undone = await runSelection(expense ? 'undo_mandatory_expense_payment' : 'undo_mandatory_gain_receipt', {}, family + '_undo');
			templates = await readRows(source);
			expect(templates.every(row => row.data.installmentsCompleted === 0 && row.data[expense ? 'lastPaymentCycle' : 'lastReceiptCycle'] === null && !Object.hasOwn(row.data.completedCycles, cycle))).toBe(true);
			expect(await readRows(movements)).toHaveLength(0);
			await assertBalances(100_000_000, undefined, 0);
			await assertReceipts(undone);
			expect(await readRows(movements)).toHaveLength(0);
			undone.conversation.dispose();
			return;
		}
		if (family === 'bank' || family === 'category' || family === 'opening') {
			const kind = family === 'bank' ? 'update_bank' : family === 'category' ? 'update_category' : 'upsert_monthly_balance';
			const payload = family === 'bank' ? { colorHex: '#123456' } : family === 'category' ? { iconLabel: 'Café' } : { cycle, valueInCents: 120_000 };
			const harness = await runSelection(kind, payload, family);
			const name = family === 'bank' ? 'banks' : family === 'category' ? 'tags' : 'monthlyBalances';
			const rows = (await readRows(name)).filter(row => row.id.includes('-item-'));
			expect(rows).toHaveLength(211);
			expect(rows.every(row => family === 'bank' ? row.data.colorHex === '#123456' : family === 'category' ? row.data.iconFamily === 'ionicons' && row.data.iconName === 'cafe-outline' : row.data.valueInCents === 120_000)).toBe(true);
			await assertBalances(100_000_000, family === 'opening' ? 120_000 : family === 'bank' ? 100_000 : undefined, 0);
			await assertReceipts(harness);
			expect((await readRows(name)).filter(row => row.id.includes('-item-'))).toEqual(rows);
			harness.conversation.dispose();
			return;
		}
		if (family === 'adjustment') {
			const saved = await runSelection('upsert_balance_adjustment', { date, targetBalanceInCents: 120_000, description: prefix + ' ajuste' }, 'adjustment_save');
			const rows = await readRows('bankBalanceAdjustments');
			expect(rows).toHaveLength(211);
			expect(new Set(rows.map(row => row.data.bankId)).size).toBe(211);
			expect(rows.every(row => row.data.previousBalanceInCents === 100_000 && row.data.targetBalanceInCents === 120_000 && row.data.differenceInCents === 20_000 && row.data.status === 'active')).toBe(true);
			await assertBalances(100_000_000, 120_000, 0);
			await assertReceipts(saved, true); expect(await readRows('bankBalanceAdjustments')).toEqual(rows); saved.conversation.dispose();
			const reverted = await runSelection('revert_balance_adjustment', {}, 'adjustment_revert');
			const history = await readRows('bankBalanceAdjustments');
			expect(history).toHaveLength(422);
			expect(history.filter(row => row.data.status === 'reversed')).toHaveLength(211);
			expect(history.filter(row => row.data.reversesAdjustmentId && row.data.differenceInCents === -20_000)).toHaveLength(211);
			await assertBalances(100_000_000, 100_000, 0);
			await assertReceipts(reverted, true); expect(await readRows('bankBalanceAdjustments')).toEqual(history); reverted.conversation.dispose();
			return;
		}
		if (family === 'transfer' || family === 'cash') {
			const harness = await runSelection(family === 'transfer' ? 'create_transfer' : 'create_cash_withdrawal', { valueInCents: 100, date, ...(family === 'transfer' ? { targetBankRef: 'principal' } : {}) }, family);
			const rows = await readRows(family === 'transfer' ? 'bankTransfers' : 'cashRescues');
			expect(rows).toHaveLength(211);
			expect(rows.every(row => row.data.valueInCents === 100)).toBe(true);
			expect(new Set(rows.map(row => row.data.assistantActionId))).toEqual(new Set(harness.attempts));
			if (family === 'transfer') {
				expect(new Set(rows.map(row => row.data.sourceBankId)).size).toBe(211);
				const expenses = await readRows('expenses'); const gains = await readRows('gains');
				expect(expenses).toHaveLength(211); expect(gains).toHaveLength(211);
				for (const transfer of rows) {
					expect(expenses.filter(row => row.id === transfer.data.expenseId && row.data.bankTransferPairId === transfer.id && row.data.valueInCents === 100)).toHaveLength(1);
					expect(gains.filter(row => row.id === transfer.data.gainId && row.data.bankTransferPairId === transfer.id && row.data.valueInCents === 100)).toHaveLength(1);
				}
			} else expect(new Set(rows.map(row => row.data.bankId)).size).toBe(211);
			await assertBalances(family === 'transfer' ? 100_021_100 : 100_000_000, 99_900, family === 'cash' ? 21_100 : 0);
			await assertReceipts(harness);
			expect(await readRows(family === 'transfer' ? 'bankTransfers' : 'cashRescues')).toEqual(rows);
			harness.conversation.dispose();
			if (family === 'cash') {
				const undone = await runSelection('undo_cash_withdrawal', {}, 'cash_undo', 'Saque');
				expect(await readRows('cashRescues')).toHaveLength(0); await assertBalances(100_000_000, 100_000, 0); await assertReceipts(undone); expect(await readRows('cashRescues')).toHaveLength(0); undone.conversation.dispose();
			}
			return;
		}
		if (family === 'investment') {
			for (const phase of ['deposit', 'redeem', 'sync', 'undo_sync'] as const) {
				const kind = phase === 'deposit' ? 'deposit_investment' : phase === 'redeem' ? 'redeem_investment' : phase === 'sync' ? 'sync_investment' : 'undo_investment_sync';
				const payload = phase === 'undo_sync' ? {} : phase === 'sync' ? { syncedValueInCents: 1500, date } : { valueInCents: 100, date };
				const harness = await runSelection(kind, payload, 'investment_' + phase);
				const values = await readRows('financeInvestments');
				expect(values).toHaveLength(211);
				const expected = phase === 'deposit' ? 1100 : phase === 'sync' ? 1500 : 1000;
				expect(values.every(row => row.data.currentValueInCents === expected)).toBe(true);
				await assertBalances(phase === 'deposit' ? 99_767_900 : 99_789_000, undefined, 0);
				if (phase === 'deposit' || phase === 'redeem') {
					const movements = await readRows(phase === 'deposit' ? 'expenses' : 'gains');
					expect(movements).toHaveLength(211); expect(movements.every(row => row.data.valueInCents === 100 && row.data[phase === 'deposit' ? 'isInvestmentDeposit' : 'isInvestmentRedemption'] === true)).toBe(true);
				}
				if (phase === 'sync') expect(await readRows('financeInvestmentSyncs')).toHaveLength(211);
				if (phase === 'undo_sync') expect(await readRows('financeInvestmentSyncs')).toHaveLength(0);
				await assertReceipts(harness); expect(await readRows('financeInvestments')).toEqual(values); harness.conversation.dispose();
			}
			return;
		}
		if (family === 'cdi') {
			const harness = await runCdiChunks();
			const rows = await readRows('investmentCdiRates');
			expect(rows).toHaveLength(211);
			expect(new Set(rows.map(row => row.data.effectiveFrom.toMillis())).size).toBe(211);
			expect(rows.map(row => row.data.annualRateInBasisPoints).sort((a, b) => a - b)).toEqual(Array.from({ length: 211 }, (_, index) => 1400 + index));
			await assertReceipts(harness); expect(await readRows('investmentCdiRates')).toEqual(rows); harness.conversation.dispose();
			return;
		}
		throw new Error('Family implementation pending: ' + family);
	}, 180000);

	(selected.length ? it : it.skip)('retries only two failed identities after a pre-commit failure and a lost real commit response', async () => {
		await seedFamily('expense');
		const injected = new Set<string>();
		const harness = measuredConversation('update_expense', { valueInCents: 200 }, prefix, undefined, async (actor, draft, catalog, grant) => {
			const target = catalog.expenses?.find(item => item.handle === draft.payload.recordRef)?.realId;
			if (target?.endsWith('-005') && !injected.has(draft.clientActionId)) {
				injected.add(draft.clientActionId); return { success: false, message: 'Synthetic transport failed before commit.' };
			}
			const result = await financeCommandService.execute(actor, draft, catalog, grant);
			if (target?.endsWith('-200') && !injected.has(draft.clientActionId) && result.success) {
				injected.add(draft.clientActionId); throw new Error('Synthetic response lost after real commit.');
			}
			return result;
		});
		await harness.conversation.send('Altere todas as despesas do conjunto sintético para R$ 2,00');
		await harness.conversation.send('confirmo');
		const failedIds = harness.conversation.snapshot().drafts.filter(item => item.status === 'failed').map(item => item.clientActionId);
		expect(failedIds).toHaveLength(2);
		const partial = await readRows('expenses');
		expect(partial.filter(row => row.data.valueInCents === 200)).toHaveLength(210);
		expect(partial.filter(row => row.data.valueInCents === 100)).toHaveLength(1);
		expect(await readRows('assistantOperationReceipts')).toHaveLength(210);
		await assertBalances(99_957_900, undefined, 0);
		await harness.conversation.send('tente novamente');
		expect(harness.attempts).toHaveLength(211);
		await harness.conversation.send('confirmo');
		expect(harness.attempts.slice(211)).toEqual(failedIds);
		expect(harness.conversation.snapshot().drafts.every(item => item.status === 'succeeded')).toBe(true);
		expect((await readRows('expenses')).every(row => row.data.valueInCents === 200)).toBe(true);
		const receipts = await readRows('assistantOperationReceipts');
		expect(receipts).toHaveLength(211); expect(new Set(receipts.map(row => row.data.clientActionId))).toEqual(new Set(harness.attempts));
		await assertBalances(99_957_800, undefined, 0);
		expect(harness.invalidations()).toBe(2);
		harness.conversation.dispose();
	}, 90000);

	(selected.length ? it : it.skip)('cancels during item 51 and preserves 51 real commits without starting the remaining 160', async () => {
		await seedFamily('expense');
		let release!: () => void;
		let entered!: () => void;
		const inFlight = new Promise<void>(resolve => { entered = resolve; });
		const pause = new Promise<void>(resolve => { release = resolve; });
		let started = 0;
		const harness = measuredConversation('update_expense', { valueInCents: 200 }, prefix, undefined, async (actor, draft, catalog, grant) => {
			if (++started === 51) { entered(); await pause; }
			return financeCommandService.execute(actor, draft, catalog, grant);
		});
		await harness.conversation.send('Altere todas as despesas do conjunto sintético para R$ 2,00');
		const committing = harness.conversation.send('confirmo');
		await inFlight;
		await harness.conversation.send('cancele');
		release(); await committing;
		expect(harness.attempts).toHaveLength(51);
		expect(harness.conversation.snapshot().drafts.filter(item => item.status === 'succeeded')).toHaveLength(51);
		expect(harness.conversation.snapshot().drafts.filter(item => item.status === 'cancelled')).toHaveLength(160);
		const persisted = await readRows('expenses');
		expect(persisted.filter(row => row.data.valueInCents === 200)).toHaveLength(51);
		expect(persisted.filter(row => row.data.valueInCents === 100)).toHaveLength(160);
		const receipts = await readRows('assistantOperationReceipts');
		expect(receipts).toHaveLength(51); expect(new Set(receipts.map(row => row.data.clientActionId))).toEqual(new Set(harness.attempts));
		await assertBalances(99_973_800, undefined, 0);
		await harness.conversation.send('tente novamente'); expect(harness.attempts).toHaveLength(51);
		expect(await readRows('expenses')).toEqual(persisted);
		harness.conversation.dispose();
	}, 90000);

	(process.env.MEASURE_ASSISTANT_REAL_BATCH === '1' ? it : it.skip)('measures twenty complete 211-expense batches with fresh proposals and persisted effects', async () => {
		await seedFamily('expense');
		const measurements: Array<Awaited<ReturnType<typeof runSelection>>['measurement']> = [];
		const operationIds = new Set<string>();
		// One unmeasured warmup; changing the material amount forces a fresh snapshot each round.
		for (let sample = -1; sample < 20; sample++) {
			const valueInCents = 301 + sample;
			const harness = await runSelection('update_expense', { valueInCents }, `benchmark_expense_${sample}`);
			const rows = await readRows('expenses');
			expect(rows).toHaveLength(COUNT);
			expect(rows.every(row => row.data.valueInCents === valueInCents)).toBe(true);
			await assertBalances(100_000_000 - COUNT * valueInCents, undefined, 0);
			for (const id of harness.attempts) { expect(operationIds.has(id)).toBe(false); operationIds.add(id); }
			expect(harness.measurement.sdk.transactions).toBe(COUNT);
			expect(harness.measurement.sdk.transactionWrites).toBe(422);
			expect(harness.measurement.interpreterSeamCalls).toBe(1);
			if (sample >= 0) measurements.push(harness.measurement);
			harness.conversation.dispose();
		}
		expect(operationIds.size).toBe(4431);
		const receipts = await readRows('assistantOperationReceipts');
		expect(receipts).toHaveLength(4431);
		expect(new Set(receipts.map(row => row.data.clientActionId))).toEqual(operationIds);
		const elapsed = measurements.map(item => item.batchMs).sort((a, b) => a - b);
		const sdkRanges = Object.fromEntries(Object.keys(mockCalls).map(key => [key, {
			min: Math.min(...measurements.map(item => item.sdk[key]!)), max: Math.max(...measurements.map(item => item.sdk[key]!)),
		}]));
		console.info('LUMUS_BATCH_REAL_END_TO_END ' + JSON.stringify({ family: 'expense_update', samples: 20, warmup: 1, itemsPerBatch: COUNT,
			p50Ms: elapsed[9], p95Ms: elapsed[18], minMs: elapsed[0], maxMs: elapsed[19], sdkRanges,
			interpreterSeamCallsPerBatch: 1, networkModelCalls: 0, executionsPerBatch: COUNT, clientTransactionWritesPerItem: 2,
			uniqueOperationIds: operationIds.size, scope: 'two conversational sends, real catalog/grants/SDK/commit/result; excludes fixture setup, verification and cleanup',
		}));
	}, 300000);
});
