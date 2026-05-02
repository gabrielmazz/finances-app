import { db } from '@/FirebaseConfig';
import { getRelatedUsersIDsFirebase } from '@/functions/RegisterUserFirebase';
import type { TagIconFamily, TagIconSelection, TagIconStyle } from '@/hooks/useTagIcons';
import type { TagUsageType } from '@/utils/tagUsage';
import { normalizeTagUsageType } from '@/utils/tagUsage';
import { shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';
import {
	collection,
	getDocs,
	query,
	Timestamp,
	where,
} from 'firebase/firestore';

export type CategoryAnalysisMovementType = 'expense' | 'gain';
export type CategoryAnalysisStatus = 'above' | 'below' | 'stable' | 'no-history';

export type CategoryAnalysisTagOption = {
	id: string;
	name: string;
	usageType: TagUsageType | null;
	isMandatoryExpense: boolean;
	isMandatoryGain: boolean;
	icon: TagIconSelection | null;
	currentExpenseInCents: number;
	currentGainInCents: number;
	movementCount: number;
};

export type CategoryAnalysisMonthBucket = {
	key: string;
	label: string;
	isCurrentMonth: boolean;
	expenseInCents: number;
	gainInCents: number;
	expenseCount: number;
	gainCount: number;
};

export type CategoryAnalysisMetric = {
	currentInCents: number;
	historicalAverageInCents: number;
	deltaInCents: number;
	deltaPercent: number | null;
	status: CategoryAnalysisStatus;
	currentCount: number;
	historicalCount: number;
};

export type CategoryAnalysisBankBreakdown = {
	id: string;
	name: string;
	colorHex: string | null;
	isCash: boolean;
	expenseInCents: number;
	gainInCents: number;
	movementCount: number;
};

export type CategoryAnalysisRecentMovement = {
	id: string;
	type: CategoryAnalysisMovementType;
	name: string;
	valueInCents: number;
	date: Date | null;
	bankId: string | null;
	bankName: string;
	isCash: boolean;
	explanation: string | null;
};

export type CategoryAnalysisReport = {
	tagId: string;
	tagName: string;
	currentMonthLabel: string;
	baselineMonthCount: number;
	months: CategoryAnalysisMonthBucket[];
	expense: CategoryAnalysisMetric;
	gain: CategoryAnalysisMetric;
	bankBreakdown: CategoryAnalysisBankBreakdown[];
	recentMovements: CategoryAnalysisRecentMovement[];
};

export type CategoryAnalysisData = {
	tags: CategoryAnalysisTagOption[];
	reportsByTagId: Record<string, CategoryAnalysisReport>;
	defaultTagId: string | null;
	baselineMonthCount: number;
	generatedAt: Date;
};

type FirestoreDocument = Record<string, unknown>;

type BankMetadata = {
	name: string;
	colorHex: string | null;
};

type MonthReference = {
	key: string;
	label: string;
	startDate: Date;
	endDate: Date;
	isCurrentMonth: boolean;
};

type NormalizedMovement = {
	id: string;
	type: CategoryAnalysisMovementType;
	tagId: string;
	name: string;
	valueInCents: number;
	date: Date | null;
	monthKey: string | null;
	bankId: string | null;
	bankName: string;
	isCash: boolean;
	explanation: string | null;
};

const CASH_ANALYSIS_ID = 'cash-transactions';
const STABLE_DELTA_PERCENT_THRESHOLD = 5;

const normalizeDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === 'object' && value !== null) {
		const timestampLike = value as { toDate?: () => Date; seconds?: number };
		if (typeof timestampLike.toDate === 'function') {
			const dateValue = timestampLike.toDate();
			return dateValue instanceof Date && !Number.isNaN(dateValue.getTime()) ? dateValue : null;
		}

		if (typeof timestampLike.seconds === 'number') {
			const dateValue = new Date(timestampLike.seconds * 1000);
			return Number.isNaN(dateValue.getTime()) ? null : dateValue;
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const dateValue = new Date(value);
		return Number.isNaN(dateValue.getTime()) ? null : dateValue;
	}

	return null;
};

const toMonthKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${year}-${month}`;
};

const toMonthLabel = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		month: 'short',
		year: '2-digit',
	}).format(date);

const buildMonthReferences = (baselineMonthCount: number) => {
	const safeBaselineCount = Math.max(1, Math.min(Math.trunc(baselineMonthCount), 12));
	const now = new Date();
	const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	return Array.from({ length: safeBaselineCount + 1 }).map((_, index): MonthReference => {
		const offset = index - safeBaselineCount;
		const startDate = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + offset, 1);
		const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
		const isCurrentMonth = offset === 0;

		return {
			key: toMonthKey(startDate),
			label: toMonthLabel(startDate),
			startDate,
			endDate,
			isCurrentMonth,
		};
	});
};

const normalizeTagIconFamily = (value: unknown): TagIconFamily | null => {
	if (value === 'ionicons' || value === 'material-community' || value === 'font-awesome-6') {
		return value;
	}

	return null;
};

const normalizeTagIconStyle = (value: unknown): TagIconStyle | undefined => {
	if (value === 'brand' || value === 'regular' || value === 'solid') {
		return value;
	}

	return undefined;
};

const normalizeTagIcon = (data: FirestoreDocument): TagIconSelection | null => {
	const iconFamily = normalizeTagIconFamily(data.iconFamily);
	const iconName = typeof data.iconName === 'string' && data.iconName.trim().length > 0
		? data.iconName.trim()
		: null;

	if (!iconFamily || !iconName) {
		return null;
	}

	return {
		iconFamily,
		iconName,
		iconStyle: normalizeTagIconStyle(data.iconStyle),
	};
};

const normalizePositiveCurrency = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const buildAllowedPersonIds = async (personId: string) => {
	const relatedUsersResult = await getRelatedUsersIDsFirebase(personId);
	if (!relatedUsersResult.success) {
		throw new Error('Erro ao obter usuários relacionados.');
	}

	const relatedUserIds = Array.isArray(relatedUsersResult.data) ? relatedUsersResult.data : [];
	return Array.from(
		new Set(
			[personId, ...relatedUserIds].filter(
				(candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
			),
		),
	);
};

const createEmptyMonthBuckets = (monthReferences: MonthReference[]) =>
	monthReferences.map<CategoryAnalysisMonthBucket>(month => ({
		key: month.key,
		label: month.label,
		isCurrentMonth: month.isCurrentMonth,
		expenseInCents: 0,
		gainInCents: 0,
		expenseCount: 0,
		gainCount: 0,
	}));

const createMetric = (
	months: CategoryAnalysisMonthBucket[],
	type: CategoryAnalysisMovementType,
	baselineMonthCount: number,
): CategoryAnalysisMetric => {
	const currentMonth = months.find(month => month.isCurrentMonth);
	const historyMonths = months.filter(month => !month.isCurrentMonth);
	const currentInCents = type === 'expense'
		? currentMonth?.expenseInCents ?? 0
		: currentMonth?.gainInCents ?? 0;
	const currentCount = type === 'expense'
		? currentMonth?.expenseCount ?? 0
		: currentMonth?.gainCount ?? 0;
	const historicalTotalInCents = historyMonths.reduce(
		(accumulator, month) =>
			accumulator + (type === 'expense' ? month.expenseInCents : month.gainInCents),
		0,
	);
	const historicalCount = historyMonths.reduce(
		(accumulator, month) => accumulator + (type === 'expense' ? month.expenseCount : month.gainCount),
		0,
	);
	const historicalAverageInCents = Math.round(historicalTotalInCents / baselineMonthCount);
	const deltaInCents = currentInCents - historicalAverageInCents;
	const deltaPercent =
		historicalAverageInCents > 0
			? Number(((deltaInCents / historicalAverageInCents) * 100).toFixed(1))
			: null;

	let status: CategoryAnalysisStatus = 'no-history';
	if (historicalAverageInCents > 0 && typeof deltaPercent === 'number') {
		if (Math.abs(deltaPercent) <= STABLE_DELTA_PERCENT_THRESHOLD) {
			status = 'stable';
		} else {
			status = deltaInCents > 0 ? 'above' : 'below';
		}
	}

	return {
		currentInCents,
		historicalAverageInCents,
		deltaInCents,
		deltaPercent,
		status,
		currentCount,
		historicalCount,
	};
};

const normalizeMovement = ({
	docId,
	data,
	type,
	bankMetadataById,
	monthKeys,
}: {
	docId: string;
	data: FirestoreDocument;
	type: CategoryAnalysisMovementType;
	bankMetadataById: Record<string, BankMetadata>;
	monthKeys: Set<string>;
}): NormalizedMovement | null => {
	if (!shouldIncludeMovementInGainExpenseTotals(data)) {
		return null;
	}

	const tagId = typeof data.tagId === 'string' && data.tagId.trim().length > 0
		? data.tagId.trim()
		: null;
	if (!tagId) {
		return null;
	}

	const date = normalizeDate(data.date ?? data.createdAt);
	const monthKey = date ? toMonthKey(date) : null;
	if (!monthKey || !monthKeys.has(monthKey)) {
		return null;
	}

	const bankId = typeof data.bankId === 'string' && data.bankId.trim().length > 0
		? data.bankId.trim()
		: null;
	const bankMetadata = bankId ? bankMetadataById[bankId] : null;
	const isCash = !bankId;

	return {
		id: docId,
		type,
		tagId,
		name:
			typeof data.name === 'string' && data.name.trim().length > 0
				? data.name.trim()
				: type === 'expense'
					? 'Despesa sem nome'
					: 'Ganho sem nome',
		valueInCents: normalizePositiveCurrency(data.valueInCents),
		date,
		monthKey,
		bankId,
		bankName: isCash ? 'Dinheiro' : bankMetadata?.name ?? 'Banco não identificado',
		isCash,
		explanation: typeof data.explanation === 'string' && data.explanation.trim().length > 0
			? data.explanation.trim()
			: null,
	};
};

export async function getCategoryAnalysisFirebase(
	personId: string,
	baselineMonthCount = 3,
): Promise<{ success: true; data: CategoryAnalysisData } | { success: false; error: unknown }> {
	try {
		if (!personId) {
			return { success: false, error: 'Usuário não informado.' };
		}

		const allowedPersonIds = await buildAllowedPersonIds(personId);
		const monthReferences = buildMonthReferences(baselineMonthCount);
		const effectiveBaselineMonthCount = monthReferences.filter(month => !month.isCurrentMonth).length;
		const monthKeys = new Set(monthReferences.map(month => month.key));
		const periodStart = monthReferences[0].startDate;
		const periodEnd = monthReferences[monthReferences.length - 1].endDate;

		const tagsQuery = query(collection(db, 'tags'), where('personId', 'in', allowedPersonIds));
		const banksQuery = query(collection(db, 'banks'), where('personId', 'in', allowedPersonIds));
		const expensesQuery = query(
			collection(db, 'expenses'),
			where('personId', 'in', allowedPersonIds),
			where('date', '>=', Timestamp.fromDate(periodStart)),
			where('date', '<=', Timestamp.fromDate(periodEnd)),
		);
		const gainsQuery = query(
			collection(db, 'gains'),
			where('personId', 'in', allowedPersonIds),
			where('date', '>=', Timestamp.fromDate(periodStart)),
			where('date', '<=', Timestamp.fromDate(periodEnd)),
		);

		const [tagsSnapshot, banksSnapshot, expensesSnapshot, gainsSnapshot] = await Promise.all([
			getDocs(tagsQuery),
			getDocs(banksQuery),
			getDocs(expensesQuery),
			getDocs(gainsQuery),
		]);

		const bankMetadataById = banksSnapshot.docs.reduce<Record<string, BankMetadata>>((acc, bankDoc) => {
			const bank = bankDoc.data() as FirestoreDocument;
			acc[bankDoc.id] = {
				name:
					typeof bank.name === 'string' && bank.name.trim().length > 0
						? bank.name.trim()
						: 'Banco sem nome',
				colorHex:
					typeof bank.colorHex === 'string' && bank.colorHex.trim().length > 0
						? bank.colorHex.trim()
						: null,
			};
			return acc;
		}, {});

		const tags = tagsSnapshot.docs
			.map<CategoryAnalysisTagOption>(tagDoc => {
				const tag = tagDoc.data() as FirestoreDocument;
				const usageType = normalizeTagUsageType(tag.usageType ?? tag.type) ?? null;

				return {
					id: tagDoc.id,
					name:
						typeof tag.name === 'string' && tag.name.trim().length > 0
					? tag.name.trim()
					: 'Categoria sem nome',
				usageType,
				isMandatoryExpense: Boolean(tag.isMandatoryExpense),
				isMandatoryGain: Boolean(tag.isMandatoryGain),
				icon: normalizeTagIcon(tag),
				currentExpenseInCents: 0,
					currentGainInCents: 0,
					movementCount: 0,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));

		const tagIds = new Set(tags.map(tag => tag.id));
		const movements = [
			...expensesSnapshot.docs
				.map(docSnap =>
					normalizeMovement({
						docId: docSnap.id,
						data: docSnap.data() as FirestoreDocument,
						type: 'expense',
						bankMetadataById,
						monthKeys,
					}),
				),
			...gainsSnapshot.docs
				.map(docSnap =>
					normalizeMovement({
						docId: docSnap.id,
						data: docSnap.data() as FirestoreDocument,
						type: 'gain',
						bankMetadataById,
						monthKeys,
					}),
				),
		].filter((movement): movement is NormalizedMovement => Boolean(movement && tagIds.has(movement.tagId)));

		const movementsByTagId = movements.reduce<Record<string, NormalizedMovement[]>>((acc, movement) => {
			if (!acc[movement.tagId]) {
				acc[movement.tagId] = [];
			}
			acc[movement.tagId].push(movement);
			return acc;
		}, {});

		const currentMonthKey = monthReferences.find(month => month.isCurrentMonth)?.key ?? monthReferences[monthReferences.length - 1].key;
		const currentMonthLabel = new Intl.DateTimeFormat('pt-BR', {
			month: 'long',
			year: 'numeric',
		}).format(monthReferences[monthReferences.length - 1].startDate);

		const reportsByTagId = tags.reduce<Record<string, CategoryAnalysisReport>>((acc, tag) => {
			const tagMovements = movementsByTagId[tag.id] ?? [];
			const months = createEmptyMonthBuckets(monthReferences);
			const monthIndexByKey = months.reduce<Record<string, number>>((indexAcc, month, index) => {
				indexAcc[month.key] = index;
				return indexAcc;
			}, {});
			const currentBreakdownById: Record<string, CategoryAnalysisBankBreakdown> = {};

			tagMovements.forEach(movement => {
				const monthIndex = movement.monthKey ? monthIndexByKey[movement.monthKey] : undefined;
				if (typeof monthIndex !== 'number') {
					return;
				}

				if (movement.type === 'expense') {
					months[monthIndex].expenseInCents += movement.valueInCents;
					months[monthIndex].expenseCount += 1;
				} else {
					months[monthIndex].gainInCents += movement.valueInCents;
					months[monthIndex].gainCount += 1;
				}

				if (movement.monthKey !== currentMonthKey) {
					return;
				}

				const breakdownId = movement.bankId ?? CASH_ANALYSIS_ID;
				if (!currentBreakdownById[breakdownId]) {
					const bankMetadata = movement.bankId ? bankMetadataById[movement.bankId] : null;
					currentBreakdownById[breakdownId] = {
						id: breakdownId,
						name: movement.bankName,
						colorHex: bankMetadata?.colorHex ?? null,
						isCash: movement.isCash,
						expenseInCents: 0,
						gainInCents: 0,
						movementCount: 0,
					};
				}

				if (movement.type === 'expense') {
					currentBreakdownById[breakdownId].expenseInCents += movement.valueInCents;
				} else {
					currentBreakdownById[breakdownId].gainInCents += movement.valueInCents;
				}
				currentBreakdownById[breakdownId].movementCount += 1;
			});

			acc[tag.id] = {
				tagId: tag.id,
				tagName: tag.name,
				currentMonthLabel,
				baselineMonthCount: effectiveBaselineMonthCount,
				months,
				expense: createMetric(months, 'expense', effectiveBaselineMonthCount),
				gain: createMetric(months, 'gain', effectiveBaselineMonthCount),
				bankBreakdown: Object.values(currentBreakdownById).sort(
					(left, right) =>
						right.expenseInCents + right.gainInCents - (left.expenseInCents + left.gainInCents),
				),
				recentMovements: [...tagMovements]
					.sort((left, right) => (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0))
					.slice(0, 8)
					.map(movement => ({
						id: movement.id,
						type: movement.type,
						name: movement.name,
						valueInCents: movement.valueInCents,
						date: movement.date,
						bankId: movement.bankId,
						bankName: movement.bankName,
						isCash: movement.isCash,
						explanation: movement.explanation,
					})),
			};

			const currentMonth = months.find(month => month.isCurrentMonth);
			tag.currentExpenseInCents = currentMonth?.expenseInCents ?? 0;
			tag.currentGainInCents = currentMonth?.gainInCents ?? 0;
			tag.movementCount = tagMovements.length;

			return acc;
		}, {});

		const sortedTags = [...tags].sort((left, right) => {
			const rightCurrentTotal = right.currentExpenseInCents + right.currentGainInCents;
			const leftCurrentTotal = left.currentExpenseInCents + left.currentGainInCents;
			if (rightCurrentTotal !== leftCurrentTotal) {
				return rightCurrentTotal - leftCurrentTotal;
			}

			if (right.movementCount !== left.movementCount) {
				return right.movementCount - left.movementCount;
			}

			return left.name.localeCompare(right.name, 'pt-BR');
		});

		return {
			success: true,
			data: {
				tags: sortedTags,
				reportsByTagId,
				defaultTagId: sortedTags[0]?.id ?? null,
				baselineMonthCount: effectiveBaselineMonthCount,
				generatedAt: new Date(),
			},
		};
	} catch (error) {
		console.error('Erro ao carregar análise por categoria:', error);
		return { success: false, error };
	}
}
