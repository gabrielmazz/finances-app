import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { runTransaction } from 'firebase/firestore';
import { auth, secondaryAuth, secondaryDb } from '@/FirebaseConfig';
import { registrationRecoveryStorage } from '@/utils/registrationRecoveryStorage';
import { registerUserFirebase, requestPasswordResetFirebase } from '@/functions/RegisterUserFirebase';

jest.mock('@/utils/registrationRecoveryStorage', () => ({ registrationRecoveryStorage: { find: jest.fn(), save: jest.fn(), remove: jest.fn() } }));
jest.mock('@/FirebaseConfig', () => ({
	auth: { currentUser: { uid: 'primary-user' }, languageCode: null },
	db: { app: 'primary' }, secondaryAuth: { app: 'secondary' }, secondaryDb: { app: 'secondary' },
}));
jest.mock('firebase/auth', () => ({
	createUserWithEmailAndPassword: jest.fn(), signInWithEmailAndPassword: jest.fn(), signOut: jest.fn(), sendPasswordResetEmail: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
	doc: jest.fn((database, collection, id) => ({ database, collection, id })), runTransaction: jest.fn(),
}));

const newUser = { uid: 'new-user' };
let savedProfile: Record<string, unknown> | undefined;
let transactionSet: jest.Mock;
beforeEach(() => {
    jest.clearAllMocks(); jest.mocked(registrationRecoveryStorage.find).mockResolvedValue(null); jest.mocked(registrationRecoveryStorage.save).mockResolvedValue(undefined); jest.mocked(registrationRecoveryStorage.remove).mockResolvedValue(undefined); savedProfile = undefined; transactionSet = jest.fn((_ref, data) => { savedProfile = data; });
    jest.mocked(createUserWithEmailAndPassword).mockResolvedValue({ user: newUser } as never);
    jest.mocked(signInWithEmailAndPassword).mockResolvedValue({ user: newUser } as never);
    jest.mocked(runTransaction).mockImplementation(async (_db, callback) => callback({
        get: async () => ({ exists: () => !!savedProfile, data: () => savedProfile }), set: transactionSet,
    } as never));
    jest.mocked(signOut).mockResolvedValue(undefined);
    jest.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
});

