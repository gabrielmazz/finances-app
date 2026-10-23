import { buildSparkUpcomingMandatoryItems, parseSparkRecurringReadModel as parseModel } from '@/utils/sparkRecurringReadModel';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
const plan = (extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, actorId: 'owner', recurringType: 'expense', name: 'Contrato', categoryId: null,
  startCycle: '2026-09', endCycle: '2026-11', historyFromCycle: '2026-10', valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000,
  installmentsCompleted: 0, active: true, revision: 0, ...extra });
const metadata = (extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, actorId: 'owner', revision: 0, lastOperationId: 'metadata', updatedAt: null,
  dueDay: 15, usesBusinessDays: false, description: null, reminderConfigVersion: 1, reminderEnabled: true, reminderDaysBefore: 1,
  reminderOnDueDate: true, reminderHour: 9, reminderMinute: 0, ...extra });
const at = new Date('2026-10-19T12:00:00-03:00');
const parseSparkRecurringReadModel = (id: string, value: Record<string, unknown>, config: Record<string, unknown> | undefined, cycles: string[]) =>
  parseModel(id, value, config, cycles, { fromCycle: '2026-10', throughCycle: '2028-10' });
test('histórico mensal decorrido não altera o contador nem o valor da parcela seguinte', () => {
  const read = parseSparkRecurringReadModel('plan', plan(), metadata(), []), items = buildSparkUpcomingMandatoryItems([read], at);
  expect(items[0]).toMatchObject({ valueInCents: 333, installmentLabel: 'Parcela 1 de 3', isOverdue: true });
});
test('última parcela inclui resto contratual e ciclos ativos são pulados', () => {
  const read = parseSparkRecurringReadModel('plan', plan({ installmentsCompleted: 2 }), metadata(), ['2026-10']);
  const [item] = buildSparkUpcomingMandatoryItems([read], at);
  expect(item.valueInCents).toBe(334); expect(toFinancialCivilDate(item.dueDate).getMonth()).toBe(10); expect(item.installmentLabel).toBe('Parcela 3 de 3');
});
test('sem dia declarado, arquivada e contrato completo não inventam compromisso', () => {
  const models = [parseSparkRecurringReadModel('undated', plan(), undefined, []),
    parseSparkRecurringReadModel('archived', plan({ active: false }), metadata(), []),
    parseSparkRecurringReadModel('completed', plan({ installmentsCompleted: 3 }), metadata(), [])];
  expect(buildSparkUpcomingMandatoryItems(models, at)).toEqual([]);
});
test('parcela quitada em outro ciclo não completa todos os meses e cobertura impede inventar passado', () => {
  const read = parseSparkRecurringReadModel('plan', plan({ installmentTotal: null, contractTotalInCents: null, endCycle: null, historyFromCycle: '2026-11' }), metadata(), []);
  expect(toFinancialCivilDate(buildSparkUpcomingMandatoryItems([read], at)[0].dueDate).getMonth()).toBe(10);
});
test('calendário de dias úteis e virada do ano conservam data civil de São Paulo', () => {
  const read = parseSparkRecurringReadModel('plan', plan({ startCycle: '2026-12', historyFromCycle: '2026-12', endCycle: null, installmentTotal: null, contractTotalInCents: null }), metadata({ dueDay: 1, usesBusinessDays: true }), ['2026-12']);
  const date = toFinancialCivilDate(buildSparkUpcomingMandatoryItems([read], new Date('2027-01-01T02:59:00Z'))[0].dueDate);
  expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2027, 0, 4]);
});
test('schema, contador, contrato e configuração inválidos pedem reconciliação', () => {
  for (const fields of [{ schemaVersion: 2 }, { installmentsCompleted: 4 }, { valueInCents: 334 }, { startCycle: '2026-99' }, { endCycle: '2026-12' }]) {
    expect(() => parseSparkRecurringReadModel('plan', plan(fields), metadata(), [])).toThrow();
  }
  expect(() => parseSparkRecurringReadModel('plan', plan(), metadata({ actorId: 'other' }), [])).toThrow();
  expect(() => parseSparkRecurringReadModel('plan', plan(), metadata({ dueDay: 32 }), [])).toThrow();
});
test('janela consultada não é prova do histórico completo nem de um período futuro não lido', () => {
  expect(() => parseSparkRecurringReadModel('plan', plan(), metadata(), ['2026-09'])).toThrow();
  const read = parseSparkRecurringReadModel('plan', plan({ endCycle: null, installmentTotal: null, contractTotalInCents: null }), metadata(), []);
  expect(() => buildSparkUpcomingMandatoryItems([read], new Date('2028-11-01T12:00:00-03:00'))).toThrow(/cobertura/);
});
test('parcelas vencidas permanecem na Home com saldo restante e vencimento original', () => {
  const read = parseSparkRecurringReadModel('plan', plan({ startCycle: '2026-06', historyFromCycle: '2026-06', endCycle: '2026-08', installmentsCompleted: 1 }), metadata(), []);
  read.completedCycles = ['2026-10'];
  const [item] = buildSparkUpcomingMandatoryItems([read], at);
  expect(item).toMatchObject({ valueInCents: 667, isOverdue: true, installmentLabel: '2 parcela(s) pendente(s)' });
  expect(toFinancialCivilDate(item.dueDate).getMonth()).toBe(7);
});
test('ciclos após prazo exigem evidência explícita e vínculos de replanejamento não podem reativar predecessores', () => {
  const fields = plan({ startCycle: '2026-06', historyFromCycle: '2026-06', endCycle: '2026-08', installmentsCompleted: 1 });
  expect(() => parseSparkRecurringReadModel('plan', fields, metadata(), ['2026-10'])).toThrow();
  expect(parseModel('plan', fields, metadata(), ['2026-10'], { fromCycle: '2026-10', throughCycle: '2028-10' }, ['2026-10']).completedCycles).toEqual(['2026-10']);
  for (const invalid of [{ successorPlanId: 'next' }, { successorPlanId: 'next', replanOperationId: 'replan' }, { replanCancelled: true }, { predecessorPlanId: 'old' }]) {
    expect(() => parseSparkRecurringReadModel('plan', plan(invalid), metadata(), [])).toThrow();
  }
  expect(parseSparkRecurringReadModel('old', plan({ active: false, successorPlanId: 'next', replanOperationId: 'replan' }), metadata(), []).successorPlanId).toBe('next');
});
