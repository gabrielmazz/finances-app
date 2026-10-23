let mockUid = 'owner';
const mockRead = jest.fn();
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }) }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocFromServer: (...args: unknown[]) => mockRead(...args),
}));
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import type { Firestore } from 'firebase/firestore';
const db = {} as Firestore;
beforeEach(() => { mockUid = 'owner'; mockRead.mockReset(); });

test('troca de UID durante perfil sem grupo não autoriza fallback legado', async () => {
  mockRead.mockImplementation(async () => { mockUid = 'other'; return { data: () => ({}) }; });
  await expect(getSparkContextFirebase(db, 'owner')).rejects.toThrow(/sessão/);
});
test('troca de UID no perfil é recusada antes de consultar o grupo anterior', async () => {
  mockRead.mockImplementation(async () => { mockUid = 'other'; return { data: () => ({ financialGroupId: 'group' }) }; });
  await expect(getSparkContextFirebase(db, 'owner')).rejects.toThrow(/sessão/);
  expect(mockRead).toHaveBeenCalledTimes(1);
});
test('logout durante a leitura de grupo descarta o contexto recebido', async () => {
  mockRead.mockResolvedValueOnce({ data: () => ({ financialGroupId: 'group' }) }).mockImplementationOnce(async () => {
    mockUid = ''; return { data: () => ({ status: 'active', sparkProtocol: 'financial-proof-v17', members: { owner: 'member' } }) };
  });
  await expect(getSparkContextFirebase(db, 'owner')).rejects.toThrow(/sessão/);
});
test('perfil realmente sem grupo conserva o caminho anterior somente na mesma sessão', async () => {
  mockRead.mockResolvedValue({ data: () => ({}) });
  await expect(getSparkContextFirebase(db, 'owner')).resolves.toBeNull();
});
