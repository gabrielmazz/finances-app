import AsyncStorage from '@react-native-async-storage/async-storage';
import { beginAnotherBank, pendingBankIntent } from '../application/bankIntents';
import { newBankOperationId, readBank } from '../firebase/banks';
jest.mock('../firebase/banks', () => ({
	requireBankEnvironment: jest.fn(),
	newBankOperationId: jest.fn(),
	readBank: jest.fn(),
}));
const scope = { kind: 'personal' as const, id: 'person', uid: 'person' },
	client = {} as any;
beforeEach(async () => {
	await AsyncStorage.clear();
	jest.clearAllMocks();
	let index = 0;
	(newBankOperationId as jest.Mock).mockImplementation(() => String(++index).padStart(20, '0'));
	(readBank as jest.Mock).mockResolvedValue({});
});
test('parallel allocation and restart reuse the durable opaque operation ID', async () => {
	const ids = await Promise.all(Array.from({ length: 8 }, () => pendingBankIntent(client, scope)));
	expect(new Set(ids).size).toBe(1);
	expect(await pendingBankIntent(client, scope)).toBe(ids[0]);
	expect(newBankOperationId).toHaveBeenCalledTimes(1);
});
test('two stale forms rotating the same confirmed result cannot erase the new ID', async () => {
	const previous = await pendingBankIntent(client, scope);
	const [first, second] = await Promise.all([
		beginAnotherBank(client, scope, previous),
		beginAnotherBank(client, scope, previous),
	]);
	expect(first).toBe(second);
	expect(first).not.toBe(previous);
	expect(await pendingBankIntent(client, scope)).toBe(first);
	expect(newBankOperationId).toHaveBeenCalledTimes(2);
});
test('an unconfirmed result or connection error preserves the original ID', async () => {
	const previous = await pendingBankIntent(client, scope);
	(readBank as jest.Mock).mockRejectedValue(Error('unavailable'));
	await expect(beginAnotherBank(client, scope, previous)).rejects.toThrow('unavailable');
	expect(await pendingBankIntent(client, scope)).toBe(previous);
});
