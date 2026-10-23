import { resolveMonthlyOccurrence } from './businessCalendar';
import { fromFinancialCivilDate, toFinancialCivilDate } from './financialCivilDate';
import { getCycleKeyFromDate } from './mandatoryExpenses';
import { getMandatoryInstallmentValueInCents, getMandatoryInstallmentRemainingValueInCents, MAX_MANDATORY_INSTALLMENTS } from './mandatoryInstallments';
import type { HomeMandatoryItem } from './homeMandatorySchedule';
import { validateSparkRecurringMetadata, type SparkRecurringMetadata } from './sparkRecurringMetadata';

export type SparkRecurringReadModel = {
  id: string; actorId: string; recurringType: 'expense' | 'gain'; name: string; categoryId: string | null;
  startCycle: string; endCycle: string | null; historyFromCycle: string; valueInCents: number;
  installmentTotal: number | null; contractTotalInCents: number | null; installmentsCompleted: number;
  active: boolean; revision: number; metadata: SparkRecurringMetadata | null; completedCycles: string[];
  cycleWindow: { fromCycle: string; throughCycle: string };
  metadataRevision?: number | null;
  cycleStates?: SparkRecurringCycleReadModel[];
  predecessorPlanId?: string | null; successorPlanId?: string | null; replanOriginOperationId?: string | null;
  replanOperationId?: string | null; replanCancelled?: boolean;
};
export type SparkRecurringCycleReadModel = { cycle: string; active: boolean; settlementOperationId: string; accountId: string;
  amountInCents: number; installmentsCount: number; installmentsBefore: number; installmentsAfter: number; effectiveAt: Date;
  settlementMode?: 'negotiated'; contractAmountInCents?: number; lateSettlement?: true };
const cycle = (value: unknown): value is string => typeof value === 'string' && /^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(value);
const integer = (value: unknown, low: number, high = 1e12): value is number => Number.isSafeInteger(value) && (value as number) >= low && (value as number) <= high;

export const isSparkRecurringCycleCurrent = (value: string | null | undefined, now = new Date()) =>
  !!value && value === getCycleKeyFromDate(toFinancialCivilDate(now));

