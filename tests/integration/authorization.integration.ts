import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, onIdTokenChanged } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, terminate, setLogLevel } from 'firebase/firestore';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { setEmulatorClaims, DEMO_PASSWORD } from '../../script/emulator-fixtures';
import { loadAuthorization } from '../../firebase/authorization';
import { loadFinancialContext } from '../../firebase/financialContext';
import { loadProfile } from '../../firebase/profiles';

const project='demo-lumus-foundation';
const generation='synthetic-authority-original';
const app=initializeApp({projectId:project,apiKey:'demo-api-key'},'authorization-stage03');
const client={auth:getAuth(app),db:getFirestore(app)};
connectAuthEmulator(client.auth,'http://127.0.0.1:9098',{disableWarnings:true});
connectFirestoreEmulator(client.db,'127.0.0.1',8089);
let environment:RulesTestEnvironment;
let owner:string,member:string,outsider:string;
before(async()=>{
	assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9098');setLogLevel('silent');
	environment=await initializeTestEnvironment({projectId:project,firestore:{host:'127.0.0.1',port:8089,rules:readFileSync('firestore.rules','utf8')}});
	owner=(await createUserWithEmailAndPassword(client.auth,'auth-owner@lumus.test',DEMO_PASSWORD)).user.uid;
	member=(await createUserWithEmailAndPassword(client.auth,'auth-member@lumus.test',DEMO_PASSWORD)).user.uid;
	outsider=(await createUserWithEmailAndPassword(client.auth,'auth-outsider@lumus.test',DEMO_PASSWORD)).user.uid;
	await setEmulatorClaims(member,{lumusAccess:generation},project);
	await environment.withSecurityRulesDisabled(async context=>{
		const db=context.firestore(),batch=db.batch();
		batch.set(db.doc(`users/${member}`),{name:'Membro legado',financialGroupId:'authorization-group',adminUser:true});
		batch.set(db.doc(`users/${outsider}`),{name:'Outro',financialGroupId:'authorization-group',adminUser:true,relatedIdUsers:[owner]});
		batch.set(db.doc(`_authorizations/${member}`),{generation,enabled:true,readOwners:[owner],groups:{'authorization-group':'member'}});
		batch.set(db.doc('financialGroups/authorization-group'),{status:'active',members:{[member]:'admin',[outsider]:'admin'}});
		batch.set(db.doc('expenses/authorization-history'),{personId:owner,groupId:null,financialGroupId:null,ledgerGroupId:null,valueInCents:12345});
		await batch.commit();
	});
});
after(async()=>{await terminate(client.db);await deleteApp(app);await environment?.cleanup();});

test('real emulator token + protected authorization governs access, not legacy profile/member roles',async()=>{
	await signInWithEmailAndPassword(client.auth,'auth-member@lumus.test',DEMO_PASSWORD);
	assert.equal(client.auth.currentUser!.uid,member);
	assert.equal((await client.auth.currentUser!.getIdTokenResult()).claims.lumusAccess,generation);
	assert.deepEqual((await loadAuthorization(client,member))?.readOwners,[owner]);
	assert.deepEqual(await loadFinancialContext(client,member,null),{kind:'personal',sharedReadStatus:'authorized'});
	assert.equal((await loadProfile(client,member))?.profile.adminUser,false);
	assert.deepEqual(await loadFinancialContext(client,member,'authorization-group'),{kind:'group',groupId:'authorization-group',role:'member'});
	assert.equal((await getDocFromServer(doc(client.db,'expenses','authorization-history'))).data()?.valueInCents,12345);
	await signInWithEmailAndPassword(client.auth,'auth-outsider@lumus.test',DEMO_PASSWORD);
	assert.equal(await loadAuthorization(client,outsider),null);
	await assert.rejects(loadFinancialContext(client,outsider,'authorization-group'),/context\/access-denied/);
	await assert.rejects(getDocFromServer(doc(client.db,'expenses','authorization-history')),(e:any)=>e.code==='permission-denied');
});
test('revocation blocks shared documents immediately even while a valid old token remains cached',async()=>{
	await signInWithEmailAndPassword(client.auth,'auth-member@lumus.test',DEMO_PASSWORD);
	await environment.withSecurityRulesDisabled(async c=>c.firestore().doc(`_authorizations/${member}`).update({enabled:false}));
	assert.equal((await client.auth.currentUser!.getIdTokenResult()).claims.lumusAccess,generation);
	await assert.rejects(getDocFromServer(doc(client.db,'expenses','authorization-history')),(e:any)=>e.code==='permission-denied');
	await assert.rejects(loadAuthorization(client,member));
	assert.deepEqual(await loadFinancialContext(client,member,null),{kind:'personal',sharedReadStatus:'unverified'});
	assert.equal((await loadProfile(client,member))?.profile.name,'Membro legado');
});
test('token refresh propagates the new generation; stale grant cannot be reused',async()=>{
	const next='synthetic-authority-reissued';
	let lastClaim:unknown;
	const unsubscribe=onIdTokenChanged(client.auth,async user=>{lastClaim=(await user?.getIdTokenResult())?.claims.lumusAccess;});
	try{
		await setEmulatorClaims(member,{lumusAccess:next},project);
		await client.auth.currentUser!.getIdToken(true);
		await new Promise(resolve=>setTimeout(resolve,0));
		assert.equal(lastClaim,next);
		await environment.withSecurityRulesDisabled(async c=>c.firestore().doc(`_authorizations/${member}`).update({enabled:true}));
		await assert.rejects(loadAuthorization(client,member));
		await environment.withSecurityRulesDisabled(async c=>c.firestore().doc(`_authorizations/${member}`).update({generation:next}));
		assert.equal((await loadAuthorization(client,member))?.generation,next);
	}finally{unsubscribe();}
});
