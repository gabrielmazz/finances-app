import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { readSparkAccountsFirebase } from '@/functions/SparkAccountReadFirebase';
import { readSparkFinancialEventsFirebase } from '@/functions/SparkFinancialReadFirebase';
import { readSparkRecurringPlansFirebase } from '@/functions/SparkRecurringReadFirebase';
import { getSparkCurrentOrdinaryMovements, getSparkMovementResolutionIndex } from '@/utils/sparkFinancialReadModel';
import { db } from '@/FirebaseConfig';
import type {
	AssistantActionKind,
	AssistantCatalogType,
	AssistantDraftAction,
	AssistantMissingField,
	AssistantModelActionProposal,
	AssistantModelCatalog,
	AssistantPrepareActionsResult,
	AssistantResolvedCatalog,
	AssistantResolvedCatalogItem,
} from '@/types/lumusAssistant';
import {
	buildAssistantDraft,
	createAssistantId,
	createAssistantOpaqueHandle,
	formatCents,
	formatCycleKey,
	inferAssistantDependencyReferences,
	updateAssistantDraftPayload,
} from '@/utils/lumusAssistant';
import { getFieldDefinition } from '@/utils/lumusAssistantSchemas';
import { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
export { createAssistantRecordFingerprint } from '@/utils/assistantRecordFingerprint';
import { getFinancialLedgerAccountsFirebase, getFinancialLedgerContextFirebase } from '@/functions/FinancialLedgerFirebase';
import {
	collection,
	getDocs,
	getDocsFromServer,
	limit,
	query,
	startAfter,
	where,
	type DocumentData,
	type QueryDocumentSnapshot,
} from 'firebase/firestore';

type OwnedDocument = {
	id: string;
	collection: string;
	data: Record<string, unknown>;
};

const catalogSessionSalts = new Map<string, string>();

const getCatalogSessionSalt = (personId: string) => {
	let salt = catalogSessionSalts.get(personId);
	if (!salt) {
		salt = createAssistantId('catalog');
		catalogSessionSalts.set(personId, salt);
	}
	return salt;
};

export const resetAssistantCatalogSession = (personId?: string | null) => {
	if (personId) {
		catalogSessionSalts.delete(personId);
		return;
	}
	catalogSessionSalts.clear();
};

const COLLECTIONS = [
	'banks',
	'tags',
	'expenses',
	'gains',
	'cashRescues',
	'mandatoryExpenses',
	'mandatoryGains',
	'financeInvestments',
	'financeInvestmentSyncs',
	'bankBalanceAdjustments',
] as const;

const toDate = (value: unknown): Date | null => {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}
	if (value && typeof value === 'object' && 'toDate' in value) {
		const maybeToDate = (value as { toDate?: unknown }).toDate;
		if (typeof maybeToDate === 'function') {
			const parsed = maybeToDate.call(value) as Date;
			return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
		}
	}
	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
};

const normalizeLabel = (value: unknown, fallback: string) =>
	typeof value === 'string' && value.trim() ? value.trim() : fallback;

const formatDateLabel = (value: unknown) => {
	const date = toDate(value);
	return date
		? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(date)
		: 'data não informada';
};

const loadScopedCollection = async (
	collectionName: string,
	field: 'personId' | 'groupId',
	scopeId: string,
	fromServer = false,
): Promise<OwnedDocument[]> => {
	const documents: OwnedDocument[] = [];
	let cursor: QueryDocumentSnapshot | undefined;
	// [[Assistente Lumus]]: the local catalog is complete; model context is a separate bounded projection.
	while (true) {
		const snapshot = await (fromServer ? getDocsFromServer : getDocs)(query(collection(db, collectionName), where(field, '==', scopeId), limit(200), ...(cursor ? [startAfter(cursor)] : [])));
		documents.push(...snapshot.docs.map(document => ({ id: document.id, collection: collectionName, data: document.data() as DocumentData as Record<string, unknown> })));
		if (snapshot.docs.length < 200) return documents;
		cursor = snapshot.docs[snapshot.docs.length - 1];
	}
};

