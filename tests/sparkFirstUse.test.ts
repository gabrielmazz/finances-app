import { initializeSparkFirstUseFirebase } from '@/functions/SparkFirstUseFirebase';
import { getAuth } from 'firebase/auth';
import { runTransaction, Timestamp } from 'firebase/firestore';

jest.mock('firebase/auth',()=>({getAuth:jest.fn()}));
jest.mock('firebase/firestore',()=>{
  const Timestamp = jest.requireActual('firebase/firestore').Timestamp;
  return {Timestamp,doc:(_db:unknown,...parts:string[])=>parts.join('/'),serverTimestamp:()=>({server:true}),runTransaction:jest.fn()};
});
let docs:Record<string,any>,writes:Array<{path:string;data:any;kind:string}>;
const firestore={app:{}} as any, ts=new Timestamp(1000,0);
beforeEach(()=>{
  docs={'users/owner':{email:'a@example.com',createdAt:ts,sparkFirstUseRequested:true},'sparkFirstUseLocks/owner':{schemaVersion:1,status:'authorized',actorId:'owner',groupId:'first_owner',profileCreatedAt:ts,expiresAt:ts,cycle:'2026-10',lockId:'lock_owner_1234567890'},'sparkCivilMonths/2026-10':{startAt:ts,endAt:ts}};writes=[];
  jest.mocked(getAuth).mockReturnValue({currentUser:{uid:'owner'}} as any);
  jest.mocked(runTransaction).mockImplementation(async (_db,callback)=>callback({get:async(path:string)=>({data:()=>docs[path]}),set:(path:string,data:any)=>writes.push({path,data,kind:'set'}),update:(path:string,data:any)=>writes.push({path,data,kind:'update'})} as any));
});
test('autorização válida prepara grupo, perfil, caixa e recibo em uma transação',async()=>{
  expect(await initializeSparkFirstUseFirebase(firestore,'owner')).toEqual({status:'ready',groupId:'first_owner',idempotent:false});
  expect(writes.map(x=>x.path)).toEqual(['financialGroups/first_owner','users/owner','financialGroups/first_owner/sparkPositions/cash','financialGroups/first_owner/sparkOperations/first_use_cash']);
  expect(writes[2].data.balanceInCents).toBe(0);expect(runTransaction).toHaveBeenCalledTimes(1);
});
test('sem autorização não cria grupo ou muda perfil',async()=>{delete docs['sparkFirstUseLocks/owner'];expect(await initializeSparkFirstUseFirebase(firestore,'owner')).toEqual({status:'awaiting-authorization'});expect(writes).toHaveLength(0);});
test('bloqueio em revisão ainda não autoriza a criação',async()=>{docs['sparkFirstUseLocks/owner']={status:'reviewing',lockId:'new_lock_1234567890'};expect(await initializeSparkFirstUseFirebase(firestore,'owner')).toEqual({status:'awaiting-authorization'});expect(writes).toHaveLength(0);});
test('não altera conta legada já vinculada',async()=>{docs['users/owner']={...docs['users/owner'],financialGroupId:'legacy',financialGroupRole:'admin'};expect(await initializeSparkFirstUseFirebase(firestore,'owner')).toEqual({status:'existing-account'});expect(writes).toHaveLength(0);});
test('reenvio confirma grupo e caixa existentes sem repetir gravações',async()=>{docs['users/owner']={...docs['users/owner'],financialGroupId:'first_owner',financialGroupRole:'admin'};docs['financialGroups/first_owner']={status:'active',sparkProtocol:'financial-proof-v17',members:{owner:'admin'},firstUseActorId:'owner'};docs['financialGroups/first_owner/sparkPositions/cash']={kind:'cash',balanceInCents:100};docs['financialGroups/first_owner/sparkOperations/first_use_cash']={actorId:'owner',kind:'account_opening',accountId:'cash',openingBalanceInCents:0};expect(await initializeSparkFirstUseFirebase(firestore,'owner')).toMatchObject({status:'ready',idempotent:true});expect(writes).toHaveLength(0);});
test('autorização incompatível ou sessão trocada não gravam',async()=>{docs['sparkFirstUseLocks/owner'].groupId='other';await expect(initializeSparkFirstUseFirebase(firestore,'owner')).rejects.toThrow();expect(writes).toHaveLength(0);jest.mocked(getAuth).mockReturnValue({currentUser:{uid:'other'}} as any);await expect(initializeSparkFirstUseFirebase(firestore,'owner')).rejects.toThrow();expect(writes).toHaveLength(0);});

test('perfil e caixa existentes sem recibo válido exigem reconciliação',async()=>{docs['users/owner']={...docs['users/owner'],financialGroupId:'first_owner',financialGroupRole:'admin'};docs['financialGroups/first_owner']={status:'active',sparkProtocol:'financial-proof-v17',members:{owner:'admin'},firstUseActorId:'owner'};docs['financialGroups/first_owner/sparkPositions/cash']={kind:'cash'};await expect(initializeSparkFirstUseFirebase(firestore,'owner')).rejects.toThrow('reconciliada');expect(writes).toHaveLength(0);});

test('sem calendário protegido a inicialização não grava',async()=>{delete docs['sparkCivilMonths/2026-10'];await expect(initializeSparkFirstUseFirebase(firestore,'owner')).rejects.toThrow('Calendário');expect(writes).toHaveLength(0);});
test('autorização sem identidade válida de bloqueio não grava',async()=>{docs['sparkFirstUseLocks/owner'].lockId='short';await expect(initializeSparkFirstUseFirebase(firestore,'owner')).rejects.toThrow('Autorização');expect(writes).toHaveLength(0);});
