import { executeLegacyFinancialMovementFirebase } from '@/functions/LegacyFinancialMovementFirebase';
import { auth, db } from '@/FirebaseConfig';
import { validateAssistantExecutionAuthorization } from '@/services/lumusAssistant/assistantAuthorization';
import {
	completeFinancialRecurringFirebase, manageFinancialMetadataFirebase, correctFinancialLedgerMovementFirebase, getFinancialLedgerContextFirebase, manageFinancialLedgerAccountFirebase, parseFinancialAccount,
	postLedgerMovementFirebase, reconcileFinancialLedgerAccountFirebase, reverseFinancialLedgerTransactionFirebase,
	transferFundsFinancialLedgerFirebase, type FinancialLedgerContext,
} from '@/functions/FinancialLedgerFirebase';
import { runBankBalanceAdjustmentFirebase } from '@/functions/BankBalanceAdjustmentFirebase';
import { getTagReferenceSummary } from '@/functions/TagFirebase';
import { getLegacyBankBalanceInCentsFirebase } from '@/functions/BankFirebase';
import type {
	AssistantActionKind,
	AssistantCatalogType,
	AssistantDraftAction,
	AssistantExecuteResult,
	AssistantResolvedCatalog,
	AssistantResolvedCatalogItem,
	FinanceCommandService,
} from '@/types/lumusAssistant';
import {
	createAssistantRecordFingerprint,
	findAssistantCatalogItem,
	loadAssistantResolvedCatalog,
	prepareAssistantActions,
	updatePreparedAssistantDraft,
} from '@/services/lumusAssistant/assistantCatalogService';
import { parseIsoDateAtLocalNoon } from '@/utils/lumusAssistant';
import { getActionValidation, getFieldDefinition } from '@/utils/lumusAssistantSchemas';
import {
	cancelMandatoryExpenseNotification,
	scheduleMandatoryExpenseNotification,
	suppressMandatoryExpenseNotificationCycle,
} from '@/utils/mandatoryExpenseNotifications';
import {
	cancelMandatoryGainNotification,
	scheduleMandatoryGainNotification,
	suppressMandatoryGainNotificationCycle,
} from '@/utils/mandatoryGainNotifications';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import { getInvestmentAssetType, getInvestmentValuationMethod } from '@/utils/investmentPortfolio';
import { findTagIconByLabel } from '@/utils/tagIconCatalog';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
import { getMandatoryInstallmentValueInCents, normalizeMandatoryInstallmentTotal, resolveMandatoryInstallmentsCompleted } from '@/utils/mandatoryInstallments';
import { MANDATORY_REMINDER_CONFIG_VERSION } from '@/utils/mandatoryReminderConfig';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	runTransaction,
	serverTimestamp,
	where,
	type DocumentReference,
	type Transaction,
} from 'firebase/firestore';

type FirestoreRecord = Record<string, unknown>;
type ExecuteContext = {
	personId: string;
	draft: AssistantDraftAction;
	payload: Record<string, unknown>;
	catalog: AssistantResolvedCatalog;
};

class FinanceCommandError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = 'FinanceCommandError';
	}
}

const fail = (message: string, code: string): never => {
	throw new FinanceCommandError(message, code);
};

const getString = (payload: Record<string, unknown>, key: string) => {
	const value = payload[key];
	if (typeof value !== 'string' || !value.trim()) {
		return fail(`O campo ${key} não foi informado.`, 'invalid-payload');
	}
	return value.trim();
};

const getOptionalString = (payload: Record<string, unknown>, key: string) => {
	const value = payload[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getInteger = (payload: Record<string, unknown>, key: string) => {
	const value = payload[key];
	if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
		return fail(`O campo ${key} precisa ser um número inteiro.`, 'invalid-payload');
	}
	return value;
};

const parseActionDate = (payload: Record<string, unknown>, dateKey = 'date') => {
	const parsed = parseIsoDateAtLocalNoon(payload[dateKey], payload.time);
	if (!parsed) {
		return fail('A data informada não é válida.', 'invalid-date');
	}
	return parsed;
};

const toDate = (value: unknown): Date | null => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (value && typeof value === 'object' && 'toDate' in value) {
		const method = (value as { toDate?: unknown }).toDate;
		if (typeof method === 'function') {
			const date = method.call(value) as Date;
			return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
		}
	}
	return null;
};

const createDocumentId = (personId: string, actionId: string, suffix: string) => {
	const fingerprint = createAssistantRecordFingerprint({ personId, actionId, suffix });
	return `assistant_${fingerprint}_${suffix.replace(/[^a-z0-9_-]/gi, '').slice(0, 24)}`;
};

const legacyReceiptReference = (context: ExecuteContext) => doc(db, 'assistantOperationReceipts', createDocumentId(context.personId, context.draft.clientActionId, 'receipt'));
const legacyReceiptFingerprint = (context: ExecuteContext) => createAssistantRecordFingerprint({ kind: context.draft.kind, payload: context.payload, dependencies: context.draft.dependsOnActionIds });
const readLegacyAssistantReceipt = async (context: ExecuteContext): Promise<AssistantExecuteResult | null> => {
	const receipt = await getDoc(legacyReceiptReference(context));
	if (!receipt.exists()) return null;
	const data = receipt.data() as FirestoreRecord;
	assertOwned(data, context.personId);
	if (data.fingerprint !== legacyReceiptFingerprint(context)) return fail('Os argumentos mudaram depois que este pedido foi registrado. Envie um novo pedido.', 'idempotency-conflict');
	return { success: true, message: 'Operação já registrada; nenhum lançamento foi repetido.', recordHandle: `action:${context.draft.clientActionId}` };
};
const runLegacyAssistantTransaction = async (context: ExecuteContext, perform: (transaction: Transaction) => Promise<void>) => {
	await runTransaction(db, async transaction => {
		const reference = legacyReceiptReference(context); const receipt = await transaction.get(reference);
		if (receipt.exists()) {
			const data = receipt.data() as FirestoreRecord; assertOwned(data, context.personId);
			if (data.fingerprint !== legacyReceiptFingerprint(context)) return fail('Os argumentos mudaram depois que este pedido foi registrado.', 'idempotency-conflict');
			return;
		}
		if (auth.currentUser?.uid !== context.personId) return fail('A sessão mudou. Envie o pedido novamente.', 'authentication');
		await perform(transaction);
		transaction.set(reference, { personId: context.personId, clientActionId: context.draft.clientActionId, kind: context.draft.kind, fingerprint: legacyReceiptFingerprint(context), createdAt: new Date() });
	});
};

const assertOwned = (data: FirestoreRecord, personId: string) => {
	if (data.personId !== personId) {
		return fail('Este registro não pertence à conta atual e está disponível somente para leitura.', 'read-only');
	}
};

const getReferenceSource = (
	kind: AssistantActionKind,
	field: 'recordRef' | 'bankRef' | 'sourceBankRef' | 'targetBankRef' | 'categoryRef' | 'investmentRef',
): AssistantCatalogType | undefined => getFieldDefinition(kind, field).choiceSource;

const resolveItem = (
	context: ExecuteContext,
	field: 'recordRef' | 'bankRef' | 'sourceBankRef' | 'targetBankRef' | 'categoryRef' | 'investmentRef',
	options: { allowCash?: boolean } = {},
): AssistantResolvedCatalogItem => {
	const source = getReferenceSource(context.draft.kind, field);
	if (!source) {
		return fail('Não foi possível resolver a referência solicitada.', 'invalid-reference');
	}
	const handle = context.payload[field];
	if (typeof handle === 'string' && handle.startsWith('action:')) {
		return fail('Conclua primeiro a ação da qual este registro depende.', 'dependency-pending');
	}
	const item = findAssistantCatalogItem(context.catalog, source, handle);
	if (!item || (item.ownerScope === 'related_read_only' && field !== 'categoryRef')) {
		return fail('A opção selecionada não está mais disponível.', 'invalid-reference');
	}
	if (field !== 'recordRef' && item.data?.isActive === false) return fail('Este banco está desativado. Reative-o antes de registrar movimentos.', 'inactive-account');
	if (item.realId === null && !options.allowCash) {
		return fail('Selecione uma conta bancária para esta operação.', 'bank-required');
	}
	return item;
};

const assertFreshSnapshot = (
	draft: AssistantDraftAction,
	item: AssistantResolvedCatalogItem,
	currentData: FirestoreRecord,
) => {
	if (!draft.originalSnapshot || draft.originalSnapshot.recordHandle !== item.handle) {
		return;
	}
	const fingerprint = createAssistantRecordFingerprint(currentData);
	if (fingerprint !== draft.originalSnapshot.fingerprint) {
		return fail('Este registro mudou depois do resumo. Revise os dados novamente.', 'stale');
	}
};

const readOwnedItem = async (
	context: ExecuteContext,
	field: 'recordRef' | 'investmentRef',
	options: { skipSnapshotCheck?: boolean } = {},
) => {
	const item = resolveItem(context, field);
	if (!item.collection || !item.realId) {
		return fail('O registro selecionado é inválido.', 'invalid-reference');
	}
	const reference = doc(db, item.collection, item.realId);
	const snapshot = await getDoc(reference);
	if (!snapshot.exists()) {
		return fail('O registro não existe mais.', 'not-found');
	}
	const data = snapshot.data() as FirestoreRecord;
	assertOwned(data, context.personId);
	if (!options.skipSnapshotCheck) assertFreshSnapshot(context.draft, item, data);
	return { item, reference, data };
};

const readOwnedInTransaction = async (
	transaction: Transaction,
	reference: DocumentReference,
	personId: string,
) => {
	const snapshot = await transaction.get(reference);
	if (!snapshot.exists()) {
		return fail('O registro não existe mais.', 'not-found');
	}
	const data = snapshot.data() as FirestoreRecord;
	assertOwned(data, personId);
	return data;
};

const validateLegacyCategoryReference = async (transaction: Transaction, categoryId: unknown, type: 'expense' | 'gain') => {
	if (typeof categoryId !== 'string') return;
	const category = await transaction.get(doc(db, 'tags', categoryId));
	if (!category.exists()) return fail('A categoria não existe mais. Escolha outra categoria na conversa.', 'not-found');
	const data = category.data() as FirestoreRecord;
	if (data.usageType !== undefined && data.usageType !== 'both' && data.usageType !== type) return fail('Essa categoria não aceita esse tipo de lançamento.', 'invalid-reference');
};
const validateLegacyBankReference = async (transaction: Transaction, bankId: string | null, personId: string) => {
	if (bankId === null) return;
	const bank = await readOwnedInTransaction(transaction, doc(db, 'banks', bankId), personId);
	if (bank.isActive === false) return fail('Esse banco foi desativado. Ative-o ou escolha outro banco na conversa.', 'inactive-account');
};

const getReminderTime = (payload: Record<string, unknown>) => {
	const value = typeof payload.reminderTime === 'string' ? payload.reminderTime : '09:00';
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	return { hour: match ? Number(match[1]) : 9, minute: match ? Number(match[2]) : 0 };
};

const resolveCurrentInvestmentValue = (data: FirestoreRecord) => {
	for (const key of ['currentValueInCents', 'lastManualSyncValueInCents', 'initialValueInCents', 'initialInvestedInCents']) {
		const value = data[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.max(0, Math.round(value));
		}
	}
	return 0;
};

