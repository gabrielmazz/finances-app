const mockRows: Record<string, Array<Record<string, any>>> = {};
const mockGetDocs = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ db: {}, auth: { currentUser: { uid: 'owner' } } }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: async () => ({ success: true, data: Array.from({ length: 35 }, (_, index) => `related-${index}`) }) }));
jest.mock('firebase/firestore', () => ({
 collection: (_db: unknown, name: string) => ({ name }),
 query: (source: unknown, ...filters: unknown[]) => ({ ...source as object, filters }),
 where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
 limit: (count: number) => ({ count }), startAfter: (doc: { id: string }) => ({ after: doc.id }),
 getDocs: (...args: unknown[]) => mockGetDocs(...args), doc: jest.fn(), getDoc: jest.fn(), Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));
import { getMandatoryExpensesWithRelationsFirebase } from '@/functions/MandatoryExpenseFirebase';
import { getMandatoryGainsWithRelationsFirebase } from '@/functions/MandatoryGainFirebase';

it.each([
 ['mandatoryExpenses', getMandatoryExpensesWithRelationsFirebase],
 ['mandatoryGains', getMandatoryGainsWithRelationsFirebase],
] as const)('lê os 401 templates de %s com 35 relacionados, sem limite silencioso nem erro do filtro in', async (name, read) => {
 mockRows[name] = Array.from({ length: 401 }, (_, index) => ({ id: String(index).padStart(4, '0'), name: `Item ${index}`, personId: index === 400 ? 'related-34' : 'owner', valueInCents: 100 }));
 mockGetDocs.mockImplementation(async ({ name: source, filters }: { name: string; filters: Array<Record<string, any>> }) => {
  const scope = filters.find(filter => filter.field === 'personId');
  if (scope?.operator === 'in' && scope.value.length > 30) throw new Error('Limite real do filtro in');
  let rows = (mockRows[source] ?? []).filter(row => !scope || scope.operator === '==' ? !scope || row.personId === scope.value : scope.value.includes(row.personId));
  const after = filters.find(filter => filter.after)?.after;
  if (after) rows = rows.filter(row => row.id > after);
  const count = filters.find(filter => filter.count)?.count;
  if (count) rows = rows.slice(0, count);
  return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
 });
 const result = await read('owner');
 expect(result.success).toBe(true); expect(result.data).toHaveLength(401);
 expect(result.data?.some((item: any) => item.personId === 'related-34')).toBe(true);
});
