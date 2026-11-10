jest.mock('react-native-css-interop/jsx-runtime', () => require('react/jsx-runtime'));
jest.mock('../hooks/useSession', () => ({ useSession: () => mockSession }));
jest.mock('../firebase/client', () => ({ getFirebaseClient: () => ({}) }));
jest.mock('../firebase/banks', () => ({ readBankPage: jest.fn() }));
import React, { act } from 'react';
import { createRoot } from 'test-renderer';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { BankAccountsProvider, useBankAccounts } from '../contexts/BankAccountsContext';
import { readBankPage } from '../firebase/banks';
const mockSession = {
	user: { uid: 'owner' },
	context: { kind: 'personal' },
	contextError: null,
	error: null,
};
const empty = { banks: [], nextCursor: null, issues: 0 };
let latest: ReturnType<typeof useBankAccounts>;
function Consumer() {
	latest = useBankAccounts();
	return null;
}
const tree = () => React.createElement(BankAccountsProvider, null, React.createElement(Consumer));
const bank = (id: string, amount: number | null) => ({
	id,
	source: 'new',
	scope: { kind: 'personal', id: 'owner', uid: 'owner' },
	name: id,
	institutionKey: 'bank',
	institutionName: 'Bank',
	accountType: 'checking',
	colorHex: null,
	balanceInCents: amount,
	openingDate: '2025-01-01',
	status: 'active',
	revision: 0,
	issue: null,
});
beforeEach(() => {
	mockSession.user = { uid: 'owner' };
	(readBankPage as jest.Mock).mockReset();
});
test('post-commit refresh cannot reuse a page already in flight before the commit', async () => {
	let resolveOld!: (value: unknown) => void;
	const old = new Promise((resolve) => {
		resolveOld = resolve;
	});
	let calls = 0;
	(readBankPage as jest.Mock).mockImplementation((_client, _scope, source) =>
		source !== 'new'
			? Promise.resolve(empty)
			: ++calls === 1
				? old
				: Promise.resolve({ ...empty, banks: [bank('persisted', 150000)] }),
	);
	const renderer = createRoot();
	await act(async () => {
		renderer.render(tree());
	});
	let refresh: Promise<void>;
	await act(async () => {
		refresh = latest.reload();
		resolveOld(empty);
		await refresh;
	});
	expect(calls).toBe(2);
	expect(latest.total).toBe(150000);
	expect(latest.active.items.map((item) => item.id)).toEqual(['persisted']);
	await act(() => renderer.unmount());
});
test('incomplete pages and unknown legacy balances never become a confirmed total', async () => {
	(readBankPage as jest.Mock).mockImplementation((_client, _scope, source) =>
		Promise.resolve(
			source === 'new' ? { ...empty, banks: [bank('page1', 150000)], nextCursor: 'page1' } : empty,
		),
	);
	const renderer = createRoot();
	await act(() => renderer.render(tree()));
	expect(latest.total).toBeNull();
	(readBankPage as jest.Mock).mockResolvedValue({ ...empty, banks: [bank('legacy', null)] });
	await act(async () => {
		await latest.reload();
	});
	expect(latest.total).toBeNull();
	await act(() => renderer.unmount());
});
test('logout hides the previous context immediately and discards late page responses', async () => {
	let resolvePage!: (value: unknown) => void;
	const pending = new Promise((resolve) => {
		resolvePage = resolve;
	});
	(readBankPage as jest.Mock).mockImplementation((_client, _scope, source) =>
		source === 'new' ? pending : Promise.resolve(empty),
	);
	const renderer = createRoot();
	await act(() => renderer.render(tree()));
	mockSession.user = null as any;
	await act(() => renderer.render(tree()));
	expect(latest.scope).toBeNull();
	expect(latest.active.items).toEqual([]);
	await act(async () => {
		resolvePage({ ...empty, banks: [bank('private', 150000)] });
		await pending;
	});
	expect(latest.active.items).toEqual([]);
	expect(latest.total).toBeNull();
	await act(() => renderer.unmount());
});