const resolveInitialInvestmentValue = (data: FirestoreRecord) => {
	for (const key of ['initialValueInCents', 'initialInvestedInCents', 'currentValueInCents', 'lastManualSyncValueInCents']) {
		const value = data[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return Math.max(0, Math.round(value));
		}
	}
	return 0;
};

const loadOwnCurrentBankBalance = async (
	personId: string,
	bankId: string,
	referenceDate: Date,
): Promise<number | null> => {
	const result = await getLegacyBankBalanceInCentsFirebase({ personId, bankId, asOfDate: referenceDate });
	if (!result.success) {
		throw result.error;
	}
	return result.data;
};

const ensureBankBalance = async (
	personId: string,
	bankId: string,
	date: Date,
	requiredInCents: number,
) => {
	const available = await loadOwnCurrentBankBalance(personId, bankId, date);
	if (available === null) {
		return fail('Registre o saldo mensal do banco antes de concluir esta operação.', 'balance-unavailable');
	}
	if (available < requiredInCents) {
		return fail('O banco selecionado não tem saldo suficiente para esta operação.', 'insufficient-balance');
	}
	return available;
};

const createMovement = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef', { allowCash: true });
	const category = resolveItem(context, 'categoryRef');
	const date = parseActionDate(context.payload);
	const valueInCents = getInteger(context.payload, 'valueInCents');
	const documentId = createDocumentId(context.personId, context.draft.clientActionId, type);
	const reference = doc(db, type === 'expense' ? 'expenses' : 'gains', documentId);
	const createdAt = new Date();
	await runLegacyAssistantTransaction(context, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		await validateLegacyBankReference(transaction, bank.realId ?? null, context.personId);
		await validateLegacyCategoryReference(transaction, category.realId, type);
		const common = {
			name: getString(context.payload, 'name'),
			valueInCents,
			tagId: category.realId,
			bankId: bank.realId,
			date,
			personId: context.personId,
			explanation: getOptionalString(context.payload, 'explanation'),
			moneyFormat: bank.realId === null,
			isBankTransfer: false,
			bankTransferPairId: null,
			bankTransferDirection: null,
			bankTransferSourceBankId: null,
			bankTransferTargetBankId: null,
			bankTransferSourceBankNameSnapshot: null,
			bankTransferTargetBankNameSnapshot: null,
			bankTransferExpenseId: null,
			bankTransferGainId: null,
			assistantActionId: context.draft.clientActionId,
			createdAt,
			updatedAt: createdAt,
		};
		transaction.set(reference, type === 'expense'
			? {
				...common,
				isInvestmentDeposit: false,
				investmentId: null,
				investmentNameSnapshot: null,
			  }
			: {
				...common,
				paymentFormats: Array.isArray(context.payload.paymentFormats) ? context.payload.paymentFormats : [],
				isInvestmentRedemption: false,
				investmentId: null,
				investmentNameSnapshot: null,
			  });
	});
	return {
		success: true,
		message: type === 'expense' ? 'Despesa registrada com sucesso.' : 'Ganho registrado com sucesso.',
		recordHandle: `action:${context.draft.clientActionId}`,
	};
};

const updateMovement = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	const expectedCollection = type === 'expense' ? 'expenses' : 'gains';
	if (owned.item.collection !== expectedCollection) {
		return fail('O registro selecionado não corresponde a esta operação.', 'invalid-reference');
	}
	if (
		owned.data.isBankTransfer ||
		(type === 'expense' ? owned.data.isInvestmentDeposit : owned.data.isInvestmentRedemption)
	) {
		return fail('Este lançamento usa um fluxo específico de desfazer ou resgatar e não pode ser editado diretamente.', 'linked-record');
	}
	const updates: FirestoreRecord = { updatedAt: new Date() };
	if (typeof context.payload.name === 'string') updates.name = context.payload.name.trim();
	if (typeof context.payload.valueInCents === 'number') updates.valueInCents = context.payload.valueInCents;
	if (typeof context.payload.explanation === 'string' || context.payload.explanation === null) {
		updates.explanation = context.payload.explanation;
	}
	if (typeof context.payload.date === 'string') updates.date = parseActionDate(context.payload);
	if (typeof context.payload.categoryRef === 'string') updates.tagId = resolveItem(context, 'categoryRef').realId;
	if (typeof context.payload.bankRef === 'string') {
		const bank = resolveItem(context, 'bankRef', { allowCash: true });
		updates.bankId = bank.realId;
		updates.moneyFormat = bank.realId === null;
	}
	if (type === 'gain' && Array.isArray(context.payload.paymentFormats)) {
		updates.paymentFormats = context.payload.paymentFormats;
	}
	if (Object.keys(updates).length === 1) {
		return fail('Informe pelo menos uma alteração para este registro.', 'no-changes');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		if (typeof updates.bankId === 'string') await validateLegacyBankReference(transaction, updates.bankId, context.personId);
		if (typeof updates.tagId === 'string') await validateLegacyCategoryReference(transaction, updates.tagId, type);
		transaction.update(owned.reference, updates);
	});
	return { success: true, message: type === 'expense' ? 'Despesa atualizada.' : 'Ganho atualizado.' };
};

const deleteMovement = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	const expectedCollection = type === 'expense' ? 'expenses' : 'gains';
	if (owned.item.collection !== expectedCollection) {
		return fail('O registro selecionado não corresponde a esta operação.', 'invalid-reference');
	}
	if (
		owned.data.isBankTransfer ||
		(type === 'expense' ? owned.data.isInvestmentDeposit : owned.data.isInvestmentRedemption)
	) {
		return fail('Use o fluxo específico para desfazer este lançamento vinculado.', 'linked-record');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	return { success: true, message: type === 'expense' ? 'Despesa excluída.' : 'Ganho excluído.' };
};

const upsertMonthlyBalance = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef');
	const cycle = getString(context.payload, 'cycle');
	const [year, month] = cycle.split('-').map(Number);
	const valueInCents = getInteger(context.payload, 'valueInCents');
	const existing = await getDocs(
		query(
			collection(db, 'monthlyBalances'),
			where('personId', '==', context.personId),
			where('bankId', '==', bank.realId),
			where('year', '==', year),
			where('month', '==', month),
		),
	);
	const reference = existing.empty
		? doc(db, 'monthlyBalances', createDocumentId(context.personId, context.draft.clientActionId, 'balance'))
		: existing.docs[0]!.ref;
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await transaction.get(reference);
		if (current.exists()) {
			assertOwned(current.data() as FirestoreRecord, context.personId);
			transaction.set(reference, { valueInCents, updatedAt: new Date() }, { merge: true });
			return;
		}
		transaction.set(reference, {
			personId: context.personId,
			bankId: bank.realId,
			year,
			month,
			valueInCents,
			assistantActionId: context.draft.clientActionId,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});
	return { success: true, message: `Saldo de ${String(month).padStart(2, '0')}/${year} salvo.` };
};

const createTransfer = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const source = resolveItem(context, 'sourceBankRef'); const target = resolveItem(context, 'targetBankRef');
	await executeLegacyFinancialMovementFirebase({ kind: 'create_transfer', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), sourceBankId: source.realId!, targetBankId: target.realId!, valueInCents: getInteger(context.payload, 'valueInCents'), date: parseActionDate(context.payload), description: getOptionalString(context.payload, 'description') });
	return { success: true, message: 'Transferência registrada com segurança.' };
};

const createCashWithdrawal = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef');
	await executeLegacyFinancialMovementFirebase({ kind: 'create_cash_withdrawal', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), bankId: bank.realId!, valueInCents: getInteger(context.payload, 'valueInCents'), date: parseActionDate(context.payload), description: getOptionalString(context.payload, 'description') });
	return { success: true, message: 'Saque em dinheiro registrado.' };
};

const undoCashWithdrawal = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'cashRescues') {
		return fail('O registro selecionado não é um saque.', 'invalid-reference');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	return { success: true, message: 'Saque desfeito.' };
};

const buildRecurringFields = (context: ExecuteContext) => {
	const category = resolveItem(context, 'categoryRef');
	const reminderTime = getReminderTime(context.payload);
	const installmentTotal =
		typeof context.payload.installmentTotal === 'number'
			? Math.max(1, Math.trunc(context.payload.installmentTotal))
			: null;
	return {
		name: getString(context.payload, 'name'),
		valueInCents: getInteger(context.payload, 'valueInCents'),
		dueDay: getInteger(context.payload, 'dueDay'),
		usesBusinessDays: Boolean(context.payload.usesBusinessDays),
		tagId: category.realId,
		personId: context.personId,
		description: getOptionalString(context.payload, 'description'),
		reminderEnabled: Boolean(context.payload.reminderEnabled),
		reminderConfigVersion: MANDATORY_REMINDER_CONFIG_VERSION,
		reminderDaysBefore:
			typeof context.payload.reminderDaysBefore === 'number'
				? Math.min(3, Math.max(1, Math.trunc(context.payload.reminderDaysBefore)))
				: 1,
		reminderOnDueDate: Boolean(context.payload.reminderOnDueDate),
		reminderHour: reminderTime.hour,
		reminderMinute: reminderTime.minute,
		installmentTotal,
		installmentTotalValueInCents: installmentTotal === null ? null : typeof context.payload.installmentTotalValueInCents === 'number' ? context.payload.installmentTotalValueInCents : getInteger(context.payload, 'valueInCents') * installmentTotal,
		installmentsCompleted: 0,
		completedCycles: {},
		assistantCycleHistoryComplete: true,
		installmentStartDate:
			typeof context.payload.installmentStartDate === 'string'
				? parseIsoDateAtLocalNoon(context.payload.installmentStartDate)
				: null,
		installmentEndDate:
			typeof context.payload.installmentEndDate === 'string'
				? parseIsoDateAtLocalNoon(context.payload.installmentEndDate)
				: null,
	};
};

const scheduleRecurringNotification = async (
	type: 'expense' | 'gain',
	personId: string,
	templateId: string,
	data: FirestoreRecord,
): Promise<string | undefined> => {
	if (!data.reminderEnabled) {
		return undefined;
	}
	try {
		const common = {
			accountId: personId,
			name: typeof data.name === 'string' ? data.name : type === 'expense' ? 'Gasto obrigatório' : 'Ganho obrigatório',
			dueDay: typeof data.dueDay === 'number' ? data.dueDay : 1,
			usesBusinessDays: Boolean(data.usesBusinessDays),
			reminderHour: typeof data.reminderHour === 'number' ? data.reminderHour : 9,
			reminderMinute: typeof data.reminderMinute === 'number' ? data.reminderMinute : 0,
			reminderDaysBefore: typeof data.reminderDaysBefore === 'number' ? data.reminderDaysBefore : type === 'expense' ? 1 : 0,
			reminderOnDueDate: typeof data.reminderOnDueDate === 'boolean' ? data.reminderOnDueDate : type === 'gain',
			description: typeof data.description === 'string' ? data.description : null,
			activeFromDate: toDate(data.installmentStartDate),
			activeThroughDate: toDate(data.installmentEndDate),
		};
		const result = type === 'expense'
			? await scheduleMandatoryExpenseNotification({ ...common, expenseId: templateId })
			: await scheduleMandatoryGainNotification({ ...common, gainTemplateId: templateId });
		return result.success ? undefined : result.message;
	} catch {
		return 'A operação foi salva, mas o lembrete local não pôde ser agendado. Você pode tentar novamente depois.';
	}
};

