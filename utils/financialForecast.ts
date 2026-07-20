import { resolveMonthlyOccurrence } from '@/utils/businessCalendar';
import { RedemptionTerm } from '@/utils/finance';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import {
	isMandatoryInstallmentPlanComplete,
	normalizeMandatoryInstallmentDate,
	normalizeMandatoryInstallmentTotal,
	normalizeMandatoryInstallmentsCompleted,
	resolveMandatoryInstallmentsCompleted,
} from '@/utils/mandatoryInstallments';
import { shouldIncludeMovementInGainExpenseTotals } from '@/utils/monthlyBalance';

export const FINANCIAL_FORECAST_PERIOD_OPTIONS = [3, 6, 12] as const;

export type FinancialForecastPeriod = (typeof FINANCIAL_FORECAST_PERIOD_OPTIONS)[number];
export type FinancialForecastMovementType = 'expense' | 'gain';
export type FinancialForecastCommitmentKind =
	| 'fixed-expense'
	| 'fixed-gain'
	| 'variable-expense'
	| 'variable-gain'
	| 'scheduled-expense'
	| 'scheduled-gain'
	| 'investment-outflow'
	| 'investment-inflow'
	| 'investment-liquidity';

export type FinancialForecastMovement = {
	id: string;
	type: FinancialForecastMovementType;
	name: string;
	valueInCents: number;
	date: Date;
	tagId: string | null;
	tagName: string | null;
	bankId: string | null;
	isInvestmentDeposit: boolean;
	isInvestmentRedemption: boolean;
	isBankTransfer: boolean;
	isFinanceInvestment: boolean;
	isFinanceInvestmentSync: boolean;
};

export type FinancialForecastMandatoryTemplate = {
	id: string;
	type: FinancialForecastMovementType;
	name: string;
	valueInCents: number;
	dueDay: number;
	usesBusinessDays: boolean;
	tagId: string | null;
	tagName: string | null;
	lastCompletedCycle: string | null;
	installmentTotal: number | null;
	installmentsCompleted: number;
	installmentStartDate: Date | null;
	installmentEndDate: Date | null;
};

export type FinancialForecastInvestment = {
	id: string;
	name: string;
	initialValueInCents: number;
	currentValueInCents: number;
	date: Date;
	bankId: string | null;
	redemptionTerm: RedemptionTerm;
};

export type FinancialForecastBankSnapshot = {
	bankId: string;
	bankName: string;
	snapshotDate: Date | null;
	valueInCents: number | null;
};

export type FinancialForecastCashRescue = {
	id: string;
	bankId: string | null;
	valueInCents: number;
	date: Date;
};

export type FinancialForecastCommitment = {
	id: string;
	kind: FinancialForecastCommitmentKind;
	name: string;
	date: Date;
	valueInCents: number;
	tagName: string | null;
	isOverdue: boolean;
	/** Quantos meses fechados registraram a categoria desta estimativa variável. */
	historicalOccurrenceMonths?: number;
};

export type FinancialForecastMonth = {
	key: string;
	label: string;
	startDate: Date;
	openingBalanceInCents: number;
	closingBalanceInCents: number;
	gainsInCents: number;
	expensesInCents: number;
	netChangeInCents: number;
	fixedExpensesInCents: number;
	fixedGainsInCents: number;
	variableExpensesInCents: number;
	variableGainsInCents: number;
	scheduledExpensesInCents: number;
	scheduledGainsInCents: number;
	investmentOutflowsInCents: number;
	investmentInflowsInCents: number;
	commitments: FinancialForecastCommitment[];
};

export type FinancialForecastData = {
	generatedAt: Date;
	periodInMonths: FinancialForecastPeriod;
	openingBalanceInCents: number;
	finalBalanceInCents: number;
	totalGainsInCents: number;
	totalExpensesInCents: number;
	historicalMonthsUsed: number;
	missingSnapshotBankNames: string[];
	months: FinancialForecastMonth[];
};

type HistoricalCategoryAverage = {
	categoryKey: string;
	tagName: string | null;
	valueInCents: number;
	occurrenceMonths: number;
};

type ForecastMonthAccumulator = Omit<FinancialForecastMonth, 'openingBalanceInCents' | 'closingBalanceInCents' | 'netChangeInCents'>;

export type FinancialForecastOpeningBalanceInput = {
	asOfDate: Date;
	banks: FinancialForecastBankSnapshot[];
	movements: FinancialForecastMovement[];
	investments: FinancialForecastInvestment[];
	cashRescues?: FinancialForecastCashRescue[];
};

