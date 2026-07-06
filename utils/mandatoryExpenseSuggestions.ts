import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
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
	tagId?: unknown;
	dueDay?: unknown;
	usesBusinessDays?: unknown;
	lastPaymentCycle?: unknown;
	installmentTotal?: unknown;
	installmentsCompleted?: unknown;
};

export type MandatoryExpenseSuggestion = {
	id: string;
	name: string;
	valueInCents: number;
	tagId: string | null;
	dueDay: number;
	status: 'pending' | 'paid';
	matchKey: string;
	score: number;
};

type ScoredMandatoryExpenseSuggestion = MandatoryExpenseSuggestion & {
	nameScore: number;
	valueScore: number;
};

const MINIMUM_MATCH_SCORE = 86;
const MINIMUM_NAME_SCORE = 52;
const MINIMUM_VALUE_SCORE = 18;
const MINIMUM_SECOND_PLACE_GAP = 12;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const normalizeComparableText = (value: unknown) =>
	(typeof value === 'string' ? value : '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');

const getComparableTokens = (value: string) => value.split(' ').filter(token => token.length > 0);

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

const getValueScore = (draftValueInCents: number, candidateValueInCents: number) => {
	if (draftValueInCents === candidateValueInCents) {
		return 25;
	}

	const differenceInCents = Math.abs(draftValueInCents - candidateValueInCents);
	const referenceValueInCents = Math.max(draftValueInCents, candidateValueInCents);
	const differenceBasisPoints = Math.floor((differenceInCents * 10000) / referenceValueInCents);

	if (differenceInCents <= 100 || differenceBasisPoints <= 100) {
		return 21;
	}

	if (differenceInCents <= 500 || differenceBasisPoints <= 500) {
		return 10;
	}

	return 0;
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
) => {
	const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id : null;
	const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0 ? candidate.name.trim() : null;
	const valueInCents =
		typeof candidate.valueInCents === 'number' && Number.isFinite(candidate.valueInCents)
			? Math.max(0, Math.trunc(candidate.valueInCents))
			: null;
	const dueDay =
		typeof candidate.dueDay === 'number' && Number.isFinite(candidate.dueDay)
			? Math.max(1, Math.trunc(candidate.dueDay))
			: null;

	if (!id || !name || valueInCents === null || valueInCents <= 0 || dueDay === null) {
		return null;
	}

	const lastPaymentCycle = typeof candidate.lastPaymentCycle === 'string' ? candidate.lastPaymentCycle : null;
	const status: MandatoryExpenseSuggestion['status'] = lastPaymentCycle === draftCycleKey ? 'paid' : 'pending';
	const installmentTotal = normalizeMandatoryInstallmentTotal(candidate.installmentTotal);
	const installmentsCompleted = normalizeMandatoryInstallmentsCompleted(
		candidate.installmentsCompleted,
		installmentTotal,
	);

	if (
		status === 'pending' &&
		isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted)
	) {
		return null;
	}

	return {
		id,
		name,
		valueInCents,
		tagId: typeof candidate.tagId === 'string' && candidate.tagId.length > 0 ? candidate.tagId : null,
		dueDay,
		usesBusinessDays: candidate.usesBusinessDays === true,
		status,
	};
};

const buildMatchKey = ({
	draft,
	candidateId,
	status,
	cycleKey,
}: {
	draft: MandatoryExpenseSuggestionDraft;
	candidateId: string;
	status: MandatoryExpenseSuggestion['status'];
	cycleKey: string;
}) =>
	[
		candidateId,
		status,
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
	const nameScore = getNameScore(draft.name, candidate.name);
	const valueScore = getValueScore(draft.valueInCents, candidate.valueInCents);

	if (nameScore < MINIMUM_NAME_SCORE || valueScore < MINIMUM_VALUE_SCORE) {
		return null;
	}

	const tagScore = draft.tagId && candidate.tagId && draft.tagId === candidate.tagId ? 15 : 0;
	const dueDateScore = getDueDateScore(draft.date, candidate.dueDay, candidate.usesBusinessDays);
	const score = nameScore + valueScore + tagScore + dueDateScore;

	if (score < MINIMUM_MATCH_SCORE) {
		return null;
	}

	return {
		id: candidate.id,
		name: candidate.name,
		valueInCents: candidate.valueInCents,
		tagId: candidate.tagId,
		dueDay: candidate.dueDay,
		status: candidate.status,
		matchKey: buildMatchKey({ draft, candidateId: candidate.id, status: candidate.status, cycleKey }),
		score,
		nameScore,
		valueScore,
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
	const scoredCandidates = candidates
		.map(candidate => normalizeCandidate(candidate, cycleKey))
		.filter((candidate): candidate is NonNullable<ReturnType<typeof normalizeCandidate>> => Boolean(candidate))
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
