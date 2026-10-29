import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, Timestamp, type Firestore } from 'firebase/firestore';

async function run() {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8186').split(':');
  const env = await initializeTestEnvironment({ projectId:'demo-first-use-rules', firestore:{host,port:Number(port),rules:readFileSync(resolve(__dirname,'../../firestore.rules'),'utf8')} });
  const createdAt=Timestamp.fromDate(new Date('2026-10-01T00:00:00Z'));
  try {
    await env.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore() as unknown as Firestore,'sparkCivilMonths','2026-10'),{startAt:Timestamp.fromMillis(Date.now()-3600000),endAt:Timestamp.fromMillis(Date.now()+3600000)});
      for (const uid of ['new','ungranted','expired','legacy','bad','foreign','partial','no-calendar','unlocked','locked','stale-lock']) {
        await setDoc(doc(c.firestore() as unknown as Firestore,'users',uid),{name:uid,email:`${uid}@example.com`,adminUser:false,createdAt,sparkFirstUseRequested:true,...(uid==='legacy'?{financialGroupId:'legacy-group',financialGroupRole:'admin'}:{})});
        if(uid !== 'ungranted' && uid !== 'unlocked') await setDoc(doc(c.firestore() as unknown as Firestore,'sparkFirstUseLocks',uid),{schemaVersion:1,status:'authorized',actorId:uid,groupId:`first_${uid}`,profileCreatedAt:createdAt,cycle:uid==='no-calendar'?'2026-11':'2026-10',expiresAt:Timestamp.fromMillis(Date.now()+(uid==='expired'?-60000:3600000)),lockId:`lock_${uid}_1234567890`});
      }
      await setDoc(doc(c.firestore() as unknown as Firestore,'banks','locked-bank'),{personId:'locked',name:'Conta existente'});
    });
    const client=(uid:string)=>env.authenticatedContext(uid,{auth_time:Math.floor(Date.now()/1000)}).firestore() as unknown as Firestore;
    const create=(db:ReturnType<typeof client>,uid:string, options:{badCash?:boolean;partial?:boolean}={}) => {
      const group=`first_${uid}`, batch=writeBatch(db);
      batch.update(doc(db,'users',uid),{financialGroupId:group,financialGroupRole:'admin',financialLegacyCutoverAt:serverTimestamp()});
      batch.set(doc(db,'financialGroups',group),{status:'active',members:{[uid]:'admin'},sparkProtocol:'financial-proof-v17',firstUseActorId:uid,createdAt:serverTimestamp()});
      if(!options.partial) {
        batch.set(doc(db,'financialGroups',group,'sparkPositions','cash'),{schemaVersion:1,kind:'cash',active:true,balanceInCents:options.badCash?100:0,revision:0,lastOperationId:'first_use_cash',nextActivationAt:null,updatedAt:serverTimestamp()});
        batch.set(doc(db,'financialGroups',group,'sparkOperations','first_use_cash'),{schemaVersion:1,actorId:uid,kind:'account_opening',accountId:'cash',accountKind:'cash',openingBalanceInCents:0,note:null,createdAt:serverTimestamp()});
      }
      return batch.commit();
    };
    await assertFails(setDoc(doc(client('ungranted'),'sparkFirstUseAuthorizations','ungranted'),{schemaVersion:1}));
    await assertFails(setDoc(doc(client('ungranted'),'sparkFirstUseLocks','ungranted'),{reason:'first-use-review'}));
    await assertFails(deleteDoc(doc(client('locked'),'sparkFirstUseLocks','locked')));
    await assertSucceeds(setDoc(doc(client('ungranted'),'banks','unlocked-bank'),{personId:'ungranted',name:'Conta legada'}));
    await assertFails(setDoc(doc(client('locked'),'banks','another-bank'),{personId:'locked',name:'Conta legada'}));
    await assertFails(updateDoc(doc(client('locked'),'banks','locked-bank'),{name:'Alterada'}));
    await assertFails(deleteDoc(doc(client('locked'),'banks','locked-bank')));
    await env.withSecurityRulesDisabled(async c => { await deleteDoc(doc(c.firestore() as unknown as Firestore,'sparkFirstUseLocks','locked')); });
    await assertSucceeds(setDoc(doc(client('locked'),'banks','another-bank'),{personId:'locked',name:'Conta legada'}));
    await assertSucceeds(updateDoc(doc(client('locked'),'banks','locked-bank'),{name:'Alterada'}));
    await assertSucceeds(deleteDoc(doc(client('locked'),'banks','locked-bank')));
    await assertFails(create(client('unlocked'),'unlocked'));
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore() as unknown as Firestore,'sparkFirstUseLocks','stale-lock'),{status:'reviewing',lockId:'replacement_lock_123456'}); });
    await assertFails(create(client('stale-lock'),'stale-lock'));
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore() as unknown as Firestore,'sparkFirstUseLocks','stale-lock'),{schemaVersion:1,status:'authorized',actorId:'stale-lock',groupId:'first_stale-lock',profileCreatedAt:createdAt,cycle:'2026-10',expiresAt:Timestamp.fromMillis(Date.now()+3600000),lockId:'replacement_lock_123456'}); });
    await assertSucceeds(create(client('stale-lock'),'stale-lock'));
    await assertFails(getDoc(doc(client('foreign'),'sparkFirstUseAuthorizations','new')));
    await assertFails(getDoc(doc(client('foreign'),'sparkFirstUseLocks','new')));
    await assertFails(create(client('ungranted'),'ungranted'));
    await assertFails(create(client('expired'),'expired'));
    await assertFails(create(client('legacy'),'legacy'));
    await assertFails(create(client('bad'),'bad',{badCash:true}));
    await assertFails(create(client('partial'),'partial',{partial:true}));
    await assertFails(create(client('no-calendar'),'no-calendar'));
    await assertFails(create(client('foreign'),'new'));
    await assertSucceeds(create(client('new'),'new'));
    const profile=(await getDoc(doc(client('new'),'users','new'))).data();
    const cash=(await getDoc(doc(client('new'),'financialGroups','first_new','sparkPositions','cash'))).data();
    if(profile?.financialGroupId!=='first_new'||cash?.balanceInCents!==0) throw new Error('Inicialização incompleta.');
    await assertFails(create(client('new'),'new'));
    console.log('Primeiro uso: autorização, atomicidade, identidade, recusa de legado e replay validados.');
  } finally { await env.cleanup(); }
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
