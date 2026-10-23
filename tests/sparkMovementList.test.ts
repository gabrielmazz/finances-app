const mockEvents = jest.fn(), mockContext = jest.fn(), mockRelated = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('@/functions/SparkFinancialReadFirebase', () => ({ readSparkFinancialEventsFirebase: (...args: unknown[]) => mockEvents(...args) }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: (...args: unknown[]) => mockRelated(...args) }));
jest.mock('firebase/firestore', () => ({ collection: () => { throw new Error('Não deve consultar coleção legada.'); } }));
import { getAllExpensesFirebase, getLimitedExpensesFirebase, getLimitedExpensesWithPeopleFirebase } from '@/functions/ExpenseFirebase';
import { getAllGainsFirebase, getLimitedGainsFirebase, getLimitedGainsWithPeopleFirebase } from '@/functions/GainFirebase';
import { readSparkMovementListFirebase } from '@/functions/SparkMovementListFirebase';
import { buildSparkFinancialReadEvents } from '@/utils/sparkFinancialReadModel';
const record = (id: string, kind: string, data: Record<string, unknown>) => ({ id, data: { kind, actorId: 'owner', createdAt: new Date('2026-09-10T12:00Z'), ...data } });
const events = () => buildSparkFinancialReadEvents('group', [
  record('original', 'expense', { accountId: 'bank', differenceInCents: -1000 }),
  record('edit', 'movement_correction', { originalSource: 'live', originalOperationId: 'original', fromAccountId: 'bank', toAccountId: 'cash',
    movementKind: 'expense', originalDeltaInCents: -1000, differenceInCents: -1500, effectiveAt: new Date('2026-09-11T12:00Z') }),
  record('income', 'income', { accountId: 'bank', differenceInCents: 3000 }),
  record('pair', 'transfer', { fromAccountId: 'bank', toAccountId: 'cash', amountInCents: 400 }),
]);
beforeEach(() => { jest.clearAllMocks(); mockContext.mockResolvedValue({ groupId: 'group', actorId: 'owner' }); mockEvents.mockResolvedValue(events()); });

test('lista vigente contém só o substituto, enquanto o journal original permanece completo', async () => {
  const list = await readSparkMovementListFirebase({} as any, 'owner', 'group', 'expense');
  expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ id: 'edit:replacement', valueInCents: 1500, bankId: null, moneyFormat: true,
    sparkExecutionReference: { source: 'live', operationId: 'edit', family: 'ordinary' } });
  expect(events()).toHaveLength(6);
});

test('estorno em data posterior resolve o alvo antes de ordenar ou limitar a lista', async () => {
  const rows = events();
  const inverse = { ...rows[0], id: 'reversal:inverse', operationId: 'reversal', component: 'inverse', originalOperationId: 'reversal', deltaInCents: -3000,
    kind: 'income' as const, economicKind: 'income' as const, resolvesOperationId: 'income', resolvesOriginalSource: 'live' as const, executionReference: null, effectiveAt: new Date('2026-10-15T12:00Z') };
  mockEvents.mockResolvedValueOnce([...rows, inverse]);
  expect(await readSparkMovementListFirebase({} as any, 'owner', 'group', 'income', 1)).toEqual([]);
});

test.each([
  ['todas as despesas', () => getAllExpensesFirebase(), 1500],
  ['despesas limitadas', () => getLimitedExpensesFirebase({ limit: 1 }), 1500],
  ['despesas com pessoas', () => getLimitedExpensesWithPeopleFirebase({ limit: 1, personId: 'owner' }), 1500],
  ['todos os ganhos', () => getAllGainsFirebase(), 3000],
  ['ganhos limitados', () => getLimitedGainsFirebase({ limit: 1 }), 3000],
  ['ganhos com pessoas', () => getLimitedGainsWithPeopleFirebase({ limit: 1, personId: 'owner' }), 3000],
])('%s usa o journal Spark sem depender das relações antigas', async (_label, read, amount) => {
  const result = await read(); expect(result.success).toBe(true); expect(result.data).toHaveLength(1);
  expect(result.data?.[0]).toMatchObject({ valueInCents: amount, isSparkMovement: true }); expect(mockRelated).not.toHaveBeenCalled();
});

test('falha no contexto é falha da consulta, sem lista antiga de sucesso nem execução de relações', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mockContext.mockRejectedValueOnce(new Error('acesso revogado'));
    expect((await getAllExpensesFirebase()).success).toBe(false); expect(mockRelated).not.toHaveBeenCalled();
  } finally { errorLog.mockRestore(); }
});
