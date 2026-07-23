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
	inferAssistantDependencyReferences,
	updateAssistantDraftPayload,
} from '@/utils/lumusAssistant';
import { getFieldDefinition } from '@/utils/lumusAssistantSchemas';
import {
	collection,
	getDocs,
	query,
	where,
	type DocumentData,
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

const canonicalize = (value: unknown): unknown => {
	const date = toDate(value);
	if (date) {
		return { $date: date.toISOString() };
	}
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, item]) => item !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, item]) => [key, canonicalize(item)]),
		);
	}
	return value;
};

export const createAssistantRecordFingerprint = (value: Record<string, unknown>) => {
	const serialized = JSON.stringify(canonicalize(value));
	let hash = 2166136261;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeLabel = (value: unknown, fallback: string) =>
	typeof value === 'string' && value.trim() ? value.trim() : fallback;

const formatDateLabel = (value: unknown) => {
	const date = toDate(value);
	return date
		? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
		: 'data não informada';
};

const loadOwnedCollection = async (
	collectionName: (typeof COLLECTIONS)[number],
	personId: string,
): Promise<OwnedDocument[]> => {
	const snapshot = await getDocs(
		query(collection(db, collectionName), where('personId', '==', personId)),
	);
	return snapshot.docs.map(document => ({
		id: document.id,
		collection: collectionName,
		data: document.data() as DocumentData as Record<string, unknown>,
	}));
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
): AssistantResolvedCatalogItem[] =>
	documents.slice(0, 50).map(document => ({
		handle: createAssistantOpaqueHandle(
			prefix,
			document.collection,
			document.id,
			getCatalogSessionSalt(
				typeof document.data.personId === 'string' ? document.data.personId : 'anonymous-session',
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

export const loadAssistantResolvedCatalog = async (personId: string): Promise<AssistantResolvedCatalog> => {
	if (!personId.trim()) {
		throw new Error('Usuário não autenticado.');
	}
	const [banks, tags, expenses, gains, cashRescues, mandatoryExpenses, mandatoryGains, investments, syncs] =
		await Promise.all(COLLECTIONS.map(name => loadOwnedCollection(name, personId)));

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

	return {
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
	};
};

export const toAssistantModelCatalog = (
	catalog: AssistantResolvedCatalog,
	options: { hideValues?: boolean } = {},
): AssistantModelCatalog =>
	Object.fromEntries(
		Object.entries(catalog).map(([key, values]) => [
			key,
			(values ?? []).map(item => ({
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

const REFERENCE_FIELDS = ['bankRef', 'sourceBankRef', 'targetBankRef', 'categoryRef', 'investmentRef', 'recordRef'] as const;

const resolveReferenceSource = (
	kind: AssistantActionKind,
	field: (typeof REFERENCE_FIELDS)[number],
): AssistantCatalogType | undefined => getFieldDefinition(kind, field).choiceSource;

const withChoices = (
	field: AssistantMissingField,
	catalog: AssistantResolvedCatalog,
): AssistantMissingField => {
	const options = field.choiceSource ? catalog[field.choiceSource] ?? [] : [];
	const filtered =
		field.key === 'sourceBankRef' || field.key === 'targetBankRef'
			? options.filter(item => item.realId !== null)
			: options;
	return {
		...field,
		choices: filtered
			.filter(item => item.ownerScope !== 'related_read_only')
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
	const field = withChoices(getFieldDefinition(draft.kind, fieldKey), catalog);
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
		missingFields: draft.missingFields.map(field => withChoices(field, catalog)),
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
		const resolved = findAssistantCatalogItem(catalog, source, currentValue);
		if (!resolved || resolved.ownerScope === 'related_read_only') {
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
	const usedIds = new Set<string>();
	const allocatedProposals = proposals.slice(0, 20).map(proposal => {
		let clientActionId = proposal.clientActionId?.trim() || createAssistantId('action');
		while (usedIds.has(clientActionId)) {
			clientActionId = createAssistantId('action');
		}
		usedIds.add(clientActionId);
		return { ...proposal, clientActionId };
	});
	const actions = inferAssistantDependencyReferences(allocatedProposals).map(proposal =>
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
