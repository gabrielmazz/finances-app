import type { SparkAccountReadModel } from '../functions/SparkAccountReadFirebase';
import type { SparkFinancialReadEvent } from './sparkFinancialReadModel';
import { getSparkCurrentOrdinaryMovements } from './sparkFinancialReadModel';
import { buildFinancialForecast, type FinancialForecastMovement, type FinancialForecastPeriod, type FinancialForecastInvestment } from './financialForecast';
import type { SparkRecurringReadModel } from './sparkRecurringReadModel';
import { fromFinancialCivilDate, toFinancialCivilDate } from './financialCivilDate';
import { getMandatoryInstallmentValueInCents, getMandatoryInstallmentRemainingValueInCents } from './mandatoryInstallments';
import { resolveMonthlyOccurrence } from './businessCalendar';
import { getCycleKeyFromDate } from './mandatoryExpenses';
import { addHomeCents } from './homeCents';
import type { RedemptionTerm } from './finance';

/** [[Previsão de Fluxo de Caixa]]: posições já contêm o journal; só compromissos pendentes são projetados. */
export function projectSparkForecast(accounts: SparkAccountReadModel[], events: SparkFinancialReadEvent[], plans: SparkRecurringReadModel[],
  categories: Map<string, string>, now: Date, period: FinancialForecastPeriod) {
  if (!Number.isFinite(now.getTime()) || ![3, 6, 12].includes(period)) throw new Error('Data ou horizonte inválido.');
  const civil = toFinancialCivilDate(now), active = accounts.filter(account => account.position.active);
  if (!active.some(account => account.accountId === 'cash' && account.position.kind === 'cash')) throw new Error('Caixa canônico indisponível.');
  if (active.some(account => account.positionStatus !== 'current')) throw new Error('Atualize as aberturas vencidas antes da previsão.');
  const sum = (values: number[]) => values.reduce(addHomeCents, 0);
  const openingBalanceInCents = sum(active.filter(account => account.position.kind !== 'investment').map(account => account.position.balanceInCents));
  const movements: FinancialForecastMovement[] = getSparkCurrentOrdinaryMovements(events, now)
    .filter(event => event.economicKind && !event.recurringPlanId && event.effectiveAt <= now)
    .map(event => ({ id: event.id, name: event.details?.name ?? event.note ?? 'Movimentação', type: event.economicKind === 'income' ? 'gain' : 'expense',
      date: toFinancialCivilDate(event.effectiveAt), valueInCents: Math.abs(event.deltaInCents), bankId: event.accountId === 'cash' ? null : event.accountId,
      tagId: event.categoryId, tagName: event.categoryId ? categories.get(event.categoryId) ?? null : null,
      isBankTransfer: false, isInvestmentDeposit: false, isInvestmentRedemption: false, isFinanceInvestment: false, isFinanceInvestmentSync: false }));
  const investments: FinancialForecastInvestment[] = active.filter(account => account.position.kind === 'investment').flatMap(account => {
    const opened = events.find(event => event.operationId === account.principal?.openingOperationId && event.accountId === account.accountId);
    const term = account.catalog?.redemptionTerm;
    if (!opened || !term) return [];
    return [{ id: account.accountId, name: account.catalog?.name ?? 'Investimento', bankId: account.catalog?.bankAccountId ?? null,
      date: toFinancialCivilDate(opened.effectiveAt), initialValueInCents: 0, currentValueInCents: account.position.balanceInCents, redemptionTerm: term as RedemptionTerm }];
  });
  const forecast = buildFinancialForecast({ asOfDate: civil, periodInMonths: period, openingBalanceInCents, movements, mandatoryTemplates: [], investments });
  let running = openingBalanceInCents;
  const counters = new Map(plans.map(plan => [plan.id, plan.installmentsCompleted]));
  for (const month of forecast.months) {
    for (const plan of plans.filter(plan => plan.active)) {
      const overdue = plan.endCycle !== null && plan.endCycle < getCycleKeyFromDate(civil);
      if (month.key < plan.startCycle || plan.endCycle && month.key > plan.endCycle && (!overdue || month !== forecast.months[0])) continue;
      if (month.key < plan.historyFromCycle || month.key < plan.cycleWindow.fromCycle || month.key > plan.cycleWindow.throughCycle) throw new Error('A previsão exige cobertura dos ciclos no horizonte selecionado.');
      if (!overdue && plan.completedCycles.includes(month.key)) continue;
      if (!plan.metadata?.dueDay) throw new Error(`Informe o vencimento de ${plan.name} antes de projetar.`);
      const completed = counters.get(plan.id)!;
      if (plan.installmentTotal !== null && completed >= plan.installmentTotal) continue;
      const terms = { installmentTotal: plan.installmentTotal, installmentsCompleted: completed, installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents };
      const amount = plan.installmentTotal === null ? plan.valueInCents : overdue ? getMandatoryInstallmentRemainingValueInCents(terms) : getMandatoryInstallmentValueInCents(terms);
      if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Valor da parcela indisponível.');
      if (plan.installmentTotal !== null) counters.set(plan.id, overdue ? plan.installmentTotal : completed + 1);
      const [endYear, endMonth] = (plan.endCycle ?? month.key).split('-').map(Number);
      const occurrence = resolveMonthlyOccurrence({ referenceDate: overdue ? new Date(endYear, endMonth - 1, 15, 12) : month.startDate, dueDay: plan.metadata.dueDay, usesBusinessDays: plan.metadata.usesBusinessDays }).date;
      month.commitments.push({ id: `spark-plan-${plan.id}-${month.key}`, name: plan.name, kind: plan.recurringType === 'gain' ? 'fixed-gain' : 'fixed-expense',
        valueInCents: amount, date: occurrence, tagName: plan.categoryId ? categories.get(plan.categoryId) ?? null : null,
        isOverdue: overdue || month.key === getCycleKeyFromDate(civil) && occurrence < new Date(civil.getFullYear(), civil.getMonth(), civil.getDate()) });
      if (plan.recurringType === 'gain') { month.gainsInCents = addHomeCents(month.gainsInCents, amount); month.fixedGainsInCents = addHomeCents(month.fixedGainsInCents, amount); }
      else { month.expensesInCents = addHomeCents(month.expensesInCents, amount); month.fixedExpensesInCents = addHomeCents(month.fixedExpensesInCents, amount); }
    }
    month.openingBalanceInCents = running; month.netChangeInCents = addHomeCents(month.gainsInCents, -month.expensesInCents);
    running = addHomeCents(running, month.netChangeInCents); month.closingBalanceInCents = running;
    month.commitments.sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  }
  return { ...forecast, generatedAt: new Date(now), finalBalanceInCents: running,
    hasScheduledMonthlyOpenings: active.some(account => account.position.kind === 'bank' && account.position.nextActivationAt !== null),
    totalGainsInCents: sum(forecast.months.map(month => month.gainsInCents)), totalExpensesInCents: sum(forecast.months.map(month => month.expensesInCents)),
    months: forecast.months.map(month => ({ ...month, startDate: fromFinancialCivilDate(month.startDate), commitments: month.commitments.map(commitment => ({ ...commitment, date: fromFinancialCivilDate(commitment.date) })) })) };
}

