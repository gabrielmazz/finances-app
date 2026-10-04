// Opt-in: RUN_ASSISTANT_EMULATOR_READS=1, with the local demo Auth/Firestore emulators running.
// The configuration is local; SDK call counters delegate to the real Firebase implementation.
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, deleteUser, getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate, type Firestore } from 'firebase/firestore';

let mockClientDb: Firestore;
let mockClientAuth: Auth;
const mockSdkReads = { getDoc: 0, getDocs: 0 };
jest.mock('firebase/firestore', () => {
	const actual = jest.requireActual('firebase/firestore');
	return { ...actual,
		getDoc: (...args: unknown[]) => { mockSdkReads.getDoc++; return actual.getDoc(...args); },
		getDocs: (...args: unknown[]) => { mockSdkReads.getDocs++; return actual.getDocs(...args); },
	};
});
jest.mock('@/FirebaseConfig', () => ({
	get db() { return mockClientDb; },
	get auth() { return mockClientAuth; },
	firebaseFunctions: {},
}));

import { getLegacyBankBalanceInCentsFirebase } from '@/functions/BankFirebase';
import { getCategoryAnalysisFirebase } from '@/functions/CategoryAnalysisFirebase';
import { getFinancialForecastFirebase } from '@/functions/FinancialForecastFirebase';
import { getHomeOverviewFirebase, getHomeSnapshotFirebase, getHomeInvestmentsFirebase, getHomeBalancesFirebase } from '@/functions/HomeFirebase';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';

const project = 'demo-lumus-financas';
const baseUrl = `http://127.0.0.1:8080/v1/projects/${project}/databases/(default)/documents`;
const pathPrefix = `projects/${project}/databases/(default)/documents/`;
const seededPaths = new Set<string>();
let app: FirebaseApp;
let uid: string;
let civilToday: string;
let groupId: string;
let bankId: string;
let cashId: string;

const firestoreValue = (value: unknown): Record<string, unknown> => {
	if (value === null) return { nullValue: 'NULL_VALUE' };
	if (value instanceof Date) return { timestampValue: value.toISOString() };
	if (typeof value === 'string') return { stringValue: value };
	if (typeof value === 'boolean') return { booleanValue: value };
	if (typeof value === 'number' && Number.isSafeInteger(value)) return { integerValue: String(value) };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
	if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, firestoreValue(item)])) } };
	throw new Error('Invalid synthetic fixture value.');
};

const commitFixture = async (records: Array<{ path: string; data: Record<string, unknown> }>) => {
	const response = await fetch(baseUrl + ':commit', {
		method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
		body: JSON.stringify({ writes: records.map(record => ({ update: { name: pathPrefix + record.path, fields: (firestoreValue(record.data).mapValue as { fields: unknown }).fields } })) }),
	});
	if (!response.ok) throw new Error(`Demo fixture write failed: ${response.status}.`);
	records.forEach(record => seededPaths.add(record.path));
};