const sortByRecent = (documents: OwnedDocument[]) =>
	[...documents].sort((left, right) => {
		const leftDate = toDate(left.data.date ?? left.data.updatedAt ?? left.data.createdAt)?.getTime() ?? 0;
		const rightDate = toDate(right.data.date ?? right.data.updatedAt ?? right.data.createdAt)?.getTime() ?? 0;
		return rightDate - leftDate;
	});

const createItems = (
	documents: OwnedDocument[],
	prefix: string,
	label: (document: OwnedDocument) => string,
	description?: (document: OwnedDocument) => string | undefined,
	sessionOwner?: string,
): AssistantResolvedCatalogItem[] =>
	documents.map(document => ({
		handle: createAssistantOpaqueHandle(
			prefix,
			document.collection,
			document.id,
			getCatalogSessionSalt(
				sessionOwner ?? (typeof document.data.personId === 'string' ? document.data.personId : 'anonymous-session'),
			),
		),
		label: label(document),
		description: description?.(document),
		ownerScope: 'current_user',
		realId: document.id,
		collection: document.collection,
		data: document.data,
	}));

const tagSupports = (data: Record<string, unknown>, usage: 'expense' | 'gain') =>
	data.usageType === usage || data.usageType === 'both' || data.usageType === undefined;

/** [[Assistente Lumus]]: fonte nativa completa, sem misturar identidades/saldos legados. */
async function loadSparkAssistantCatalog(personId: string, context: NonNullable<Awaited<ReturnType<typeof getSparkContextFirebase>>>): Promise<AssistantResolvedCatalog> {
	const { groupId, role } = context;
	const nativeItems: typeof createItems = (rows, prefix, label, description) => createItems(rows, prefix, label, description, personId);
	const [accounts, events, plans, ownTags, groupTags] = await Promise.all([
		readSparkAccountsFirebase(db, personId, groupId), readSparkFinancialEventsFirebase(db, personId, groupId),
		readSparkRecurringPlansFirebase(db, personId, groupId, new Date()),
		loadScopedCollection('tags', 'personId', personId, true), loadScopedCollection('tags', 'groupId', groupId, true),
	]);
	const nextContext = await getSparkContextFirebase(db, personId);
	if (!nextContext || nextContext.groupId !== groupId || nextContext.role !== role) throw new Error('O acesso financeiro mudou. Atualize o catálogo.');
	const documents: OwnedDocument[] = accounts.filter(account => account.position.active && account.lifecycle.isActive && !account.lifecycle.archived).map(account => ({
		id: account.accountId, collection: 'sparkPositions', data: { ...account.catalog, groupId, personId,
			kind: account.position.kind, name: account.catalog?.name ?? (account.position.kind === 'cash' ? 'Dinheiro' : null),
			currentBalanceInCents: account.position.balanceInCents, revision: account.position.revision,
			bankAccountId: account.catalog?.bankAccountId ?? account.principal?.fundingAccountId ?? null, sparkAccount: true },
	}));
	if (documents.some(item => typeof item.data.name !== 'string' || !item.data.name.trim())) throw new Error('Existe uma conta sem cadastro confirmado. Atualize o catálogo.');
	const tags = [...new Map([...ownTags, ...groupTags].map(item => [item.id, item])).values()]
		.filter(item => item.data.deleted !== true && (item.data.groupId == null || item.data.groupId === groupId)
			&& [undefined, 'expense', 'gain', 'both'].includes(item.data.usageType as any));
	const categories = (usage: 'expense' | 'gain', mandatory = false) => {
		const eligible = tags.filter(item => tagSupports(item.data, usage));
		const marked = eligible.filter(item => item.data.showInBothLists || item.data[usage === 'expense' ? 'isMandatoryExpense' : 'isMandatoryGain']);
		return nativeItems(mandatory && marked.length ? marked : eligible, `${mandatory ? 'mandatory_' : ''}${usage}_category`, item => normalizeLabel(item.data.name, 'Categoria'));
	};
	const movements = getSparkCurrentOrdinaryMovements(events);
	const movementItems = (kind: 'expense' | 'income') => nativeItems(movements.filter(event => event.economicKind === kind).map(event => ({
		id: event.originalOperationId, collection: event.originalSource === 'live' ? 'sparkOperations' : 'sparkImportedIdentities',
		data: { personId: event.actorId, groupId, name: event.details?.name ?? event.note, date: event.effectiveAt,
			valueInCents: Math.abs(event.deltaInCents), sparkExecutionReference: event.executionReference, source: event.originalSource },
	})), kind, item => normalizeLabel(item.data.name, kind === 'expense' ? 'Despesa' : 'Ganho'), item => formatDateLabel(item.data.date));
	const recurring = (type: 'expense' | 'gain') => nativeItems(plans.filter(plan => plan.recurringType === type).map(plan => ({
		id: plan.id, collection: 'sparkRecurringPlans', data: { ...plan, personId: plan.actorId, groupId },
	})), `mandatory_${type}`, item => normalizeLabel(item.data.name, 'Recorrência'), item => item.data.replanCancelled ? 'Replanejamento desfeito' : item.data.successorPlanId ? 'Contrato anterior substituído' : item.data.predecessorPlanId ? 'Contrato sucessor do replanejamento' : item.data.active === false ? 'Arquivada' : 'Ativa');
	const resolutions = getSparkMovementResolutionIndex(events);
	const withdrawals = nativeItems(sortByRecent(events.filter(event => event.kind === 'transfer' && event.term === 'delta' && event.accountId === 'cash'
		&& event.deltaInCents > 0 && event.executionReference?.family === 'pair' && resolutions.resolvedBy(event.executionReference) === null
		&& accounts.some(account => account.accountId === event.counterpartyAccountId && account.position.kind === 'bank')).map(event => ({
		id: event.originalOperationId, collection: event.originalSource === 'live' ? 'sparkOperations' : 'sparkImportedIdentities',
		data: { groupId, personId: event.actorId, date: event.effectiveAt, valueInCents: event.deltaInCents,
			fromAccountId: event.counterpartyAccountId, toAccountId: 'cash', sparkExecutionReference: event.executionReference,
			bankName: accounts.find(account => account.accountId === event.counterpartyAccountId)?.catalog?.name ?? 'banco de origem' },
	}))), 'spark_withdrawal', () => 'Saque em dinheiro', item => `${formatDateLabel(item.data.date)} — ${formatCents(item.data.valueInCents as number)}`);
	const catalog: AssistantResolvedCatalog = {
		banks: nativeItems(documents.filter(item => item.data.kind !== 'investment'), 'spark_account', item => item.data.name as string),
		investments: nativeItems(documents.filter(item => item.data.kind === 'investment'), 'spark_investment', item => item.data.name as string),
		expenseCategories: categories('expense'), gainCategories: categories('gain'),
		mandatoryExpenseCategories: categories('expense', true), mandatoryGainCategories: categories('gain', true),
		categories: nativeItems(tags, 'category', item => normalizeLabel(item.data.name, 'Categoria')),
		expenses: movementItems('expense'), gains: movementItems('income'), mandatoryExpenses: recurring('expense'), mandatoryGains: recurring('gain'),
		cashWithdrawals: withdrawals, investmentDeposits: [], investmentRedemptions: [], investmentSyncs: [], bankBalanceAdjustments: [],
	};
	for (const items of Object.values(catalog)) for (const item of items ?? []) {
		if (typeof item.data?.personId === 'string' && item.data.personId !== personId && item.collection === 'tags') item.ownerScope = 'related_read_only';
		if ((item.collection === 'sparkRecurringPlans' || role !== 'admin' && ['sparkOperations', 'sparkImportedIdentities'].includes(item.collection ?? '')) && item.data?.personId !== personId) item.ownerScope = 'related_read_only';
	}
	return catalog;
}

