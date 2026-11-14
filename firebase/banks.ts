import {
	collection,
	doc,
	documentId,
	getDocFromServer,
	getDocsFromServer,
	limit,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	startAfter,
	Timestamp,
	where,
	type QueryConstraint,
} from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { LOCAL_PROJECT_ID, OFFICIAL_PROJECT_ID } from './config';
import { measureRead } from './diagnostics';
import {
	parseBank,
	validId,
	validateCreation,
	validateMetadata,
	openingTimestamp,
	type BankScope,
	type BankSource,
	type BankRef,
	type BankCreation,
	type BankMetadata,
} from '../domain/banks';

export function requireBankEnvironment(client: AccountClient, scope: BankScope) {
	requireBankReadEnvironment(client, scope);
	if (client.db.app.options.projectId !== LOCAL_PROJECT_ID) throw Error('read-only/operation');
}
export function requireBankReadEnvironment(client: AccountClient, scope: BankScope) {
	if (client.auth.currentUser?.uid !== scope.uid) throw Error('session/changed');
	if (![LOCAL_PROJECT_ID, OFFICIAL_PROJECT_ID].includes(client.db.app.options.projectId || '')) throw Error('banks/not-released');
	if (
		!validId(scope.id) ||
		!validId(scope.uid) ||
		!['personal', 'group'].includes(scope.kind) ||
		(scope.kind === 'personal' && scope.id !== scope.uid)
	)
		throw Error('banks/invalid-context');
}
export const bankContextKey = (scope: BankScope) => `${scope.kind}:${scope.id}`;
function reference(client: AccountClient, scope: BankScope, ref: BankRef) {
	requireBankReadEnvironment(client, scope);
	if (!validId(ref.id) || !['new', 'legacy', 'group-legacy'].includes(ref.source))
		throw Error('banks/not-found');
	if (ref.source === 'new')
		return doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', ref.id);
	if (ref.source === 'legacy' && scope.kind === 'personal') return doc(client.db, 'banks', ref.id);
	if (ref.source === 'group-legacy' && scope.kind === 'group')
		return doc(client.db, 'financialGroups', scope.id, 'accounts', ref.id);
	throw Error('banks/invalid-context');
}
export function newBankOperationId(client: AccountClient, scope: BankScope) {
	requireBankEnvironment(client, scope);
	return doc(collection(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts')).id;
}
export async function readBank(client: AccountClient, scope: BankScope, ref: BankRef) {
	const result = await measureRead(
		'accounts.get',
		() => getDocFromServer(reference(client, scope, ref)),
		() => 1,
	);
	requireBankReadEnvironment(client, scope);
	if (!result.exists()) throw Error('banks/not-found');
	if (client.db.app.options.projectId === OFFICIAL_PROJECT_ID && ref.source === 'legacy' &&
		(result.data().groupId != null || result.data().financialGroupId != null || result.data().ledgerGroupId != null)) throw Error('banks/incompatible');
	const bank = parseBank(result.id, ref.source, result.data(), scope);
	if (ref.source === 'new') {
		const opening = await measureRead(
			'accounts.opening',
			() =>
				getDocFromServer(
					doc(client.db, 'financialContexts', bankContextKey(scope), 'accountOpenings', ref.id),
				),
			() => 1,
		);
		requireBankReadEnvironment(client, scope);
		const event = opening.data();
		if (
			!event ||
			event.accountId !== ref.id ||
			event.type !== 'opening' ||
			event.scopeKind !== scope.kind ||
			event.scopeId !== scope.id ||
			event.amountCents !== result.data().initialBalanceCents ||
			event.schemaVersion !== 1 ||
			event.createdBy !== result.data().createdBy ||
			event.createdAt?.toMillis() !== result.data().createdAt?.toMillis() ||
			event.date?.toMillis() !== result.data().openingDate?.toMillis()
		)
			throw Error('banks/incompatible');
	}
	return bank;
}
export async function readBankPage(
	client: AccountClient,
	scope: BankScope,
	source: BankSource,
	status: 'active' | 'archived',
	cursor?: string | null,
) {
	requireBankReadEnvironment(client, scope);
	if (source === 'new' && client.db.app.options.projectId === OFFICIAL_PROJECT_ID)
		return { banks: [], nextCursor: null as string | null, issues: 0, unavailable: true, contextUnverified: false };
	if (source !== 'new' && status === 'archived')
		return { banks: [], nextCursor: null as string | null, issues: 0, unavailable: false, contextUnverified: false };
	const base =
		source === 'new'
			? collection(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts')
			: scope.kind === 'personal'
				? collection(client.db, 'banks')
				: collection(client.db, 'financialGroups', scope.id, 'accounts');
	const filters: QueryConstraint[] =
		source === 'new'
			? [where('status', '==', status)]
			: scope.kind === 'personal'
				? client.db.app.options.projectId === OFFICIAL_PROJECT_ID
					? [where('personId', '==', scope.id)]
					: [where('personId', '==', scope.id), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]
				: [];
	filters.push(orderBy(documentId()), limit(20));
	if (cursor) filters.push(startAfter(cursor));
	const result = await measureRead(
		'accounts.page.' + source,
		() => getDocsFromServer(query(base, ...filters)),
		(result) => result.size,
	);
	requireBankReadEnvironment(client, scope);
	let issues = 0, contextUnverified = false;
	const banks = result.docs.flatMap((item) => {
		try {
			if (client.db.app.options.projectId === OFFICIAL_PROJECT_ID && source === 'legacy' &&
				(item.data().groupId != null || item.data().financialGroupId != null || item.data().ledgerGroupId != null)) {
				contextUnverified = true;
				issues++;
				return [];
			}
			const bank = parseBank(item.id, source, item.data(), scope);
			return bank.status === status ? [bank] : [];
		} catch {
			issues++;
			return [
				{
					id: item.id,
					source,
					scope,
					name: 'Conta com cadastro incompatível',
					institutionKey: 'outro-banco',
					institutionName: 'Instituição em revisão',
					accountType: 'unknown' as const,
					colorHex: null,
					balanceInCents: null,
					openingDate: null,
					status,
					revision: 0,
					blocked: true,
					issue:
						'Dados incompletos ou incompatíveis. Consulte o registro; nenhuma alteração automática foi feita.',
				},
			];
		}
	});
	return { banks, nextCursor: result.size === 20 ? result.docs.at(-1)!.id : null, issues, unavailable: false, contextUnverified };
}
export async function createBank(
	client: AccountClient,
	scope: BankScope,
	operationId: string,
	input: BankCreation,
) {
	requireBankEnvironment(client, scope);
	const value = validateCreation(input);
	if (!/^[A-Za-z0-9]{20}$/.test(operationId)) throw Error('banks/invalid-operation');
	const account = doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', operationId),
		opening = doc(client.db, 'financialContexts', bankContextKey(scope), 'accountOpenings', operationId);
	try {
		await runTransaction(client.db, async (transaction) => {
			const [existing, event] = await Promise.all([transaction.get(account), transaction.get(opening)]);
			requireBankEnvironment(client, scope);
			if (existing.exists() || event.exists()) {
				const data = existing.data(),
					origin = event.data();
				if (
					!data ||
					!origin ||
					data.scopeKind !== scope.kind ||
					data.scopeId !== scope.id ||
					data.name !== value.name ||
					data.institutionKey !== value.institutionKey ||
					data.institutionName !== value.institutionName ||
					data.accountType !== value.accountType ||
					data.colorHex !== value.colorHex ||
					data.initialBalanceCents !== value.initialBalanceCents ||
					data.openingDate?.toMillis() !== openingTimestamp(value.openingDate).getTime() ||
					origin.reason !== value.reason ||
					origin.amountCents !== value.initialBalanceCents ||
					origin.accountId !== operationId
				)
					throw Error('banks/operation-conflict');
				return;
			}
			const date = Timestamp.fromDate(openingTimestamp(value.openingDate));
			transaction.set(account, {
				schemaVersion: 1,
				scopeKind: scope.kind,
				scopeId: scope.id,
				...validateMetadata(value),
				initialBalanceCents: value.initialBalanceCents,
				openingDate: date,
				status: 'active',
				revision: 0,
				createdBy: scope.uid,
				updatedBy: scope.uid,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			});
			transaction.set(opening, {
				schemaVersion: 1,
				accountId: operationId,
				scopeKind: scope.kind,
				scopeId: scope.id,
				type: 'opening',
				amountCents: value.initialBalanceCents,
				date,
				reason: value.reason,
				createdBy: scope.uid,
				createdAt: serverTimestamp(),
			});
		});
	} catch (error) {
		// A competing atomic create can be rejected by Rules before the SDK sees ABORTED.
		// Recover only an identical, server-confirmed pair; never retry with a new ID.
		try {
			const recovered = await readBank(client, scope, { id: operationId, source: 'new' });
			const origin = await getDocFromServer(opening);
			if (
				recovered.name === value.name &&
				recovered.institutionKey === value.institutionKey &&
				recovered.institutionName === value.institutionName &&
				recovered.accountType === value.accountType &&
				recovered.colorHex === value.colorHex &&
				origin.data()?.amountCents === value.initialBalanceCents &&
				recovered.openingDate === value.openingDate &&
				origin.data()?.reason === value.reason
			)
				return recovered;
		} catch {
			/* Preserve the original failure when the outcome cannot be verified. */
		}
		throw error;
	}
	return readBank(client, scope, { id: operationId, source: 'new' });
}
export async function updateBank(
	client: AccountClient,
	scope: BankScope,
	ref: BankRef,
	expectedRevision: number,
	input: BankMetadata,
) {
	requireBankEnvironment(client, scope);
	const value = validateMetadata(input),
		target = reference(client, scope, ref);
	await runTransaction(client.db, async (transaction) => {
		const existing = await transaction.get(target);
		requireBankEnvironment(client, scope);
		if (!existing.exists()) throw Error('banks/not-found');
		const bank = parseBank(existing.id, ref.source, existing.data(), scope);
		if (bank.status !== 'active') throw Error('banks/archived');
		if (
			bank.name === value.name &&
			bank.institutionKey === value.institutionKey &&
			bank.institutionName === value.institutionName &&
			bank.accountType === value.accountType &&
			bank.colorHex === value.colorHex
		)
			return;
		if (bank.revision !== expectedRevision) throw Error('banks/conflict');
		transaction.update(
			target,
			ref.source === 'new'
				? { ...value, revision: expectedRevision + 1, updatedBy: scope.uid, updatedAt: serverTimestamp() }
				: {
						name: value.name,
						bankIconKey: value.institutionKey,
						institutionName: value.institutionName,
						accountType: value.accountType,
						colorHex: value.colorHex,
						metadataRevision: expectedRevision + 1,
						updatedBy: scope.uid,
						updatedAt: serverTimestamp(),
					},
		);
	});
	return readBank(client, scope, ref);
}
export async function archiveBank(
	client: AccountClient,
	scope: BankScope,
	ref: BankRef,
	expectedRevision: number,
) {
	requireBankEnvironment(client, scope);
	const target = reference(client, scope, ref);
	if (ref.source !== 'new') throw Error('banks/reconciliation-required');
	await runTransaction(client.db, async (transaction) => {
		const result = await transaction.get(target);
		requireBankEnvironment(client, scope);
		if (!result.exists()) throw Error('banks/not-found');
		const bank = parseBank(result.id, 'new', result.data(), scope);
		if (bank.status === 'archived') return;
		if (bank.balanceInCents !== 0) throw Error('banks/nonzero-archive');
		if (bank.revision !== expectedRevision) throw Error('banks/conflict');
		transaction.update(target, {
			status: 'archived',
			revision: expectedRevision + 1,
			updatedBy: scope.uid,
			updatedAt: serverTimestamp(),
		});
	});
	return readBank(client, scope, ref);
}
