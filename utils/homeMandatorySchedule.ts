import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	formatMandatoryInstallmentLabel,
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';

export type HomeMandatoryItem = {
	id: string;
	name: string;
	type: 'expense' | 'gain';
	valueInCents: number;
	dueDate: Date;
	isOverdue: boolean;
	installmentLabel: string | null;
};

type MandatoryScheduleSource = Record<string, unknown> & { id: string };

const HOME_MANDATORY_ITEM_LIMIT = 3;
const MAX_MONTHS_TO_SEARCH = 24;

const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const monthKey = (date: Date) => date.getFullYear() * 12 + date.getMonth();

const isOccurrenceInPlan = (
	dueDate: Date,
	startDate: Date | null,
	endDate: Date | null,
) => {
	const occurrenceMonth = monthKey(dueDate);
	if (startDate && occurrenceMonth < monthKey(startDate)) return false;
	if (endDate && occurrenceMonth > monthKey(endDate)) return false;
	return true;
};

const buildNextItem = (
	source: MandatoryScheduleSource,
	type: HomeMandatoryItem['type'],
	referenceDate: Date,
): HomeMandatoryItem | null => {
	const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : null;
	const valueInCents = source.valueInCents;
	const dueDay = typeof source.dueDay === 'number' ? source.dueDay : 1;
	const usesBusinessDays = source.usesBusinessDays === true;
	const installmentTotal = normalizeMandatoryInstallmentTotal(source.installmentTotal);
	const startDate = normalizeMandatoryInstallmentDate(source.installmentStartDate);
	const endDate = normalizeMandatoryInstallmentDate(source.installmentEndDate);
	const completedCycleField = type === 'expense' ? 'lastPaymentCycle' : 'lastReceiptCycle';
	const completedCycle =
		typeof source[completedCycleField] === 'string' ? (source[completedCycleField] as string) : null;

	if (
		!name ||
		typeof valueInCents !== 'number' ||
		!Number.isSafeInteger(valueInCents) ||
		valueInCents <= 0
	) {
		return null;
	}

	for (let monthOffset = 0; monthOffset <= MAX_MONTHS_TO_SEARCH; monthOffset += 1) {
		const occurrenceMonth = new Date(
			referenceDate.getFullYear(),
			referenceDate.getMonth() + monthOffset,
			15,
			12,
			0,
			0,
		);
		const occurrence = resolveMonthlyOccurrence({
			referenceDate: occurrenceMonth,
			dueDay,
			usesBusinessDays,
		});

		if (!isOccurrenceInPlan(occurrence.date, startDate, endDate)) continue;

		const cycleKey = getCycleKeyFromDate(occurrence.date);
		const isCompletedForCycle = completedCycle === cycleKey;
		const installmentsCompleted = resolveMandatoryInstallmentsCompleted({
			storedCompleted: source.installmentsCompleted,
			installmentTotal,
			startDate,
			isCurrentCycleCompleted: isCompletedForCycle,
			referenceDate: occurrence.date,
		});

		if (isCompletedForCycle || isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted)) {
			continue;
		}

		return {
			id: source.id,
			name,
			type,
			valueInCents,
			dueDate: occurrence.date,
			isOverdue: occurrence.date.getTime() < startOfDay(referenceDate).getTime(),
			installmentLabel: formatMandatoryInstallmentLabel(
				installmentTotal,
				installmentsCompleted,
				isCompletedForCycle,
			),
		};
	}

	return null;
};

const buildNextItemsForType = (
	sources: MandatoryScheduleSource[],
	type: HomeMandatoryItem['type'],
	referenceDate: Date,
) =>
	sources
		.map((source) => buildNextItem(source, type, referenceDate))
		.filter((item): item is HomeMandatoryItem => Boolean(item))
		.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
		.slice(0, HOME_MANDATORY_ITEM_LIMIT);

export const buildHomeMandatorySchedule = (
	expenses: MandatoryScheduleSource[],
	gains: MandatoryScheduleSource[],
	referenceDate = new Date(),
) => [
	...buildNextItemsForType(expenses, 'expense', referenceDate),
	...buildNextItemsForType(gains, 'gain', referenceDate),
];