const createRecurring = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const data = buildRecurringFields(context);
	if (data.installmentTotal !== null && data.installmentTotalValueInCents !== null) data.valueInCents = Math.floor(data.installmentTotalValueInCents / data.installmentTotal);
	const collectionName = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	const reference = doc(db, collectionName, createDocumentId(context.personId, context.draft.clientActionId, `mandatory_${type}`));
	await runLegacyAssistantTransaction(context, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		await validateLegacyCategoryReference(transaction, data.tagId, type);
		const now = new Date();
		transaction.set(reference, {
			...data,
			...(type === 'expense'
				? { lastPaymentExpenseId: null, lastPaymentCycle: null, lastPaymentDate: null }
				: { lastReceiptGainId: null, lastReceiptCycle: null, lastReceiptDate: null }),
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
	});
	const notificationWarning = await scheduleRecurringNotification(type, context.personId, reference.id, data);
	return {
		success: true,
		message: type === 'expense' ? 'Gasto obrigatório criado.' : 'Ganho obrigatório criado.',
		recordHandle: `action:${context.draft.clientActionId}`,
		notificationWarning,
		notificationRetry: notificationWarning
			? { operation: 'sync', recurringType: type, templateId: reference.id }
			: undefined,
	};
};

const updateRecurring = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	const expected = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	if (owned.item.collection !== expected) {
		return fail('O registro obrigatório selecionado é inválido.', 'invalid-reference');
	}
	const updates: FirestoreRecord = { updatedAt: new Date() };
	if (typeof context.payload.name === 'string') updates.name = context.payload.name.trim();
	if (typeof context.payload.valueInCents === 'number') updates.valueInCents = context.payload.valueInCents;
	if (typeof context.payload.dueDay === 'number') updates.dueDay = context.payload.dueDay;
	if (typeof context.payload.usesBusinessDays === 'boolean') updates.usesBusinessDays = context.payload.usesBusinessDays;
	if (typeof context.payload.description === 'string' || context.payload.description === null) updates.description = context.payload.description;
	if (typeof context.payload.categoryRef === 'string') updates.tagId = resolveItem(context, 'categoryRef').realId;
	if (typeof context.payload.reminderEnabled === 'boolean') updates.reminderEnabled = context.payload.reminderEnabled;
	if (typeof context.payload.reminderDaysBefore === 'number') updates.reminderDaysBefore = context.payload.reminderDaysBefore;
	if (typeof context.payload.reminderOnDueDate === 'boolean') updates.reminderOnDueDate = context.payload.reminderOnDueDate;
	if (typeof context.payload.reminderTime === 'string') {
		const reminderTime = getReminderTime(context.payload);
		updates.reminderHour = reminderTime.hour;
		updates.reminderMinute = reminderTime.minute;
	}
	if (typeof context.payload.installmentTotalValueInCents === 'number') updates.installmentTotalValueInCents = context.payload.installmentTotalValueInCents;
	if (context.payload.installmentTotal === null || typeof context.payload.installmentTotal === 'number') {
		updates.installmentTotal = context.payload.installmentTotal;
		if (context.payload.installmentTotal === null) {
			updates.installmentsCompleted = 0;
			updates.installmentStartDate = null;
			updates.installmentEndDate = null;
		}
	}
	if (typeof context.payload.installmentStartDate === 'string' || context.payload.installmentStartDate === null) {
		updates.installmentStartDate = context.payload.installmentStartDate
			? parseIsoDateAtLocalNoon(context.payload.installmentStartDate)
			: null;
	}
	if (typeof context.payload.installmentEndDate === 'string' || context.payload.installmentEndDate === null) {
		updates.installmentEndDate = context.payload.installmentEndDate
			? parseIsoDateAtLocalNoon(context.payload.installmentEndDate)
			: null;
	}
	if (Object.keys(updates).length === 1) {
		return fail('Informe pelo menos uma alteração.', 'no-changes');
	}
	let merged: FirestoreRecord = {};
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		if (typeof updates.tagId === 'string') await validateLegacyCategoryReference(transaction, updates.tagId, type);
		merged = { ...current, ...updates };
		const total = normalizeMandatoryInstallmentTotal(merged.installmentTotal);
		if (total !== null) {
			if (Number(current.installmentsCompleted ?? 0) > total) return fail('A quantidade é menor que as parcelas já concluídas.', 'installment-complete');
			const contract = typeof updates.installmentTotalValueInCents === 'number' ? updates.installmentTotalValueInCents
				: typeof updates.valueInCents === 'number' ? updates.valueInCents * total
				: typeof current.installmentTotalValueInCents === 'number' ? current.installmentTotalValueInCents : Number(merged.valueInCents) * total;
			if (!Number.isSafeInteger(contract) || contract < total) return fail('O total contratual precisa permitir pelo menos um centavo por parcela.', 'invalid-payload');
			updates.installmentTotalValueInCents = contract;
			updates.valueInCents = Math.floor(contract / total);
		} else updates.installmentTotalValueInCents = null;
		const start = toDate(merged.installmentStartDate); const end = toDate(merged.installmentEndDate);
		if (start && end && getCycleKeyFromDate(start) > getCycleKeyFromDate(end)) return fail('O fim do plano deve ocorrer após o início.', 'invalid-payload');
		merged = { ...current, ...updates };
		transaction.update(owned.reference, updates);
	});
	let notificationWarning: string | undefined;
	try {
		if (merged.reminderEnabled) {
			notificationWarning = await scheduleRecurringNotification(type, context.personId, owned.reference.id, merged);
		} else if (type === 'expense') {
			await cancelMandatoryExpenseNotification(context.personId, owned.reference.id);
		} else {
			await cancelMandatoryGainNotification(context.personId, owned.reference.id);
		}
	} catch {
		notificationWarning = 'A alteração foi salva, mas não foi possível atualizar o lembrete local.';
	}
	return {
		success: true,
		message: type === 'expense' ? 'Gasto obrigatório atualizado.' : 'Ganho obrigatório atualizado.',
		notificationWarning,
		notificationRetry: notificationWarning
			? { operation: 'sync', recurringType: type, templateId: owned.reference.id }
			: undefined,
	};
};

const deleteRecurring = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	const expected = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	if (owned.item.collection !== expected) {
		return fail('O registro obrigatório selecionado é inválido.', 'invalid-reference');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	let notificationWarning: string | undefined;
	try {
		if (type === 'expense') {
			await cancelMandatoryExpenseNotification(context.personId, owned.reference.id);
		} else {
			await cancelMandatoryGainNotification(context.personId, owned.reference.id);
		}
	} catch {
		notificationWarning = 'O registro foi excluído, mas a agenda local será limpa na próxima sincronização.';
	}
	return {
		success: true,
		message: type === 'expense' ? 'Gasto obrigatório excluído.' : 'Ganho obrigatório excluído.',
		notificationWarning,
		notificationRetry: notificationWarning
			? { operation: 'cancel', recurringType: type, templateId: owned.reference.id }
			: undefined,
	};
};

const retryRecurringNotification = async (
	personId: string,
	draft: AssistantDraftAction,
	_catalog: AssistantResolvedCatalog,
): Promise<AssistantExecuteResult> => {
	const retry = draft.result?.notificationRetry;
	if (!retry) {
		return fail('Este cartão não possui um lembrete que possa ser repetido.', 'notification-not-supported');
	}
	try {
		if (retry.operation === 'cancel') {
			if (retry.recurringType === 'expense') {
				await cancelMandatoryExpenseNotification(personId, retry.templateId);
			} else {
				await cancelMandatoryGainNotification(personId, retry.templateId);
			}
			return { success: true, message: 'Agenda local limpa sem repetir a exclusão.' };
		}

		const collectionName = retry.recurringType === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
		const snapshot = await getDoc(doc(db, collectionName, retry.templateId));
		if (!snapshot.exists()) return fail('O registro obrigatório não existe mais.', 'not-found');
		const data = snapshot.data() as FirestoreRecord;
		assertOwned(data, personId);

		if (retry.operation === 'suppress_cycle') {
			if (!retry.cycle) return fail('O ciclo do lembrete não está disponível.', 'invalid-payload');
			if (retry.recurringType === 'expense') {
				await suppressMandatoryExpenseNotificationCycle(personId, retry.templateId, retry.cycle);
			} else {
				await suppressMandatoryGainNotificationCycle(personId, retry.templateId, retry.cycle);
			}
			return { success: true, message: 'Lembrete do ciclo atualizado sem repetir o lançamento.' };
		}

		if (data.reminderEnabled) {
			const warning = await scheduleRecurringNotification(retry.recurringType, personId, retry.templateId, data);
			if (warning) return { success: false, message: warning, errorCode: 'notification-failed' };
		} else if (retry.recurringType === 'expense') {
			await cancelMandatoryExpenseNotification(personId, retry.templateId);
		} else {
			await cancelMandatoryGainNotification(personId, retry.templateId);
		}
		return { success: true, message: 'Lembrete local atualizado sem repetir a operação financeira.' };
	} catch {
		return {
			success: false,
			message: 'O lembrete ainda não pôde ser atualizado. A operação financeira continua salva.',
			errorCode: 'notification-failed',
		};
	}
};

