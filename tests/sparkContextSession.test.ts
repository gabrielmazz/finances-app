let mockUid = 'owner';
const mockInitialize = jest.fn();
jest.mock('@/functions/SparkFirstUseFirebase', () => ({ initializeSparkFirstUseFirebase: (...args: unknown[]) => mockInitialize(...args) }));
const mockRead = jest.fn();
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: mockUid ? { uid: mockUid } : null }) }));
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocFromServer: (...args: unknown[]) => mockRead(...args),
}));
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import type { Firestore } from 'firebase/firestore';
const db = {} as Firestore;
beforeEach(() => { mockUid = 'owner'; mockRead.mockReset(); mockInitialize.mockReset(); });

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

test('perfil novo autorizado inicializa uma vez e lê o contexto confirmado', async () => {
  mockRead.mockResolvedValueOnce({data:()=>({sparkFirstUseRequested:true})})
    .mockResolvedValueOnce({data:()=>({financialGroupId:'first_owner'})})
    .mockResolvedValueOnce({data:()=>({status:'active',sparkProtocol:'financial-proof-v17',members:{owner:'admin'}})});
  mockInitialize.mockResolvedValue({status:'ready',groupId:'first_owner',idempotent:false});
  await expect(getSparkContextFirebase(db,'owner')).resolves.toMatchObject({groupId:'first_owner',role:'admin'});
  expect(mockInitialize).toHaveBeenCalledTimes(1);
});
test('perfil legado não tenta inicialização; conta nova sem autorização não é alterada', async () => {
  mockRead.mockResolvedValueOnce({data:()=>({})});await expect(getSparkContextFirebase(db,'owner')).resolves.toBeNull();expect(mockInitialize).not.toHaveBeenCalled();
  mockRead.mockResolvedValueOnce({data:()=>({sparkFirstUseRequested:true})});mockInitialize.mockResolvedValue({status:'awaiting-authorization'});
  await expect(getSparkContextFirebase(db,'owner')).rejects.toThrow(/aguarda autorização/);expect(mockInitialize).toHaveBeenCalledTimes(1);
});

test('vínculo criado por outra sessão é relido antes de decidir o contexto', async () => {
  mockRead.mockResolvedValueOnce({data:()=>({sparkFirstUseRequested:true})})
    .mockResolvedValueOnce({data:()=>({financialGroupId:'existing'})})
    .mockResolvedValueOnce({data:()=>({status:'active',sparkProtocol:'financial-proof-v17',members:{owner:'admin'}})});
  mockInitialize.mockResolvedValue({status:'existing-account'});
  await expect(getSparkContextFirebase(db,'owner')).resolves.toMatchObject({groupId:'existing'});
});

test('resultado de inicialização sem perfil vinculado não libera caminho legado', async () => {
  mockRead.mockResolvedValue({data:()=>({sparkFirstUseRequested:true})});
  mockInitialize.mockResolvedValue({status:'ready',groupId:'first_owner'});
  await expect(getSparkContextFirebase(db,'owner')).rejects.toThrow(/não foi concluída/);
});
