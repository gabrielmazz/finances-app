let mockUid = 'owner';
const mockRecords = new Map<string, Map<string, Record<string, any>>>();
let mockMutation: (() => void) | null = null;
let mockMutateOnce = false;
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: mockUid } }) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: async () => ({ groupId: 'group', actorId: 'owner' }) }));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ name: path.at(-1) }), documentId: () => '__name__',
  orderBy: () => ({}), limit: (count: number) => ({ count }), startAfter: (document: { id: string }) => ({ afterId: document.id }),
  query: (source: { name: string }, ...constraints: any[]) => ({ name: source.name, constraints }),
  getDocsFromServer: async ({ name, constraints }: { name: string; constraints: any[] }) => {
    if (name === 'sparkOperations' && mockMutation) { const mutate = mockMutation; if (mockMutateOnce) mockMutation = null; mutate(); }
    const after = constraints.find(item => item.afterId)?.afterId, count = constraints.find(item => item.count)?.count ?? 200;
    const docs = [...(mockRecords.get(name) ?? [])].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .filter(([id]) => !after || id > after).slice(0, count).map(([id, data]) => ({ id, data: () => ({ ...data }) }));
    return { docs, size: docs.length };
  },
}));
import { readSparkFinancialEventsFirebase } from '@/functions/SparkFinancialReadFirebase';
import type { Firestore } from 'firebase/firestore';

const commit = () => {
  const position = mockRecords.get('sparkPositions')!.get('bank')!, revision = position.revision + 1, id = `income_${String(revision).padStart(8, '0')}`;
  mockRecords.get('sparkPositions')!.set('bank', { ...position, revision, lastOperationId: id, balanceInCents: position.balanceInCents + 100 });
  mockRecords.get('sparkOperations')!.set(id, { kind: 'income', accountId: 'bank', actorId: 'owner', differenceInCents: 100, createdAt: new Date('2026-09-10T12:00Z') });
};
beforeEach(() => {
  mockUid = 'owner'; mockMutation = null; mockMutateOnce = false; mockRecords.clear();
  mockRecords.set('sparkPositions', new Map([['bank', { revision: 0, lastOperationId: 'opening_123456', active: true, balanceInCents: 0, nextActivationAt: null }]]));
  mockRecords.set('sparkOperations', new Map()); mockRecords.set('sparkImportedIdentities', new Map());
});
test('mudança concorrente refaz a fotografia e retorna o conjunto financeiro completo', async () => {
  mockMutation = commit; mockMutateOnce = true;
  const rows = await readSparkFinancialEventsFirebase({} as Firestore, 'owner', 'group');
  expect(rows.map(row => row.deltaInCents)).toEqual([100]);
  expect(rows[0]?.executionReference?.operationId).toBe(mockRecords.get('sparkPositions')!.get('bank')!.lastOperationId);
});
test('grupo em alteração contínua não retorna um total parcial como se estivesse confirmado', async () => {
  mockMutation = commit;
  await expect(readSparkFinancialEventsFirebase({} as Firestore, 'owner', 'group')).rejects.toThrow(/novas movimentações/);
});
test('histórico financeiro acima de duzentos documentos não é truncado', async () => {
  for (let count = 0; count < 205; count += 1) commit();
  const rows = await readSparkFinancialEventsFirebase({} as Firestore, 'owner', 'group');
  expect(rows).toHaveLength(205); expect(rows.reduce((sum, row) => sum + row.deltaInCents, 0)).toBe(20500);
  expect(new Set(rows.map(row => row.id)).size).toBe(205);
});
test('troca de UID durante a consulta não entrega dados tardios à sessão seguinte', async () => {
  mockMutation = () => { mockUid = 'other'; }; mockMutateOnce = true;
  await expect(readSparkFinancialEventsFirebase({} as Firestore, 'owner', 'group')).rejects.toThrow(/sessão/);
});