const suite = process.env.RUN_ASSISTANT_EMULATOR_READS === '1' ? describe : describe.skip;
suite('public financial projection readers against local demo emulators', () => {
	beforeAll(async () => {
		app = initializeApp({ projectId: project, apiKey: 'test-api-key', authDomain: project + '.firebaseapp.com' }, 'ledger-read-' + Date.now());
		mockClientAuth = getAuth(app);
		connectAuthEmulator(mockClientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
		mockClientDb = getFirestore(app);
		connectFirestoreEmulator(mockClientDb, '127.0.0.1', 8080);
		uid = (await signInAnonymously(mockClientAuth)).user.uid;
		groupId = uid + '_read_group'; bankId = uid + '_read_bank'; cashId = uid + '_read_cash';
		const now = toFinancialCivilDate(new Date());
		civilToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		jest.useFakeTimers({ doNotFake: ['nextTick', 'hrtime', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }).setSystemTime(new Date(civilToday + 'T08:00:00-03:00'));
	}, 20_000);

	afterAll(async () => {
		jest.useRealTimers();
		if (seededPaths.size) {
			const response = await fetch(baseUrl + ':commit', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [...seededPaths].map(path => ({ delete: pathPrefix + path })) }) });
			if (!response.ok) throw new Error('Could not remove the isolated demo read fixtures.');
		}
		if (mockClientAuth?.currentUser) await deleteUser(mockClientAuth.currentUser);
		if (mockClientDb) await terminate(mockClientDb);
		if (app) await deleteApp(app);
	}, 20_000);

	it('includes a persisted legacy expense dated today at noon in the current morning balance and category', async () => {
		const [year, month] = civilToday.split('-').map(Number);
		await commitFixture([
			{ path: 'users/' + uid, data: { name: 'Synthetic reader', relatedIdUsers: [] } },
			{ path: 'banks/' + bankId, data: { personId: uid, name: 'Demo Nubank' } },
			{ path: 'monthlyBalances/' + bankId, data: { personId: uid, bankId, year, month, valueInCents: 100_000 } },
			{ path: 'tags/' + bankId, data: { personId: uid, name: 'Synthetic food', usageType: 'expense' } },
			{ path: 'expenses/' + bankId, data: { personId: uid, bankId, tagId: bankId, name: 'Synthetic market', valueInCents: 8_290, date: new Date(civilToday + 'T12:00:00-03:00') } },
		]);
		expect(await getLegacyBankBalanceInCentsFirebase({ personId: uid, bankId })).toEqual({ success: true, data: 91_710 });
		const home = await getHomeOverviewFirebase(uid);
		if (!home.success) throw home.error;
		expect(home.data.bankBalances).toEqual([expect.objectContaining({ id: bankId, balanceInCents: 91_710 })]);
		expect(home.data.currentMonthExpensesByBankId[bankId]).toBe(8_290);
		const balances = await getHomeBalancesFirebase(uid);
		if (!balances.success) throw balances.error;
		expect(balances.data.bankBalances).toEqual(home.data.bankBalances);
		expect(balances.data.cashSummary?.balanceInCents).toBe(home.data.cashSummary?.balanceInCents);
		const categories = await getCategoryAnalysisFirebase(uid);
		if (!categories.success) throw categories.error;
		expect(categories.data.reportsByTagId[bankId].expense.currentInCents).toBe(8_290);
	}, 30_000);

	it('switches to the complete group ledger, removes today reversal and preserves materialized liquid balances', async () => {
		const expense = (id: string, value: number, effectiveAt = new Date(civilToday + 'T12:00:00-03:00')) => ({ path: 'ledgerTransactions/' + id, data: { groupId, actorId: uid, clientActionId: id, kind: 'expense', categoryId: bankId, note: 'Synthetic expense', effectiveAt, legs: [{ accountId: bankId, deltaInCents: -value }, { accountId: null, deltaInCents: value }] } });
		const original = uid + '_read_cancelled';
		await commitFixture([
			{ path: 'users/' + uid, data: { name: 'Synthetic reader', relatedIdUsers: [], financialGroupId: groupId, financialGroupRole: 'admin' } },
			{ path: 'financialGroups/' + groupId, data: { status: 'active', members: { [uid]: 'admin' } } },
			{ path: 'financialAccounts/' + bankId, data: { groupId, personId: uid, kind: 'bank', name: 'Demo Nubank', currentBalanceInCents: 91_460, archivedAt: null, isActive: true } },
			{ path: 'financialAccounts/' + cashId, data: { groupId, personId: uid, kind: 'cash', name: 'Caixa', currentBalanceInCents: 500, archivedAt: null, isActive: true } },
			expense(uid + '_read_market', 8_290),
			...Array.from({ length: 250 }, (_, index) => expense(uid + '_read_' + String(index).padStart(3, '0'), 1)),
			expense(original, 9_000),
			{ path: 'ledgerTransactions/' + uid + '_read_reversal', data: { groupId, actorId: uid, clientActionId: uid + '_read_reversal', kind: 'reversal', reversesTransactionId: original, effectiveAt: new Date(civilToday + 'T12:00:00-03:00'), legs: [{ accountId: bankId, deltaInCents: 9_000 }, { accountId: null, deltaInCents: -9_000 }] } },
		]);
		const home = await getHomeOverviewFirebase(uid);
		if (!home.success) throw home.error;
		expect(home.data.bankBalances[0].balanceInCents).toBe(91_460);
		expect(home.data.cashSummary?.balanceInCents).toBe(500);
		expect(home.data.currentMonthExpensesByBankId[bankId]).toBe(8_540);
		const balances = await getHomeBalancesFirebase(uid);
		if (!balances.success) throw balances.error;
		expect(balances.data.bankBalances).toEqual(home.data.bankBalances);
		expect(balances.data.cashSummary?.balanceInCents).toBe(500);
		const categories = await getCategoryAnalysisFirebase(uid);
		if (!categories.success) throw categories.error;
		expect(categories.data.reportsByTagId[bankId].expense).toMatchObject({ currentInCents: 8_540, currentCount: 251 });
		const forecast = await getFinancialForecastFirebase(uid, 3);
		if (!forecast.success) throw forecast.error;
		expect(forecast.data.openingBalanceInCents).toBe(91_960);
	}, 30_000);

	if (process.env.MEASURE_ASSISTANT_EMULATOR_READS === '1') it('measures equivalent complete and focused reader paths against the same real emulator dataset', async () => {
		const samples: Record<string, number[]> = { full: [], overview: [], investments: [], balances: [] };
		const readCounts: Record<string, Array<typeof mockSdkReads>> = { full: [], overview: [], investments: [], balances: [] };
		const recordReads = (name: string) => readCounts[name].push({ ...mockSdkReads });
		const resetReads = () => { mockSdkReads.getDoc = 0; mockSdkReads.getDocs = 0; };
		await getHomeSnapshotFirebase(uid);
		for (let index = 0; index < 20; index++) {
			resetReads();
			let started = performance.now();
			const full = await getHomeSnapshotFirebase(uid); samples.full.push(performance.now() - started);
			recordReads('full');
			if (!full.success || !full.data.overview.success || !full.data.investments.success) throw new Error('Benchmark source was unavailable.');
			resetReads();
			started = performance.now();
			const overview = await getHomeOverviewFirebase(uid); samples.overview.push(performance.now() - started);
			recordReads('overview');
			expect(overview).toEqual({ success: true, data: full.data.overview.data });
			resetReads();
			started = performance.now();
			const investments = await getHomeInvestmentsFirebase(uid); samples.investments.push(performance.now() - started);
			recordReads('investments');
			expect(investments).toEqual({ success: true, data: full.data.investments.data });
			resetReads();
			started = performance.now();
			const balances = await getHomeBalancesFirebase(uid); samples.balances.push(performance.now() - started);
			recordReads('balances');
			if (!balances.success) throw balances.error;
			expect(balances.data.bankBalances).toEqual(full.data.overview.data.bankBalances);
			expect(balances.data.cashSummary).toEqual({ id: 'cash-transactions', name: 'Caixa', balanceInCents: 500 });
		}
		for (const counts of Object.values(readCounts)) expect(new Set(counts.map(count => JSON.stringify(count))).size).toBe(1);
		const percentile = (items: number[], percentile: number) => Number([...items].sort((a, b) => a - b)[Math.ceil(items.length * percentile) - 1].toFixed(2));
		console.info('LUMUS_READER_EMULATOR_LATENCY ' + JSON.stringify({ dataset: { ledgerEvents: 253, activeExpenses: 251, accounts: 2 }, samplesPerPath: 20, modelCalls: 0, writesDuringMeasurement: 0, clock: '08:00 America/Sao_Paulo', milliseconds: Object.fromEntries(Object.entries(samples).map(([name, items]) => [name, { p50: percentile(items, 0.5), p95: percentile(items, 0.95), sdkReads: readCounts[name][0] }])) }));
	}, 60_000);
});
