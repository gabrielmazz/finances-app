import { createHash } from 'node:crypto';
import { createAssistantRecordFingerprint } from '../../utils/assistantRecordFingerprint';
import { getFirestore, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { calculateLegacyBankBalanceInCents } from '../../utils/monthlyBalance';
import { calculateBankBalanceAdjustment, canChangeBankBalanceAdjustment } from '../../utils/bankBalanceAdjustment';
import { assertClientActionId, validateLedgerTransaction, type LedgerTransaction } from '../../utils/financialLedger';

function fail(message: string): never { throw new HttpsError('failed-precondition', message); }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const toDate = (value: unknown): Date => value instanceof Timestamp ? value.toDate() : new Date(value as string);

// [[Ajuste de Saldo]]: datas civis de São Paulo, hoje em agora e passado no fim do dia.
function effectiveDate(value: unknown, now: Date): Date {
	const day = text(value);
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) fail('Escolha uma data válida até hoje.');
	const date = new Date(`${day}T23:59:59.999-03:00`);
	if (Number.isNaN(date.valueOf()) || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date) !== day) {
		fail('Escolha uma data válida até hoje.');
	}
	return day === today ? now : date;
}

export const bankBalanceAdjustment = onCall({ region: 'southamerica-east1' }, async request => {
	const personId = request.auth?.uid;
	if (!personId) throw new HttpsError('unauthenticated', 'Entre na sua conta para ajustar o saldo.');
	const data = request.data as Record<string, unknown>;
	if (data?.expectedActorId !== undefined && data.expectedActorId !== personId) throw new HttpsError('unauthenticated', 'A conta autenticada mudou; confirme novamente na sessão atual.');
	const action = data?.action;
	if (!['preview', 'save', 'revert'].includes(String(action))) throw new HttpsError('invalid-argument', 'Ação inválida.');
	const bankId = text(data.bankId);
	if (!bankId || bankId.includes('/')) throw new HttpsError('invalid-argument', 'Selecione um banco válido.');
	const clientActionId = text(data.clientActionId);
	if (action !== 'preview') {
		try { assertClientActionId(clientActionId); } catch { throw new HttpsError('invalid-argument', 'Identificador da ação inválido.'); }
	}
	const now = new Date();
	const date = action === 'revert' ? now : effectiveDate(data.date, now);
	const description = text(data.description);
	const target = data.targetBalanceInCents;
	if (action === 'save' && (!Number.isSafeInteger(target) || description.length > 2000)) {
		throw new HttpsError('invalid-argument', 'Informe um saldo válido e uma descrição de até 2000 caracteres.');
	}
	if (action === 'save' && (target as number) < 0 && description.length < 3) fail('Descreva o motivo para registrar um saldo negativo.');
	const adjustmentId = text(data.adjustmentId);
	if (adjustmentId.includes('/')) throw new HttpsError('invalid-argument', 'Ajuste inválido.');
	const fingerprint = createHash('sha256').update(JSON.stringify({ action, bankId, date: text(data.date), adjustmentId,
		targetBalanceInCents: data.targetBalanceInCents ?? null, expectedPreviousBalanceInCents: data.expectedPreviousBalanceInCents ?? null,
		description, expectedFingerprint: data.expectedFingerprint ?? null })).digest('hex');
	const db = getFirestore();
	return db.runTransaction(async transaction => {
		const user = await transaction.get(db.doc(`users/${personId}`));
		if (!user.exists) throw new HttpsError('permission-denied', 'Usuário não encontrado.');
		const userData = user.data()!;
		const groupId = text(userData.financialGroupId) || null;
		const operationRef = db.doc(`bankBalanceAdjustmentOperations/${personId}_${clientActionId || 'preview'}`);
		if (action !== 'preview') {
			const operation = await transaction.get(operationRef);
			if (operation.exists) {
				if (operation.data()?.fingerprint !== fingerprint) fail('Os argumentos do ajuste mudaram sob o mesmo identificador.');
				return operation.data()!.result;
			}
		}
		const originalRef = adjustmentId ? db.doc(`bankBalanceAdjustments/${adjustmentId}`) : null;
		const originalSnapshot = originalRef ? await transaction.get(originalRef) : null;
		const original = originalSnapshot?.data();
		if (adjustmentId && (!original || original.bankId !== bankId || original.personId !== personId || !canChangeBankBalanceAdjustment(original as Parameters<typeof canChangeBankBalanceAdjustment>[0]))) {
			throw new HttpsError('permission-denied', 'Este ajuste já foi revertido, substituído ou pertence a outra pessoa.');
		}
		if (action === 'revert' && !original) fail('Selecione o ajuste que será revertido.');
		if (original && typeof data.expectedFingerprint === 'string' && createAssistantRecordFingerprint(original) !== data.expectedFingerprint) fail('O ajuste mudou após o resumo; confira a proposta atual.');
		const relatedIds = Array.isArray(userData.relatedIdUsers) ? userData.relatedIdUsers : [];
		const allowedIds = new Set([personId, ...relatedIds]);
		let accountId: string | null = null;
		let accountBalance = 0;
		let previousBalance: number | null = null;
		let originalContribution = 0;
		if (groupId) {
			const group = await transaction.get(db.doc(`financialGroups/${groupId}`));
			if (group.data()?.status !== 'active' || group.data()?.members?.[personId] !== 'admin') {
				throw new HttpsError('permission-denied', 'O ajuste de saldo deste grupo exige acesso de administrador.');
			}
			const accounts = await transaction.get(db.collection('financialAccounts').where('groupId', '==', groupId));
			const account = accounts.docs.find(item => item.data().kind === 'bank' && (item.id === bankId || item.data().legacyBankId === bankId));
			if (!account || account.data().archivedAt || account.data().isActive === false) fail('Selecione um banco ativo do seu grupo.');
			accountId = account.id;
			accountBalance = account.data().currentBalanceInCents;
			const [events, reconciliations] = await Promise.all([
				transaction.get(db.collection('ledgerTransactions').where('groupId', '==', groupId).where('effectiveAt', '>', Timestamp.fromDate(date))),
				transaction.get(db.collection('accountReconciliations').where('groupId', '==', groupId).where('accountId', '==', accountId).orderBy('effectiveAt', 'desc').limit(1)),
			]);
			const opening = reconciliations.docs[0];
			const openingTime = opening ? toDate(opening.data().effectiveAt).valueOf() : -Infinity;
			if (action !== 'revert' && date.valueOf() <= openingTime) fail('Escolha uma data posterior ao saldo de abertura mais recente.');
			const laterDelta = events.docs.reduce((sum, item) => {
				const event = item.data();
				return sum + (toDate(event.effectiveAt) > date ? event.legs.find((leg: { accountId: string }) => leg.accountId === accountId)?.deltaInCents ?? 0 : 0);
			}, 0);
			previousBalance = accountBalance - laterDelta;
			originalContribution = original && toDate(original.date).valueOf() > openingTime ? original.differenceInCents : 0;
			if (original && toDate(original.date) <= date) previousBalance -= originalContribution;
		} else {
			const bank = await transaction.get(db.doc(`banks/${bankId}`));
			if (!bank.exists || !allowedIds.has(bank.data()!.personId) || bank.data()!.isActive === false) {
				throw new HttpsError('permission-denied', 'Selecione um banco ativo autorizado para sua conta.');
			}
			const load = async (name: string) => {
				const snapshot = await transaction.get(db.collection(name).where('bankId', '==', bankId));
				return snapshot.docs.filter(item => allowedIds.has(item.data().personId)).map(item => ({ id: item.id, ...item.data() }) as {
					id: string; bankId?: string; year?: number; month?: number; valueInCents?: number;
					differenceInCents?: number; date?: unknown; createdAt?: unknown; initialValueInCents?: number;
					initialInvestedInCents?: number;
				});
			};
			const [snapshots, expenses, gains, cashRescues, investments, adjustments] = await Promise.all([
				load('monthlyBalances'), load('expenses'), load('gains'), load('cashRescues'), load('financeInvestments'), load('bankBalanceAdjustments'),
			]);
			previousBalance = calculateLegacyBankBalanceInCents({
				bankId, snapshots, expenses, gains, cashRescues, investments,
				balanceAdjustments: adjustments.filter(item => item.id !== adjustmentId),
				asOfDate: date, snapshotTimeZone: 'America/Sao_Paulo',
			});
		}
		if (previousBalance === null) fail('Registre o saldo de abertura do banco antes de ajustar.');
		let difference = 0;
		if (action === 'save') {
			try { difference = calculateBankBalanceAdjustment(previousBalance, target as number); }
			catch { throw new HttpsError('invalid-argument', 'Informe um saldo dentro do limite permitido.'); }
		}
		if (action === 'preview') return { previousBalanceInCents: previousBalance };
		if (action === 'save' && typeof data.expectedPreviousBalanceInCents === 'number' && data.expectedPreviousBalanceInCents !== previousBalance) {
			fail('O saldo mudou durante o preenchimento. Confira a nova prévia e tente novamente.');
		}
		if (action === 'save' && difference === 0 && !original) fail('O saldo informado já corresponde ao saldo do Lumus.');
		if (groupId && accountBalance - originalContribution + difference < 0 && description.length < 3 && !original?.description) {
			fail('Descreva o motivo para registrar um saldo negativo.');
		}
		const id = `${personId}_${clientActionId}`;
		const writeEvent = (eventId: string, eventDate: Date, delta: number, previous: number, counted: number, reversalOf: string | null) => {
			transaction.set(db.doc(`bankBalanceAdjustments/${eventId}`), {
				bankId, personId, groupId, date: Timestamp.fromDate(eventDate), differenceInCents: delta,
				previousBalanceInCents: previous, targetBalanceInCents: counted,
				description: reversalOf ? `Estorno: ${original?.description || 'Ajuste de saldo'}` : description || null,
				status: 'active', reversesAdjustmentId: reversalOf, replacesAdjustmentId: !reversalOf ? adjustmentId || null : null,
				ledgerTransactionId: groupId && delta !== 0 ? `bank-adjustment-${eventId}` : null,
				createdAt: FieldValue.serverTimestamp(),
			});
			if (groupId && accountId && delta !== 0) writeLedgerEvent(transaction, {
				id: `bank-adjustment-${eventId}`, groupId, actorId: personId, effectiveAt: eventDate,
				clientActionId: reversalOf ? `${clientActionId.slice(0, 155)}_undo` : clientActionId, kind: reversalOf ? 'reversal' : 'reconciliation_adjustment',
				reversesTransactionId: reversalOf ? original?.ledgerTransactionId || `migration-bank-adjustment-${reversalOf}` : null,
				note: description || original?.description || 'Ajuste de saldo', overdraftReason: description || original?.description || null,
				sourceReferences: [{ collection: 'bankBalanceAdjustments', id: eventId }],
				legs: [{ accountId, deltaInCents: delta }, { accountId: null, deltaInCents: -delta }],
			});
		};
		if (original && originalRef) {
			writeEvent(`${id}_undo`, toDate(original.date), -original.differenceInCents, original.targetBalanceInCents, original.previousBalanceInCents, adjustmentId);
			transaction.update(originalRef, { status: action === 'save' ? 'replaced' : 'reversed', reversedBy: personId, reversedAt: FieldValue.serverTimestamp(), reversalId: `${id}_undo` });
		}
		if (action === 'save') writeEvent(id, date, difference, previousBalance, target as number, null);
		if (groupId && accountId) {
			const next = accountBalance - originalContribution + difference;
			if (!Number.isSafeInteger(next)) fail('Saldo fora do limite permitido.');
			transaction.update(db.doc(`financialAccounts/${accountId}`), { currentBalanceInCents: next, updatedAt: FieldValue.serverTimestamp() });
		}
		const result = { adjustmentId: action === 'save' ? id : `${id}_undo`, previousBalanceInCents: previousBalance, differenceInCents: difference };
		transaction.set(operationRef, { personId, fingerprint, result, createdAt: FieldValue.serverTimestamp() });
		return result;
	});
});

function writeLedgerEvent(transaction: Transaction, event: LedgerTransaction) {
	validateLedgerTransaction(event);
	const db = getFirestore();
	transaction.set(db.doc(`ledgerTransactions/${event.id}`), { ...event, effectiveAt: Timestamp.fromDate(event.effectiveAt), createdAt: FieldValue.serverTimestamp() });
	transaction.set(db.doc(`financialAuditEvents/${event.id}`), { groupId: event.groupId, actorId: event.actorId, action: event.kind, transactionId: event.id, createdAt: FieldValue.serverTimestamp() });
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(event.effectiveAt);
	const month = `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`;
	const account = event.legs.find(leg => leg.accountId)!;
	transaction.set(db.doc(`financeMonthlySummaries/${event.groupId}-${month}`), {
		version: 1, scopeType: 'group', scopeId: event.groupId, groupId: event.groupId, monthKey: month,
		transactionCount: FieldValue.increment(1), bankDeltaInCents: { [account.accountId!]: FieldValue.increment(account.deltaInCents) }, updatedAt: FieldValue.serverTimestamp(),
	}, { merge: true });
}
