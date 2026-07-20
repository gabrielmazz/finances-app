import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';

type MandatoryExpenseSuggestionDraft = {
	name: string;
	valueInCents: number;
	tagId?: string | null;
	date: Date;
};

export type MandatoryExpenseSuggestionCandidate = {
	id?: unknown;
	name?: unknown;
	valueInCents?: unknown;
	lastPaymentValueInCents?: unknown;
	tagId?: unknown;
	dueDay?: unknown;
	usesBusinessDays?: unknown;
	lastPaymentCycle?: unknown;
	hasLinkedPaymentExpense?: unknown;
	installmentTotal?: unknown;
	installmentsCompleted?: unknown;
	installmentStartDate?: unknown;
	installmentEndDate?: unknown;
};

export type MandatoryExpenseSuggestion = {
	id: string;
	name: string;
	valueInCents: number;
	tagId: string | null;
	dueDay: number;
	matchKey: string;
	score: number;
};

export type MandatoryExpenseRegistrationTarget = {
	id: string;
	isPaidForCurrentCycle?: boolean;
	isInstallmentComplete?: boolean;
};

type ScoredMandatoryExpenseSuggestion = MandatoryExpenseSuggestion & {
	nameScore: number;
	valueScore: number;
};

type ValueMatch = {
	score: number;
	isModeratelyClose: boolean;
};

const MINIMUM_FLEXIBLE_NAME_SCORE = 56;
const MINIMUM_SECOND_PLACE_GAP = 12;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const MINIMUM_CORE_NAME_LENGTH = 3;
const MODERATE_VALUE_DIFFERENCE_IN_CENTS = 3000;
const CORE_NAME_IGNORED_TOKENS = new Set([
	'a',
	'as',
	'boleto',
	'conta',
	'da',
	'das',
	'de',
	'debito',
	'despesa',
	'do',
	'dos',
	'em',
	'fatura',
	'gasto',
	'mensal',
	'mensalidade',
	'na',
	'no',
	'o',
	'os',
	'pagamento',
	'para',
	'por',
]);

const normalizeComparableText = (value: unknown) =>
	(typeof value === 'string' ? value : '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');

const getComparableTokens = (value: string) => value.split(' ').filter(token => token.length > 0);

const getCoreMandatoryNameTokens = (value: unknown) => {
	const normalizedValue = normalizeComparableText(value)
		.replace(/\benergia eletrica\b/g, 'luz')
		.replace(/\beletricidade\b/g, 'luz');

	return getComparableTokens(normalizedValue).filter(token => !CORE_NAME_IGNORED_TOKENS.has(token));
};

const hasSameCoreMandatoryName = (draftName: string, candidateName: string) => {
	const draftTokens = getCoreMandatoryNameTokens(draftName);
	const candidateTokens = getCoreMandatoryNameTokens(candidateName);
	const draftCoreName = draftTokens.join(' ');
	const candidateCoreName = candidateTokens.join(' ');

	if (
		draftCoreName.length < MINIMUM_CORE_NAME_LENGTH ||
		candidateCoreName.length < MINIMUM_CORE_NAME_LENGTH
	) {
		return false;
	}

	return draftCoreName === candidateCoreName;
};

const getLevenshteinDistance = (left: string, right: string) => {
	if (left === right) {
		return 0;
	}

	if (left.length === 0) {
		return right.length;
	}

	if (right.length === 0) {
		return left.length;
	}

	const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
	const currentRow = Array.from({ length: right.length + 1 }, () => 0);

	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		currentRow[0] = leftIndex;

		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
			currentRow[rightIndex] = Math.min(
				currentRow[rightIndex - 1] + 1,
				previousRow[rightIndex] + 1,
				previousRow[rightIndex - 1] + substitutionCost,
			);
		}

		for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
			previousRow[rightIndex] = currentRow[rightIndex];
		}
	}

	return previousRow[right.length];
};

const getNameScore = (draftName: string, candidateName: string) => {
	const normalizedDraftName = normalizeComparableText(draftName);
	const normalizedCandidateName = normalizeComparableText(candidateName);

	if (!normalizedDraftName || !normalizedCandidateName) {
		return 0;
	}

	const compactDraftName = normalizedDraftName.replace(/\s/g, '');
	const compactCandidateName = normalizedCandidateName.replace(/\s/g, '');

	if (normalizedDraftName === normalizedCandidateName || compactDraftName === compactCandidateName) {
		return 70;
	}

	const shorterLength = Math.min(compactDraftName.length, compactCandidateName.length);
	const longerLength = Math.max(compactDraftName.length, compactCandidateName.length);
	const containsCompactName =
		shorterLength >= 5 &&
		(compactDraftName.includes(compactCandidateName) || compactCandidateName.includes(compactDraftName));

	if (containsCompactName && shorterLength * 100 >= longerLength * 65) {
		return 58;
	}

	const draftTokens = getComparableTokens(normalizedDraftName);
	const candidateTokens = getComparableTokens(normalizedCandidateName);
	const draftTokenSet = new Set(draftTokens);
	const commonTokenCount = candidateTokens.filter(token => draftTokenSet.has(token)).length;
	const smallestTokenCount = Math.min(draftTokens.length, candidateTokens.length);

	if (smallestTokenCount > 0 && commonTokenCount * 100 >= smallestTokenCount * 80) {
		return 56;
	}

	const distance = getLevenshteinDistance(compactDraftName, compactCandidateName);
	const similarityBasisPoints = Math.floor(((longerLength - distance) * 10000) / longerLength);

	if (similarityBasisPoints >= 8600) {
		return 55;
	}

	if (similarityBasisPoints >= 8000 && smallestTokenCount > 0 && commonTokenCount * 100 >= smallestTokenCount * 60) {
		return 50;
	}

	return 0;
};