export type FinancialForecastOpeningBalance = {
	openingBalanceInCents: number;
	missingSnapshotBankNames: string[];
};

export type BuildFinancialForecastInput = {
	asOfDate: Date;
	periodInMonths: FinancialForecastPeriod;
	openingBalanceInCents: number;
	missingSnapshotBankNames?: string[];
	movements: FinancialForecastMovement[];
	mandatoryTemplates: FinancialForecastMandatoryTemplate[];
	investments: FinancialForecastInvestment[];
};

const HISTORICAL_MONTH_COUNT = 3;
const MINIMUM_HISTORICAL_OCCURRENCE_MONTHS = 2;
const UNCATEGORIZED_KEY = '__uncategorized__';

const createLocalDate = (year: number, monthIndex: number, day = 1) =>
	new Date(year, monthIndex, day, 12, 0, 0, 0);

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

const startOfLocalDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

const endOfLocalDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const addMonths = (date: Date, amount: number) =>
	new Date(date.getFullYear(), date.getMonth() + amount, 1, 0, 0, 0, 0);

const addMonthsPreservingDay = (date: Date, amount: number) => {
	const monthIndex = date.getMonth() + amount;
	const targetYear = date.getFullYear() + Math.floor(monthIndex / 12);
	const targetMonth = ((monthIndex % 12) + 12) % 12;
	const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
	return createLocalDate(targetYear, targetMonth, Math.min(date.getDate(), daysInTargetMonth));
};

const isValidDate = (value: Date | null | undefined): value is Date =>
	value instanceof Date && !Number.isNaN(value.getTime());

const isInMonth = (date: Date, monthStart: Date) =>
	date.getFullYear() === monthStart.getFullYear() && date.getMonth() === monthStart.getMonth();

const isAfterDay = (date: Date, referenceDate: Date) => date.getTime() > endOfLocalDay(referenceDate).getTime();

const normalizeMoneyInCents = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const normalizeSignedMoneyInCents = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;

const normalizeComparableText = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLocaleLowerCase('pt-BR')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');

const getCategoryKey = (movement: Pick<FinancialForecastMovement, 'tagId'>) =>
	movement.tagId?.trim() || UNCATEGORIZED_KEY;

const getTemplateSignature = (template: Pick<FinancialForecastMandatoryTemplate, 'type' | 'name' | 'tagId'>) =>
	[template.type, normalizeComparableText(template.name), template.tagId?.trim() ?? ''].join('|');

const getMovementSignature = (movement: Pick<FinancialForecastMovement, 'type' | 'name' | 'tagId'>) =>
	[movement.type, normalizeComparableText(movement.name), movement.tagId?.trim() ?? ''].join('|');

const getMonthLabel = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		month: 'short',
		year: 'numeric',
	}).format(date);

const isPnlMovement = (movement: FinancialForecastMovement) =>
	!movement.isBankTransfer &&
	shouldIncludeMovementInGainExpenseTotals({
		isInvestmentDeposit: movement.isInvestmentDeposit,
		isInvestmentRedemption: movement.isInvestmentRedemption,
		isFinanceInvestment: movement.isFinanceInvestment,
		isFinanceInvestmentSync: movement.isFinanceInvestmentSync,
	});

const sortCommitments = (commitments: FinancialForecastCommitment[]) =>
	commitments.sort((left, right) => {
		const dateDifference = left.date.getTime() - right.date.getTime();
		if (dateDifference !== 0) {
			return dateDifference;
		}

		return left.name.localeCompare(right.name, 'pt-BR');
	});

const getRedemptionAvailabilityDate = (investment: FinancialForecastInvestment) => {
	switch (investment.redemptionTerm) {
		case '1m':
			return addMonthsPreservingDay(investment.date, 1);
		case '3m':
			return addMonthsPreservingDay(investment.date, 3);
		case '6m':
			return addMonthsPreservingDay(investment.date, 6);
		case '1y':
			return addMonthsPreservingDay(investment.date, 12);
		case '2y':
			return addMonthsPreservingDay(investment.date, 24);
		case '3y':
			return addMonthsPreservingDay(investment.date, 36);
		case 'anytime':
		default:
			return null;
	}
};