export const loadAssistantResolvedCatalog = async (personId: string): Promise<AssistantResolvedCatalog> => {
	if (!personId.trim()) {
		throw new Error('Usuário não autenticado.');
	}
	const spark = await getSparkContextFirebase(db, personId);
	if (spark) return loadSparkAssistantCatalog(personId, spark);
	const ledgerContext = await getFinancialLedgerContextFirebase(personId);
	const [banks, tags, expenses, gains, cashRescues, mandatoryExpenses, mandatoryGains, investments, syncs, adjustments] =
		await Promise.all(COLLECTIONS.map(name => ledgerContext && ['banks', 'expenses', 'gains', 'cashRescues', 'financeInvestmentSyncs'].includes(name)
			? Promise.resolve([] as OwnedDocument[])
			: loadScopedCollection(name, 'personId', personId)));

	if (ledgerContext) {
		const groupMetadata = await Promise.all(['tags', 'mandatoryExpenses', 'mandatoryGains'].map(name => loadScopedCollection(name, 'groupId', ledgerContext.groupId)));
		for (const [index, target] of [tags, mandatoryExpenses, mandatoryGains].entries()) {
			const ids = new Set(target.map(item => item.id));
			for (const item of groupMetadata[index]!) if (!ids.has(item.id)) target.push(item);
		}
	}
	// [[Categorias e CDI Spark]]: exclusão conserva a identidade, mas não oferece o registro para novos comandos.
	tags.splice(0, tags.length, ...tags.filter(item => item.data.deleted !== true));

	const linkedExpenseIds = new Set(
		mandatoryExpenses
			.map(item => item.data.lastPaymentExpenseId)
			.filter((value): value is string => typeof value === 'string' && value.length > 0),
	);
	const linkedGainIds = new Set(
		mandatoryGains
			.map(item => item.data.lastReceiptGainId)
			.filter((value): value is string => typeof value === 'string' && value.length > 0),
	);
	const editableExpenses = sortByRecent(expenses).filter(
		item =>
			!item.data.isBankTransfer &&
			!item.data.isInvestmentDeposit &&
			!linkedExpenseIds.has(item.id),
	);
	const editableGains = sortByRecent(gains).filter(
		item =>
			!item.data.isBankTransfer &&
			!item.data.isInvestmentRedemption &&
			!linkedGainIds.has(item.id),
	);
	const investmentDeposits = sortByRecent(expenses).filter(item => Boolean(item.data.isInvestmentDeposit));
	const investmentRedemptions = sortByRecent(gains).filter(item => Boolean(item.data.isInvestmentRedemption));
	const expenseTags = tags.filter(item => tagSupports(item.data, 'expense'));
	const gainTags = tags.filter(item => tagSupports(item.data, 'gain'));
	const mandatoryExpenseTags = expenseTags.filter(item => Boolean(item.data.isMandatoryExpense || item.data.showInBothLists));
	const mandatoryGainTags = gainTags.filter(item => Boolean(item.data.isMandatoryGain || item.data.showInBothLists));

	const bankItems = createItems(
		banks.sort((left, right) => normalizeLabel(left.data.name, '').localeCompare(normalizeLabel(right.data.name, ''))),
		'bank',
		item => normalizeLabel(item.data.name, 'Banco sem nome'),
		item => normalizeLabel(item.data.name, 'Banco'),
	);

	const catalog: AssistantResolvedCatalog = {
		banks: [
			...bankItems,
			{
				handle: 'cash',
				label: 'Dinheiro em espécie',
				description: 'Movimento sem conta bancária.',
				ownerScope: 'current_user',
				realId: null,
				data: { moneyFormat: true },
			},
		],
		expenseCategories: createItems(expenseTags, 'expense_category', item => normalizeLabel(item.data.name, 'Categoria')),
		gainCategories: createItems(gainTags, 'gain_category', item => normalizeLabel(item.data.name, 'Categoria')),
		mandatoryExpenseCategories: createItems(
			mandatoryExpenseTags.length > 0 ? mandatoryExpenseTags : expenseTags,
			'mandatory_expense_category',
			item => normalizeLabel(item.data.name, 'Categoria'),
		),
		mandatoryGainCategories: createItems(
			mandatoryGainTags.length > 0 ? mandatoryGainTags : gainTags,
			'mandatory_gain_category',
			item => normalizeLabel(item.data.name, 'Categoria'),
		),
		categories: createItems(tags, 'category', item => normalizeLabel(item.data.name, 'Categoria')),
		investments: createItems(
			sortByRecent(investments),
			'investment',
			item => normalizeLabel(item.data.name, 'Investimento'),
			item => {
				const bankId = typeof item.data.bankId === 'string' ? item.data.bankId : null;
				return bankItems.find(bank => bank.realId === bankId)?.label;
			},
		),
		expenses: createItems(
			editableExpenses,
			'expense',
			item => normalizeLabel(item.data.name, 'Despesa'),
			item => formatDateLabel(item.data.date),
		),
		gains: createItems(
			editableGains,
			'gain',
			item => normalizeLabel(item.data.name, 'Ganho'),
			item => formatDateLabel(item.data.date),
		),
		cashWithdrawals: createItems(
			sortByRecent(cashRescues),
			'cash_withdrawal',
			item => normalizeLabel(item.data.name, 'Saque em dinheiro'),
			item => formatDateLabel(item.data.date),
		),
		mandatoryExpenses: createItems(
			mandatoryExpenses,
			'mandatory_expense',
			item => normalizeLabel(item.data.name, 'Gasto obrigatório'),
			item => `Vencimento: dia ${String(item.data.dueDay ?? '?')}`,
		),
		mandatoryGains: createItems(
			mandatoryGains,
			'mandatory_gain',
			item => normalizeLabel(item.data.name, 'Ganho obrigatório'),
			item => `Vencimento: dia ${String(item.data.dueDay ?? '?')}`,
		),
		investmentDeposits: createItems(
			investmentDeposits,
			'investment_deposit',
			item => normalizeLabel(item.data.name, 'Aporte'),
			item => formatDateLabel(item.data.date),
		),
		investmentRedemptions: createItems(
			investmentRedemptions,
			'investment_redemption',
			item => normalizeLabel(item.data.name, 'Resgate'),
			item => formatDateLabel(item.data.date),
		),
		investmentSyncs: createItems(
			sortByRecent(syncs),
			'investment_sync',
			item => normalizeLabel(item.data.name, 'Sincronização'),
			item => formatDateLabel(item.data.date),
		),
		bankBalanceAdjustments: createItems(sortByRecent(adjustments).filter(item => item.data.status === 'active' && !item.data.reversesAdjustmentId), 'balance_adjustment', item => normalizeLabel(item.data.description, 'Ajuste de saldo'), item => formatDateLabel(item.data.date)),
	};
	for (const values of Object.values(catalog)) for (const item of values ?? []) if (typeof item.data?.personId === 'string' && item.data.personId !== personId) item.ownerScope = 'related_read_only';
	if (!ledgerContext) return catalog;
	const [accounts, transactions] = await Promise.all([
		getFinancialLedgerAccountsFirebase(ledgerContext.groupId),
		loadScopedCollection('ledgerTransactions', 'groupId', ledgerContext.groupId),
	]);
	const accountDocuments = accounts.filter(item => !item.archivedAt).map(account => ({
		id: account.id,
		collection: 'financialAccounts',
		data: { ...account, personId, financialRole: ledgerContext.role } as Record<string, unknown>,
	}));
	const reversedIds = new Set(transactions.flatMap(item => typeof item.data.reversesTransactionId === 'string' ? [item.data.reversesTransactionId] : []));
	const activeTransactions = sortByRecent(transactions).filter(item => !reversedIds.has(item.id));
	const movementItems = (kind: string, prefix: string) => createItems(activeTransactions.filter(item => item.data.kind === kind && !(Array.isArray(item.data.sourceReferences) && item.data.sourceReferences.some((source: { collection?: string }) => ['mandatoryExpenses', 'mandatoryGains'].includes(source.collection ?? '')))), prefix, item => normalizeLabel(item.data.note, kind === 'expense' ? 'Despesa' : 'Receita'), item => formatDateLabel(item.data.effectiveAt));
	const bankAccounts = accountDocuments.filter(item => item.data.kind === 'bank' || item.data.kind === 'cash');
	catalog.banks = createItems(bankAccounts, 'account', item => normalizeLabel(item.data.name, 'Conta'));
	const cashIds = new Set(accounts.filter(item => item.kind === 'cash').map(item => item.id));
	catalog.cashWithdrawals = createItems(activeTransactions.filter(item => item.data.kind === 'transfer' && Array.isArray(item.data.legs) && item.data.legs.some((leg: { accountId?: string; deltaInCents?: number }) => cashIds.has(leg.accountId ?? '') && (leg.deltaInCents ?? 0) > 0)), 'cash_withdrawal', item => normalizeLabel(item.data.note, 'Saque em dinheiro'), item => formatDateLabel(item.data.effectiveAt));
	catalog.expenses = movementItems('expense', 'expense');
	catalog.gains = movementItems('income', 'gain');
	catalog.investmentDeposits = movementItems('investment_deposit', 'investment_deposit');
	catalog.investmentRedemptions = movementItems('investment_redemption', 'investment_redemption');
	const investmentAccountIds = new Set(accounts.filter(item => item.kind === 'investment').map(item => item.id));
	catalog.investmentSyncs = createItems(activeTransactions.filter(item => item.data.kind === 'reconciliation_adjustment' && item.data.note !== 'Saldo inicial' && Array.isArray(item.data.legs) && item.data.legs.some((leg: { accountId?: string }) => investmentAccountIds.has(leg.accountId ?? ''))), 'investment_sync', item => normalizeLabel(item.data.note, 'Sincronização'), item => formatDateLabel(item.data.effectiveAt));
	catalog.investments = createItems(accountDocuments.filter(item => item.data.kind === 'investment').map(item => {
		const legacy = investments.find(investment => investment.id === item.data.legacyInvestmentId);
		const bankAccount = accounts.find(account => account.kind === 'bank' && account.legacyBankId === legacy?.data.bankId);
		return { ...item, data: { ...item.data, bankAccountId: item.data.bankAccountId ?? bankAccount?.id ?? null } };
	}), 'investment_account', item => normalizeLabel(item.data.name, 'Investimento'));
	for (const values of Object.values(catalog)) for (const item of values ?? []) if (item.collection === 'ledgerTransactions' && ledgerContext.role !== 'admin' && item.data?.actorId !== personId) item.ownerScope = 'related_read_only';
	return catalog;
};

