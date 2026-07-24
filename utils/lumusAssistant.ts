import type {
	AssistantActionKind,
	AssistantDraftAction,
	AssistantDraftStatus,
	AssistantMissingField,
	AssistantModelActionProposal,
} from '@/types/lumusAssistant';
import { getActionValidation, getFieldDefinition, isAssistantActionKind } from '@/utils/lumusAssistantSchemas';

export const ASSISTANT_TIME_ZONE = 'America/Sao_Paulo' as const;
export const ASSISTANT_MAX_INPUT_CHARACTERS = 4_000;
export const ASSISTANT_DEFAULT_MAX_ACTIONS = 20;
export const ASSISTANT_DEFAULT_MAX_TOOL_CALLS = 8;
export const ASSISTANT_DEFAULT_CONTEXT_TURNS = 12;

const pad = (value: number) => String(value).padStart(2, '0');

const getSaoPauloDateTimeParts = (reference: Date) => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: ASSISTANT_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(reference);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find(part => part.type === type)?.value ?? 0);
	return {
		year: value('year'),
		month: value('month'),
		day: value('day'),
		hour: value('hour'),
		minute: value('minute'),
		second: value('second'),
	};
};

const getSaoPauloDateParts = (reference: Date) => {
	const { year, month, day } = getSaoPauloDateTimeParts(reference);
	return { year, month, day };
};

const formatCivilDate = (year: number, month: number, day: number) =>
	`${year}-${pad(month)}-${pad(day)}`;

const isValidCivilDate = (year: number, month: number, day: number) => {
	const candidate = new Date(Date.UTC(year, month - 1, day, 12));
	return candidate.getUTCFullYear() === year &&
		candidate.getUTCMonth() === month - 1 &&
		candidate.getUTCDate() === day;
};

const createSaoPauloDate = (
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
) => {
	const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
	let candidate = new Date(targetWallClock);
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const rendered = getSaoPauloDateTimeParts(candidate);
		const renderedWallClock = Date.UTC(
			rendered.year,
			rendered.month - 1,
			rendered.day,
			rendered.hour,
			rendered.minute,
			rendered.second,
		);
		const correction = targetWallClock - renderedWallClock;
		if (correction === 0) break;
		candidate = new Date(candidate.getTime() + correction);
	}
	const rendered = getSaoPauloDateTimeParts(candidate);
	return rendered.year === year && rendered.month === month && rendered.day === day &&
		rendered.hour === hour && rendered.minute === minute
		? candidate
		: null;
};