it('creates a profile transactionally in the secondary session without storing a password', async () => {
    const result = await registerUserFirebase({ name:'  Ana  ', email:'ana@example.com', password:'secret123' });
    expect(result.success).toBe(true);
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(secondaryAuth,'ana@example.com','secret123');
    expect(transactionSet).toHaveBeenCalledWith({database:secondaryDb,collection:'users',id:'new-user'}, {name:'Ana',email:'ana@example.com',adminUser:false,sparkFirstUseRequested:true,createdAt:expect.any(Date)});
    expect(auth.currentUser?.uid).toBe('primary-user');expect(signOut).toHaveBeenCalledWith(secondaryAuth);
});
it('does not touch an existing account if no recovery is pending', async () => {
    const error={code:'auth/email-already-in-use'};jest.mocked(createUserWithEmailAndPassword).mockRejectedValueOnce(error);
    expect(await registerUserFirebase({email:'existing@example.com',password:'secret123'})).toEqual({success:false,error});
    expect(runTransaction).not.toHaveBeenCalled();expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
});
it('recovers an uncertain profile write using the same authenticated UID without recreating Auth', async () => {
    const data={name:'Ana',email:'retry@example.com',password:'secret123'};
    jest.mocked(runTransaction).mockRejectedValueOnce({code:'unavailable'});
    expect(await registerUserFirebase(data)).toEqual({success:false,error:{code:'auth/profile-creation-pending'}});
    expect(auth.currentUser?.uid).toBe('primary-user');expect(signOut).toHaveBeenCalledWith(secondaryAuth);
    expect(await registerUserFirebase(data)).toMatchObject({success:true});
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);expect(signInWithEmailAndPassword).toHaveBeenCalledWith(secondaryAuth,data.email,data.password);
    expect(transactionSet).toHaveBeenCalledTimes(1);
});
it('does not overwrite a profile committed before a lost response', async () => {
    const data={name:'Ana',email:'committed@example.com',password:'secret123'};
    jest.mocked(runTransaction).mockImplementationOnce(async (_db, callback) => {
        await callback({get:async()=>({exists:()=>false}),set:transactionSet} as never);throw {code:'unavailable'};
    });
    expect((await registerUserFirebase(data)).success).toBe(false);const profile=savedProfile;
    expect((await registerUserFirebase(data)).success).toBe(true);expect(transactionSet).toHaveBeenCalledTimes(1);expect(savedProfile).toBe(profile);
});
it('refuses changes or another UID while recovering', async () => {
    const data={name:'Ana',email:'mismatch@example.com',password:'secret123'};
    jest.mocked(runTransaction).mockRejectedValueOnce({code:'unavailable'});await registerUserFirebase(data);
    expect(await registerUserFirebase({...data,name:'Outra'})).toMatchObject({success:false,error:{code:'auth/profile-recovery-mismatch'}});
    jest.mocked(signInWithEmailAndPassword).mockResolvedValueOnce({user:{uid:'other'}} as never);
    expect(await registerUserFirebase(data)).toMatchObject({success:false,error:{code:'auth/profile-recovery-mismatch'}});
    expect(runTransaction).toHaveBeenCalledTimes(1);expect(signOut).toHaveBeenCalledTimes(2);
});
it('recupera o UID salvo antes do reinício sem criar outra conta', async () => {
    const data={name:'Ana',email:'restored@example.com',password:'secret123'};
    jest.mocked(registrationRecoveryStorage.find).mockResolvedValueOnce({uid:'new-user',email:data.email,name:data.name,createdAt:'2026-10-27T12:00:00.000Z'});
    expect(await registerUserFirebase(data)).toMatchObject({success:true});
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(secondaryAuth,data.email,data.password);
    expect(transactionSet).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({createdAt:new Date('2026-10-27T12:00:00.000Z')}));
});
it('interrompe antes de criar usuário se não conseguir ler a recuperação local', async () => {
    jest.mocked(registrationRecoveryStorage.find).mockRejectedValueOnce(new Error('storage'));
    expect(await registerUserFirebase({name:'Ana',email:'read-error@example.com',password:'secret123'})).toMatchObject({success:false,error:{code:'auth/profile-recovery-storage'}});
    expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();expect(runTransaction).not.toHaveBeenCalled();
});
it('se não puder preservar a intenção, não inicia a gravação do perfil', async () => {
    const data={name:'Ana',email:'storage-error@example.com',password:'secret123'};
    jest.mocked(registrationRecoveryStorage.save).mockRejectedValueOnce(new Error('storage'));
    expect(await registerUserFirebase(data)).toMatchObject({success:false,error:{code:'auth/profile-recovery-storage-pending'}});
    expect(runTransaction).not.toHaveBeenCalled();
    expect(await registerUserFirebase(data)).toMatchObject({success:true});
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);
});
it('não repete ou substitui perfil quando falha a limpeza da intenção', async () => {
    const data={name:'Ana',email:'cleanup@example.com',password:'secret123'};
    jest.mocked(registrationRecoveryStorage.remove).mockRejectedValueOnce(new Error('storage'));
    expect(await registerUserFirebase(data)).toMatchObject({success:false,error:{code:'auth/profile-recovery-storage-pending'}});
    expect(await registerUserFirebase(data)).toMatchObject({success:true});
    expect(createUserWithEmailAndPassword).toHaveBeenCalledTimes(1);expect(transactionSet).toHaveBeenCalledTimes(1);
});
it('refuses an incompatible existing profile during recovery', async () => {
    const data={name:'Ana',email:'conflict@example.com',password:'secret123'};
    jest.mocked(runTransaction).mockRejectedValueOnce({code:'unavailable'});await registerUserFirebase(data);
    savedProfile={email:'other@example.com',name:'Other'};
    expect(await registerUserFirebase(data)).toMatchObject({success:false,error:{code:'auth/profile-recovery-mismatch'}});expect(transactionSet).not.toHaveBeenCalled();
});

it('requests password recovery with a normalized email and Portuguese template', async () => {
	await requestPasswordResetFirebase(' ANA@EXAMPLE.COM ');
	expect(sendPasswordResetEmail).toHaveBeenCalledWith(auth, 'ana@example.com');
	expect(auth.languageCode).toBe('pt-BR');
});

it('does not disclose that an account is missing', async () => {
	jest.mocked(sendPasswordResetEmail).mockRejectedValueOnce({ code: 'auth/user-not-found' });
	await expect(requestPasswordResetFirebase('missing@example.com')).resolves.toBeUndefined();
});

it.each(['auth/network-request-failed', 'auth/too-many-requests'])('preserves %s so the form can offer recovery', async code => {
	jest.mocked(sendPasswordResetEmail).mockRejectedValueOnce({ code });
	await expect(requestPasswordResetFirebase('ana@example.com')).rejects.toEqual({ code });
});