const findLatestSnapshot = (
	banks: FinancialForecastBankSnapshot[],
	asOfDate: Date,
) => {
	const latestByBankId = new Map<string, FinancialForecastBankSnapshot>();

	banks.forEach(bank => {
		if (!bank.bankId || !isValidDate(bank.snapshotDate) || bank.snapshotDate.getTime() > endOfLocalDay(asOfDate).getTime()) {
			return;
		}

		const current = latestByBankId.get(bank.bankId);
		if (!current || (current.snapshotDate?.getTime() ?? 0) < bank.snapshotDate.getTime()) {
			latestByBankId.set(bank.bankId, bank);
		}
	});

	return latestByBankId;
};

// [[Balanço Mensal]] registra o saldo no início do ciclo. Esta função o atualiza
// apenas com eventos já datados até hoje e mantém as contas sem saldo-base fora
// do total, evitando uma falsa precisão na previsão de caixa.
export const calculateFinancialForecastOpeningBalance = ({
	asOfDate,
	banks,
	movements,
	investments,
	cashRescues = [],
}: FinancialForecastOpeningBalanceInput): FinancialForecastOpeningBalance => {
	const asOfEnd = endOfLocalDay(asOfDate);
	const latestSnapshotsByBankId = findLatestSnapshot(banks, asOfDate);
	const missingSnapshotBankNames = Array.from(
		new Set(
			banks
				.filter(bank => !latestSnapshotsByBankId.has(bank.bankId))
				.map(bank => bank.bankName)
				.filter(name => name.trim().length > 0),
		),
	).sort((left, right) => left.localeCompare(right, 'pt-BR'));

	let openingBalanceInCents = Array.from(latestSnapshotsByBankId.values()).reduce(
		(total, snapshot) => total + normalizeSignedMoneyInCents(snapshot.valueInCents),
		0,
	);

	movements.forEach(movement => {
		if (!isValidDate(movement.date) || movement.date.getTime() > asOfEnd.getTime() || movement.isBankTransfer) {
			return;
		}

		const valueInCents = normalizeMoneyInCents(movement.valueInCents);
		if (valueInCents <= 0) {
			return;
		}

		if (!movement.bankId) {
			openingBalanceInCents += movement.type === 'gain' ? valueInCents : -valueInCents;
			return;
		}

		const snapshot = latestSnapshotsByBankId.get(movement.bankId);
		if (!snapshot?.snapshotDate || movement.date.getTime() < startOfLocalDay(snapshot.snapshotDate).getTime()) {
			return;
		}

		openingBalanceInCents += movement.type === 'gain' ? valueInCents : -valueInCents;
	});

	investments.forEach(investment => {
		if (!isValidDate(investment.date) || investment.date.getTime() > asOfEnd.getTime()) {
			return;
		}

		const valueInCents = normalizeMoneyInCents(investment.initialValueInCents);
		if (valueInCents <= 0) {
			return;
		}

		if (!investment.bankId) {
			openingBalanceInCents -= valueInCents;
			return;
		}

		const snapshot = latestSnapshotsByBankId.get(investment.bankId);
		if (snapshot?.snapshotDate && investment.date.getTime() >= startOfLocalDay(snapshot.snapshotDate).getTime()) {
			openingBalanceInCents -= valueInCents;
		}
	});

	// Saque em dinheiro muda apenas a composição do patrimônio líquido. Quando a
	// conta de origem tem saldo-base, o débito bancário anula a entrada em espécie;
	// sem saldo-base, a espécie ainda é conhecida e permanece contabilizada.
	cashRescues.forEach(rescue => {
		if (!isValidDate(rescue.date) || rescue.date.getTime() > asOfEnd.getTime()) {
			return;
		}

		const valueInCents = normalizeMoneyInCents(rescue.valueInCents);
		if (valueInCents <= 0) {
			return;
		}

		openingBalanceInCents += valueInCents;
		const snapshot = rescue.bankId ? latestSnapshotsByBankId.get(rescue.bankId) : null;
		if (snapshot?.snapshotDate && rescue.date.getTime() >= startOfLocalDay(snapshot.snapshotDate).getTime()) {
			openingBalanceInCents -= valueInCents;
		}
	});

	return {
		openingBalanceInCents,
		missingSnapshotBankNames,
	};
};