const getValueMatch = (draftValueInCents: number, candidateValuesInCents: number[]): ValueMatch => {
	let highestScore = 0;
	let isModeratelyClose = false;

	for (const candidateValueInCents of candidateValuesInCents) {
		if (!Number.isFinite(candidateValueInCents) || candidateValueInCents <= 0) {
			continue;
		}

		const differenceInCents = Math.abs(draftValueInCents - candidateValueInCents);
		const referenceValueInCents = Math.max(draftValueInCents, candidateValueInCents);
		const isVeryClose =
			differenceInCents <= 100 || differenceInCents * 10000 <= referenceValueInCents * 100;
		const isWithinVariableBillRange =
			differenceInCents <= MODERATE_VALUE_DIFFERENCE_IN_CENTS &&
			differenceInCents * 100 <= referenceValueInCents * 25;

		isModeratelyClose = isModeratelyClose || isWithinVariableBillRange;
		highestScore = Math.max(
			highestScore,
			differenceInCents === 0 ? 25 : isVeryClose ? 21 : isWithinVariableBillRange ? 14 : 0,
		);
	}

	return { score: highestScore, isModeratelyClose };
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const getDueDateScore = (draftDate: Date, dueDay: number, usesBusinessDays: boolean) => {
	const resolvedDueDate = resolveMonthlyOccurrence({
		referenceDate: draftDate,
		dueDay,
		usesBusinessDays,
	}).date;
	const dayDistance = Math.abs(
		Math.round((startOfLocalDay(draftDate).getTime() - startOfLocalDay(resolvedDueDate).getTime()) / ONE_DAY_IN_MS),
	);

	if (dayDistance === 0) {
		return 12;
	}

	if (dayDistance <= 3) {
		return 8;
	}

	if (dayDistance <= 7) {
		return 4;
	}

	return 0;
};

const normalizeCandidate = (
	candidate: MandatoryExpenseSuggestionCandidate,
	draftCycleKey: string,
	draftDate: Date,
) => {
	const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id : null;
	const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0 ? candidate.name.trim() : null;
	const valueInCents =
		typeof candidate.valueInCents === 'number' && Number.isFinite(candidate.valueInCents)
			? Math.max(0, Math.trunc(candidate.valueInCents))
			: null;
	const lastPaymentValueInCents =
		typeof candidate.lastPaymentValueInCents === 'number' &&
		Number.isFinite(candidate.lastPaymentValueInCents)
			? Math.max(0, Math.trunc(candidate.lastPaymentValueInCents))
			: null;
	const dueDay =
		typeof candidate.dueDay === 'number' && Number.isFinite(candidate.dueDay)
			? Math.max(1, Math.trunc(candidate.dueDay))
			: null;

	if (!id || !name || valueInCents === null || valueInCents <= 0 || dueDay === null) {
		return null;
	}

	const lastPaymentCycle = typeof candidate.lastPaymentCycle === 'string' ? candidate.lastPaymentCycle : null;
	const hasLinkedPaymentExpense = candidate.hasLinkedPaymentExpense !== false;
	const wasPaidForDraftCycle = lastPaymentCycle === draftCycleKey && hasLinkedPaymentExpense;
	const installmentTotal = normalizeMandatoryInstallmentTotal(candidate.installmentTotal);
	const storedInstallmentsCompleted = normalizeMandatoryInstallmentsCompleted(
		candidate.installmentsCompleted,
		installmentTotal,
	);
	const installmentStartDate = normalizeMandatoryInstallmentDate(candidate.installmentStartDate);
	const installmentEndDate = normalizeMandatoryInstallmentDate(candidate.installmentEndDate);

	// O fluxo de [[Despesas Fixas]] só deve sugerir ciclos realmente registráveis.
	// Um template já pago, concluído ou fora da vigência do parcelamento não é candidato.
	if (wasPaidForDraftCycle) {
		return null;
	}

	if (installmentStartDate && draftCycleKey < getCycleKeyFromDate(installmentStartDate)) {
		return null;
	}

	if (installmentEndDate && draftCycleKey > getCycleKeyFromDate(installmentEndDate)) {
		return null;
	}

	const installmentsCompleted = resolveMandatoryInstallmentsCompleted({
		storedCompleted: storedInstallmentsCompleted,
		installmentTotal,
		startDate: installmentStartDate,
		isCurrentCycleCompleted: false,
		referenceDate: draftDate,
	});

	if (isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted)) {
		return null;
	}

	return {
		id,
		name,
		valueInCents,
		lastPaymentValueInCents,
		tagId: typeof candidate.tagId === 'string' && candidate.tagId.length > 0 ? candidate.tagId : null,
		dueDay,
		usesBusinessDays: candidate.usesBusinessDays === true,
	};
};