const completeRecurringCycle = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	// [[Assistente Lumus]]: o retry do mesmo cartão consulta o lançamento idempotente
	// na transação antes de comparar o snapshot do template já atualizado.
	const template = await readOwnedItem(context, 'recordRef', { skipSnapshotCheck: true });
	const expected = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	if (template.item.collection !== expected) {
		return fail('O registro obrigatório selecionado é inválido.', 'invalid-reference');
	}
	const bank = resolveItem(context, 'bankRef', { allowCash: true });
	const date = parseActionDate(context.payload);
	const cycle = getCycleKeyFromDate(date);
	const movementCollection = type === 'expense' ? 'expenses' : 'gains';
	const movementRef = doc(
		db,
		movementCollection,
		createDocumentId(context.personId, context.draft.clientActionId, type === 'expense' ? 'mandatory_payment' : 'mandatory_receipt'),
	);
	await runLegacyAssistantTransaction(context, async transaction => {
		const currentTemplate = await readOwnedInTransaction(transaction, template.reference, context.personId);
		const existingMovement = await transaction.get(movementRef);
		if (existingMovement.exists()) {
			const existingData = existingMovement.data() as FirestoreRecord;
			assertOwned(existingData, context.personId);
			if (existingData.assistantActionId !== context.draft.clientActionId) {
				return fail('Este lançamento já pertence a outra operação.', 'duplicate-action');
			}
			return;
		}
		assertFreshSnapshot(context.draft, template.item, currentTemplate);
		const lastCycleKey = type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle';
		const completedCycles = currentTemplate.completedCycles && typeof currentTemplate.completedCycles === 'object' ? currentTemplate.completedCycles as FirestoreRecord : {};
		if (currentTemplate.assistantCycleHistoryComplete !== true && typeof currentTemplate[lastCycleKey] === 'string' && cycle < String(currentTemplate[lastCycleKey])) return fail('O histórico antigo guarda somente o último ciclo. Não é possível comprovar se esse período já foi concluído.', 'history-unavailable');
		if (currentTemplate[lastCycleKey] === cycle || completedCycles[cycle]) {
			return fail(
				type === 'expense' ? 'Este gasto já foi pago neste ciclo.' : 'Este ganho já foi recebido neste ciclo.',
				'already-completed-cycle',
			);
		}
		const start = toDate(currentTemplate.installmentStartDate); const end = toDate(currentTemplate.installmentEndDate);
		if (start && getCycleKeyFromDate(toFinancialCivilDate(start)) > cycle || end && getCycleKeyFromDate(toFinancialCivilDate(end)) < cycle) return fail('A data está fora dos meses de início e fim desse plano.', 'plan-outside-period');
		await validateLegacyBankReference(transaction, bank.realId ?? null, context.personId);
		await validateLegacyCategoryReference(transaction, currentTemplate.tagId, type);
		const installmentTotal = normalizeMandatoryInstallmentTotal(currentTemplate.installmentTotal);
		const completed = resolveMandatoryInstallmentsCompleted({ storedCompleted: currentTemplate.installmentsCompleted, installmentTotal, startDate: toDate(currentTemplate.installmentStartDate), isCurrentCycleCompleted: false, referenceDate: date });
		const quantity = typeof context.payload.installmentsToAdvance === 'number' ? context.payload.installmentsToAdvance : 1;
		if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (installmentTotal === null ? 1 : installmentTotal - completed)) return fail('A quantidade informada excede as parcelas restantes.', 'installment-complete');
		const now = new Date();
		const valueInCents = installmentTotal === null
			? typeof context.payload.valueInCents === 'number' ? context.payload.valueInCents : typeof currentTemplate.valueInCents === 'number' ? currentTemplate.valueInCents : fail('O valor do registro é inválido.', 'invalid-payload')
			: getMandatoryInstallmentValueInCents({ installmentTotal, installmentsCompleted: completed, installmentsToSettle: quantity, installmentValueInCents: currentTemplate.valueInCents, installmentTotalValueInCents: currentTemplate.installmentTotalValueInCents }) ?? fail('O valor contratual das parcelas é inválido.', 'invalid-payload');
		if (installmentTotal !== null && context.payload.valueInCents !== undefined && context.payload.valueInCents !== valueInCents) return fail('O pagamento precisa corresponder à soma exata das parcelas selecionadas.', 'invalid-payload');
		const common = {
			name: typeof currentTemplate.name === 'string' ? currentTemplate.name : type === 'expense' ? 'Gasto obrigatório' : 'Ganho obrigatório',
			valueInCents,
			tagId: typeof currentTemplate.tagId === 'string' ? currentTemplate.tagId : null,
			bankId: bank.realId,
			date,
			personId: context.personId,
			explanation: getOptionalString(context.payload, 'explanation') ?? (typeof currentTemplate.description === 'string' ? currentTemplate.description : null),
			moneyFormat: bank.realId === null,
			isBankTransfer: false,
			investmentId: null,
			investmentNameSnapshot: null,
			mandatoryTemplateId: template.reference.id, ...(type === 'expense' ? { mandatoryExpenseId: template.reference.id } : { mandatoryGainId: template.reference.id }), mandatoryType: type, mandatoryCycle: cycle, installmentsCount: quantity,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		};
		transaction.set(movementRef, type === 'expense'
			? { ...common, isInvestmentDeposit: false }
			: { ...common, paymentFormats: [], isInvestmentRedemption: false });
		const nextCompleted = installmentTotal === null ? completed : Math.min(installmentTotal, completed + quantity);
		transaction.update(template.reference, type === 'expense'
			? {
				lastPaymentExpenseId: movementRef.id,
				lastPaymentDate: date,
				lastPaymentCycle: cycle,
				lastPaymentInstallmentsCount: quantity,
				completedCycles: { ...completedCycles, [cycle]: { transactionId: movementRef.id, installmentsCount: quantity, amountInCents: valueInCents } },
				...(installmentTotal !== null ? { installmentsCompleted: nextCompleted } : {}),
				updatedAt: new Date(),
			  }
			: {
				lastReceiptGainId: movementRef.id,
				lastReceiptDate: date,
				lastReceiptCycle: cycle,
				lastReceiptInstallmentsCount: quantity,
				completedCycles: { ...completedCycles, [cycle]: { transactionId: movementRef.id, installmentsCount: quantity, amountInCents: valueInCents } },
				...(installmentTotal !== null ? { installmentsCompleted: nextCompleted } : {}),
				updatedAt: new Date(),
			  });
	});

	let notificationWarning: string | undefined;
	try {
		if (type === 'expense') {
			await suppressMandatoryExpenseNotificationCycle(context.personId, template.reference.id, cycle);
		} else {
			await suppressMandatoryGainNotificationCycle(context.personId, template.reference.id, cycle);
		}
	} catch {
		notificationWarning = 'O lançamento foi concluído, mas o lembrete local não pôde ser atualizado.';
	}
	return {
		success: true,
		message: type === 'expense' ? 'Pagamento obrigatório registrado.' : 'Recebimento obrigatório registrado.',
		notificationWarning,
		notificationRetry: notificationWarning
			? {
				operation: 'suppress_cycle',
				recurringType: type,
				templateId: template.reference.id,
				cycle,
			  }
			: undefined,
	};
};

const undoRecurringCycle = async (
	context: ExecuteContext,
	type: 'expense' | 'gain',
): Promise<AssistantExecuteResult> => {
	const template = await readOwnedItem(context, 'recordRef');
	const expected = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	if (template.item.collection !== expected) {
		return fail('O registro obrigatório selecionado é inválido.', 'invalid-reference');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, template.reference, context.personId);
		assertFreshSnapshot(context.draft, template.item, current);
		const linkedIdKey = type === 'expense' ? 'lastPaymentExpenseId' : 'lastReceiptGainId';
		const linkedId = typeof current[linkedIdKey] === 'string' ? current[linkedIdKey] as string : null;
		if (!linkedId) {
			return fail('Este registro não possui um ciclo concluído para desfazer.', 'nothing-to-undo');
		}
		const movementCollection = type === 'expense' ? 'expenses' : 'gains';
		const linkedRef = doc(db, movementCollection, linkedId);
		const linkedSnapshot = await transaction.get(linkedRef);
		if (linkedSnapshot.exists()) {
			assertOwned(linkedSnapshot.data() as FirestoreRecord, context.personId);
			transaction.delete(linkedRef);
		}
		const installmentTotal = typeof current.installmentTotal === 'number' ? current.installmentTotal : null;
		const completed = typeof current.installmentsCompleted === 'number' ? current.installmentsCompleted : 0;
		const completedCycles = { ...(current.completedCycles && typeof current.completedCycles === 'object' ? current.completedCycles as FirestoreRecord : {}) };
		delete completedCycles[String(current[type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle'])];
		const advanced = current[type === 'expense' ? 'lastPaymentInstallmentsCount' : 'lastReceiptInstallmentsCount'];
		const completedToUndo = typeof advanced === 'number' ? advanced : 1;
		transaction.update(template.reference, type === 'expense'
			? {
				lastPaymentExpenseId: null, completedCycles,
				lastPaymentDate: null,
				lastPaymentCycle: null,
				...(installmentTotal !== null ? { installmentsCompleted: Math.max(0, completed - completedToUndo) } : {}),
				updatedAt: new Date(),
			  }
			: {
				lastReceiptGainId: null, completedCycles,
				lastReceiptDate: null,
				lastReceiptCycle: null,
				...(installmentTotal !== null ? { installmentsCompleted: Math.max(0, completed - completedToUndo) } : {}),
				updatedAt: new Date(),
			  });
	});
	return {
		success: true,
		message: type === 'expense' ? 'Pagamento obrigatório desfeito.' : 'Recebimento obrigatório desfeito.',
	};
};

const createInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef'); const payload = context.payload;
	await executeLegacyFinancialMovementFirebase({ kind: 'create_investment', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), bankId: bank.realId!, name: getString(payload, 'name'), initialValueInCents: getInteger(payload, 'initialValueInCents'), ...(typeof payload.currentValueInCents === 'number' ? { currentValueInCents: payload.currentValueInCents } : {}), cdiPercentageInBasisPoints: getInteger(payload, 'cdiPercentageInBasisPoints'), assetType: getInvestmentAssetType(payload.assetType), valuationMethod: getInvestmentValuationMethod(payload.valuationMethod, getInvestmentAssetType(payload.assetType)), redemptionTerm: getString(payload, 'redemptionTerm'), date: parseActionDate(payload), description: getOptionalString(payload, 'description') });
	return { success: true, message: 'Investimento registrado.', recordHandle: `action:${context.draft.clientActionId}` };
};

const updateInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const { recordRef: _recordRef, bankRef: _bankRef, overdraftReason: _overdraftReason, ...fields } = context.payload;
	if (typeof context.payload.bankRef === 'string') fields.bankId = resolveItem(context, 'bankRef').realId;
	if (fields.assetType !== undefined || fields.valuationMethod !== undefined) fields.valuationMethod = getInvestmentValuationMethod(fields.valuationMethod, getInvestmentAssetType(fields.assetType ?? owned.data.assetType));
	await executeLegacyFinancialMovementFirebase({ kind: 'update_investment', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), investmentId: owned.item.realId!, expectedFingerprint: createAssistantRecordFingerprint(owned.data), date: new Date(context.draft.preparedAt), fields });
	return { success: true, message: 'Investimento atualizado.' };
};

const deleteInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const [expenseSnapshot, gainSnapshot, syncSnapshot] = await Promise.all([
		getDocs(query(collection(db, 'expenses'), where('investmentId', '==', owned.reference.id), where('personId', '==', context.personId))),
		getDocs(query(collection(db, 'gains'), where('investmentId', '==', owned.reference.id), where('personId', '==', context.personId))),
		getDocs(query(collection(db, 'financeInvestmentSyncs'), where('investmentId', '==', owned.reference.id), where('personId', '==', context.personId))),
	]);
	if (
		expenseSnapshot.docs.some(item => item.data().personId === context.personId && item.data().isInvestmentDeposit) ||
		gainSnapshot.docs.some(item => item.data().personId === context.personId && item.data().isInvestmentRedemption)
	) {
		return fail('Desfaça os aportes e resgates antes de excluir este investimento.', 'linked-record');
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		for (const syncDocument of syncSnapshot.docs) {
			if (syncDocument.data().personId === context.personId) {
				transaction.delete(syncDocument.ref);
			}
		}
		transaction.delete(owned.reference);
	});
	return { success: true, message: 'Investimento excluído.' };
};

const findOrCreateInvestmentTagReference = (
	context: ExecuteContext,
	usage: 'expense' | 'gain',
) => {
	const sources: AssistantCatalogType[] = usage === 'expense' ? ['expenseCategories', 'categories'] : ['gainCategories', 'categories'];
	for (const source of sources) {
		const found = (context.catalog[source] ?? []).find(item => item.label.trim().toLocaleLowerCase('pt-BR') === 'investimento' && (!item.data?.usageType || item.data?.usageType === 'both' || item.data?.usageType === usage));
		if (found?.realId) {
			return { reference: doc(db, 'tags', found.realId), shouldCreate: false };
		}
	}
	return {
		reference: doc(db, 'tags', createDocumentId(context.personId, 'investment_tag', usage)),
		shouldCreate: true,
	};
};

