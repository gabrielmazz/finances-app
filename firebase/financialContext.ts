import {
	collection,
	doc,
	documentId,
	getDocFromServer,
	getDocsFromServer,
	limit,
	orderBy,
	query,
	startAfter,
	where,
	type QueryConstraint,
} from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { measureRead } from './diagnostics';
import { loadAuthorization } from './authorization';

export type FinancialContext =
	{ kind: 'personal'; sharedReadStatus?: 'authorized' | 'group-listed' | 'unverified' } | { kind: 'group'; groupId: string; role: 'admin' | 'member' };

export async function loadFinancialContext(
	client: AccountClient,
	uid: string,
	groupId: unknown,
): Promise<FinancialContext> {
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	if (groupId == null) {
		try {
			const authorization = await loadAuthorization(client, uid);
			if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
			if (authorization?.readOwners.some(owner => owner !== uid)) return { kind: 'personal', sharedReadStatus: 'authorized' };
			if (authorization && Object.keys(authorization.groups).length) return { kind: 'personal', sharedReadStatus: 'group-listed' };
			return { kind: 'personal' };
		} catch (error) {
			if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
			return { kind: 'personal', sharedReadStatus: 'unverified' };
		}
	}
	if (typeof groupId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(groupId))
		throw new Error('context/invalid-group');
	const authorization = await loadAuthorization(client, uid);
	const role = authorization?.groups[groupId];
	if (role !== 'admin' && role !== 'member') throw new Error('context/access-denied');
	const snapshot = await measureRead(
		'context.get',
		() => getDocFromServer(doc(client.db, 'financialGroups', groupId)),
		() => 1,
	);
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	const data = snapshot.data();
	if (data?.status !== 'active')
		throw new Error('context/access-denied');
	return { kind: 'group', groupId, role };
}

// Read-only compatibility probe. No balance reconstruction or full-history scan.
export async function readOwnBankPage(client: AccountClient, uid: string, afterId?: string) {
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	const constraints: QueryConstraint[] = [where('personId', '==', uid), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null), orderBy(documentId()), limit(20)];
	if (afterId) constraints.push(startAfter(afterId));
	const snapshot = await measureRead(
		'banks.page',
		() => getDocsFromServer(query(collection(client.db, 'banks'), ...constraints)),
		(value) => value.size,
	);
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	return {
		banks: snapshot.docs.map((item) => ({
			id: item.id,
			name: typeof item.data().name === 'string' ? (item.data().name as string) : '',
			personId: uid,
		})),
		nextCursor: snapshot.size === 20 ? snapshot.docs.at(-1)!.id : null,
	};
}