const buildHistoricalAverages = ({
	movements,
	mandatoryTemplates,
	asOfDate,
}: Pick<BuildFinancialForecastInput, 'movements' | 'mandatoryTemplates' | 'asOfDate'>) => {
	const firstHistoricalMonth = addMonths(startOfMonth(asOfDate), -HISTORICAL_MONTH_COUNT);
	const currentMonthStart = startOfMonth(asOfDate);
	const mandatorySignatures = new Set(mandatoryTemplates.map(getTemplateSignature));
	const totals = new Map<
		string,
		{
			type: FinancialForecastMovementType;
			tagName: string | null;
			totalInCents: number;
			occurrenceMonthKeys: Set<string>;
		}
	>();

	movements.forEach(movement => {
		if (
			!isPnlMovement(movement) ||
			movement.date.getTime() < firstHistoricalMonth.getTime() ||
			movement.date.getTime() >= currentMonthStart.getTime() ||
			mandatorySignatures.has(getMovementSignature(movement))
		) {
			return;
		}

		const categoryKey = getCategoryKey(movement);
		const aggregateKey = `${movement.type}|${categoryKey}`;
		const current = totals.get(aggregateKey) ?? {
			type: movement.type,
			tagName: movement.tagName,
			totalInCents: 0,
			occurrenceMonthKeys: new Set<string>(),
		};
		current.totalInCents += normalizeMoneyInCents(movement.valueInCents);
		current.occurrenceMonthKeys.add(getCycleKeyFromDate(movement.date));
		if (!current.tagName && movement.tagName) {
			current.tagName = movement.tagName;
		}
		totals.set(aggregateKey, current);
	});

	const averages: Record<FinancialForecastMovementType, HistoricalCategoryAverage[]> = {
		expense: [],
		gain: [],
	};

	totals.forEach((total, aggregateKey) => {
		const [, categoryKey = UNCATEGORIZED_KEY] = aggregateKey.split('|');
		// [[Previsão de Fluxo de Caixa]]: gasto pontual, mesmo com vários lançamentos
		// no mesmo mês, não é evidência suficiente para projetar um novo compromisso.
		if (total.occurrenceMonthKeys.size < MINIMUM_HISTORICAL_OCCURRENCE_MONTHS) {
			return;
		}

		const averageInCents = Math.round(total.totalInCents / HISTORICAL_MONTH_COUNT);
		if (averageInCents <= 0) {
			return;
		}

		averages[total.type].push({
			categoryKey,
			tagName: total.tagName,
			valueInCents: averageInCents,
			occurrenceMonths: total.occurrenceMonthKeys.size,
		});
	});

	averages.expense.sort((left, right) => right.valueInCents - left.valueInCents);
	averages.gain.sort((left, right) => right.valueInCents - left.valueInCents);

	return averages;
};

const isTemplateExpectedInMonth = ({
	template,
	monthStart,
	movements,
}: {
	template: FinancialForecastMandatoryTemplate;
	monthStart: Date;
	movements: FinancialForecastMovement[];
}) => {
	const cycleKey = getCycleKeyFromDate(monthStart);
	if (template.lastCompletedCycle === cycleKey) {
		return false;
	}

	const hasMatchingMovementInCycle = movements.some(
		movement =>
			isPnlMovement(movement) &&
			isInMonth(movement.date, monthStart) &&
			getMovementSignature(movement) === getTemplateSignature(template) &&
			normalizeMoneyInCents(movement.valueInCents) === normalizeMoneyInCents(template.valueInCents),
	);
	if (hasMatchingMovementInCycle) {
		return false;
	}

	const installmentStartDate = normalizeMandatoryInstallmentDate(template.installmentStartDate);
	const installmentEndDate = normalizeMandatoryInstallmentDate(template.installmentEndDate);
	if (installmentStartDate && cycleKey < getCycleKeyFromDate(installmentStartDate)) {
		return false;
	}
	if (installmentEndDate && cycleKey > getCycleKeyFromDate(installmentEndDate)) {
		return false;
	}

	const installmentTotal = normalizeMandatoryInstallmentTotal(template.installmentTotal);
	const installmentsCompleted = resolveMandatoryInstallmentsCompleted({
		storedCompleted: normalizeMandatoryInstallmentsCompleted(
			template.installmentsCompleted,
			installmentTotal,
		),
		installmentTotal,
		startDate: installmentStartDate,
		isCurrentCycleCompleted: false,
		referenceDate: monthStart,
	});

	return !isMandatoryInstallmentPlanComplete(installmentTotal, installmentsCompleted);
};

