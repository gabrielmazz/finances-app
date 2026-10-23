import { projectSparkForecast } from '@/utils/sparkFinancialForecast';
import { buildSparkFinancialReadEvents, type SparkReadRecord } from '@/utils/sparkFinancialReadModel';
import { parseSparkRecurringReadModel } from '@/utils/sparkRecurringReadModel';
import type { SparkAccountReadModel } from '@/functions/SparkAccountReadFirebase';

const now = new Date('2026-10-21T12:00:00-03:00');
const account = (id: string, balanceInCents: number, kind = id === 'cash' ? 'cash' : 'bank', active = true) => ({ accountId: id, groupId: 'group',
  position: { kind, balanceInCents, active, revision: 0, lastOperationId: 'opening', nextActivationAt: null }, positionStatus: 'current',
  catalog: null, catalogRevision: null, catalogActorId: null, lifecycle: { isActive: active, archived: false, archivedAt: null, revision: null },
  reference: null, principal: null } as SparkAccountReadModel);
const plan = (fields: Record<string, unknown> = {}, completed: string[] = []) => parseSparkRecurringReadModel('plan', {
  schemaVersion: 1, actorId: 'owner', recurringType: 'expense', name: 'Contrato', categoryId: null, startCycle: '2026-09', endCycle: '2026-11',
  historyFromCycle: '2026-09', valueInCents: 333, installmentTotal: 3, contractTotalInCents: 1000, installmentsCompleted: 0, active: true, revision: 0, ...fields,
}, { schemaVersion: 1, actorId: 'owner', revision: 0, dueDay: 10, usesBusinessDays: false, description: null, reminderConfigVersion: 1,
  reminderEnabled: false, reminderDaysBefore: 1, reminderOnDueDate: false, reminderHour: 9, reminderMinute: 0 }, completed,
{ fromCycle: '2026-10', throughCycle: '2028-10' });
const row = (id: string, fields: Record<string, unknown>): SparkReadRecord => ({ id, data: { actorId: 'owner', createdAt: now, ...fields } });
const project = (records: SparkReadRecord[] = [], plans = [plan()], accounts = [account('bank', 10000), account('cash', 500)]) =>
  projectSparkForecast(accounts, buildSparkFinancialReadEvents('group', records), plans, new Map([['food', 'Mercado']]), now, 3);

test('abertura usa posição canônica sem reaplicar journal, transferências ou investimento', () => {
  const forecast = project([row('expense', { kind: 'expense', accountId: 'bank', differenceInCents: -1000 }),
    row('transfer', { kind: 'transfer', fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 500 })], [],
    [account('bank', 10000), account('cash', 500), account('portfolio', 20000, 'investment'), account('archived', 30000, 'bank', false)]);
  expect(forecast.openingBalanceInCents).toBe(10500); expect(forecast.finalBalanceInCents).toBe(10500);
  expect(forecast.totalGainsInCents).toBe(0); expect(forecast.totalExpensesInCents).toBe(0);
});

test('contagem mensal futura é sinalizada sem criar renda ou disponibilidade hoje', () => {
  const bank = account('bank', 10000);
  bank.position.nextActivationAt = { toMillis: () => new Date('2026-11-01T03:00:00Z').getTime() } as any;
  const forecast = project([], [], [bank, account('cash', 500)]);
  expect(forecast.hasScheduledMonthlyOpenings).toBe(true);
  expect(forecast.openingBalanceInCents).toBe(10500); expect(forecast.finalBalanceInCents).toBe(10500);
  expect(forecast.totalGainsInCents).toBe(0);
});

test('calendário não inventa parcelas quitadas e a última inclui o resto contratual', () => {
  const forecast = project([], [plan({ startCycle: '2026-10', endCycle: '2026-12', historyFromCycle: '2026-10' })]);
  expect(forecast.months.map(month => month.fixedExpensesInCents)).toEqual([333, 333, 334]);
  expect(forecast.totalExpensesInCents).toBe(1000); expect(forecast.finalBalanceInCents).toBe(9500);
  expect(forecast.months[0].commitments[0].isOverdue).toBe(true);
});