const moveInvestment = async (context: ExecuteContext, type: 'deposit' | 'redemption'): Promise<AssistantExecuteResult> => {
	const investment = await readOwnedItem(context, 'investmentRef');
	if (investment.item.collection !== 'financeInvestments') return fail('O investimento selecionado é inválido.', 'invalid-reference');
	const tag = findOrCreateInvestmentTagReference(context, type === 'deposit' ? 'expense' : 'gain');
	await executeLegacyFinancialMovementFirebase({ kind: type === 'deposit' ? 'deposit_investment' : 'redeem_investment', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), investmentId: investment.item.realId!, valueInCents: getInteger(context.payload, 'valueInCents'), date: parseActionDate(context.payload), description: getOptionalString(context.payload, 'description'), expectedFingerprint: createAssistantRecordFingerprint(investment.data), ...(!tag.shouldCreate ? { categoryId: tag.reference.id } : {}) });
	return { success: true, message: type === 'deposit' ? 'Aporte registrado.' : 'Resgate registrado.' };
};

const syncInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const investment = await readOwnedItem(context, 'investmentRef');
	if (investment.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const syncedValueInCents = getInteger(context.payload, 'syncedValueInCents');
	const date = parseActionDate(context.payload);
	const eventRef = doc(db, 'financeInvestmentSyncs', createDocumentId(context.personId, context.draft.clientActionId, 'investment_sync'));
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, investment.reference, context.personId);
		assertFreshSnapshot(context.draft, investment.item, current);
		const existing = await transaction.get(eventRef);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		const previousValueInCents = resolveCurrentInvestmentValue(current);
		transaction.update(investment.reference, {
			currentValueInCents: syncedValueInCents,
			lastManualSyncValueInCents: syncedValueInCents,
			lastManualSyncAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
		transaction.set(eventRef, {
			name: `Sincronização - ${investment.item.label}`,
			investmentId: investment.reference.id,
			personId: context.personId,
			bankId: typeof current.bankId === 'string' ? current.bankId : null,
			bankNameSnapshot: typeof current.bankNameSnapshot === 'string' ? current.bankNameSnapshot : null,
			investmentNameSnapshot: investment.item.label,
			previousValueInCents,
			syncedValueInCents,
			deltaInCents: syncedValueInCents - previousValueInCents,
			reason: 'manual',
			date,
			assistantActionId: context.draft.clientActionId,
			createdAt: date,
			updatedAt: date,
		});
	});
	return { success: true, message: 'Valor do investimento sincronizado.' };
};

const undoInvestmentMovement = async (
	context: ExecuteContext,
	type: 'deposit' | 'redemption' | 'sync',
): Promise<AssistantExecuteResult> => {
	const movement = await readOwnedItem(context, 'recordRef');
	const expected = type === 'deposit' ? 'expenses' : type === 'redemption' ? 'gains' : 'financeInvestmentSyncs';
	if (movement.item.collection !== expected) {
		return fail('O movimento selecionado é inválido.', 'invalid-reference');
	}
	const investmentId = typeof movement.data.investmentId === 'string' ? movement.data.investmentId : null;
	if (!investmentId) {
		return fail('O investimento vinculado não foi encontrado.', 'invalid-reference');
	}
	const investmentRef = doc(db, 'financeInvestments', investmentId);
	if (type !== 'sync') {
		const currentInvestment = (await getDoc(investmentRef)).data();
		if (!currentInvestment || currentInvestment.personId !== context.personId) return fail('O investimento não está disponível para esta conta.', 'permission-denied');
		await executeLegacyFinancialMovementFirebase({ kind: type === 'redemption' ? 'undo_investment_redemption' : 'undo_investment_deposit', expectedActorId: context.personId, clientActionId: context.draft.clientActionId, assistantRequestFingerprint: legacyReceiptFingerprint(context), movementId: movement.item.realId!, expectedMovementFingerprint: createAssistantRecordFingerprint(movement.data), expectedInvestmentFingerprint: createAssistantRecordFingerprint(currentInvestment), date: new Date(context.draft.preparedAt) });
		return { success: true, message: type === 'redemption' ? 'Resgate desfeito.' : 'Aporte desfeito.' };
	}
	await runLegacyAssistantTransaction(context, async transaction => {
		const currentMovement = await readOwnedInTransaction(transaction, movement.reference, context.personId);
		assertFreshSnapshot(context.draft, movement.item, currentMovement);
		const currentInvestment = await readOwnedInTransaction(transaction, investmentRef, context.personId);
		const currentValue = resolveCurrentInvestmentValue(currentInvestment);
		if (typeof currentMovement.previousValueInCents !== 'number' || typeof currentMovement.syncedValueInCents !== 'number') return fail('Esta sincronização não possui dados suficientes para ser desfeita.', 'invalid-reference');
		if (currentValue !== currentMovement.syncedValueInCents) return fail('O investimento mudou depois desta sincronização. Desfaça os movimentos mais recentes primeiro.', 'stale');
		const nextValue = currentMovement.previousValueInCents;
		transaction.update(investmentRef, {
			currentValueInCents: nextValue,
			lastManualSyncValueInCents: nextValue,
			lastManualSyncAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
		transaction.delete(movement.reference);
	});
	return {
		success: true,
		message: 'Sincronização desfeita.',
	};
};

const upsertCdiRate = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const annualRateInBasisPoints = getInteger(context.payload, 'annualRateInBasisPoints');
	const effectiveFrom = parseActionDate({ ...context.payload, date: context.payload.effectiveFrom });
	const dateKey = `${effectiveFrom.getFullYear()}${String(effectiveFrom.getMonth() + 1).padStart(2, '0')}${String(effectiveFrom.getDate()).padStart(2, '0')}`;
	const reference = doc(db, 'investmentCdiRates', `${context.personId}_${dateKey}`);
	await runLegacyAssistantTransaction(context, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) assertOwned(existing.data() as FirestoreRecord, context.personId);
		transaction.set(reference, { personId: context.personId, annualRateInBasisPoints, effectiveFrom,
			updatedAt: serverTimestamp(), ...(existing.exists() ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
	});
	return { success: true, message: 'Taxa CDI salva.' };
};

const createBank = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const cycle = getString(context.payload, 'initialBalanceCycle');
	const [year, month] = cycle.split('-').map(Number);
	const bankRef = doc(db, 'banks', createDocumentId(context.personId, context.draft.clientActionId, 'bank'));
	const balanceRef = doc(db, 'monthlyBalances', createDocumentId(context.personId, context.draft.clientActionId, 'bank_balance'));
	await runLegacyAssistantTransaction(context, async transaction => {
		const existing = await transaction.get(bankRef);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		const now = new Date();
		transaction.set(bankRef, {
			name: getString(context.payload, 'bankName'),
			personId: context.personId,
			colorHex: typeof context.payload.colorHex === 'string' ? context.payload.colorHex : null,
			iconKey: typeof context.payload.iconKey === 'string' ? context.payload.iconKey : null,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
		transaction.set(balanceRef, {
			personId: context.personId,
			bankId: bankRef.id,
			year,
			month,
			valueInCents: getInteger(context.payload, 'initialBalanceInCents'),
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { success: true, message: 'Banco e saldo inicial criados.', recordHandle: `action:${context.draft.clientActionId}` };
};

const updateBank = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'banks') return fail('O banco selecionado é inválido.', 'invalid-reference');
	const updates: FirestoreRecord = { updatedAt: new Date() };
	if (typeof context.payload.bankName === 'string') updates.name = context.payload.bankName.trim();
	if (typeof context.payload.isActive === 'boolean') updates.isActive = context.payload.isActive;
	if (typeof context.payload.colorHex === 'string' || context.payload.colorHex === null) updates.colorHex = context.payload.colorHex;
	if (typeof context.payload.iconKey === 'string' || context.payload.iconKey === null) updates.iconKey = context.payload.iconKey;
	if (Object.keys(updates).length === 1) return fail('Informe pelo menos uma alteração.', 'no-changes');
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.update(owned.reference, updates);
	});
	return { success: true, message: 'Banco atualizado.' };
};

const deleteBank = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'banks') return fail('O banco selecionado é inválido.', 'invalid-reference');
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	return { success: true, message: 'Banco excluído conforme as regras atuais do Lumus.' };
};

const resolveCategoryIconFields = (payload: FirestoreRecord): FirestoreRecord => {
	if (payload.iconLabel === undefined) return {};
	if (payload.iconLabel === null) return { iconFamily: null, iconName: null, iconStyle: null };
	const icon = typeof payload.iconLabel === 'string' ? findTagIconByLabel(payload.iconLabel) : null;
	if (!icon) return fail('Esse ícone não existe no catálogo. Use um nome como Café, Mercado ou Casa.', 'invalid-payload');
	return { iconFamily: icon.iconFamily, iconName: icon.iconName, iconStyle: icon.iconStyle ?? null };
};

const createCategory = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const reference = doc(db, 'tags', createDocumentId(context.personId, context.draft.clientActionId, 'category'));
	await runLegacyAssistantTransaction(context, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		const usageType = getString(context.payload, 'usageType');
		const showInBothLists = Boolean(context.payload.showInBothLists);
		const now = new Date();
		transaction.set(reference, {
			name: getString(context.payload, 'categoryName'),
			personId: context.personId,
			usageType,
			isMandatoryExpense: usageType === 'gain' ? false : showInBothLists || Boolean(context.payload.isMandatoryExpense),
			isMandatoryGain: usageType === 'expense' ? false : showInBothLists || Boolean(context.payload.isMandatoryGain),
			showInBothLists,
			iconFamily: null,
			iconName: null,
			iconStyle: null,
			...resolveCategoryIconFields(context.payload),
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { success: true, message: 'Categoria criada.', recordHandle: `action:${context.draft.clientActionId}` };
};

const updateCategory = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'tags') return fail('A categoria selecionada é inválida.', 'invalid-reference');
	const updates: FirestoreRecord = { updatedAt: new Date() };
	if (typeof context.payload.categoryName === 'string') updates.name = context.payload.categoryName.trim();
	Object.assign(updates, resolveCategoryIconFields(context.payload));
	if (typeof context.payload.usageType === 'string') updates.usageType = context.payload.usageType;
	for (const key of ['isMandatoryExpense', 'isMandatoryGain', 'showInBothLists'] as const) {
		if (typeof context.payload[key] === 'boolean') updates[key] = context.payload[key];
	}
	if (Object.keys(updates).length === 1) return fail('Informe pelo menos uma alteração.', 'no-changes');
	await runLegacyAssistantTransaction(context, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		const usageType = typeof updates.usageType === 'string' ? updates.usageType : current.usageType;
		if (usageType === 'expense') updates.isMandatoryGain = false;
		if (usageType === 'gain') updates.isMandatoryExpense = false;
		transaction.update(owned.reference, updates);
	});
	return { success: true, message: 'Categoria atualizada.' };
};

const deleteCategory = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'tags') return fail('A categoria selecionada é inválida.', 'invalid-reference');
	const references = await getTagReferenceSummary(owned.item.realId!);
	if (!references.success || !references.data) return fail('Não foi possível conferir os vínculos da categoria.', 'references-unavailable');
	if (Object.values(references.data).some(value => typeof value === 'number' && value > 0)) return fail('Esta categoria está em uso. Reclassifique os registros vinculados antes de excluir.', 'linked-record');
	await manageFinancialMetadataFirebase({ expectedActorId: context.personId, domain: 'category', action: 'delete', recordId: owned.item.realId!, fields: {}, clientActionId: context.draft.clientActionId, expectedFingerprint: context.draft.originalSnapshot?.fingerprint, assistantRequestFingerprint: legacyReceiptFingerprint(context) });
	return { success: true, message: 'Categoria excluída conforme as regras atuais do Lumus.' };
};