export const toAssistantModelCatalog = (
	catalog: AssistantResolvedCatalog,
	options: { hideValues?: boolean } = {},
): AssistantModelCatalog =>
	Object.fromEntries(
		Object.entries(catalog).map(([key, values]) => [
			key,
			(values ?? []).slice(0, 50).map(item => ({
				handle: item.handle,
				label: item.label,
				description: options.hideValues
					? item.description?.replace(/R\$\s*[\d.,]+/g, 'valor oculto')
					: item.description,
				ownerScope: item.ownerScope,
			})),
		]),
	) as AssistantModelCatalog;

export const findAssistantCatalogItem = (
	catalog: AssistantResolvedCatalog,
	source: AssistantCatalogType,
	handleOrLabel: unknown,
): AssistantResolvedCatalogItem | null => {
	if (typeof handleOrLabel !== 'string') {
		return null;
	}
	const value = handleOrLabel.trim();
	const items = catalog[source] ?? [];
	const byHandle = items.find(item => item.handle === value);
	if (byHandle) {
		return byHandle;
	}
	const normalized = value.toLocaleLowerCase('pt-BR');
	const byLabel = items.filter(item => item.label.toLocaleLowerCase('pt-BR') === normalized);
	return byLabel.length === 1 ? byLabel[0] ?? null : null;
};