test('ciclo pago não é projetado e parcelas antecipadas conservam o contador confirmado', () => {
  const forecast = project([], [plan({ installmentsCompleted: 2 }, ['2026-10'])]);
  expect(forecast.months.map(month => month.fixedExpensesInCents)).toEqual([0, 334, 0]);
});

test('recorrência encerrada e sem cobertura de ciclos não vira estimativa silenciosa', () => {
  expect(project([], [plan({ active: false })]).totalExpensesInCents).toBe(0);
  const missing = plan(); missing.cycleWindow.throughCycle = '2026-10';
  expect(() => project([], [missing])).toThrow(/cobertura/);
  expect(() => project([], [plan()], [account('bank', 1)])).toThrow(/Caixa/);
});

test('média variável exclui resolvidos, recorrências e pares e exige dois meses distintos', () => {
  const records = ['2026-08-10', '2026-09-10'].map((day, i) => row(`food-${i}`, { kind: 'expense', accountId: 'bank',
    effectiveAt: new Date(`${day}T12:00:00-03:00`), differenceInCents: -300, categoryId: 'food' }));
  records.push(row('undo', { kind: 'movement_reversal', originalSource: 'live', originalOperationId: 'food-0', accountId: 'bank', movementKind: 'expense', differenceInCents: 300 }));
  expect(project(records, []).totalExpensesInCents).toBe(0);
  expect(project(records.slice(0, 2), []).totalExpensesInCents).toBe(600);
});

test('posição vencida, horizonte inválido e estouro não produzem saldo aproximado', () => {
  const bank = account('bank', 1); bank.positionStatus = 'retained';
  expect(() => project([], [], [bank, account('cash', 0)])).toThrow(/aberturas/);
  expect(() => projectSparkForecast([], [], [], new Map(), new Date(NaN), 3)).toThrow(/inválido/);
  expect(() => project([], [], [account('bank', Number.MAX_SAFE_INTEGER), account('cash', 1)])).toThrow();
});

test('média não oculta estouro histórico quando a divisão volta a caber em inteiro seguro', () => {
  const records = Array.from({ length: 9008 }, (_, index) => row(`large-${index}`, { kind: 'expense', accountId: 'bank',
    categoryId: 'food', effectiveAt: new Date(index % 2 ? '2026-08-10T12:00:00-03:00' : '2026-09-10T12:00:00-03:00'),
    differenceInCents: -(index === 9007 ? 199254740992 : 1e12) }));
  expect(() => project(records, [])).toThrow(/centavos/);
});

test('arredondamento da média conserva o centavo também perto do limite inteiro', () => {
  const records = Array.from({ length: 9008 }, (_, index) => row(`round-${index}`, { kind: 'expense', accountId: 'bank', categoryId: 'food',
    effectiveAt: new Date(index % 2 ? '2026-08-10T12:00:00-03:00' : '2026-09-10T12:00:00-03:00'),
    differenceInCents: -(index === 9007 ? 199254740988 : 1e12) }));
  expect(project(records, []).months[0].variableExpensesInCents).toBe(3002399751580329);
});
test('dívida após fim do contrato é projetada uma vez pelo saldo restante, inclusive após pagamento parcial no mês', () => {
  const overdue = plan({ startCycle: '2026-06', endCycle: '2026-08', historyFromCycle: '2026-06', installmentsCompleted: 1 });
  overdue.completedCycles = ['2026-10'];
  const forecast = project([], [overdue]);
  expect(forecast.months.map(month => month.fixedExpensesInCents)).toEqual([667, 0, 0]);
  expect(forecast.months[0].commitments[0]).toMatchObject({ valueInCents: 667, isOverdue: true });
  expect(forecast.totalExpensesInCents).toBe(667);
});