const prepareBalanceAdjustment = async (personId: string, draft: AssistantDraftAction, catalog: AssistantResolvedCatalog) => {
	if (draft.kind !== 'upsert_balance_adjustment' || draft.status !== 'ready') return draft;
	const context = { personId, draft, payload: draft.payload, catalog };
	const bank = resolveItem(context, 'bankRef');
	const adjustment = typeof draft.payload.recordRef === 'string' ? await readOwnedItem(context, 'recordRef') : null;
	const preview = await runBankBalanceAdjustmentFirebase({ action: 'preview', expectedActorId: personId, bankId: bank.realId!, date: getString(draft.payload, 'date'), adjustmentId: adjustment?.item.realId ?? undefined });
	return updatePreparedAssistantDraft(draft, { expectedPreviousBalanceInCents: preview.previousBalanceInCents }, catalog);
};

const upsertBalanceAdjustment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef');
	const adjustment = typeof context.payload.recordRef === 'string' ? await readOwnedItem(context, 'recordRef', { skipSnapshotCheck: true }) : null;
	if (adjustment && adjustment.item.collection !== 'bankBalanceAdjustments') return fail('O ajuste selecionado é inválido.', 'invalid-reference');
	if (typeof context.payload.expectedPreviousBalanceInCents !== 'number') return fail('Atualize a prévia do saldo antes de confirmar este ajuste.', 'stale');
	await runBankBalanceAdjustmentFirebase({ action: 'save', expectedActorId: context.personId, expectedFingerprint: adjustment ? context.draft.originalSnapshot?.fingerprint : undefined, bankId: bank.realId!, date: getString(context.payload, 'date'), adjustmentId: adjustment?.item.realId ?? undefined, clientActionId: context.draft.clientActionId, targetBalanceInCents: getInteger(context.payload, 'targetBalanceInCents'), expectedPreviousBalanceInCents: getInteger(context.payload, 'expectedPreviousBalanceInCents'), description: getOptionalString(context.payload, 'description') ?? undefined });
	return { success: true, message: 'Ajuste de saldo registrado; o histórico foi preservado.', recordHandle: `action:${context.draft.clientActionId}` };
};

const revertBalanceAdjustment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const adjustment = await readOwnedItem(context, 'recordRef', { skipSnapshotCheck: true });
	if (adjustment.item.collection !== 'bankBalanceAdjustments' || typeof adjustment.data.bankId !== 'string') return fail('O ajuste selecionado é inválido.', 'invalid-reference');
	await runBankBalanceAdjustmentFirebase({ action: 'revert', expectedActorId: context.personId, expectedFingerprint: context.draft.originalSnapshot?.fingerprint, bankId: adjustment.data.bankId, adjustmentId: adjustment.item.realId!, clientActionId: context.draft.clientActionId });
	return { success: true, message: 'Ajuste de saldo estornado; o histórico foi preservado.' };
};

const ledgerAccount = (context: ExecuteContext, ledger: FinancialLedgerContext, field: 'bankRef' | 'sourceBankRef' | 'targetBankRef' | 'investmentRef') => {
	const item = resolveItem(context, field, { allowCash: true });
	if (item.collection !== 'financialAccounts' || item.data?.groupId !== ledger.groupId || !item.realId || item.data.archivedAt) {
		return fail('A conta selecionada não está ativa no grupo financeiro atual.', 'invalid-reference');
	}
	return item;
};

const readLedgerRecord = async (context: ExecuteContext, ledger: FinancialLedgerContext, field: 'recordRef' | 'investmentRef') => {
	const item = resolveItem(context, field);
	if (!item.realId || !['financialAccounts', 'ledgerTransactions'].includes(item.collection ?? '')) return fail('Este registro pertence ao armazenamento antigo e não pode ser alterado pelo razão.', 'read-only');
	const snapshot = await getDoc(doc(db, item.collection!, item.realId));
	if (!snapshot.exists()) return fail('O registro não existe mais.', 'not-found');
	const current = snapshot.data() as FirestoreRecord;
	if (current.groupId !== ledger.groupId || (item.collection === 'ledgerTransactions' && ledger.role !== 'admin' && current.actorId !== context.personId)) return fail('Seu acesso não permite alterar este registro.', 'permission-denied');
	const comparable = item.collection === 'financialAccounts'
		? { ...parseFinancialAccount(item.realId, current), personId: context.personId, financialRole: ledger.role, ...(Object.hasOwn(item.data ?? {}, 'bankAccountId') ? { bankAccountId: item.data?.bankAccountId } : {}) }
		: current;
	assertFreshSnapshot(context.draft, item, comparable);
	if (auth.currentUser?.uid !== context.personId) return fail('A sessão mudou. Envie o pedido novamente.', 'authentication');
	return { item, data: current };
};