const createMonthAccumulator = (monthStart: Date): ForecastMonthAccumulator => ({
	key: getCycleKeyFromDate(monthStart),
	label: getMonthLabel(monthStart),
	startDate: monthStart,
	gainsInCents: 0,
	expensesInCents: 0,
	fixedExpensesInCents: 0,
	fixedGainsInCents: 0,
	variableExpensesInCents: 0,
	variableGainsInCents: 0,
	scheduledExpensesInCents: 0,
	scheduledGainsInCents: 0,
	investmentOutflowsInCents: 0,
	investmentInflowsInCents: 0,
	commitments: [],
});

const appendCommitment = (
	month: ForecastMonthAccumulator,
	commitment: FinancialForecastCommitment,
) => {
	month.commitments.push(commitment);

	switch (commitment.kind) {
		case 'fixed-expense':
			month.fixedExpensesInCents += commitment.valueInCents;
			month.expensesInCents += commitment.valueInCents;
			break;
		case 'fixed-gain':
			month.fixedGainsInCents += commitment.valueInCents;
			month.gainsInCents += commitment.valueInCents;
			break;
		case 'variable-expense':
			month.variableExpensesInCents += commitment.valueInCents;
			month.expensesInCents += commitment.valueInCents;
			break;
		case 'variable-gain':
			month.variableGainsInCents += commitment.valueInCents;
			month.gainsInCents += commitment.valueInCents;
			break;
		case 'scheduled-expense':
			month.scheduledExpensesInCents += commitment.valueInCents;
			month.expensesInCents += commitment.valueInCents;
			break;
		case 'scheduled-gain':
			month.scheduledGainsInCents += commitment.valueInCents;
			month.gainsInCents += commitment.valueInCents;
			break;
		case 'investment-outflow':
			month.investmentOutflowsInCents += commitment.valueInCents;
			month.expensesInCents += commitment.valueInCents;
			break;
		case 'investment-inflow':
			month.investmentInflowsInCents += commitment.valueInCents;
			month.gainsInCents += commitment.valueInCents;
			break;
		case 'investment-liquidity':
			break;
	}
};

