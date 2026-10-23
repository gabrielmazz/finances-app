const mockServerRead = jest.fn();
const mockDocuments = new Map<string, Record<string, any>>();
const mockSpark = jest.fn();
const mockExecute = jest.fn();
const mockCallable = jest.fn();
const mockRelated = jest.fn();
jest.mock('@/FirebaseConfig', () => ({ auth: { currentUser: { uid: 'owner' } }, db: {}, firebaseFunctions: {} }));
jest.mock('@/functions/RegisterUserFirebase', () => ({ getRelatedUsersIDsFirebase: (...args: unknown[]) => mockRelated(...args) }));
jest.mock('@/functions/SparkContextFirebase', () => ({ getSparkContextFirebase: (...args: unknown[]) => mockSpark(...args) }));
jest.mock('@/functions/SparkMetadataCommandFirebase', () => ({ executeSparkMetadataCommandFirebase: (...args: unknown[]) => mockExecute(...args) }));
jest.mock('firebase/functions', () => ({ httpsCallable: (...args: unknown[]) => { mockCallable(...args); return async () => ({ data: {} }); } }));
jest.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  query: (source: { name: string }, ...filters: any[]) => ({ source, filters }),
  getDocs: async ({ source, filters }: any) => ({ docs: [...mockDocuments].filter(([path, data]) => path.startsWith(source.name + '/') && filters.every(({ field, operator, value }: any) => operator === 'in' ? value.includes(data[field]) : data[field] === value))
    .map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })) }),
  doc: (_db: unknown, ...segments: string[]) => ({ id: segments.at(-1), path: segments.join('/') }),
  getDoc: async ({ path }: { path: string }) => ({ exists: () => mockDocuments.has(path), data: () => mockDocuments.get(path) }),
  getDocFromServer: async ({ path }: { path: string }) => { mockServerRead(path); return { exists: () => mockDocuments.has(path), data: () => mockDocuments.get(path) }; },
}));
import { getInvestmentCdiRatesWithRelationsFirebase } from '@/functions/InvestmentCdiRateFirebase';
import { getTagsWithUsersByPersonFirebase, getTagDataFirebase } from '@/functions/TagFirebase';
import { manageFinancialMetadataFirebase } from '@/functions/FinancialLedgerFirebase';

beforeEach(() => { mockDocuments.clear(); jest.clearAllMocks(); mockRelated.mockResolvedValue({ success: true, data: [] }); mockSpark.mockResolvedValue({ groupId: 'group', actorId: 'owner', role: 'admin' }); mockExecute.mockResolvedValue({ recordId: 'saved', idempotent: false }); });
test('CDI conserva o dia de São Paulo em aparelhos de qualquer fuso e inclui outro membro sem relação legada', async () => {
  mockDocuments.set('investmentCdiRates/owner_20261019', { schemaVersion: 1, groupId: 'group', personId: 'owner', annualRateInBasisPoints: 0, effectiveFrom: new Date('2026-10-19T03:00Z') });
  mockDocuments.set('investmentCdiRates/member_20261018', { schemaVersion: 1, groupId: 'group', personId: 'member', annualRateInBasisPoints: 1375, effectiveFrom: new Date('2026-10-18T03:00Z') });
  const result = await getInvestmentCdiRatesWithRelationsFirebase('owner');
  expect(result.success).toBe(true); expect(result.data).toHaveLength(2);
  expect(result.data?.find(rate => rate.personId === 'owner')).toMatchObject({ annualRateInBasisPoints: 0, effectiveFrom: new Date(2026, 9, 19) });
});
test('categorias Spark incluem membros do grupo, deduplicam o dono e ocultam apenas as excluídas', async () => {
  mockDocuments.set('tags/own', { personId: 'owner', groupId: 'group', name: 'Própria' });
  mockDocuments.set('tags/shared', { personId: 'member', groupId: 'group', name: 'Compartilhada' });
  mockDocuments.set('tags/deleted', { personId: 'member', groupId: 'group', deleted: true });
  mockDocuments.set('tags/foreign', { personId: 'other', groupId: 'other' });
  expect((await getTagsWithUsersByPersonFirebase('owner')).data?.map((value: any) => value.id).sort()).toEqual(['own', 'shared']);
});
test('fachada de metadados resolve Spark mesmo sem groupId e não chama Functions', async () => {
  await manageFinancialMetadataFirebase({ domain: 'category', action: 'create', clientActionId: 'command_123456', fields: { name: 'Casa' }, expectedActorId: 'owner' });
  expect(mockExecute).toHaveBeenCalledWith({}, expect.objectContaining({ groupId: 'group', actorId: 'owner' })); expect(mockCallable).not.toHaveBeenCalled();
});

test('categoria nativa de outro grupo não aparece só por pertencer ao usuário autenticado', async () => {
  mockDocuments.set('tags/foreign-own', { schemaVersion: 1, personId: 'owner', groupId: 'other', usageType: 'expense' });
  mockDocuments.set('tags/own-legacy', { personId: 'owner', name: 'Legada' });
  mockDocuments.set('tags/invalid-usage', { personId: 'owner', groupId: 'group', usageType: 'unknown' });
  expect((await getTagsWithUsersByPersonFirebase('owner')).data?.map((value: any) => value.id)).toEqual(['own-legacy']);
});

test('vínculo antigo só descobre categoria legada; o perfil protegido confirma o escopo financeiro', async () => {
  mockRelated.mockResolvedValue({ success: true, data: ['same-group', 'old-relative'] });
  mockDocuments.set('users/same-group', { financialGroupId: 'group' }); mockDocuments.set('users/old-relative', { financialGroupId: 'other' });
  mockDocuments.set('tags/same-group', { personId: 'same-group', name: 'Permitida', usageType: 'expense' });
  mockDocuments.set('tags/old-relative', { personId: 'old-relative', name: 'Outro grupo', usageType: 'expense' });
  expect((await getTagsWithUsersByPersonFirebase('owner')).data?.map(value => value.id)).toEqual(['same-group']);
});
test('fachada não retorna a Functions quando o grupo está bloqueado ou mudou', async () => {
  await expect(manageFinancialMetadataFirebase({ groupId: 'other', domain: 'cdi', action: 'upsert', clientActionId: 'command_123456', fields: {} })).rejects.toThrow(/grupo/);
  mockSpark.mockRejectedValueOnce(new Error('preparação incompleta'));
  await expect(manageFinancialMetadataFirebase({ domain: 'category', action: 'create', clientActionId: 'command_123456', fields: {} })).rejects.toThrow(/preparação/);
  expect(mockCallable).not.toHaveBeenCalled();
});

test('formulário solicita categoria confirmada pelo servidor sem alterar os demais leitores', async () => {
  mockDocuments.set('tags/category', { personId: 'owner', name: 'Casa', revision: 1 });
  expect((await getTagDataFirebase('category')).success).toBe(true);
  expect(mockServerRead).not.toHaveBeenCalled();
  expect((await getTagDataFirebase('category', { fromServer: true })).data).toMatchObject({ revision: 1 });
  expect(mockServerRead).toHaveBeenCalledWith('tags/category');
});

test('categoria excluída não reaparece no carregamento de edição', async () => {
  mockDocuments.set('tags/deleted', { personId: 'owner', deleted: true });
  expect((await getTagDataFirebase('deleted', { fromServer: true })).success).toBe(false);
});