const executeLedgerCommand = async (context: ExecuteContext, ledger: FinancialLedgerContext): Promise<AssistantExecuteResult> => {
	const kind = context.draft.kind;
	const clientActionId = context.draft.clientActionId;
	const payload = context.payload;
	const assistantRequestFingerprint = legacyReceiptFingerprint(context);
	const result = (message: string): AssistantExecuteResult => ({ success: true, message, recordHandle: `action:${clientActionId}` });
	if (['create_category', 'update_category', 'delete_category', 'create_mandatory_expense', 'update_mandatory_expense', 'delete_mandatory_expense', 'create_mandatory_gain', 'update_mandatory_gain', 'delete_mandatory_gain', 'upsert_cdi_rate'].includes(kind)) {
		const category = kind.includes('category');
		const cdi = kind === 'upsert_cdi_rate';
		const type = kind.includes('expense') ? 'expense' : 'gain';
		const action = cdi ? 'upsert' : kind.startsWith('create_') ? 'create' : kind.startsWith('update_') ? 'update' : 'delete';
		const owned = action === 'create' || cdi ? null : await readOwnedItem(context, 'recordRef', { skipSnapshotCheck: true });
		const fields: FirestoreRecord = {};
		if (category) {
			if (typeof payload.categoryName === 'string') fields.name = payload.categoryName;
			for (const key of ['usageType', 'isMandatoryExpense', 'isMandatoryGain', 'showInBothLists', 'iconLabel']) if (payload[key] !== undefined) fields[key] = payload[key];
		} else if (cdi) {
			fields.annualRateInBasisPoints = getInteger(payload, 'annualRateInBasisPoints');
			fields.effectiveFrom = parseActionDate({ ...payload, date: payload.effectiveFrom });
		} else if (action === 'create') {
			Object.assign(fields, buildRecurringFields(context)); delete fields.personId; delete fields.installmentsCompleted; delete fields.completedCycles; delete fields.assistantCycleHistoryComplete;
			if (payload.installmentTotalValueInCents !== undefined) fields.installmentTotalValueInCents = payload.installmentTotalValueInCents;
		} else if (action === 'update') {
			for (const key of ['name', 'valueInCents', 'dueDay', 'usesBusinessDays', 'description', 'reminderEnabled', 'reminderDaysBefore', 'reminderOnDueDate', 'installmentTotal', 'installmentTotalValueInCents']) if (payload[key] !== undefined) fields[key] = payload[key];
			for (const key of ['installmentStartDate', 'installmentEndDate']) if (payload[key] !== undefined) fields[key] = typeof payload[key] === 'string' ? parseIsoDateAtLocalNoon(payload[key]) : null;
			if (typeof payload.categoryRef === 'string') fields.tagId = resolveItem(context, 'categoryRef').realId;
			if (typeof payload.reminderTime === 'string') { const time = getReminderTime(payload); fields.reminderHour = time.hour; fields.reminderMinute = time.minute; }
		}
		const recordId = cdi ? context.personId + '_' + getString(payload, 'effectiveFrom').replace(/-/g, '') : owned?.item.realId ?? undefined;
		const saved = await manageFinancialMetadataFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, domain: category ? 'category' : cdi ? 'cdi' : type === 'expense' ? 'mandatoryExpense' : 'mandatoryGain', action, clientActionId, fields, recordId,
			expectedFingerprint: owned ? context.draft.originalSnapshot?.fingerprint : undefined });
		let notificationWarning: string | undefined;
		if (!category && !cdi) {
			try {
				if (action === 'delete') {
					if (type === 'expense') await cancelMandatoryExpenseNotification(context.personId, saved.recordId); else await cancelMandatoryGainNotification(context.personId, saved.recordId);
				} else notificationWarning = await scheduleRecurringNotification(type, context.personId, saved.recordId, { ...owned?.data, ...fields });
			} catch { notificationWarning = 'A operação foi salva, mas o lembrete local ainda precisa ser atualizado.'; }
		}
		return { ...result(category ? 'Categoria salva.' : cdi ? 'Taxa CDI salva.' : action === 'delete' ? 'Recorrência excluída.' : 'Recorrência salva.'), notificationWarning,
			notificationRetry: notificationWarning ? { operation: action === 'delete' ? 'cancel' : 'sync', recurringType: type, templateId: saved.recordId } : undefined };
	}
	if (['pay_mandatory_expense', 'receive_mandatory_gain', 'undo_mandatory_expense_payment', 'undo_mandatory_gain_receipt'].includes(kind)) {
		const type = kind.includes('expense') ? 'expense' : 'gain'; const undo = kind.startsWith('undo_');
		const owned = await readOwnedItem(context, 'recordRef', { skipSnapshotCheck: true });
		const date = undo ? new Date(context.draft.preparedAt) : parseActionDate(payload);
		const saved = await completeFinancialRecurringFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, templateId: owned.item.realId!, recurringType: type, action: undo ? 'undo' : 'settle', effectiveAt: date, clientActionId,
			accountId: undo ? undefined : ledgerAccount(context, ledger, 'bankRef').realId!, installmentsToAdvance: typeof payload.installmentsToAdvance === 'number' ? payload.installmentsToAdvance : undefined,
			valueInCents: typeof payload.valueInCents === 'number' ? payload.valueInCents : undefined, overdraftReason: getOptionalString(payload, 'overdraftReason'), expectedFingerprint: context.draft.originalSnapshot?.fingerprint });
		let notificationWarning: string | undefined;
		try {
			if (undo) notificationWarning = await scheduleRecurringNotification(type, context.personId, owned.item.realId!, owned.data);
			else if (type === 'expense') await suppressMandatoryExpenseNotificationCycle(context.personId, owned.item.realId!, getCycleKeyFromDate(date));
			else await suppressMandatoryGainNotificationCycle(context.personId, owned.item.realId!, getCycleKeyFromDate(date));
		} catch { notificationWarning = 'O lançamento foi salvo, mas o lembrete local ainda precisa ser atualizado.'; }
		return { ...result(undo ? 'Ciclo estornado; o histórico foi preservado.' : type === 'expense' ? 'Pagamento registrado no razão.' : 'Recebimento registrado no razão.'), notificationWarning,
			notificationRetry: notificationWarning ? { operation: undo ? 'sync' : 'suppress_cycle', recurringType: type, templateId: owned.item.realId!, cycle: getCycleKeyFromDate(date) } : undefined };
	}
	if (kind === 'create_expense' || kind === 'create_gain') {
		const account = ledgerAccount(context, ledger, 'bankRef');
		const category = resolveItem(context, 'categoryRef');
		await postLedgerMovementFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, accountId: account.realId!, direction: kind === 'create_expense' ? 'expense' : 'income', amountInCents: getInteger(payload, 'valueInCents'), effectiveAt: parseActionDate(payload), clientActionId, categoryId: category.realId, note: [getString(payload, 'name'), getOptionalString(payload, 'explanation')].filter(Boolean).join('\n'), overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result(kind === 'create_expense' ? 'Despesa registrada no razão.' : 'Receita registrada no razão.');
	}
	if (kind === 'create_transfer' || kind === 'create_cash_withdrawal') {
		const source = ledgerAccount(context, ledger, kind === 'create_transfer' ? 'sourceBankRef' : 'bankRef');
		const cash = (context.catalog.banks ?? []).filter(item => item.data?.kind === 'cash' && item.data.groupId === ledger.groupId && !item.data.archivedAt);
		const target = kind === 'create_transfer' ? ledgerAccount(context, ledger, 'targetBankRef') : cash.length === 1 ? cash[0]! : fail('A conta Caixa do grupo não está disponível.', 'invalid-reference');
		if (source.data?.kind !== 'bank' || (kind === 'create_transfer' && target.data?.kind !== 'bank') || source.realId === target.realId || !target.realId) return fail('Informe contas bancárias de origem e destino diferentes.', 'invalid-reference');
		await transferFundsFinancialLedgerFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, fromAccountId: source.realId!, toAccountId: target.realId, amountInCents: getInteger(payload, 'valueInCents'), effectiveAt: parseActionDate(payload), clientActionId, note: getOptionalString(payload, 'description'), overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result(kind === 'create_transfer' ? 'Transferência registrada.' : 'Saque registrado no Caixa do grupo.');
	}
	if (kind === 'deposit_investment' || kind === 'redeem_investment') {
		const investment = ledgerAccount(context, ledger, 'investmentRef');
		const bank = typeof payload.bankRef === 'string' ? ledgerAccount(context, ledger, 'bankRef') : context.catalog.banks?.find(item => item.realId === investment.data?.bankAccountId);
		if (!bank?.realId || bank.data?.kind !== 'bank' || bank.data.groupId !== ledger.groupId || investment.data?.kind !== 'investment') return fail('Informe em qual banco registrar este aporte ou resgate.', 'bank-required');
		await transferFundsFinancialLedgerFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, fromAccountId: kind === 'deposit_investment' ? bank.realId : investment.realId!, toAccountId: kind === 'deposit_investment' ? investment.realId! : bank.realId, amountInCents: getInteger(payload, 'valueInCents'), effectiveAt: parseActionDate(payload), clientActionId, kind: kind === 'deposit_investment' ? 'investment_deposit' : 'investment_redemption', note: getOptionalString(payload, 'description'), overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result(kind === 'deposit_investment' ? 'Aporte registrado.' : 'Resgate registrado.');
	}
	if (kind === 'update_expense' || kind === 'update_gain') {
		const record = await readLedgerRecord(context, ledger, 'recordRef');
		const direction = kind === 'update_expense' ? 'expense' : 'income';
		if (Array.isArray(record.data.sourceReferences) && record.data.sourceReferences.some((source: { collection?: string }) => ['mandatoryExpenses', 'mandatoryGains'].includes(source.collection ?? ''))) return fail('Corrija o ciclo pela recorrência para preservar seu vínculo e suas parcelas.', 'linked-record');
		if (record.item.collection !== 'ledgerTransactions' || record.data.kind !== direction) return fail('Este registro não corresponde ao lançamento solicitado.', 'invalid-reference');
		const legs = Array.isArray(record.data.legs) ? record.data.legs as Array<{ accountId: string | null; deltaInCents: number }> : [];
		const originalLeg = legs.find(leg => leg.accountId !== null);
		if (!originalLeg?.accountId) return fail('O lançamento original não possui conta válida.', 'invalid-reference');
		const originalName = typeof record.data.note === 'string' ? record.data.note.split('\n')[0] : direction === 'expense' ? 'Despesa' : 'Receita';
		const accountId = typeof payload.bankRef === 'string' ? ledgerAccount(context, ledger, 'bankRef').realId! : originalLeg.accountId;
		await correctFinancialLedgerMovementFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, originalTransactionId: record.item.realId!, accountId, direction,
			amountInCents: typeof payload.valueInCents === 'number' ? payload.valueInCents : Math.abs(originalLeg.deltaInCents),
			effectiveAt: typeof payload.date === 'string' ? parseActionDate(payload) : toDate(record.data.effectiveAt) ?? fail('A data original é inválida.', 'invalid-date'), clientActionId,
			categoryId: typeof payload.categoryRef === 'string' ? resolveItem(context, 'categoryRef').realId : typeof record.data.categoryId === 'string' ? record.data.categoryId : null,
			note: typeof payload.name === 'string' || typeof payload.explanation === 'string' ? [getOptionalString(payload, 'name') ?? originalName, getOptionalString(payload, 'explanation')].filter(Boolean).join('\n') : typeof record.data.note === 'string' ? record.data.note : null,
			overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result('Lançamento corrigido por estorno e substituição; o histórico foi preservado.');
	}
	const reversibleKinds: Partial<Record<AssistantActionKind, string>> = { delete_expense: 'expense', delete_gain: 'income', undo_cash_withdrawal: 'transfer', undo_investment_deposit: 'investment_deposit', undo_investment_redemption: 'investment_redemption', undo_investment_sync: 'reconciliation_adjustment' };
	if (reversibleKinds[kind]) {
		const record = await readLedgerRecord(context, ledger, 'recordRef');
		if (record.item.collection !== 'ledgerTransactions' || record.data.kind !== reversibleKinds[kind]) return fail('Este lançamento usa outra operação de correção.', 'invalid-reference');
		await reverseFinancialLedgerTransactionFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, transactionId: record.item.realId!, clientActionId, effectiveAt: new Date(context.draft.preparedAt), note: 'Estorno solicitado pela conversa' });
		return result('Lançamento estornado; o histórico foi preservado.');
	}
	if (kind === 'upsert_monthly_balance' || kind === 'sync_investment') {
		if (ledger.role !== 'admin') return fail('A reconciliação exige acesso de administrador do grupo.', 'permission-denied');
		const account = ledgerAccount(context, ledger, kind === 'sync_investment' ? 'investmentRef' : 'bankRef');
		await reconcileFinancialLedgerAccountFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, accountId: account.realId!, countedBalanceInCents: getInteger(payload, kind === 'sync_investment' ? 'syncedValueInCents' : 'valueInCents'), effectiveAt: kind === 'sync_investment' ? parseActionDate(payload) : parseIsoDateAtLocalNoon(`${getString(payload, 'cycle')}-01`)!, clientActionId, note: getOptionalString(payload, 'description'), overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result('Saldo contado reconciliado no razão.');
	}
	if (kind === 'create_investment') {
		if (ledger.role !== 'admin') return fail('Criar contas de investimento exige acesso de administrador do grupo.', 'permission-denied');
		const bank = ledgerAccount(context, ledger, 'bankRef'); const initialValue = getInteger(payload, 'initialValueInCents');
		if (bank.data?.kind !== 'bank') return fail('Informe um banco ativo para vincular o investimento.', 'bank-required');
		await manageFinancialLedgerAccountFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, action: 'create', kind: 'investment', name: getString(payload, 'name'), clientActionId, initialBalanceInCents: initialValue, initialCountedBalanceInCents: typeof payload.currentValueInCents === 'number' ? payload.currentValueInCents : undefined, effectiveAt: parseActionDate(payload), fundingAccountId: initialValue > 0 ? bank.realId! : undefined,
			metadata: { bankAccountId: bank.realId!, cdiPercentageInBasisPoints: getInteger(payload, 'cdiPercentageInBasisPoints'), assetType: getInvestmentAssetType(payload.assetType), valuationMethod: getInvestmentValuationMethod(payload.valuationMethod, getInvestmentAssetType(payload.assetType)), redemptionTerm: getString(payload, 'redemptionTerm'), description: getOptionalString(payload, 'description') } });
		return result('Investimento criado com o aporte inicial registrado no razão.');
	}
	if (kind === 'create_bank') {
		if (ledger.role !== 'admin') return fail('Criar contas exige acesso de administrador do grupo.', 'permission-denied');
		await manageFinancialLedgerAccountFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, action: 'create', kind: 'bank', name: getString(payload, 'bankName'), clientActionId, initialBalanceInCents: getInteger(payload, 'initialBalanceInCents'), effectiveAt: parseIsoDateAtLocalNoon(`${getString(payload, 'initialBalanceCycle')}-01`)!, overdraftReason: getOptionalString(payload, 'overdraftReason'), metadata: { colorHex: getOptionalString(payload, 'colorHex'), iconKey: getOptionalString(payload, 'iconKey') } });
		return result('Banco e saldo inicial registrados no grupo.');
	}
	if (['update_bank', 'delete_bank', 'update_investment', 'delete_investment'].includes(kind)) {
		if (ledger.role !== 'admin') return fail('Gerenciar contas exige acesso de administrador do grupo.', 'permission-denied');
		const record = await readLedgerRecord(context, ledger, 'recordRef');
		if (record.item.collection !== 'financialAccounts') return fail('A conta selecionada é inválida.', 'invalid-reference');
		const deleting = kind.startsWith('delete_');
		const metadata: FirestoreRecord = {};
		for (const key of ['isActive', 'colorHex', 'iconKey', 'cdiPercentageInBasisPoints', 'assetType', 'valuationMethod', 'redemptionTerm', 'description']) if (payload[key] !== undefined) metadata[key] = payload[key];
		if (kind === 'update_investment' && (payload.assetType !== undefined || payload.valuationMethod !== undefined)) metadata.valuationMethod = getInvestmentValuationMethod(payload.valuationMethod, getInvestmentAssetType(payload.assetType ?? record.data.assetType));
		if (typeof payload.bankRef === 'string') metadata.bankAccountId = ledgerAccount(context, ledger, 'bankRef').realId!;
		await manageFinancialLedgerAccountFirebase({ groupId: ledger.groupId, assistantRequestFingerprint, expectedActorId: context.personId, accountId: record.item.realId!, action: deleting ? 'archive' : 'update', name: deleting ? undefined : getOptionalString(payload, kind === 'update_bank' ? 'bankName' : 'name') ?? undefined,
			expectedFingerprint: createAssistantRecordFingerprint(record.data), clientActionId, metadata,
			initialValueInCents: typeof payload.initialValueInCents === 'number' ? payload.initialValueInCents : undefined, countedBalanceInCents: typeof payload.currentValueInCents === 'number' ? payload.currentValueInCents : undefined, effectiveAt: new Date(context.draft.preparedAt), overdraftReason: getOptionalString(payload, 'overdraftReason') });
		return result(deleting ? 'Conta arquivada; o histórico foi preservado.' : 'Dados da conta atualizados; o histórico foi preservado.');
	}
	return fail('Esta operação ainda não possui um comando seguro para o razão financeiro do grupo. Nenhum registro foi alterado.', 'capability-unavailable');
};