// A previsão é um cálculo derivado e deliberadamente não cria transações.
// Valores continuam em centavos até a camada de apresentação, conforme [[Arquitetura]].
export const buildFinancialForecast = ({
	asOfDate,
	periodInMonths,
	openingBalanceInCents,
	missingSnapshotBankNames = [],
	movements,
	mandatoryTemplates,
	investments,
}: BuildFinancialForecastInput): FinancialForecastData => {
	const period = FINANCIAL_FORECAST_PERIOD_OPTIONS.includes(periodInMonths)
		? periodInMonths
		: FINANCIAL_FORECAST_PERIOD_OPTIONS[0];
	const currentMonthStart = startOfMonth(asOfDate);
	const monthAccumulators = Array.from({ length: period }, (_, monthIndex) =>
		createMonthAccumulator(addMonths(currentMonthStart, monthIndex)),
	);
	const monthByKey = new Map(monthAccumulators.map(month => [month.key, month]));
	const historicalAverages = buildHistoricalAverages({ movements, mandatoryTemplates, asOfDate });

	monthAccumulators.forEach(month => {
		const scheduledCategoryKeys: Record<FinancialForecastMovementType, Set<string>> = {
			expense: new Set<string>(),
			gain: new Set<string>(),
		};

		movements.forEach(movement => {
			if (
				!isInMonth(movement.date, month.startDate) ||
				!isAfterDay(movement.date, asOfDate) ||
				movement.isBankTransfer
			) {
				return;
			}

			const valueInCents = normalizeMoneyInCents(movement.valueInCents);
			if (valueInCents <= 0) {
				return;
			}

			if (movement.type === 'expense' && movement.isInvestmentDeposit) {
				appendCommitment(month, {
					id: `investment-deposit-${movement.id}`,
					kind: 'investment-outflow',
					name: movement.name,
					date: movement.date,
					valueInCents,
					tagName: movement.tagName,
					isOverdue: false,
				});
				return;
			}

			if (movement.type === 'gain' && movement.isInvestmentRedemption) {
				appendCommitment(month, {
					id: `investment-redemption-${movement.id}`,
					kind: 'investment-inflow',
					name: movement.name,
					date: movement.date,
					valueInCents,
					tagName: movement.tagName,
					isOverdue: false,
				});
				return;
			}

			if (!isPnlMovement(movement)) {
				return;
			}

			scheduledCategoryKeys[movement.type].add(getCategoryKey(movement));
			appendCommitment(month, {
				id: `scheduled-${movement.id}`,
				kind: movement.type === 'expense' ? 'scheduled-expense' : 'scheduled-gain',
				name: movement.name,
				date: movement.date,
				valueInCents,
				tagName: movement.tagName,
				isOverdue: false,
			});
		});

		mandatoryTemplates.forEach(template => {
			if (!isTemplateExpectedInMonth({ template, monthStart: month.startDate, movements })) {
				return;
			}

			const occurrence = resolveMonthlyOccurrence({
				referenceDate: month.startDate,
				dueDay: template.dueDay,
				usesBusinessDays: template.usesBusinessDays,
			}).date;
			const valueInCents = normalizeMoneyInCents(template.valueInCents);
			if (valueInCents <= 0) {
				return;
			}

			appendCommitment(month, {
				id: `mandatory-${template.id}-${month.key}`,
				kind: template.type === 'expense' ? 'fixed-expense' : 'fixed-gain',
				name: template.name,
				date: occurrence,
				valueInCents,
				tagName: template.tagName,
				isOverdue:
					month.key === getCycleKeyFromDate(asOfDate) && occurrence.getTime() < startOfLocalDay(asOfDate).getTime(),
			});
		});

		(['expense', 'gain'] as const).forEach(type => {
			historicalAverages[type].forEach(average => {
				if (scheduledCategoryKeys[type].has(average.categoryKey)) {
					return;
				}

				appendCommitment(month, {
					id: `historical-${type}-${average.categoryKey}-${month.key}`,
					kind: type === 'expense' ? 'variable-expense' : 'variable-gain',
					name: average.tagName ?? 'Categoria sem nome',
					date: month.startDate,
					valueInCents: average.valueInCents,
					tagName: average.tagName,
					isOverdue: false,
					historicalOccurrenceMonths: average.occurrenceMonths,
				});
			});
		});
	});

	investments.forEach(investment => {
		if (isAfterDay(investment.date, asOfDate)) {
			const scheduledInvestmentMonth = monthByKey.get(getCycleKeyFromDate(investment.date));
			if (scheduledInvestmentMonth) {
				const valueInCents = normalizeMoneyInCents(investment.initialValueInCents);
				if (valueInCents > 0) {
					appendCommitment(scheduledInvestmentMonth, {
						id: `investment-initial-${investment.id}`,
						kind: 'investment-outflow',
						name: investment.name,
						date: investment.date,
						valueInCents,
						tagName: null,
						isOverdue: false,
					});
				}
			}
		}

		const availabilityDate = getRedemptionAvailabilityDate(investment);
		if (!availabilityDate || !isAfterDay(availabilityDate, asOfDate)) {
			return;
		}

		const availabilityMonth = monthByKey.get(getCycleKeyFromDate(availabilityDate));
		if (!availabilityMonth) {
			return;
		}

		const valueInCents = normalizeMoneyInCents(investment.currentValueInCents);
		if (valueInCents > 0) {
			appendCommitment(availabilityMonth, {
				id: `investment-liquidity-${investment.id}`,
				kind: 'investment-liquidity',
				name: `${investment.name} disponível para resgate`,
				date: availabilityDate,
				valueInCents,
				tagName: null,
				isOverdue: false,
			});
		}
	});

	let runningBalanceInCents = Math.trunc(openingBalanceInCents);
	const months = monthAccumulators.map(month => {
		const netChangeInCents = month.gainsInCents - month.expensesInCents;
		const resolvedMonth: FinancialForecastMonth = {
			...month,
			openingBalanceInCents: runningBalanceInCents,
			closingBalanceInCents: runningBalanceInCents + netChangeInCents,
			netChangeInCents,
			commitments: sortCommitments(month.commitments),
		};
		runningBalanceInCents = resolvedMonth.closingBalanceInCents;
		return resolvedMonth;
	});

	return {
		generatedAt: new Date(asOfDate),
		periodInMonths: period,
		openingBalanceInCents: Math.trunc(openingBalanceInCents),
		finalBalanceInCents: runningBalanceInCents,
		totalGainsInCents: months.reduce((total, month) => total + month.gainsInCents, 0),
		totalExpensesInCents: months.reduce((total, month) => total + month.expensesInCents, 0),
		historicalMonthsUsed: HISTORICAL_MONTH_COUNT,
		missingSnapshotBankNames: Array.from(new Set(missingSnapshotBankNames)).sort((left, right) =>
			left.localeCompare(right, 'pt-BR'),
		),
		months,
	};
};
