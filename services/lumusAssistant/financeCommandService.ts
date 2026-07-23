import { db } from '@/FirebaseConfig';
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
import { MANDATORY_REMINDER_CONFIG_VERSION } from '@/utils/mandatoryReminderConfig';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	runTransaction,
	serverTimestamp,
	setDoc,
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
	if (!item || item.ownerScope === 'related_read_only') {
		return fail('A opção selecionada não está mais disponível.', 'invalid-reference');
	}
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
		return fail('Este registro mudou depois que o cartão foi montado. Revise os dados novamente.', 'stale');
	}
};

const readOwnedItem = async (
	context: ExecuteContext,
	field: 'recordRef' | 'investmentRef',
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
	assertFreshSnapshot(context.draft, item, data);
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

const isDateInMonth = (value: unknown, year: number, month: number) => {
	const date = toDate(value);
	return Boolean(date && date.getFullYear() === year && date.getMonth() + 1 === month);
};

const loadOwnCurrentBankBalance = async (
	personId: string,
	bankId: string,
	referenceDate: Date,
): Promise<number | null> => {
	const year = referenceDate.getFullYear();
	const month = referenceDate.getMonth() + 1;
	const load = async (collectionName: string) => {
		const snapshot = await getDocs(query(collection(db, collectionName), where('personId', '==', personId)));
		return snapshot.docs.map<FirestoreRecord>(document => ({ id: document.id, ...(document.data() as FirestoreRecord) }));
	};
	const [balances, expenses, gains, rescues, investments] = await Promise.all([
		load('monthlyBalances'),
		load('expenses'),
		load('gains'),
		load('cashRescues'),
		load('financeInvestments'),
	]);
	const balance = balances.find(item => item.bankId === bankId && item.year === year && item.month === month);
	if (!balance || typeof balance.valueInCents !== 'number') {
		return null;
	}
	const sum = (items: FirestoreRecord[]) =>
		items
			.filter(item => item.bankId === bankId && isDateInMonth(item.date ?? item.createdAt, year, month))
			.reduce((total, item) => total + (typeof item.valueInCents === 'number' ? Math.max(0, item.valueInCents) : 0), 0);
	const invested = investments
		.filter(item => item.bankId === bankId && isDateInMonth(item.date ?? item.createdAt, year, month))
		.reduce((total, item) => total + resolveCurrentInvestmentValue(item), 0);
	return Math.round(balance.valueInCents + sum(gains) - (sum(expenses) + sum(rescues) + invested));
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
	await runTransaction(db, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
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
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
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
	await runTransaction(db, async transaction => {
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
	await runTransaction(db, async transaction => {
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
	const source = resolveItem(context, 'sourceBankRef');
	const target = resolveItem(context, 'targetBankRef');
	if (source.realId === target.realId) {
		return fail('Escolha bancos diferentes para a transferência.', 'same-bank');
	}
	const valueInCents = getInteger(context.payload, 'valueInCents');
	const date = parseActionDate(context.payload);
	await ensureBankBalance(context.personId, source.realId!, date, valueInCents);
	const transferRef = doc(db, 'bankTransfers', createDocumentId(context.personId, context.draft.clientActionId, 'transfer'));
	const expenseRef = doc(db, 'expenses', createDocumentId(context.personId, context.draft.clientActionId, 'transfer_out'));
	const gainRef = doc(db, 'gains', createDocumentId(context.personId, context.draft.clientActionId, 'transfer_in'));
	const description = getOptionalString(context.payload, 'description') ?? `Transferência de ${source.label} para ${target.label}.`;
	await runTransaction(db, async transaction => {
		const existing = await transaction.get(transferRef);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		const [sourceBank, targetBank] = await Promise.all([
			readOwnedInTransaction(transaction, doc(db, 'banks', source.realId!), context.personId),
			readOwnedInTransaction(transaction, doc(db, 'banks', target.realId!), context.personId),
		]);
		void sourceBank;
		void targetBank;
		const now = new Date();
		transaction.set(transferRef, {
			personId: context.personId,
			sourceBankId: source.realId,
			targetBankId: target.realId,
			valueInCents,
			date,
			description,
			sourceBankNameSnapshot: source.label,
			targetBankNameSnapshot: target.label,
			expenseId: expenseRef.id,
			gainId: gainRef.id,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
		transaction.set(expenseRef, {
			name: `Transferência para ${target.label}`,
			valueInCents,
			tagId: null,
			bankId: source.realId,
			date,
			personId: context.personId,
			explanation: description,
			moneyFormat: false,
			isInvestmentDeposit: false,
			investmentId: null,
			investmentNameSnapshot: null,
			isBankTransfer: true,
			bankTransferPairId: transferRef.id,
			bankTransferDirection: 'outgoing',
			bankTransferSourceBankId: source.realId,
			bankTransferTargetBankId: target.realId,
			bankTransferSourceBankNameSnapshot: source.label,
			bankTransferTargetBankNameSnapshot: target.label,
			bankTransferExpenseId: expenseRef.id,
			bankTransferGainId: gainRef.id,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
		transaction.set(gainRef, {
			name: `Transferência recebida de ${source.label}`,
			valueInCents,
			paymentFormats: ['transferencia-bancaria'],
			explanation: description,
			moneyFormat: false,
			tagId: null,
			bankId: target.realId,
			date,
			personId: context.personId,
			isInvestmentRedemption: false,
			investmentId: null,
			investmentNameSnapshot: null,
			isBankTransfer: true,
			bankTransferPairId: transferRef.id,
			bankTransferDirection: 'incoming',
			bankTransferSourceBankId: source.realId,
			bankTransferTargetBankId: target.realId,
			bankTransferSourceBankNameSnapshot: source.label,
			bankTransferTargetBankNameSnapshot: target.label,
			bankTransferExpenseId: expenseRef.id,
			bankTransferGainId: gainRef.id,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { success: true, message: 'Transferência registrada com segurança.' };
};

const createCashWithdrawal = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef');
	const date = parseActionDate(context.payload);
	const valueInCents = getInteger(context.payload, 'valueInCents');
	await ensureBankBalance(context.personId, bank.realId!, date, valueInCents);
	const reference = doc(db, 'cashRescues', createDocumentId(context.personId, context.draft.clientActionId, 'cash_withdrawal'));
	await runTransaction(db, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		await readOwnedInTransaction(transaction, doc(db, 'banks', bank.realId!), context.personId);
		const now = new Date();
		transaction.set(reference, {
			name: 'Saque em dinheiro',
			bankId: bank.realId,
			bankNameSnapshot: bank.label,
			valueInCents,
			date,
			personId: context.personId,
			description: getOptionalString(context.payload, 'description'),
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { success: true, message: 'Saque em dinheiro registrado.' };
};

const undoCashWithdrawal = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'cashRescues') {
		return fail('O registro selecionado não é um saque.', 'invalid-reference');
	}
	await runTransaction(db, async transaction => {
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
		installmentsCompleted: 0,
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
	if (type === 'gain') {
		data.reminderDaysBefore = 0;
		data.reminderOnDueDate = true;
	}
	const collectionName = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	const reference = doc(db, collectionName, createDocumentId(context.personId, context.draft.clientActionId, `mandatory_${type}`));
	await runTransaction(db, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
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
	if (type === 'gain' && Object.keys(updates).some(key => key.startsWith('reminder'))) {
		updates.reminderDaysBefore = 0;
		updates.reminderOnDueDate = true;
	}
	if (Object.keys(updates).length === 1) {
		return fail('Informe pelo menos uma alteração.', 'no-changes');
	}
	let merged: FirestoreRecord = {};
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
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
	await runTransaction(db, async transaction => {
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
	const template = await readOwnedItem(context, 'recordRef');
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
	await runTransaction(db, async transaction => {
		const currentTemplate = await readOwnedInTransaction(transaction, template.reference, context.personId);
		assertFreshSnapshot(context.draft, template.item, currentTemplate);
		const lastCycleKey = type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle';
		const linkedIdKey = type === 'expense' ? 'lastPaymentExpenseId' : 'lastReceiptGainId';
		if (currentTemplate[lastCycleKey] === cycle && typeof currentTemplate[linkedIdKey] === 'string') {
			const linked = await transaction.get(doc(db, movementCollection, currentTemplate[linkedIdKey] as string));
			if (linked.exists() && linked.id !== movementRef.id) {
				return fail(
					type === 'expense' ? 'Este gasto já foi pago neste ciclo.' : 'Este ganho já foi recebido neste ciclo.',
					'already-completed-cycle',
				);
			}
		}
		const installmentTotal =
			typeof currentTemplate.installmentTotal === 'number' ? Math.max(1, Math.trunc(currentTemplate.installmentTotal)) : null;
		const completed =
			typeof currentTemplate.installmentsCompleted === 'number'
				? Math.max(0, Math.trunc(currentTemplate.installmentsCompleted))
				: 0;
		if (installmentTotal !== null && completed >= installmentTotal) {
			return fail('Todas as parcelas deste registro já foram concluídas.', 'installment-complete');
		}
		const existingMovement = await transaction.get(movementRef);
		if (!existingMovement.exists()) {
			const now = new Date();
			const valueInCents =
				typeof context.payload.valueInCents === 'number'
					? context.payload.valueInCents
					: typeof currentTemplate.valueInCents === 'number'
						? currentTemplate.valueInCents
						: fail('O valor do registro obrigatório é inválido.', 'invalid-payload');
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
				assistantActionId: context.draft.clientActionId,
				createdAt: now,
				updatedAt: now,
			};
			transaction.set(movementRef, type === 'expense'
				? { ...common, isInvestmentDeposit: false }
				: { ...common, paymentFormats: [], isInvestmentRedemption: false });
		}
		const nextCompleted = installmentTotal === null ? completed : Math.min(installmentTotal, completed + 1);
		transaction.update(template.reference, type === 'expense'
			? {
				lastPaymentExpenseId: movementRef.id,
				lastPaymentDate: date,
				lastPaymentCycle: cycle,
				...(installmentTotal !== null ? { installmentsCompleted: nextCompleted } : {}),
				updatedAt: new Date(),
			  }
			: {
				lastReceiptGainId: movementRef.id,
				lastReceiptDate: date,
				lastReceiptCycle: cycle,
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
	await runTransaction(db, async transaction => {
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
		transaction.update(template.reference, type === 'expense'
			? {
				lastPaymentExpenseId: null,
				lastPaymentDate: null,
				lastPaymentCycle: null,
				...(installmentTotal !== null ? { installmentsCompleted: Math.max(0, completed - 1) } : {}),
				updatedAt: new Date(),
			  }
			: {
				lastReceiptGainId: null,
				lastReceiptDate: null,
				lastReceiptCycle: null,
				...(installmentTotal !== null ? { installmentsCompleted: Math.max(0, completed - 1) } : {}),
				updatedAt: new Date(),
			  });
	});
	return {
		success: true,
		message: type === 'expense' ? 'Pagamento obrigatório desfeito.' : 'Recebimento obrigatório desfeito.',
	};
};

const createInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const bank = resolveItem(context, 'bankRef');
	const date = parseActionDate(context.payload);
	const initialValueInCents = getInteger(context.payload, 'initialValueInCents');
	if (initialValueInCents > 0) {
		await ensureBankBalance(context.personId, bank.realId!, date, initialValueInCents);
	}
	const reference = doc(db, 'financeInvestments', createDocumentId(context.personId, context.draft.clientActionId, 'investment'));
	const cdiBasisPoints = getInteger(context.payload, 'cdiPercentageInBasisPoints');
	await runTransaction(db, async transaction => {
		const existing = await transaction.get(reference);
		if (existing.exists()) {
			assertOwned(existing.data() as FirestoreRecord, context.personId);
			return;
		}
		await readOwnedInTransaction(transaction, doc(db, 'banks', bank.realId!), context.personId);
		const currentValueInCents =
			typeof context.payload.currentValueInCents === 'number'
				? context.payload.currentValueInCents
				: initialValueInCents;
		transaction.set(reference, {
			name: getString(context.payload, 'name'),
			initialValueInCents,
			initialInvestedInCents: initialValueInCents,
			currentValueInCents,
			cdiPercentage: cdiBasisPoints / 100,
			cdiPercentageInBasisPoints: cdiBasisPoints,
			assetType: typeof context.payload.assetType === 'string' ? context.payload.assetType : 'fixed_income',
			valuationMethod: typeof context.payload.valuationMethod === 'string' ? context.payload.valuationMethod : 'cdi',
			redemptionTerm: getString(context.payload, 'redemptionTerm'),
			bankId: bank.realId,
			personId: context.personId,
			description: getOptionalString(context.payload, 'description'),
			date,
			bankNameSnapshot: bank.label,
			lastManualSyncValueInCents: currentValueInCents,
			lastManualSyncAt: serverTimestamp(),
			assistantActionId: context.draft.clientActionId,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
	});
	return {
		success: true,
		message: 'Investimento criado.',
		recordHandle: `action:${context.draft.clientActionId}`,
	};
};

const updateInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const updates: FirestoreRecord = { updatedAt: serverTimestamp() };
	if (typeof context.payload.name === 'string') updates.name = context.payload.name.trim();
	if (typeof context.payload.initialValueInCents === 'number') {
		updates.initialValueInCents = context.payload.initialValueInCents;
		updates.initialInvestedInCents = context.payload.initialValueInCents;
	}
	if (typeof context.payload.currentValueInCents === 'number') {
		updates.currentValueInCents = context.payload.currentValueInCents;
		updates.lastManualSyncValueInCents = context.payload.currentValueInCents;
		updates.lastManualSyncAt = serverTimestamp();
	}
	if (typeof context.payload.cdiPercentageInBasisPoints === 'number') {
		updates.cdiPercentageInBasisPoints = context.payload.cdiPercentageInBasisPoints;
		updates.cdiPercentage = context.payload.cdiPercentageInBasisPoints / 100;
	}
	for (const key of ['assetType', 'valuationMethod', 'redemptionTerm'] as const) {
		if (typeof context.payload[key] === 'string') updates[key] = context.payload[key];
	}
	if (typeof context.payload.description === 'string' || context.payload.description === null) updates.description = context.payload.description;
	if (typeof context.payload.bankRef === 'string') {
		const bank = resolveItem(context, 'bankRef');
		updates.bankId = bank.realId;
		updates.bankNameSnapshot = bank.label;
	}
	if (Object.keys(updates).length === 1) {
		return fail('Informe pelo menos uma alteração.', 'no-changes');
	}
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		const transactionUpdates = { ...updates };
		if (
			typeof context.payload.initialValueInCents === 'number' &&
			typeof context.payload.currentValueInCents !== 'number' &&
			resolveCurrentInvestmentValue(current) === resolveInitialInvestmentValue(current)
		) {
			transactionUpdates.currentValueInCents = context.payload.initialValueInCents;
			transactionUpdates.lastManualSyncValueInCents = context.payload.initialValueInCents;
			transactionUpdates.lastManualSyncAt = serverTimestamp();
		}
		transaction.update(owned.reference, transactionUpdates);
	});
	return { success: true, message: 'Investimento atualizado.' };
};

const deleteInvestment = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const [expenseSnapshot, gainSnapshot, syncSnapshot] = await Promise.all([
		getDocs(query(collection(db, 'expenses'), where('investmentId', '==', owned.reference.id))),
		getDocs(query(collection(db, 'gains'), where('investmentId', '==', owned.reference.id))),
		getDocs(query(collection(db, 'financeInvestmentSyncs'), where('investmentId', '==', owned.reference.id))),
	]);
	if (
		expenseSnapshot.docs.some(item => item.data().personId === context.personId && item.data().isInvestmentDeposit) ||
		gainSnapshot.docs.some(item => item.data().personId === context.personId && item.data().isInvestmentRedemption)
	) {
		return fail('Desfaça os aportes e resgates antes de excluir este investimento.', 'linked-record');
	}
	await runTransaction(db, async transaction => {
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
		const found = (context.catalog[source] ?? []).find(item => item.label.trim().toLocaleLowerCase('pt-BR') === 'investimento');
		if (found?.realId) {
			return { reference: doc(db, 'tags', found.realId), shouldCreate: false };
		}
	}
	return {
		reference: doc(db, 'tags', createDocumentId(context.personId, 'investment_tag', usage)),
		shouldCreate: true,
	};
};

const moveInvestment = async (
	context: ExecuteContext,
	type: 'deposit' | 'redemption',
): Promise<AssistantExecuteResult> => {
	const investment = await readOwnedItem(context, 'investmentRef');
	if (investment.item.collection !== 'financeInvestments') {
		return fail('O investimento selecionado é inválido.', 'invalid-reference');
	}
	const valueInCents = getInteger(context.payload, 'valueInCents');
	const date = parseActionDate(context.payload);
	const bankId = typeof investment.data.bankId === 'string' ? investment.data.bankId : null;
	if (!bankId) {
		return fail('Este investimento não possui um banco válido.', 'bank-required');
	}
	if (type === 'deposit') {
		await ensureBankBalance(context.personId, bankId, date, valueInCents);
	}
	const movementCollection = type === 'deposit' ? 'expenses' : 'gains';
	const movementRef = doc(db, movementCollection, createDocumentId(context.personId, context.draft.clientActionId, `investment_${type}`));
	const tag = findOrCreateInvestmentTagReference(context, type === 'deposit' ? 'expense' : 'gain');
	await runTransaction(db, async transaction => {
		const currentInvestment = await readOwnedInTransaction(transaction, investment.reference, context.personId);
		assertFreshSnapshot(context.draft, investment.item, currentInvestment);
		const currentValue = resolveCurrentInvestmentValue(currentInvestment);
		if (type === 'redemption' && valueInCents > currentValue) {
			return fail('O resgate não pode ser maior que o valor atual do investimento.', 'insufficient-investment-balance');
		}
		const existingMovement = await transaction.get(movementRef);
		if (existingMovement.exists()) {
			assertOwned(existingMovement.data() as FirestoreRecord, context.personId);
			return;
		}
		if (tag.shouldCreate) {
			const existingTag = await transaction.get(tag.reference);
			if (!existingTag.exists()) {
				transaction.set(tag.reference, {
					name: 'Investimento',
					personId: context.personId,
					usageType: type === 'deposit' ? 'expense' : 'gain',
					isMandatoryExpense: false,
					isMandatoryGain: false,
					showInBothLists: false,
					iconFamily: 'material-community',
					iconName: 'cash-multiple',
					iconStyle: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				});
			}
		}
		const nextValue = type === 'deposit' ? currentValue + valueInCents : currentValue - valueInCents;
		transaction.update(investment.reference, {
			currentValueInCents: nextValue,
			lastManualSyncValueInCents: nextValue,
			lastManualSyncAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
		const now = new Date();
		const common = {
			name: `${type === 'deposit' ? 'Aporte' : 'Resgate'} - ${investment.item.label}`,
			valueInCents,
			tagId: tag.reference.id,
			bankId,
			date,
			personId: context.personId,
			explanation: getOptionalString(context.payload, 'description') ?? `${type === 'deposit' ? 'Aporte' : 'Resgate'} automático para ${investment.item.label}.`,
			moneyFormat: false,
			investmentId: investment.reference.id,
			investmentNameSnapshot: investment.item.label,
			isBankTransfer: false,
			assistantActionId: context.draft.clientActionId,
			createdAt: now,
			updatedAt: now,
		};
		transaction.set(movementRef, type === 'deposit'
			? { ...common, isInvestmentDeposit: true }
			: { ...common, paymentFormats: [], isInvestmentRedemption: true });
	});
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
	await runTransaction(db, async transaction => {
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
	await runTransaction(db, async transaction => {
		const currentMovement = await readOwnedInTransaction(transaction, movement.reference, context.personId);
		assertFreshSnapshot(context.draft, movement.item, currentMovement);
		const currentInvestment = await readOwnedInTransaction(transaction, investmentRef, context.personId);
		const currentValue = resolveCurrentInvestmentValue(currentInvestment);
		let nextValue = currentValue;
		if (type === 'deposit') {
			if (!currentMovement.isInvestmentDeposit || typeof currentMovement.valueInCents !== 'number') {
				return fail('Este lançamento não é um aporte válido.', 'invalid-reference');
			}
			nextValue = Math.max(0, currentValue - currentMovement.valueInCents);
		} else if (type === 'redemption') {
			if (!currentMovement.isInvestmentRedemption || typeof currentMovement.valueInCents !== 'number') {
				return fail('Este lançamento não é um resgate válido.', 'invalid-reference');
			}
			nextValue = currentValue + currentMovement.valueInCents;
		} else {
			if (
				typeof currentMovement.previousValueInCents !== 'number' ||
				typeof currentMovement.syncedValueInCents !== 'number'
			) {
				return fail('Esta sincronização não possui dados suficientes para ser desfeita.', 'invalid-reference');
			}
			if (currentValue !== currentMovement.syncedValueInCents) {
				return fail('O investimento mudou depois desta sincronização. Desfaça os movimentos mais recentes primeiro.', 'stale');
			}
			nextValue = currentMovement.previousValueInCents;
		}
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
		message: type === 'deposit' ? 'Aporte desfeito.' : type === 'redemption' ? 'Resgate desfeito.' : 'Sincronização desfeita.',
	};
};

const upsertCdiRate = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const annualRateInBasisPoints = getInteger(context.payload, 'annualRateInBasisPoints');
	const effectiveFrom = parseActionDate({ ...context.payload, date: context.payload.effectiveFrom });
	const dateKey = `${effectiveFrom.getFullYear()}${String(effectiveFrom.getMonth() + 1).padStart(2, '0')}${String(effectiveFrom.getDate()).padStart(2, '0')}`;
	const reference = doc(db, 'investmentCdiRates', `${context.personId}_${dateKey}`);
	const existing = await getDoc(reference);
	if (existing.exists()) assertOwned(existing.data() as FirestoreRecord, context.personId);
	await setDoc(reference, {
		personId: context.personId,
		annualRateInBasisPoints,
		effectiveFrom: new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), effectiveFrom.getDate()),
		updatedAt: serverTimestamp(),
		...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
	}, { merge: true });
	return { success: true, message: 'Taxa CDI salva.' };
};

const createBank = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const cycle = getString(context.payload, 'initialBalanceCycle');
	const [year, month] = cycle.split('-').map(Number);
	const bankRef = doc(db, 'banks', createDocumentId(context.personId, context.draft.clientActionId, 'bank'));
	const balanceRef = doc(db, 'monthlyBalances', createDocumentId(context.personId, context.draft.clientActionId, 'bank_balance'));
	await runTransaction(db, async transaction => {
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
	if (typeof context.payload.colorHex === 'string' || context.payload.colorHex === null) updates.colorHex = context.payload.colorHex;
	if (typeof context.payload.iconKey === 'string' || context.payload.iconKey === null) updates.iconKey = context.payload.iconKey;
	if (Object.keys(updates).length === 1) return fail('Informe pelo menos uma alteração.', 'no-changes');
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.update(owned.reference, updates);
	});
	return { success: true, message: 'Banco atualizado.' };
};

const deleteBank = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const owned = await readOwnedItem(context, 'recordRef');
	if (owned.item.collection !== 'banks') return fail('O banco selecionado é inválido.', 'invalid-reference');
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	return { success: true, message: 'Banco excluído conforme as regras atuais do Lumus.' };
};

const createCategory = async (context: ExecuteContext): Promise<AssistantExecuteResult> => {
	const reference = doc(db, 'tags', createDocumentId(context.personId, context.draft.clientActionId, 'category'));
	await runTransaction(db, async transaction => {
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
	if (typeof context.payload.usageType === 'string') updates.usageType = context.payload.usageType;
	for (const key of ['isMandatoryExpense', 'isMandatoryGain', 'showInBothLists'] as const) {
		if (typeof context.payload[key] === 'boolean') updates[key] = context.payload[key];
	}
	if (Object.keys(updates).length === 1) return fail('Informe pelo menos uma alteração.', 'no-changes');
	await runTransaction(db, async transaction => {
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
	await runTransaction(db, async transaction => {
		const current = await readOwnedInTransaction(transaction, owned.reference, context.personId);
		assertFreshSnapshot(context.draft, owned.item, current);
		transaction.delete(owned.reference);
	});
	return { success: true, message: 'Categoria excluída conforme as regras atuais do Lumus.' };
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
};

export const financeCommandService: FinanceCommandService = {
	loadCatalog: loadAssistantResolvedCatalog,
	prepareActions: prepareAssistantActions,
	async updateDraft(_personId, draft, patch, catalog) {
		return updatePreparedAssistantDraft(draft, patch, catalog);
	},
	async execute(personId, draft, catalog) {
		try {
			if (!personId.trim()) return fail('Usuário não autenticado.', 'authentication');
			if (draft.status !== 'ready' && draft.status !== 'confirming' && draft.status !== 'failed') {
				return fail('Este cartão ainda não está pronto para confirmação.', 'not-ready');
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
				return fail('Os dados deste cartão não passaram pela validação do Lumus.', 'invalid-payload');
			}
			return await ACTION_EXECUTORS[draft.kind]({
				personId,
				draft,
				payload: validation.payload,
				catalog,
			});
		} catch (error) {
			if (error instanceof FinanceCommandError) {
				return { success: false, message: error.message, errorCode: error.code };
			}
			console.error('[LumusAssistant] Falha ao executar comando financeiro:', error);
			return {
				success: false,
				message: 'Não foi possível concluir esta operação. Nenhum commit parcial foi mantido.',
				errorCode: 'transaction-failed',
			};
		}
	},
	async retryNotification(personId, draft, catalog) {
		try {
			if (!personId.trim()) return fail('Usuário não autenticado.', 'authentication');
			return await retryRecurringNotification(personId, draft, catalog);
		} catch (error) {
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