export const getPendingMandatoryCatalogItems = (
	catalog: AssistantResolvedCatalog,
	type: 'expense' | 'gain',
	cycle = formatCycleKey(new Date()),
): AssistantResolvedCatalogItem[] => {
	const source = type === 'expense' ? 'mandatoryExpenses' : 'mandatoryGains';
	const completedCycleField = type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle';
	return (catalog[source] ?? []).filter(item => {
		const completedCycles = item.data?.completedCycles;
		const cycleCompleted = Array.isArray(completedCycles) ? completedCycles.includes(cycle) : completedCycles && typeof completedCycles === 'object' && (completedCycles as Record<string, unknown>)[cycle];
		if (item.collection === 'sparkRecurringPlans' && item.data?.active === false || item.ownerScope === 'related_read_only' || item.data?.[completedCycleField] === cycle || cycleCompleted) return false;
		const total = item.data?.installmentTotal;
		const completed = item.data?.installmentsCompleted;
		return typeof total !== 'number' || typeof completed !== 'number' || completed < total;
	});
};

const REFERENCE_FIELDS = ['bankRef', 'sourceBankRef', 'targetBankRef', 'categoryRef', 'investmentRef', 'recordRef'] as const;

const resolveReferenceSource = (
	kind: AssistantActionKind,
	field: (typeof REFERENCE_FIELDS)[number],
): AssistantCatalogType | undefined => getFieldDefinition(kind, field).choiceSource;

