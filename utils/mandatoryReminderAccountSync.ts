import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';
import { isCycleKeyCurrent } from '@/utils/mandatoryExpenses';
import {
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import {
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';
import {
	setActiveMandatoryReminderAccount,
	type MandatoryReminderSyncItem,
} from '@/utils/mandatoryReminderNotifications';
import { syncMandatoryExpenseNotifications } from '@/utils/mandatoryExpenseNotifications';
import { syncMandatoryGainNotifications } from '@/utils/mandatoryGainNotifications';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
} from '@/utils/mandatoryReminderTime';

type MandatoryReminderSource = Record<string, unknown>;

const buildInstallmentState = (
	source: MandatoryReminderSource,
	completedCycleField: 'lastPaymentCycle' | 'lastReceiptCycle',
	referenceDate: Date,
) => {
	const installmentTotal = normalizeMandatoryInstallmentTotal(source.installmentTotal);
	const completedCycle =
		typeof source[completedCycleField] === 'string' ? (source[completedCycleField] as string) : null;
	const installmentsCompleted = resolveMandatoryInstallmentsCompleted({
		storedCompleted: source.installmentsCompleted,
		installmentTotal,
		startDate: normalizeMandatoryInstallmentDate(source.installmentStartDate),
		isCurrentCycleCompleted: isCycleKeyCurrent(completedCycle),
		referenceDate,
	});

	return {
		isComplete: isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted),
		activeFromDate: normalizeMandatoryInstallmentDate(source.installmentStartDate) ?? undefined,
		activeThroughDate: normalizeMandatoryInstallmentDate(source.installmentEndDate) ?? undefined,
	};
};

export const buildMandatoryExpenseReminderSyncItems = (
	sources: MandatoryReminderSource[],
	referenceDate = new Date(),
): MandatoryReminderSyncItem[] =>
	sources.map(source => {
		const installment = buildInstallmentState(source, 'lastPaymentCycle', referenceDate);
		const reminderEnabled = isMandatoryReminderConfigured(source);

		return {
			id: typeof source.id === 'string' ? source.id : '',
			name: typeof source.name === 'string' ? source.name : 'Gasto sem nome',
			dueDay: typeof source.dueDay === 'number' ? source.dueDay : 1,
			usesBusinessDays: source.usesBusinessDays === true,
			reminderEnabled: !installment.isComplete && reminderEnabled,
			reminderDaysBefore: normalizeMandatoryReminderDaysBefore(source.reminderDaysBefore),
			reminderOnDueDate: source.reminderOnDueDate === true,
			reminderHour:
				typeof source.reminderHour === 'number'
					? source.reminderHour
					: DEFAULT_MANDATORY_REMINDER_HOUR,
			reminderMinute:
				typeof source.reminderMinute === 'number'
					? source.reminderMinute
					: DEFAULT_MANDATORY_REMINDER_MINUTE,
			description: typeof source.description === 'string' ? source.description : null,
			lastCompletedCycle:
				typeof source.lastPaymentCycle === 'string' ? source.lastPaymentCycle : undefined,
			activeFromDate: installment.activeFromDate,
			activeThroughDate: installment.activeThroughDate,
		};
	});

export const buildMandatoryGainReminderSyncItems = (
	sources: MandatoryReminderSource[],
	referenceDate = new Date(),
): MandatoryReminderSyncItem[] =>
	sources.map(source => {
		const installment = buildInstallmentState(source, 'lastReceiptCycle', referenceDate);

		return {
			id: typeof source.id === 'string' ? source.id : '',
			name: typeof source.name === 'string' ? source.name : 'Ganho sem nome',
			dueDay: typeof source.dueDay === 'number' ? source.dueDay : 1,
			usesBusinessDays: source.usesBusinessDays === true,
			reminderEnabled: !installment.isComplete && isMandatoryReminderConfigured(source),
			reminderHour:
				typeof source.reminderHour === 'number'
					? source.reminderHour
					: DEFAULT_MANDATORY_REMINDER_HOUR,
			reminderMinute:
				typeof source.reminderMinute === 'number'
					? source.reminderMinute
					: DEFAULT_MANDATORY_REMINDER_MINUTE,
			reminderDaysBefore: 0,
			reminderOnDueDate: true,
			description: typeof source.description === 'string' ? source.description : null,
			lastCompletedCycle:
				typeof source.lastReceiptCycle === 'string' ? source.lastReceiptCycle : undefined,
			activeFromDate: installment.activeFromDate,
			activeThroughDate: installment.activeThroughDate,
		};
	});

export const loadMandatoryReminderSyncItems = async (accountId: string) => {
	const [expensesResult, gainsResult] = await Promise.all([
		getMandatoryExpensesWithRelationsFirebase(accountId),
		getMandatoryGainsWithRelationsFirebase(accountId),
	]);
	const referenceDate = new Date();

	return {
		expenses:
			expensesResult.success && Array.isArray(expensesResult.data)
				? buildMandatoryExpenseReminderSyncItems(expensesResult.data, referenceDate)
				: null,
		gains:
			gainsResult.success && Array.isArray(gainsResult.data)
				? buildMandatoryGainReminderSyncItems(gainsResult.data, referenceDate)
				: null,
	};
};

export const synchronizeMandatoryReminderAccount = async (
	accountId: string,
	shouldContinue: () => boolean = () => true,
) => {
	await setActiveMandatoryReminderAccount(accountId);
	if (!shouldContinue()) {
		return { complete: false, cancelled: true };
	}

	const syncItems = await loadMandatoryReminderSyncItems(accountId);
	if (!shouldContinue()) {
		return { complete: false, cancelled: true };
	}

	let schedulesComplete = true;
	if (syncItems.expenses) {
		const result = await syncMandatoryExpenseNotifications(accountId, syncItems.expenses);
		schedulesComplete = schedulesComplete && result.failed === 0;
	}
	if (shouldContinue() && syncItems.gains) {
		const result = await syncMandatoryGainNotifications(accountId, syncItems.gains);
		schedulesComplete = schedulesComplete && result.failed === 0;
	}

	return {
		complete: Boolean(syncItems.expenses && syncItems.gains && schedulesComplete),
		cancelled: !shouldContinue(),
	};
};
