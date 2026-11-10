import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BankScope } from '../domain/banks';
import type { AccountClient } from '../firebase/profiles';
import { newBankOperationId, readBank, requireBankEnvironment } from '../firebase/banks';
import { bankIntentLock } from './bankIntentLock';

const keyFor = (scope: BankScope) => `lumus:bank-opening:v1:${scope.uid}:${scope.kind}:${scope.id}`;
const inFlight = new Map<string, Promise<string>>();
// Only an opaque operation ID is stored locally, never balances or credentials.
export async function pendingBankIntent(client: AccountClient, scope: BankScope): Promise<string> {
	requireBankEnvironment(client, scope);
	const key = keyFor(scope),
		running = inFlight.get(key);
	if (running) return running;
	const promise = bankIntentLock(key, async () => {
		const existing = await AsyncStorage.getItem(key);
		if (existing) {
			if (!/^[A-Za-z0-9]{20}$/.test(existing)) throw Error('banks/invalid-operation');
			return existing;
		}
		const id = newBankOperationId(client, scope);
		await AsyncStorage.setItem(key, id);
		return id;
	});
	inFlight.set(key, promise);
	try {
		return await promise;
	} finally {
		inFlight.delete(key);
	}
}
// Rotate exactly the result shown in this form. A stale tab cannot erase a newer intent.
export async function beginAnotherBank(client: AccountClient, scope: BankScope, expectedId: string) {
	requireBankEnvironment(client, scope);
	return bankIntentLock(keyFor(scope), async () => {
		const current = await AsyncStorage.getItem(keyFor(scope));
		if (current !== expectedId) {
			if (current && /^[A-Za-z0-9]{20}$/.test(current)) return current;
			throw Error('banks/invalid-operation');
		}
		await readBank(client, scope, { id: current, source: 'new' });
		const next = newBankOperationId(client, scope);
		await AsyncStorage.setItem(keyFor(scope), next);
		return next;
	});
}