const withChoices = (
	field: AssistantMissingField,
	catalog: AssistantResolvedCatalog,
	draft: AssistantDraftAction,
): AssistantMissingField => {
	const settlementType = draft.kind === 'pay_mandatory_expense' ? 'expense'
		: draft.kind === 'receive_mandatory_gain' ? 'gain' : null;
	const date = draft.payload.date;
	const cycle = typeof date === 'string' && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)
		? date.slice(0, 7) : formatCycleKey(new Date());
	const options = field.key === 'recordRef' && settlementType
		? getPendingMandatoryCatalogItems(catalog, settlementType, cycle)
		: field.choiceSource ? catalog[field.choiceSource] ?? [] : [];
	const filtered =
		field.key === 'sourceBankRef' || field.key === 'targetBankRef'
			? options.filter(item => item.realId !== null)
			: options;
	return {
		...field,
		choices: filtered
			.filter(item => {
				if (field.key !== 'recordRef' || item.collection !== 'sparkRecurringPlans') return true;
				if (draft.payload.undoReplanOnly === true) return Boolean(item.data?.predecessorPlanId && !item.data?.successorPlanId && !item.data?.replanCancelled);
				if (draft.payload.restoreOnly === true) return item.data?.active === false && !item.data?.successorPlanId && !item.data?.replanCancelled;
				if (!['undo_mandatory_expense_payment', 'undo_mandatory_gain_receipt'].includes(draft.kind)) return item.data?.active !== false;
				if (item.data?.successorPlanId || item.data?.replanCancelled) return false;
				const states = item.data?.cycleStates as import('@/utils/sparkRecurringReadModel').SparkRecurringCycleReadModel[] | undefined;
				return states?.some(state => state.active && state.cycle === cycle
					&& (item.data?.installmentTotal === null || state.installmentsAfter === item.data?.installmentsCompleted)) ?? false;
			})
			.filter(item => (item.ownerScope !== 'related_read_only' || field.key === 'categoryRef') && (field.key === 'recordRef' || item.data?.isActive !== false))
			.map(item => ({ value: item.handle, label: item.label, description: item.description })),
	};
};