const buildMatchKey = ({
	draft,
	candidateId,
	cycleKey,
}: {
	draft: MandatoryExpenseSuggestionDraft;
	candidateId: string;
	cycleKey: string;
}) =>
	[
		candidateId,
		cycleKey,
		normalizeComparableText(draft.name),
		String(Math.max(0, Math.trunc(draft.valueInCents))),
		draft.tagId ?? '',
	].join('|');

const scoreCandidate = (
	draft: MandatoryExpenseSuggestionDraft,
	candidate: NonNullable<ReturnType<typeof normalizeCandidate>>,
	cycleKey: string,
): ScoredMandatoryExpenseSuggestion | null => {
	const hasSameCoreName = hasSameCoreMandatoryName(draft.name, candidate.name);
	const nameScore = hasSameCoreName
		? Math.max(80, getNameScore(draft.name, candidate.name))
		: getNameScore(draft.name, candidate.name);
	const valueMatch = getValueMatch(
		draft.valueInCents,
		[candidate.valueInCents, candidate.lastPaymentValueInCents].filter(
			(value): value is number => typeof value === 'number' && value > 0,
		),
	);
	const tagMatches = Boolean(draft.tagId && candidate.tagId && draft.tagId === candidate.tagId);
	const dueDateScore = getDueDateScore(draft.date, candidate.dueDay, candidate.usesBusinessDays);
	const hasSupportingContext = tagMatches || dueDateScore > 0;

	// Em [[Despesas Fixas]], a tag obrigatória pode não estar disponível na lista de
	// categorias comuns. Por isso, um nome canônico único ("Luz"/"Conta de Luz")
	// é suficiente; para um nome apenas parecido exigimos valor compatível e outro
	// sinal independente (categoria ou proximidade com o vencimento).
	if (
		!hasSameCoreName &&
		(nameScore < MINIMUM_FLEXIBLE_NAME_SCORE || !valueMatch.isModeratelyClose || !hasSupportingContext)
	) {
		return null;
	}

	const score = nameScore + valueMatch.score + (tagMatches ? 15 : 0) + dueDateScore;

	return {
		id: candidate.id,
		name: candidate.name,
		valueInCents: candidate.valueInCents,
		tagId: candidate.tagId,
		dueDay: candidate.dueDay,
		matchKey: buildMatchKey({ draft, candidateId: candidate.id, cycleKey }),
		score,
		nameScore,
		valueScore: valueMatch.score,
	};
};

export const findMandatoryExpenseSuggestion = (
	draft: MandatoryExpenseSuggestionDraft,
	candidates: MandatoryExpenseSuggestionCandidate[],
): MandatoryExpenseSuggestion | null => {
	if (!draft.name.trim() || draft.valueInCents <= 0 || Number.isNaN(draft.date.getTime())) {
		return null;
	}

	const cycleKey = getCycleKeyFromDate(draft.date);
	const normalizedCandidates = candidates
		.map(candidate => normalizeCandidate(candidate, cycleKey, draft.date))
		.filter((candidate): candidate is NonNullable<ReturnType<typeof normalizeCandidate>> => Boolean(candidate));
	const candidatesWithSameCoreName = normalizedCandidates.filter(candidate =>
		hasSameCoreMandatoryName(draft.name, candidate.name),
	);

	// Dois obrigatórios pendentes com o mesmo nome principal não são uma suposição segura.
	if (candidatesWithSameCoreName.length > 1) {
		return null;
	}

	const scoredCandidates = (candidatesWithSameCoreName.length === 1
		? candidatesWithSameCoreName
		: normalizedCandidates)
		.map(candidate => scoreCandidate(draft, candidate, cycleKey))
		.filter((candidate): candidate is ScoredMandatoryExpenseSuggestion => Boolean(candidate))
		.sort((left, right) => right.score - left.score);

	const [bestCandidate, secondCandidate] = scoredCandidates;

	if (!bestCandidate) {
		return null;
	}

	if (secondCandidate && bestCandidate.score - secondCandidate.score < MINIMUM_SECOND_PLACE_GAP) {
		return null;
	}

	const { nameScore: _nameScore, valueScore: _valueScore, ...suggestion } = bestCandidate;
	return suggestion;
};

export const findMandatoryExpenseRegistrationTarget = <
	Candidate extends MandatoryExpenseRegistrationTarget,
>(
	focusMandatoryExpenseId: string | null,
	candidates: Candidate[],
): Candidate | null => {
	if (!focusMandatoryExpenseId) {
		return null;
	}

	const candidate = candidates.find(item => item.id === focusMandatoryExpenseId);
	if (!candidate || candidate.isPaidForCurrentCycle || candidate.isInstallmentComplete) {
		return null;
	}

	return candidate;
};
