const mockContext = jest.fn(), mockRead = jest.fn(), mockSession = { currentUser: { uid: 'owner' } as { uid: string } | null };
jest.mock('firebase/auth', () => ({ getAuth: () => mockSession }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockContext(...args) }));
jest.mock('firebase/firestore', () => ({
  collection: (_: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  query: (source: unknown, ...filters: unknown[]) => ({ ...(source as object), filters }),
  documentId: () => '__name__', orderBy: () => ({}), limit: (size: number) => ({ size }), startAfter: (row: { id: string }) => ({ after: row.id }),
  where: (_field: string, operator: string, value: string) => ({ operator, value }),
  getDocsFromServer: (...args: unknown[]) => mockRead(...args),
}));
import { readSparkRecurringPlansFirebase } from '@/functions/SparkRecurringReadFirebase';
import type { Firestore } from 'firebase/firestore';
const firestore = {} as Firestore, at = new Date('2026-10-19T12:00:00-03:00');
type Row = { id: string; data: Record<string, unknown> };
let records: Record<string, Row[]>;
const plan = (id: string): Row => ({ id, data: { schemaVersion: 1, actorId: 'owner', recurringType: 'gain', name: id, categoryId: null,
  startCycle: '2026-07', historyFromCycle: '2026-07', endCycle: null, valueInCents: 100, revision: 0, lastOperationId: 'new', active: true,
  installmentTotal: null, contractTotalInCents: null, installmentsCompleted: 0 } });
const read = () => readSparkRecurringPlansFirebase(firestore, 'owner', 'group', at);
const cycle = (id: string, active: boolean): Row => ({ id, data: { schemaVersion: 1, active, revision: 0, settlementOperationId: 'settle', lastOperationId: 'settle',
  accountId: 'bank', amountInCents: 100, installmentsCount: 1, installmentsBefore: 0, installmentsAfter: 0, effectiveAt: new Date(`${id}-15T12:00:00-03:00`) } });
const sdk = async ({ path, filters }: { path: string; filters: Array<{ size?: number; after?: string; operator?: string; value?: string }> }) => {
  let rows = [...(records[path] ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  for (const filter of filters) {
    if (filter.after) rows = rows.filter(row => row.id > filter.after!);
    if (filter.operator === '>=') rows = rows.filter(row => row.id >= filter.value!);
    if (filter.operator === '<=') rows = rows.filter(row => row.id <= filter.value!);
    if (filter.size) rows = rows.slice(0, filter.size);
  }
  const docs = rows.map(row => ({ id: row.id, data: () => ({ ...row.data }) }));
  return { docs, size: docs.length };
};
beforeEach(() => {
  jest.clearAllMocks(); mockSession.currentUser = { uid: 'owner' };
  mockContext.mockReset().mockResolvedValue({ groupId: 'group' }); mockRead.mockReset().mockImplementation(sdk);
  records = { 'financialGroups/group/sparkRecurringPlans': [plan('plan')], 'financialGroups/group/sparkRecurringMetadata': [],
    'financialGroups/group/sparkRecurringPlans/plan/cycles': [
      cycle('2026-09', true), cycle('2026-10', true), cycle('2026-11', false), cycle('2028-10', true), cycle('2028-11', true) ] };
});
test('ciclos ativos são lidos no horizonte inteiro, incluindo o limite de 24 meses', async () => {
  expect((await read())[0].completedCycles).toEqual(['2026-10', '2028-10']);
});
test('201 planos e metadados são paginados sem truncar e sem consultar coleções financeiras anteriores', async () => {
  records['financialGroups/group/sparkRecurringPlans'] = Array.from({ length: 201 }, (_, i) => plan(`plan-${String(i).padStart(3, '0')}`));
  records['financialGroups/group/sparkRecurringMetadata'] = records['financialGroups/group/sparkRecurringPlans'].map(row => ({ id: row.id,
    data: { schemaVersion: 1, actorId: 'owner', revision: 0, lastOperationId: 'metadata', dueDay: null, usesBusinessDays: false, description: null,
      reminderConfigVersion: 1, reminderEnabled: false, reminderDaysBefore: 0, reminderOnDueDate: false, reminderHour: 9, reminderMinute: 0 } }));
  const rows = await read(); expect(rows).toHaveLength(201); expect(rows.at(-1)?.id).toBe('plan-200');
  expect(mockRead.mock.calls.every(([source]) => source.path.startsWith('financialGroups/group/sparkRecurring'))).toBe(true);
  expect(mockRead.mock.calls.filter(([source]) => source.path.endsWith('/sparkRecurringPlans'))).toHaveLength(4);
  expect(mockRead.mock.calls.filter(([source]) => source.path.endsWith('/sparkRecurringMetadata'))).toHaveLength(4);
});
test('revisão alterada entre leitura dos ciclos e confirmação refaz a consulta', async () => {
  let changed = false;
  mockRead.mockImplementation(async (source: any) => {
    const result = await sdk(source);
    if (!changed && source.path.endsWith('/cycles')) {
      changed = true; records['financialGroups/group/sparkRecurringPlans'][0].data = { ...records['financialGroups/group/sparkRecurringPlans'][0].data, revision: 1, lastOperationId: 'changed' };
    }
    return result;
  });
  expect((await read())[0].revision).toBe(1); expect(mockRead.mock.calls.filter(([source]) => source.path.endsWith('/cycles'))).toHaveLength(2);
});
test('metadados alterados continuamente recusam resultado parcial', async () => {
  let count = 0;
  const metadata = { schemaVersion: 1, actorId: 'owner', revision: 0, lastOperationId: 'new', dueDay: 10, usesBusinessDays: false, description: null,
    reminderConfigVersion: 1, reminderEnabled: false, reminderDaysBefore: 0, reminderOnDueDate: false, reminderHour: 9, reminderMinute: 0 };
  records['financialGroups/group/sparkRecurringMetadata'] = [{ id: 'plan', data: metadata }];
  mockRead.mockImplementation(async (source: any) => {
    if (source.path.endsWith('/sparkRecurringMetadata')) records[source.path] = [{ id: 'plan', data: { ...metadata, revision: count++, lastOperationId: String(count) } }];
    return sdk(source);
  });
  await expect(read()).rejects.toThrow(/mudaram/);
});
test('logout durante página ou grupo revogado no fim impedem retorno', async () => {
  mockRead.mockImplementationOnce(async (source: any) => { const result = await sdk(source); mockSession.currentUser = null; return result; });
  await expect(read()).rejects.toThrow(/sessão/);
  mockSession.currentUser = { uid: 'owner' }; mockRead.mockImplementation(sdk);
  mockContext.mockResolvedValueOnce({ groupId: 'group' }).mockResolvedValueOnce({ groupId: 'other' });
  await expect(read()).rejects.toThrow(/acesso/);
});
test('permissão recusada não vira lista de planos vazia', async () => {
  mockRead.mockRejectedValue(new Error('permission-denied'));
  await expect(read()).rejects.toThrow('permission-denied');
});
test('uma flag ativa sem efetivação tipada não prova que o ciclo foi pago', async () => {
  records['financialGroups/group/sparkRecurringPlans/plan/cycles'] = [{ id: '2026-10', data: { schemaVersion: 1, active: true } }];
  await expect(read()).rejects.toThrow(/Estado do ciclo/);
});