const addMissingField = (
	draft: AssistantDraftAction,
	fieldKey: string,
	catalog: AssistantResolvedCatalog,
) => {
	if (draft.missingFields.some(field => field.key === fieldKey)) {
		return draft;
	}
	const field = withChoices(getFieldDefinition(draft.kind, fieldKey), catalog, draft);
	return {
		...draft,
		status: 'needs_input' as const,
		missingFields: [...draft.missingFields, field],
	};
};

export const enrichAssistantDraft = (
	draft: AssistantDraftAction,
	catalog: AssistantResolvedCatalog,
): AssistantDraftAction => {
	let next: AssistantDraftAction = {
		...draft,
		missingFields: draft.missingFields.map(field => withChoices(field, catalog, draft)),
	};

	for (const field of REFERENCE_FIELDS) {
		const currentValue = next.payload[field];
		if (currentValue === undefined) {
			continue;
		}
		if (typeof currentValue === 'string' && currentValue.startsWith('action:')) {
			continue;
		}
		const source = resolveReferenceSource(next.kind, field);
		if (!source) {
			continue;
		}
		let resolved = findAssistantCatalogItem(catalog, source, currentValue);
		if (!resolved && field === 'recordRef' && draft.payload.undoReplanOnly === true && typeof currentValue === 'string') {
			const eligible = (catalog[source] ?? []).filter(item => item.collection === 'sparkRecurringPlans' && item.data?.predecessorPlanId && !item.data?.successorPlanId && !item.data?.replanCancelled && item.label.toLocaleLowerCase('pt-BR') === currentValue.trim().toLocaleLowerCase('pt-BR'));
			if (eligible.length === 1) resolved = eligible[0]!;
		}
		if (!resolved || (resolved.ownerScope === 'related_read_only' && field !== 'categoryRef')) {
			next = addMissingField(next, field, catalog);
			next = {
				...next,
				payload: { ...next.payload, [field]: undefined },
				warnings: [...next.warnings, `A opção informada para ${getFieldDefinition(next.kind, field).label} não está disponível.`],
			};
			continue;
		}
		if (resolved.handle !== currentValue) {
			next = { ...next, payload: { ...next.payload, [field]: resolved.handle } };
		}

		if ((field === 'recordRef' || field === 'investmentRef') && resolved.collection && resolved.data) {
			next = {
				...next,
				originalSnapshot: {
					collection: resolved.collection,
					recordHandle: resolved.handle,
					fingerprint: createAssistantRecordFingerprint(resolved.data),
					capturedAt: new Date().toISOString(),
				},
			};
		}
	}

	if (next.missingFields.length === 0 && next.status === 'needs_input') {
		next = { ...next, status: 'ready' };
	}
	return next;
};