export function parseSparkRecurringReadModel(id: string, plan: Record<string, any>, metadata: Record<string, any> | undefined, completedCycles: string[],
  cycleWindow: SparkRecurringReadModel['cycleWindow'], lateCycles: string[] = []): SparkRecurringReadModel {
  const finite = plan.installmentTotal !== null;
  if (plan.schemaVersion !== 1 || typeof plan.actorId !== 'string' || !plan.actorId || !['expense', 'gain'].includes(plan.recurringType)
    || typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 160
    || !(plan.categoryId === null || typeof plan.categoryId === 'string' && !!plan.categoryId && !plan.categoryId.includes('/'))
    || !cycle(plan.startCycle) || !cycle(plan.historyFromCycle) || plan.historyFromCycle < plan.startCycle
    || !(plan.endCycle === null || cycle(plan.endCycle) && plan.endCycle >= plan.startCycle)
    || !integer(plan.valueInCents, 1) || !integer(plan.revision, 0) || typeof plan.active !== 'boolean'
    || !integer(plan.installmentsCompleted, 0, finite ? plan.installmentTotal : 0)
    || (finite ? !integer(plan.installmentTotal, 1, MAX_MANDATORY_INSTALLMENTS) || !integer(plan.contractTotalInCents, 1)
      || Math.floor(plan.contractTotalInCents / plan.installmentTotal) !== plan.valueInCents || plan.endCycle === null
      : plan.contractTotalInCents !== null || plan.endCycle !== null)
    || !cycleWindow || !cycle(cycleWindow.fromCycle) || !cycle(cycleWindow.throughCycle) || cycleWindow.throughCycle < cycleWindow.fromCycle
    || completedCycles.some(value => !cycle(value) || value < plan.startCycle
      || plan.endCycle !== null && value > plan.endCycle && !lateCycles.includes(value)
      || value < cycleWindow.fromCycle || value > cycleWindow.throughCycle)) throw new Error('Recorrência Spark precisa de reconciliação.');
  for (const field of ['predecessorPlanId', 'successorPlanId', 'replanOriginOperationId', 'replanOperationId']) {
    if (plan[field] != null && (typeof plan[field] !== 'string' || !plan[field] || plan[field].length > 160 || plan[field].includes('/'))) throw new Error('Vínculo de replanejamento inválido.');
  }
  if (plan.replanCancelled !== undefined && typeof plan.replanCancelled !== 'boolean'
    || !!plan.predecessorPlanId !== !!plan.replanOriginOperationId || !!plan.successorPlanId !== !!plan.replanOperationId
    || (plan.successorPlanId || plan.replanCancelled) && plan.active) throw new Error('Estado do replanejamento inválido.');
  if (finite) {
    const [year, month] = plan.startCycle.split('-').map(Number), end = new Date(Date.UTC(year, month + plan.installmentTotal - 2, 1));
    const expectedEnd = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}`;
    if (plan.endCycle !== expectedEnd) throw new Error('Vigência diverge do contrato de parcelas.');
  }
  let configuration: SparkRecurringMetadata | null = null;
  if (metadata) {
    const { schemaVersion, actorId, revision, lastOperationId: _, updatedAt: __, ...fields } = metadata;
    if (schemaVersion !== 1 || actorId !== plan.actorId || !integer(revision, 0)) throw new Error('Configuração da recorrência inválida.');
    configuration = validateSparkRecurringMetadata(fields as SparkRecurringMetadata);
  }
  return { id, actorId: plan.actorId, recurringType: plan.recurringType, name: plan.name, categoryId: plan.categoryId,
    startCycle: plan.startCycle, endCycle: plan.endCycle, historyFromCycle: plan.historyFromCycle, valueInCents: plan.valueInCents,
    installmentTotal: plan.installmentTotal, contractTotalInCents: plan.contractTotalInCents, installmentsCompleted: plan.installmentsCompleted,
    active: plan.active, revision: plan.revision, metadata: configuration, metadataRevision: metadata?.revision ?? null, completedCycles, cycleWindow: { ...cycleWindow },
    predecessorPlanId: plan.predecessorPlanId ?? null, successorPlanId: plan.successorPlanId ?? null,
    replanOriginOperationId: plan.replanOriginOperationId ?? null, replanOperationId: plan.replanOperationId ?? null, replanCancelled: plan.replanCancelled ?? false };
}

/** [[Recorrências Spark]]: somente ciclos confirmados e contador explícito; meses decorridos não quitam parcelas. */
export function buildSparkUpcomingMandatoryItems(plans: SparkRecurringReadModel[], asOfDate: Date): HomeMandatoryItem[] {
  if (!Number.isFinite(asOfDate.getTime())) throw new Error('Data de consulta inválida.');
  const civil = toFinancialCivilDate(asOfDate), today = new Date(civil.getFullYear(), civil.getMonth(), civil.getDate());
  const items = plans.flatMap<HomeMandatoryItem>(plan => {
    if (!plan.active || plan.metadata?.dueDay == null || plan.installmentTotal !== null && plan.installmentsCompleted === plan.installmentTotal) return [];
    const first = getCycleKeyFromDate(civil);
    if (first < plan.cycleWindow.fromCycle || first > plan.cycleWindow.throughCycle) throw new Error('Consulta fora da cobertura dos ciclos lidos.');
    if (plan.endCycle !== null && first > plan.endCycle) {
      const [year, month] = plan.endCycle.split('-').map(Number);
      const occurrence = resolveMonthlyOccurrence({ referenceDate: new Date(year, month - 1, 15, 12), dueDay: plan.metadata.dueDay, usesBusinessDays: plan.metadata.usesBusinessDays });
      const amount = getMandatoryInstallmentRemainingValueInCents({ installmentTotal: plan.installmentTotal, installmentsCompleted: plan.installmentsCompleted,
        installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents });
      if (amount === null) throw new Error('Saldo das parcelas vencidas indisponível.');
      return [{ id: plan.id, name: plan.name, type: plan.recurringType, valueInCents: amount, dueDate: fromFinancialCivilDate(occurrence.date),
        isOverdue: true, installmentLabel: `${plan.installmentTotal! - plan.installmentsCompleted} parcela(s) pendente(s)` }];
    }
    for (let offset = 0; offset <= 24; offset += 1) {
      const month = new Date(civil.getFullYear(), civil.getMonth() + offset, 15, 12), key = getCycleKeyFromDate(month);
      if (key > plan.cycleWindow.throughCycle) break;
      if (key < plan.startCycle || key < plan.historyFromCycle || plan.endCycle !== null && key > plan.endCycle || plan.completedCycles.includes(key)) continue;
      const occurrence = resolveMonthlyOccurrence({ referenceDate: month, dueDay: plan.metadata.dueDay, usesBusinessDays: plan.metadata.usesBusinessDays });
      const amount = plan.installmentTotal === null ? plan.valueInCents : getMandatoryInstallmentValueInCents({
        installmentTotal: plan.installmentTotal, installmentsCompleted: plan.installmentsCompleted,
        installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents });
      if (amount === null) throw new Error('Valor da próxima parcela indisponível.');
      return [{ id: plan.id, name: plan.name, type: plan.recurringType, valueInCents: amount, dueDate: fromFinancialCivilDate(occurrence.date),
        isOverdue: occurrence.date < today, installmentLabel: plan.installmentTotal === null ? null : `Parcela ${plan.installmentsCompleted + 1} de ${plan.installmentTotal}` }];
    }
    return [];
  });
  return (['expense', 'gain'] as const).flatMap(type => items.filter(item => item.type === type)
    .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime() || left.id.localeCompare(right.id)).slice(0, 3));
}