export const createAssistantId = (prefix: string) =>
	`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const hashAssistantText = (value: string, seed: number) => {
	let hash = seed;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36).padStart(7, '0');
};

export const createAssistantOpaqueHandle = (
	prefix: string,
	collectionName: string,
	realId: string,
	sessionSalt: string,
) => {
	const material = `${sessionSalt}\u0000${collectionName}\u0000${realId}`;
	return `${prefix}_${hashAssistantText(material, 2166136261)}${hashAssistantText(material, 2246822519)}`;
};

export const formatIsoDate = (date: Date) => {
	const { year, month, day } = getSaoPauloDateParts(date);
	return formatCivilDate(year, month, day);
};

export const formatCycleKey = (date: Date) => {
	const { year, month } = getSaoPauloDateParts(date);
	return `${year}-${pad(month)}`;
};

export const parseIsoDateAtLocalNoon = (dateValue: unknown, timeValue?: unknown): Date | null => {
	if (typeof dateValue !== 'string') {
		return null;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	let hour = 12;
	let minute = 0;
	if (typeof timeValue === 'string') {
		const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue.trim());
		if (timeMatch) {
			hour = Number(timeMatch[1]);
			minute = Number(timeMatch[2]);
		}
	}

	if (!isValidCivilDate(year, month, day)) {
		return null;
	}
	return createSaoPauloDate(year, month, day, hour, minute);
};

export const normalizeAssistantDateInput = (
	value: unknown,
	reference = new Date(),
): string | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return formatIsoDate(value);
	}
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value
		.trim()
		.toLocaleLowerCase('pt-BR')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		return parseIsoDateAtLocalNoon(normalized) ? normalized : null;
	}

	const { year, month, day } = getSaoPauloDateParts(reference);
	const relativeDays: Record<string, number> = { hoje: 0, ontem: -1, anteontem: -2, amanha: 1 };
	if (normalized in relativeDays) {
		const date = new Date(Date.UTC(year, month - 1, day + relativeDays[normalized]!, 12));
		return formatCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	const currentMonthMatch = /^(?:dia\s+)?(\d{1,2})(?:\s+(?:deste|desse)\s+mes)?$/.exec(normalized);
	if (currentMonthMatch) {
		const requestedDay = Number(currentMonthMatch[1]);
		return isValidCivilDate(year, month, requestedDay)
			? formatCivilDate(year, month, requestedDay)
			: null;
	}

	const brDateMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(normalized);
	if (brDateMatch) {
		const parsedYear = brDateMatch[3]
			? Number(brDateMatch[3]) < 100
				? 2000 + Number(brDateMatch[3])
				: Number(brDateMatch[3])
			: year;
		const parsedMonth = Number(brDateMatch[2]);
		const parsedDay = Number(brDateMatch[1]);
		return isValidCivilDate(parsedYear, parsedMonth, parsedDay)
			? formatCivilDate(parsedYear, parsedMonth, parsedDay)
			: null;
	}

	return null;
};

export const parseMoneyToCents = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.round(value * 100);
	}
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value
		.trim()
		.toLocaleLowerCase('pt-BR')
		.replace(/r\$/g, '')
		.replace(/reais?/g, '')
		.replace(/\s/g, '');
	if (!normalized) {
		return null;
	}

	const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.';
	let numeric = normalized;
	if (numeric.includes(',') && numeric.includes('.')) {
		numeric = decimalSeparator === ',' ? numeric.replace(/\./g, '').replace(',', '.') : numeric.replace(/,/g, '');
	} else if (decimalSeparator === ',') {
		numeric = numeric.replace(',', '.');
	} else if (/^\d{1,3}(?:\.\d{3})+$/.test(numeric)) {
		numeric = numeric.replace(/\./g, '');
	}

	const parsed = Number(numeric);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};

const normalizeAssistantAnswerText = (value: string) => value
	.trim()
	.toLocaleLowerCase('pt-BR')
	.normalize('NFD')
	.replace(/[\u0300-\u036f]/g, '')
	.replace(/[.!?]+$/g, '')
	.trim();

export const parseAssistantQuestionAnswer = (
	field: AssistantMissingField,
	text: string,
): { value: unknown; label: string } | null => {
	const trimmed = sanitizeAssistantInput(text);
	if (!trimmed) return null;
	const normalized = normalizeAssistantAnswerText(trimmed);

	if (field.choices?.length) {
		const matches = field.choices.filter(choice => {
			const label = normalizeAssistantAnswerText(choice.label);
			const value = normalizeAssistantAnswerText(String(choice.value));
			return normalized === label || normalized === value || normalized.endsWith(` ${label}`);
		});
		if (matches.length !== 1 || matches[0]!.disabled) return null;
		return { value: matches[0]!.value, label: matches[0]!.label };
	}

	if (field.kind === 'boolean') {
		if (/^(?:sim|s|quero|pode)$/.test(normalized)) return { value: true, label: 'Sim' };
		if (/^(?:nao|n|nao quero)$/.test(normalized)) return { value: false, label: 'Não' };
		return null;
	}
	if (field.kind === 'money') {
		const value = parseMoneyToCents(trimmed);
		return value !== null && value >= 0 ? { value, label: trimmed } : null;
	}
	if (field.kind === 'date') {
		const value = normalizeAssistantDateInput(trimmed);
		return value ? { value, label: trimmed } : null;
	}
	if (field.kind === 'month') {
		const direct = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(trimmed);
		const brazilian = /^(0?[1-9]|1[0-2])\/(\d{4})$/.exec(trimmed);
		const value = direct
			? `${direct[1]}-${direct[2]}`
			: brazilian
				? `${brazilian[2]}-${pad(Number(brazilian[1]))}`
				: null;
		return value ? { value, label: trimmed } : null;
	}
	if (field.kind === 'time') {
		const match = /^(?:as\s+)?([01]?\d|2[0-3])(?::|h)([0-5]\d)$/.exec(normalized);
		return match ? { value: `${pad(Number(match[1]))}:${match[2]}`, label: trimmed } : null;
	}
	if (field.kind === 'number') {
		const parsed = Number(trimmed.replace(',', '.').replace(/%/g, '').trim());
		if (!Number.isFinite(parsed)) return null;
		const value = field.key === 'annualRateInBasisPoints' || field.key === 'cdiPercentageInBasisPoints'
			? Math.round(parsed * 100)
			: Math.trunc(parsed);
		return { value, label: trimmed };
	}
	if (field.kind === 'choice' || field.kind === 'bank' || field.kind === 'category' || field.kind === 'record' || field.kind === 'investment') {
		return null;
	}
	return { value: trimmed, label: trimmed };
};

export const formatCents = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100);

export const buildAssistantDraft = (
	proposal: AssistantModelActionProposal,
	now = new Date(),
): AssistantDraftAction => {
	const validation = getActionValidation(proposal);
	return {
		clientActionId: proposal.clientActionId?.trim() || createAssistantId('action'),
		kind: proposal.kind,
		status: validation.valid ? 'ready' : 'needs_input',
		payload: validation.payload,
		missingFields: validation.missingFields,
		warnings: validation.warnings,
		dependsOnActionIds: Array.from(new Set(proposal.dependsOnActionIds ?? [])),
		preparedAt: now.toISOString(),
	};
};

export const updateAssistantDraftPayload = (
	draft: AssistantDraftAction,
	patch: Record<string, unknown>,
): AssistantDraftAction => {
	const proposal: AssistantModelActionProposal = {
		clientActionId: draft.clientActionId,
		kind: draft.kind,
		payload: { ...draft.payload, ...patch },
		dependsOnActionIds: draft.dependsOnActionIds,
	};
	const updated = buildAssistantDraft(proposal, new Date(draft.preparedAt));
	return {
		...draft,
		...updated,
		status:
			draft.status === 'cancelled' || draft.status === 'succeeded'
				? draft.status
				: updated.status,
		originalSnapshot: draft.originalSnapshot,
	};
};

const ALLOWED_TRANSITIONS: Record<AssistantDraftStatus, AssistantDraftStatus[]> = {
	draft: ['needs_input', 'ready', 'cancelled'],
	needs_input: ['needs_input', 'ready', 'cancelled', 'stale'],
	ready: ['needs_input', 'confirming', 'cancelled', 'stale'],
	confirming: ['ready', 'executing', 'cancelled', 'stale'],
	executing: ['succeeded', 'failed', 'stale'],
	succeeded: [],
	failed: ['needs_input', 'ready', 'confirming', 'cancelled', 'stale'],
	cancelled: [],
	stale: ['needs_input', 'cancelled'],
};

export const canTransitionAssistantDraft = (
	from: AssistantDraftStatus,
	to: AssistantDraftStatus,
) => from === to || ALLOWED_TRANSITIONS[from].includes(to);

export const transitionAssistantDraft = (
	draft: AssistantDraftAction,
	status: AssistantDraftStatus,
): AssistantDraftAction => {
	if (!canTransitionAssistantDraft(draft.status, status)) {
		throw new Error(`Transição de rascunho inválida: ${draft.status} → ${status}`);
	}
	return { ...draft, status };
};

export const sanitizeAssistantInput = (text: string) =>
	text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, ASSISTANT_MAX_INPUT_CHARACTERS);

export const buildAssistantActiveDraftSummary = (drafts: AssistantDraftAction[]) => {
	const active = drafts
		.filter(draft => !['succeeded', 'cancelled'].includes(draft.status))
		.slice(-20)
		.map(draft => ({
			clientActionId: draft.clientActionId,
			kind: draft.kind,
			status: draft.status,
			knownFields: Object.entries(draft.payload)
				.filter(([, value]) => value !== undefined)
				.map(([key]) => key)
				.slice(0, 30),
			missingFields: draft.missingFields.map(field => field.key),
			dependsOnActionIds: draft.dependsOnActionIds,
		}));
	return JSON.stringify(active).slice(0, ASSISTANT_MAX_INPUT_CHARACTERS);
};

export const isAssistantClearConversationCommand = (text: string) => {
	const normalized = sanitizeAssistantInput(text)
		.toLocaleLowerCase('pt-BR')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[.!?]+$/g, '')
		.trim();
	return /^(?:limpar|apagar)(?:\s+a)?\s+conversa$/.test(normalized);
};

export const sanitizeAssistantModelText = (text: unknown) => {
	if (typeof text !== 'string') {
		return '';
	}
	return text
		.replace(/<[^>]*>/g, '')
		.replace(/```[\s\S]*?```/g, '')
		.trim()
		.slice(0, ASSISTANT_MAX_INPUT_CHARACTERS);
};

export const maskFinancialValuesInText = (text: string) =>
	text
		.replace(/R\$\s*-?[\d.]+(?:,\d{1,2})?/gi, 'valor oculto')
		.replace(/\b-?\d+(?:[.,]\d{1,2})?\s*(?:reais?|centavos?)\b/gi, 'valor oculto')
		.replace(/\b-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\b/g, 'valor oculto');

export const normalizeModelActionProposals = (
	value: unknown,
	maxActions = ASSISTANT_DEFAULT_MAX_ACTIONS,
): AssistantModelActionProposal[] => {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.slice(0, Math.max(1, Math.min(maxActions, ASSISTANT_DEFAULT_MAX_ACTIONS))).flatMap(item => {
		if (!item || typeof item !== 'object') {
			return [];
		}
		const record = item as Record<string, unknown>;
		if (!isAssistantActionKind(record.kind)) {
			return [];
		}
		const payload =
			record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
				? (record.payload as Record<string, unknown>)
				: {};
		return [{
			clientActionId: typeof record.clientActionId === 'string' ? record.clientActionId : undefined,
			kind: record.kind,
			payload,
			dependsOnActionIds: Array.isArray(record.dependsOnActionIds)
				? record.dependsOnActionIds.filter((id): id is string => typeof id === 'string').slice(0, 20)
				: [],
		}];
	});
};

const ASSISTANT_REFERENCE_FIELDS = [
	'bankRef',
	'sourceBankRef',
	'targetBankRef',
	'categoryRef',
	'investmentRef',
	'recordRef',
] as const;

type AssistantReferenceField = (typeof ASSISTANT_REFERENCE_FIELDS)[number];

const REFERENCE_FIELDS_BY_ACTION: Partial<Record<AssistantActionKind, readonly AssistantReferenceField[]>> = {
	create_expense: ['bankRef', 'categoryRef'],
	update_expense: ['recordRef', 'bankRef', 'categoryRef'],
	delete_expense: ['recordRef'],
	create_gain: ['bankRef', 'categoryRef'],
	update_gain: ['recordRef', 'bankRef', 'categoryRef'],
	delete_gain: ['recordRef'],
	upsert_monthly_balance: ['bankRef'],
	create_transfer: ['sourceBankRef', 'targetBankRef'],
	create_cash_withdrawal: ['bankRef'],
	undo_cash_withdrawal: ['recordRef'],
	create_mandatory_expense: ['categoryRef'],
	update_mandatory_expense: ['recordRef', 'categoryRef'],
	delete_mandatory_expense: ['recordRef'],
	pay_mandatory_expense: ['recordRef', 'bankRef'],
	undo_mandatory_expense_payment: ['recordRef'],
	create_mandatory_gain: ['categoryRef'],
	update_mandatory_gain: ['recordRef', 'categoryRef'],
	delete_mandatory_gain: ['recordRef'],
	receive_mandatory_gain: ['recordRef', 'bankRef'],
	undo_mandatory_gain_receipt: ['recordRef'],
	create_investment: ['bankRef'],
	update_investment: ['recordRef', 'bankRef'],
	delete_investment: ['recordRef'],
	deposit_investment: ['investmentRef'],
	redeem_investment: ['investmentRef'],
	sync_investment: ['investmentRef'],
	undo_investment_deposit: ['recordRef'],
	undo_investment_redemption: ['recordRef'],
	undo_investment_sync: ['recordRef'],
	update_bank: ['recordRef'],
	delete_bank: ['recordRef'],
	update_category: ['recordRef'],
	delete_category: ['recordRef'],
};

const CREATED_CATALOG_SOURCE_BY_ACTION: Partial<Record<AssistantActionKind, string>> = {
	create_expense: 'expenses',
	create_gain: 'gains',
	create_cash_withdrawal: 'cashWithdrawals',
	create_mandatory_expense: 'mandatoryExpenses',
	create_mandatory_gain: 'mandatoryGains',
	create_investment: 'investments',
	deposit_investment: 'investmentDeposits',
	redeem_investment: 'investmentRedemptions',
	sync_investment: 'investmentSyncs',
	create_bank: 'banks',
	create_category: 'categories',
};

const CATEGORY_CATALOG_SOURCES = new Set([
	'categories',
	'expenseCategories',
	'gainCategories',
	'mandatoryExpenseCategories',
	'mandatoryGainCategories',
]);

const catalogSourcesAreCompatible = (createdSource: string, targetSource?: string) =>
	Boolean(targetSource) && (
		createdSource === targetSource ||
		(createdSource === 'categories' && CATEGORY_CATALOG_SOURCES.has(targetSource!))
	);

/**
 * Liga ações criadas na mesma resposta sem confiar que o modelo monte todos os
 * placeholders. A inferência só ocorre quando há um único campo compatível.
 */
export const inferAssistantDependencyReferences = (
	proposals: AssistantModelActionProposal[],
): AssistantModelActionProposal[] => {
	const byId = new Map(
		proposals.flatMap(proposal => proposal.clientActionId
			? [[proposal.clientActionId, proposal] as const]
			: []),
	);

	return proposals.map(proposal => {
		const payload = { ...proposal.payload };
		for (const dependencyId of proposal.dependsOnActionIds ?? []) {
			const dependency = byId.get(dependencyId);
			const createdSource = dependency
				? CREATED_CATALOG_SOURCE_BY_ACTION[dependency.kind]
				: undefined;
			if (!createdSource) continue;
			const candidates = (REFERENCE_FIELDS_BY_ACTION[proposal.kind] ?? []).filter(field =>
				payload[field] === undefined &&
				catalogSourcesAreCompatible(
					createdSource,
					getFieldDefinition(proposal.kind, field).choiceSource,
				),
			);
			if (candidates.length === 1) {
				payload[candidates[0]!] = `action:${dependencyId}`;
			}
		}
		return { ...proposal, payload };
	});
};

export const getActionAmountInCents = (kind: AssistantActionKind, payload: Record<string, unknown>) => {
	const candidates = kind === 'sync_investment'
		? [payload.syncedValueInCents]
		: kind === 'create_investment'
			? [payload.initialValueInCents]
			: kind === 'create_bank'
				? [payload.initialBalanceInCents]
				: [payload.valueInCents];
	const value = candidates.find(candidate => typeof candidate === 'number' && Number.isFinite(candidate));
	return typeof value === 'number' ? value : null;
};