export const prepareAssistantActions = async (
	personId: string,
	proposals: AssistantModelActionProposal[],
	catalog?: AssistantResolvedCatalog,
): Promise<AssistantPrepareActionsResult> => {
	const resolvedCatalog = catalog ?? (await loadAssistantResolvedCatalog(personId));
	// Model IDs are only local labels within one response. Reusing them across
	// messages must never reuse a Firestore document ID. See [[Assistente Lumus]].
	const inferredProposals = inferAssistantDependencyReferences(proposals);
	const localIds = new Map<string, string>();
	const allocatedProposals = inferredProposals.map(proposal => {
		const clientActionId = createAssistantId('action');
		if (proposal.clientActionId) {
			localIds.set(proposal.clientActionId, clientActionId);
		}
		return { ...proposal, clientActionId };
	});
	const actions = allocatedProposals.map(proposal => ({
		...proposal,
		dependsOnActionIds: proposal.dependsOnActionIds?.flatMap(id => {
			const localId = localIds.get(id);
			return localId ? [localId] : [];
		}),
		payload: Object.fromEntries(Object.entries(proposal.payload).map(([key, value]) => {
			const localId = typeof value === 'string' && value.startsWith('action:')
				? localIds.get(value.slice(7))
				: null;
			return [key, typeof value === 'string' && value.startsWith('action:')
				? (localId ? `action:${localId}` : undefined)
				: value];
		})),
	})).map(proposal =>
		enrichAssistantDraft(buildAssistantDraft(proposal), resolvedCatalog),
	);
	return { actions, catalog: resolvedCatalog };
};

export const updatePreparedAssistantDraft = (
	draft: AssistantDraftAction,
	patch: Record<string, unknown>,
	catalog: AssistantResolvedCatalog,
) => enrichAssistantDraft(updateAssistantDraftPayload(draft, patch), catalog);

export const describeAssistantCatalogItem = (
	catalog: AssistantResolvedCatalog,
	source: AssistantCatalogType,
	handle: unknown,
) => findAssistantCatalogItem(catalog, source, handle)?.label ?? 'Não informado';

export const describeMoneyValue = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? formatCents(value) : 'Não informado';
