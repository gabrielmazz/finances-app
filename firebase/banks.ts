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
			event.type !== (bank.legacyBankId ? 'reference' : 'opening') ||
			(bank.legacyBankId && (event.confirmed !== true || event.pendingReviewed !== true)) ||
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
	if (source === 'new') {
		const constraints: QueryConstraint[] = [where('type', '==', 'opening'), orderBy(documentId()), limit(20)];
		if (cursor) constraints.push(startAfter(cursor));
		const page = await measureRead('accounts.openings.page', () => getDocsFromServer(query(
			collection(client.db, 'financialContexts', bankContextKey(scope), 'accountOpenings'), ...constraints,
		)), result => result.size);
		let issues = 0;
		const resolved = await Promise.all(page.docs.map(async item => {
			try {
				const bank = await readBank(client, scope, { source: 'new', id: item.id });
				return bank.status === status ? bank : null;
			} catch (error) {
				const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
				if (!['permission-denied', 'banks/not-found', 'banks/incompatible'].includes(code)) throw error;
				issues++;
				return null;
			}
		}));
		requireBankReadEnvironment(client, scope);
		return { banks: resolved.filter((bank): bank is NonNullable<typeof bank> => bank !== null), nextCursor: page.size === 20 ? page.docs[19].id : null, issues, unavailable: false, contextUnverified: false };
	}
	if (status === 'archived')
		return { banks: [], nextCursor: null as string | null, issues: 0, unavailable: false, contextUnverified: false };
	const base = scope.kind === 'personal'
		? collection(client.db, 'banks')
		: collection(client.db, 'financialGroups', scope.id, 'accounts');
	const filters: QueryConstraint[] =
		scope.kind === 'personal'
				? client.db.app.options.projectId === OFFICIAL_PROJECT_ID
					? [where('personId', '==', scope.id)]
					: [where('personId', '==', scope.id), where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)]
				: [];
	filters.push(orderBy(documentId()), limit(20));
	if (cursor) filters.push(startAfter(cursor));
	let result;
	try {
		result = await measureRead('accounts.page.' + source, () => getDocsFromServer(query(base, ...filters)), (page) => page.size);
	} catch (error) {
		if (source === 'legacy' && error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied')
			return { banks: [], nextCursor: null, issues: 0, unavailable: true, contextUnverified: true };
		throw error;
	}
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

// Protected personal bindings provide a bounded way to find old banks whose
// legacy documents do not contain queryable group fields.
export async function readBoundLegacyBankPage(client: AccountClient, scope: BankScope, status: 'active' | 'archived', cursor?: string | null) {
	requireBankReadEnvironment(client, scope);
	if (scope.kind !== 'personal' || status !== 'active' || client.db.app.options.projectId !== LOCAL_PROJECT_ID)
		return { banks: [], nextCursor: null as string | null, issues: 0, unavailable: false };
	if (cursor && !validId(cursor)) throw Error('banks/invalid-cursor');
	const constraints: QueryConstraint[] = [where('scopeKind', '==', 'personal'), where('scopeId', '==', scope.uid), orderBy(documentId()), limit(20)];
	if (cursor) constraints.push(startAfter(cursor));
	let page;
	try { page = await getDocsFromServer(query(collection(client.db, '_bankScopes'), ...constraints)); }
	catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') return { banks: [], nextCursor: null, issues: 0, unavailable: true };
		throw error;
	}
	requireBankReadEnvironment(client, scope);
	let issues = 0;
	const resolved = await Promise.all(page.docs.map(async item => {
		try { return await readBank(client, scope, { source: 'legacy', id: item.id }); }
		catch (error) {
			const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
			if (!['permission-denied', 'banks/not-found', 'banks/incompatible'].includes(code)) throw error;
			issues++; return null;
		}
	}));
	return { banks: resolved.filter((bank): bank is NonNullable<typeof bank> => !!bank && bank.status === status), nextCursor: page.size === 20 ? page.docs[page.size - 1].id : null, issues, unavailable: false };
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

export type LegacyReferenceInput = BankMetadata & { initialBalanceCents: number; referenceAt: Date; reason: string; confirmed: boolean; pendingReviewed: boolean };
const referenceGroupFields = ['groupId', 'financialGroupId', 'ledgerGroupId'];
function explicitPersonalReference(data: Record<string, any>) {
	return referenceGroupFields.every(key => Object.prototype.hasOwnProperty.call(data, key) && data[key] === null);
}
function eligibleReferenceStatus(data: Record<string, any>) {
	return (data.isActive === undefined || data.isActive === true) &&
		(data.archived === undefined || data.archived === false) &&
		(data.status === undefined || data.status === 'active');
}
function verifiedPersonalBinding(data: Record<string, any>, binding: Record<string, any> | undefined, uid: string) {
	return referenceGroupFields.every(key => data[key] == null) && !!binding && Object.keys(binding).sort().join(',') === 'scopeId,scopeKind' && binding.scopeKind === 'personal' && binding.scopeId === uid;
}
function validateReferenceInput(scope: BankScope, id: string, input: LegacyReferenceInput) {
	if (scope.kind !== 'personal' || !/^[A-Za-z0-9]{20}$/.test(id) || input.confirmed !== true || input.pendingReviewed !== true)
		throw Error('banks/reference-confirmation-required');
	if (!(input.referenceAt instanceof Date) || !Number.isFinite(input.referenceAt.getTime()) || input.referenceAt.getTime() > Date.now() || input.referenceAt.getUTCFullYear() < 1900)
		throw Error('banks/invalid-date');
	return validateCreation({ ...input, openingDate: input.referenceAt.toISOString().slice(0, 10) });
}

// A dry run checks the currently visible state only; the commit rechecks it atomically.
export async function previewLegacyReference(client: AccountClient, scope: BankScope, id: string, input: LegacyReferenceInput) {
	requireBankReadEnvironment(client, scope);
	const value = validateReferenceInput(scope, id, input);
	const old = await getDocFromServer(doc(client.db, 'banks', id));
	requireBankReadEnvironment(client, scope);
	if (!old.exists()) throw Error('banks/not-found');
	const data = old.data();
	const bank = parseBank(id, 'legacy', data, scope);
	if (bank.blocked || bank.status !== 'active' || !eligibleReferenceStatus(data) || bank.name !== value.name) throw Error('banks/reference-incompatible');
	// The published production rules do not expose the protected binding or the
	// new account paths. A preview is informational and cannot authorize writes.
	if (client.db.app.options.projectId === OFFICIAL_PROJECT_ID)
		return { accountId: id, amountCents: value.initialBalanceCents, referenceAt: new Date(input.referenceAt), firstMovementAfterUtcDay: input.referenceAt.toISOString().slice(0, 10), activationReady: false };
	if (!explicitPersonalReference(data)) {
		const binding = await getDocFromServer(doc(client.db, '_bankScopes', id));
		if (!verifiedPersonalBinding(data, binding.data(), scope.uid)) throw Error('banks/reference-context-unverified');
	}
	const account = await getDocFromServer(doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', id));
	const opening = await getDocFromServer(doc(client.db, 'financialContexts', bankContextKey(scope), 'accountOpenings', id));
	requireBankEnvironment(client, scope);
	if (account.exists() || opening.exists()) throw Error('banks/operation-conflict');
	return { accountId: id, amountCents: value.initialBalanceCents, referenceAt: new Date(input.referenceAt), firstMovementAfterUtcDay: input.referenceAt.toISOString().slice(0, 10), activationReady: true };
}

export async function prepareLegacyReference(client: AccountClient, scope: BankScope, id: string, input: LegacyReferenceInput) {
	requireBankEnvironment(client, scope);
	const value = validateReferenceInput(scope, id, input);
	const referenceMillis = input.referenceAt.getTime();
	const legacy = doc(client.db, 'banks', id), account = doc(client.db, 'financialContexts', bankContextKey(scope), 'bankAccounts', id),
		opening = doc(client.db, 'financialContexts', bankContextKey(scope), 'accountOpenings', id);
	try {
	await runTransaction(client.db, async tx => {
		const [old, existing, event] = await Promise.all([tx.get(legacy), tx.get(account), tx.get(opening)]);
		requireBankEnvironment(client, scope);
		if (!old.exists()) throw Error('banks/not-found');
		const oldData = old.data();
		if (!explicitPersonalReference(oldData)) {
			const binding = await tx.get(doc(client.db, '_bankScopes', id));
			if (!verifiedPersonalBinding(oldData, binding.data(), scope.uid)) throw Error('banks/reference-context-unverified');
		}
		const bank = parseBank(id, 'legacy', oldData, scope);
		if (bank.blocked || bank.status !== 'active' || !eligibleReferenceStatus(oldData) || bank.name !== value.name) throw Error('banks/reference-incompatible');
		if (existing.exists() || event.exists()) {
			const data = existing.data(), origin = event.data();
			if (!data || !origin || data.legacyBankId !== id || origin.type !== 'reference' || origin.confirmed !== true || origin.pendingReviewed !== true ||
				Object.entries(validateMetadata(value)).some(([field, content]) => data[field] !== content) ||
				data.initialBalanceCents !== value.initialBalanceCents || origin.amountCents !== value.initialBalanceCents ||
				data.openingDate?.toMillis() !== referenceMillis || origin.date?.toMillis() !== referenceMillis || origin.reason !== value.reason)
				throw Error('banks/operation-conflict');
			return;
		}
		const date = Timestamp.fromMillis(referenceMillis);
		tx.set(account, { schemaVersion: 1, scopeKind: scope.kind, scopeId: scope.id, ...validateMetadata(value), legacyBankId: id,
			initialBalanceCents: value.initialBalanceCents, openingDate: date, status: 'active', revision: 0,
			createdBy: scope.uid, updatedBy: scope.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
		tx.set(opening, { schemaVersion: 1, accountId: id, scopeKind: scope.kind, scopeId: scope.id, type: 'reference',
			amountCents: value.initialBalanceCents, date, reason: value.reason, confirmed: true, pendingReviewed: true,
			createdBy: scope.uid, createdAt: serverTimestamp() });
	});
	} catch (error) {
		// Rules may reject the loser of an identical concurrent create before the
		// SDK reports a transaction conflict. Recover only a confirmed matching pair.
		try {
			const [old, bank, event] = await Promise.all([
				getDocFromServer(legacy), readBank(client, scope, { id, source: 'new' }), getDocFromServer(opening),
			]);
			const oldData = old.data(), origin = event.data();
			const binding = oldData && !explicitPersonalReference(oldData) ? await getDocFromServer(doc(client.db, '_bankScopes', id)) : null;
			if (oldData && !parseBank(id, 'legacy', oldData, scope).blocked && oldData.personId === scope.uid && (explicitPersonalReference(oldData) || verifiedPersonalBinding(oldData, binding?.data(), scope.uid)) &&
				Object.entries(validateMetadata(value)).every(([field, content]) => bank[field as keyof typeof bank] === content) &&
				oldData.name === value.name && eligibleReferenceStatus(oldData) &&
				bank.legacyBankId === id && origin?.type === 'reference' && origin.confirmed === true && origin.pendingReviewed === true &&
				origin.amountCents === value.initialBalanceCents && origin.date?.toMillis() === referenceMillis && origin.reason === value.reason)
				return bank;
		} catch { /* The commit was not independently confirmed. */ }
		throw error;
	}
	return readBank(client, scope, { id, source: 'new' });
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
		if (bank.legacyBankId) throw Error('banks/reference-archive-unavailable');
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