const ACTION_EXECUTORS: Record<AssistantActionKind, (context: ExecuteContext) => Promise<AssistantExecuteResult>> = {
	create_expense: context => createMovement(context, 'expense'),
	update_expense: context => updateMovement(context, 'expense'),
	delete_expense: context => deleteMovement(context, 'expense'),
	create_gain: context => createMovement(context, 'gain'),
	update_gain: context => updateMovement(context, 'gain'),
	delete_gain: context => deleteMovement(context, 'gain'),
	upsert_monthly_balance: upsertMonthlyBalance,
	create_transfer: createTransfer,
	create_cash_withdrawal: createCashWithdrawal,
	undo_cash_withdrawal: undoCashWithdrawal,
	create_mandatory_expense: context => createRecurring(context, 'expense'),
	update_mandatory_expense: context => updateRecurring(context, 'expense'),
	delete_mandatory_expense: context => deleteRecurring(context, 'expense'),
	pay_mandatory_expense: context => completeRecurringCycle(context, 'expense'),
	undo_mandatory_expense_payment: context => undoRecurringCycle(context, 'expense'),
	create_mandatory_gain: context => createRecurring(context, 'gain'),
	update_mandatory_gain: context => updateRecurring(context, 'gain'),
	delete_mandatory_gain: context => deleteRecurring(context, 'gain'),
	receive_mandatory_gain: context => completeRecurringCycle(context, 'gain'),
	undo_mandatory_gain_receipt: context => undoRecurringCycle(context, 'gain'),
	create_investment: createInvestment,
	update_investment: updateInvestment,
	delete_investment: deleteInvestment,
	deposit_investment: context => moveInvestment(context, 'deposit'),
	redeem_investment: context => moveInvestment(context, 'redemption'),
	sync_investment: syncInvestment,
	undo_investment_deposit: context => undoInvestmentMovement(context, 'deposit'),
	undo_investment_redemption: context => undoInvestmentMovement(context, 'redemption'),
	undo_investment_sync: context => undoInvestmentMovement(context, 'sync'),
	upsert_cdi_rate: upsertCdiRate,
	create_bank: createBank,
	update_bank: updateBank,
	delete_bank: deleteBank,
	create_category: createCategory,
	update_category: updateCategory,
	delete_category: deleteCategory,
	upsert_balance_adjustment: upsertBalanceAdjustment,
	revert_balance_adjustment: revertBalanceAdjustment,
};

export const financeCommandService: FinanceCommandService = {
	loadCatalog: loadAssistantResolvedCatalog,
	async prepareActions(personId, proposals, catalog) {
		const resolvedCatalog = catalog ?? await loadAssistantResolvedCatalog(personId);
		const prepared = await prepareAssistantActions(personId, proposals, resolvedCatalog);
		const actions: AssistantDraftAction[] = [];
		for (let offset = 0; offset < prepared.actions.length; offset += 8) {
			actions.push(...await Promise.all(prepared.actions.slice(offset, offset + 8).map(draft => prepareBalanceAdjustment(personId, draft, resolvedCatalog))));
		}
		return { ...prepared, actions };
	},
	async updateDraft(personId, draft, patch, catalog) {
		return prepareBalanceAdjustment(personId, updatePreparedAssistantDraft(draft, patch, catalog), catalog);
	},
	async execute(personId, draft, catalog, authorization) {
		try {
			if (!personId.trim()) return fail('Usuário não autenticado.', 'authentication');
			if (!validateAssistantExecutionAuthorization(personId, draft, authorization)) {
				return fail('Esta operação precisa de autorização para a versão atual do pedido.', 'authorization-required');
			}
			if (auth.currentUser?.uid !== personId) return fail('A sessão mudou. Envie o pedido novamente na conta atual.', 'authentication');
			if (draft.status !== 'ready' && draft.status !== 'confirming' && draft.status !== 'failed') {
				return fail('Este pedido ainda não está pronto para confirmação.', 'not-ready');
			}
			if (draft.missingFields.length > 0) {
				return fail('Preencha os campos pendentes antes de confirmar.', 'missing-fields');
			}
			const validation = getActionValidation({
				clientActionId: draft.clientActionId,
				kind: draft.kind,
				payload: draft.payload,
				dependsOnActionIds: draft.dependsOnActionIds,
			});
			if (!validation.valid) {
				return fail('Os dados deste pedido não passaram pela validação do Lumus.', 'invalid-payload');
			}
			const ledger = await getFinancialLedgerContextFirebase(personId);
			if (auth.currentUser?.uid !== personId) return fail('A sessão mudou. Envie o pedido novamente.', 'authentication');
			if (ledger && draft.kind !== 'upsert_balance_adjustment' && draft.kind !== 'revert_balance_adjustment') {
				const receipt = await getDoc(doc(db, 'financialGroups', ledger.groupId, 'operations', draft.clientActionId));
				if (receipt.exists()) {
					const saved = receipt.data() as FirestoreRecord;
					if (saved.actorId !== personId || saved.assistantRequestFingerprint !== legacyReceiptFingerprint({ personId, draft, payload: validation.payload, catalog })) return fail('Este pedido já foi registrado com outros argumentos. Envie uma nova intenção.', 'idempotency-conflict');
					return { success: true, message: 'Operação já registrada no razão; nenhum lançamento foi repetido.', recordHandle: `action:${draft.clientActionId}` };
				}
			}
			if (ledger && draft.kind !== 'upsert_balance_adjustment' && draft.kind !== 'revert_balance_adjustment') return await executeLedgerCommand({ personId, draft, payload: validation.payload, catalog }, ledger);
			const legacyContext = { personId, draft, payload: validation.payload, catalog };
			if (draft.kind !== 'upsert_balance_adjustment' && draft.kind !== 'revert_balance_adjustment') {
				const receipt = await readLegacyAssistantReceipt(legacyContext); if (receipt) return receipt;
			}
			return await ACTION_EXECUTORS[draft.kind]({
				personId,
				draft,
				payload: validation.payload,
				catalog,
			});
		} catch (error) {
			const reason = error && typeof error === 'object' && 'details' in error && error.details && typeof error.details === 'object' && 'reason' in error.details ? String(error.details.reason) : '';
			const domainMessages: Record<string, string> = {
				'inactive-account': 'O banco foi desativado. Reative-o ou escolha outro banco na conversa.',
				'stale-record': 'O investimento mudou após o resumo. Confira a proposta atual antes de executar.',
				'same-bank': 'Escolha bancos diferentes para a transferência.',
				'missing-monthly-balance': 'Registre o saldo de abertura do banco antes deste movimento.',
				'insufficient-bank-balance': 'O saldo disponível no banco não é suficiente para este movimento.',
				'insufficient-investment-balance': 'O resgate excede o valor confirmado do investimento.',
				'history-unavailable': 'O histórico antigo guarda somente o último ciclo; não permite comprovar a situação do período solicitado. Nenhum lançamento foi criado.',
				'plan-outside-period': 'A data está fora dos meses de início e fim desse plano. Informe uma data dentro da vigência.',
				'linked-record': 'A categoria possui lançamentos ou templates vinculados. Reclassifique esses registros antes de excluí-la.',
				'original-unavailable': 'O aporte inicial original não está disponível no razão. Não é possível corrigi-lo com segurança sem recuperar esse evento.',
				'already-reversed': 'O lançamento original já foi estornado. Use o registro atual para a correção.',
				'invalid-icon': 'Esse ícone não existe no catálogo. Use um nome como Café, Mercado ou Casa.',
				'installment-complete': 'A quantidade informada excede as parcelas restantes.',
				'insufficient-balance': 'O banco não possui saldo suficiente para esse aporte inicial.',
				'already-completed-cycle': 'Esse ciclo já foi concluído. Nenhum lançamento foi repetido.',
				'amount-limit': 'O saldo resultante excede o limite de centavos inteiros que o aplicativo consegue registrar.',
			};
			if (domainMessages[reason]) return { success: false, message: domainMessages[reason]!, errorCode: reason };
			if (error instanceof FinanceCommandError) {
				return { success: false, message: error.message, errorCode: error.code };
			}
			if (error && typeof error === 'object' && 'code' in error && ['permission-denied', 'functions/permission-denied'].includes(String(error.code))) {
				return {
					success: false,
					message: 'Não foi possível acessar os registros para concluir esta ação. Confira se está na conta correta e tente novamente.',
					errorCode: 'permission-denied',
				};
			}
			if (error && typeof error === 'object' && 'code' in error && ['functions/failed-precondition', 'functions/invalid-argument', 'functions/already-exists', 'functions/not-found'].includes(String(error.code))) {
				return { success: false, message: 'A operação foi recusada pelo estado atual dos registros, saldo ou argumentos. Atualize o pedido antes de tentar novamente.', errorCode: 'precondition-failed' };
			}
			return {
				success: false,
				message: 'Não foi possível confirmar se a operação foi salva. Confira seus registros antes de tentar novamente.',
				errorCode: 'transaction-failed',
			};
		}
	},
	async retryNotification(personId, draft, catalog) {
		try {
			if (!personId.trim()) return fail('Usuário não autenticado.', 'authentication');
			return await retryRecurringNotification(personId, draft, catalog);
		} catch (error) {
			const reason = error && typeof error === 'object' && 'details' in error && error.details && typeof error.details === 'object' && 'reason' in error.details ? String(error.details.reason) : '';
			const domainMessages: Record<string, string> = {
				'inactive-account': 'O banco foi desativado. Reative-o ou escolha outro banco na conversa.',
				'stale-record': 'O investimento mudou após o resumo. Confira a proposta atual antes de executar.',
				'same-bank': 'Escolha bancos diferentes para a transferência.',
				'missing-monthly-balance': 'Registre o saldo de abertura do banco antes deste movimento.',
				'insufficient-bank-balance': 'O saldo disponível no banco não é suficiente para este movimento.',
				'insufficient-investment-balance': 'O resgate excede o valor confirmado do investimento.',
				'history-unavailable': 'O histórico antigo guarda somente o último ciclo; não permite comprovar a situação do período solicitado. Nenhum lançamento foi criado.',
				'plan-outside-period': 'A data está fora dos meses de início e fim desse plano. Informe uma data dentro da vigência.',
				'linked-record': 'A categoria possui lançamentos ou templates vinculados. Reclassifique esses registros antes de excluí-la.',
				'original-unavailable': 'O aporte inicial original não está disponível no razão. Não é possível corrigi-lo com segurança sem recuperar esse evento.',
				'already-reversed': 'O lançamento original já foi estornado. Use o registro atual para a correção.',
				'invalid-icon': 'Esse ícone não existe no catálogo. Use um nome como Café, Mercado ou Casa.',
				'installment-complete': 'A quantidade informada excede as parcelas restantes.',
				'insufficient-balance': 'O banco não possui saldo suficiente para esse aporte inicial.',
				'already-completed-cycle': 'Esse ciclo já foi concluído. Nenhum lançamento foi repetido.',
				'amount-limit': 'O saldo resultante excede o limite de centavos inteiros que o aplicativo consegue registrar.',
			};
			if (domainMessages[reason]) return { success: false, message: domainMessages[reason]!, errorCode: reason };
			if (error instanceof FinanceCommandError) {
				return { success: false, message: error.message, errorCode: error.code };
			}
			return {
				success: false,
				message: 'O lembrete ainda não pôde ser atualizado. A operação financeira continua salva.',
				errorCode: 'notification-failed',
			};
		}
	},
};
