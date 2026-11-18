import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where, type QueryConstraint } from 'firebase/firestore';
import type { AccountClient } from './profiles';
import { readBank, requireBankReadEnvironment } from './banks';
import { validCents } from '../domain/money';
import { validId, type BankRef, type BankScope } from '../domain/banks';
import { OFFICIAL_PROJECT_ID } from './config';

// Only an incremental inventory of snapshots. A monthly snapshot does not prove
// a current balance, a complete history, or the right to activate an account.
export async function readReconciliationPage(client: AccountClient, scope: BankScope, ref: BankRef, cursor?: string | null) {
	requireBankReadEnvironment(client, scope);
	const bank = await readBank(client, scope, ref);
	if (bank.source === 'new') return { bank, status: 'reconciled' as const, snapshots: [], nextCursor: null, skipped: 0 };
	if (cursor && !validId(cursor)) throw Error('banks/invalid-cursor');
	const base = scope.kind === 'personal'
		? collection(client.db, 'monthlyBalances')
		: collection(client.db, 'financialGroups', scope.id, 'monthlyBalances');
	const constraints: QueryConstraint[] = scope.kind === 'personal'
		? [where('personId', '==', scope.uid), ...(client.db.app.options.projectId === OFFICIAL_PROJECT_ID ? [] : [where('groupId', '==', null), where('financialGroupId', '==', null), where('ledgerGroupId', '==', null)])]
		: [];
	constraints.push(orderBy(documentId()), limit(20));
	if (cursor) constraints.push(startAfter(cursor));
	const page = await getDocsFromServer(query(base, ...constraints));
	requireBankReadEnvironment(client, scope);
	let skipped = 0;
	const snapshots = page.docs.flatMap(item => {
		const value = item.data();
		if (value.bankId !== bank.id) return [];
		if ((scope.kind === 'personal' && (value.personId !== scope.uid || value.groupId != null || value.financialGroupId != null || value.ledgerGroupId != null)) ||
			(scope.kind === 'group' && ((value.groupId != null && value.groupId !== scope.id) || (value.financialGroupId != null && value.financialGroupId !== scope.id) || (value.ledgerGroupId != null && value.ledgerGroupId !== scope.id))) ||
			!Number.isInteger(value.year) || value.year < 1900 || value.year > 9999 ||
			!Number.isInteger(value.month) || value.month < 1 || value.month > 12 || !validCents(value.valueInCents)) {
			skipped++;
			return [];
		}
		return [{ id: item.id, year: value.year as number, month: value.month as number, cents: value.valueInCents as number }];
	});
	return { bank, status: 'pending' as const, snapshots, nextCursor: page.size === 20 ? page.docs[page.size - 1].id : null, skipped };
}
