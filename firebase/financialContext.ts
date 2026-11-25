import {
	collection,
	doc,
	documentId,
	getDocFromServer,
	getDocsFromServer,
	limit,
	onSnapshot,
	orderBy,
	query,
	startAfter,
	where,
	type QueryConstraint,
} from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { measureRead } from './diagnostics';
import { loadAuthorization } from './authorization';
import { parseAuthorization } from '../domain/authorization';

export type FinancialContext =
	{ kind: 'personal'; sharedReadStatus?: 'authorized' | 'group-listed' | 'unverified' } | { kind: 'group'; groupId: string; role: 'admin' | 'member' };

export type FinancialGroup = Extract<FinancialContext, { kind: 'group' }> & {
	name: string;
	participantIds: string[];
};

async function readActiveGroup(client: AccountClient, uid: string, groupId: string, role: FinancialGroup['role']): Promise<FinancialGroup> {
	const snapshot = await measureRead('context.get', () => getDocFromServer(doc(client.db, 'financialGroups', groupId)), () => 1);
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	const data = snapshot.data();
	if (data?.status !== 'active') throw new Error('context/access-denied');
	const name = typeof data.name === 'string' ? data.name.trim().slice(0, 100) : '';
	const members = data.members;
	const participantIds = members && typeof members === 'object' && !Array.isArray(members)
		? Object.keys(members).filter(id => /^[A-Za-z0-9_-]{1,128}$/.test(id) && ['admin', 'member'].includes(members[id]))
		: [];
	return { kind: 'group', groupId, role, name: name || `Grupo ${groupId}`, participantIds };
}

export async function listFinancialGroups(client: AccountClient, uid: string): Promise<FinancialGroup[]> {
	const authorization = await loadAuthorization(client, uid);
	const groups = await Promise.all(Object.entries(authorization?.groups ?? {}).map(async ([groupId, role]) => {
		try {
			return await readActiveGroup(client, uid, groupId, role);
		} catch (error) {
			if (error instanceof Error && (error.message === 'context/access-denied' || ('code' in error && error.code === 'permission-denied'))) return null;
			throw error;
		}
	}));
	if (client.auth.currentUser?.uid !== uid) throw new Error('session/changed');
	return groups.filter(group => group !== null);
}

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
	await readActiveGroup(client, uid, groupId, role);
	return { kind: 'group', groupId, role };
}

export function watchFinancialGroup(
	client: AccountClient,
	uid: string,
	groupId: string,
	onRole: (role: 'admin' | 'member') => void,
	onRevocation: () => void,
) {
	const active = () => client.auth.currentUser?.uid === uid;
	const onError = (error: { code: string }) => {
		if (active() && error.code === 'permission-denied') onRevocation();
	};
	const stopGrant = onSnapshot(doc(client.db, '_authorizations', uid), { includeMetadataChanges: true }, snapshot => {
		if (!active() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
		const data = snapshot.data();
		try {
			if (!data) throw Error('context/access-denied');
			const role = parseAuthorization(data, data.generation).groups[groupId];
			if (role !== 'admin' && role !== 'member') throw Error('context/access-denied');
			onRole(role);
		} catch {
			onRevocation();
		}
	}, onError);
	const stopGroup = onSnapshot(doc(client.db, 'financialGroups', groupId), { includeMetadataChanges: true }, snapshot => {
		if (active() && !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites && snapshot.data()?.status !== 'active') onRevocation();
	}, onError);
	return () => { stopGrant(); stopGroup(); };
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
