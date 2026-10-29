import { firebaseAuthStorage } from '@/utils/firebaseAuthStorage';
import { registrationRecoveryStorage } from '@/utils/registrationRecoveryStorage';
jest.mock('@/utils/firebaseAuthStorage', () => ({ firebaseAuthStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
let data: string | null;
const first = { uid:'uid-1', email:'ana@example.com', name:'Ana', createdAt:'2026-10-27T12:00:00.000Z' };
beforeEach(() => {
  data=null; jest.clearAllMocks();
  jest.mocked(firebaseAuthStorage.getItem).mockImplementation(async () => data);
  jest.mocked(firebaseAuthStorage.setItem).mockImplementation(async (_key, value) => { data = value; });
  jest.mocked(firebaseAuthStorage.removeItem).mockImplementation(async () => { data = null; });
});
test('preserva UID e dados do perfil sem persistir senha e permite reabrir o registro', async () => {
  await registrationRecoveryStorage.save(first);
  expect(data).not.toContain('password'); expect(await registrationRecoveryStorage.find(first.email)).toEqual(first);
  await registrationRecoveryStorage.save(first); expect(JSON.parse(data!)).toHaveLength(1);
});
test('não substitui UID ou material de outra intenção', async () => {
  await registrationRecoveryStorage.save(first);
  await expect(registrationRecoveryStorage.save({...first,uid:'uid-2'})).rejects.toThrow();
  await expect(registrationRecoveryStorage.remove(first.email,'uid-2')).rejects.toThrow();
  expect(await registrationRecoveryStorage.find(first.email)).toEqual(first);
});
test('mantém outras contas pendentes ao concluir uma delas', async () => {
  await registrationRecoveryStorage.save(first); const other={...first,uid:'uid-2',email:'bia@example.com'};
  await registrationRecoveryStorage.save(other); await registrationRecoveryStorage.remove(first.email,first.uid);
  expect(await registrationRecoveryStorage.find(other.email)).toEqual(other); expect(await registrationRecoveryStorage.find(first.email)).toBeNull();
});
test('recusa armazenamento malformado em vez de apagá-lo', async () => {
  data='[{}]';await expect(registrationRecoveryStorage.find(first.email)).rejects.toThrow();
  await expect(registrationRecoveryStorage.save(first)).rejects.toThrow();expect(data).toBe('[{}]');
});

test('salvamentos simultâneos na mesma sessão não perdem uma intenção', async () => {
  const other={...first,uid:'uid-2',email:'bia@example.com'};
  await Promise.all([registrationRecoveryStorage.save(first),registrationRecoveryStorage.save(other)]);
  expect(await registrationRecoveryStorage.find(first.email)).toEqual(first);
  expect(await registrationRecoveryStorage.find(other.email)).toEqual(other);
});

test('não aceita campos extras que possam conter credenciais', async () => {
  data=JSON.stringify([{...first,password:'sensitive'}]);
  await expect(registrationRecoveryStorage.find(first.email)).rejects.toThrow();
});
