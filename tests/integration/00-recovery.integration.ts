import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeApp,deleteApp } from 'firebase/app';
import { getAuth,connectAuthEmulator,signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore,connectFirestoreEmulator,doc,getDocFromServer,terminate,setLogLevel } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { exportSnapshot,restoreToEmulator,compareSnapshots,validate } from '../../script/firestore-snapshot.cjs';
import { writeEncryptedBackup,readEncryptedBackup } from '../../script/snapshot-encryption.cjs';
import { loadProfile } from '../../firebase/profiles';
import { readOwnBankPage } from '../../firebase/financialContext';
import { DEMO_PASSWORD } from '../../script/emulator-fixtures';

const root=(project:string)=>`projects/${project}/databases/(default)/documents`;
async function commit(project:string,records:{path:string;fields:Record<string,unknown>}[]) {
	const result=await fetch(`http://127.0.0.1:8089/v1/${root(project)}:commit`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:records.map(record=>({update:{name:root(project)+'/'+record.path,fields:record.fields}}))})});
	assert.equal(result.status,200);
}
test('encrypted recovery preserves UID, financial values, hierarchy and typed references interpreted by the app',async()=>{
	assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8089');setLogLevel('silent');
	const source='demo-lumus-recovery-source',target='demo-lumus-foundation',uid='legacy-restored-uid';
	const personId={stringValue:uid};
	const records=[
		{path:`users/${uid}`,fields:{name:{stringValue:'Pessoa restaurada'},email:{stringValue:'restored@lumus.test'},adminUser:{booleanValue:true},createdAt:{stringValue:'2020-01-01T00:00:00Z'},relatedIdUsers:{arrayValue:{values:[{stringValue:'related-uid'}]}}}},
		{path:'expenses/history',fields:{personId,groupId:{nullValue:null},financialGroupId:{nullValue:null},ledgerGroupId:{nullValue:null},valueInCents:{integerValue:'12345'},bankId:{stringValue:'bank00'},bankReference:{referenceValue:root(source)+'/banks/bank00'},date:{timestampValue:'2025-01-01T00:00:00.123456Z'}}},
		{path:'monthlyBalances/snapshot',fields:{personId,valueInCents:{integerValue:'9007199254740991'},month:{integerValue:'1'},year:{integerValue:'2025'}}},
		{path:'users/missing-parent/notes/orphan',fields:{null:{nullValue:null},bytes:{bytesValue:'AQID'},location:{geoPointValue:{latitude:1,longitude:2}}}},
		...Array.from({length:22},(_,index)=>({path:`banks/bank${String(index).padStart(2,'0')}`,fields:{personId,groupId:{nullValue:null},financialGroupId:{nullValue:null},ledgerGroupId:{nullValue:null},name:{stringValue:`Banco ${index}`}}})),
	];
	await commit(source,records);
	const snapshot=await exportSnapshot({projectId:source,local:true,maxDocuments:100});
	assert.equal(snapshot.documentCount,records.length);
	assert.equal(snapshot.pointInTime,false);
	assert.throws(()=>validate({...snapshot,documentCount:999}));
	const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lumus-recovery-test-'));
	const app=initializeApp({projectId:target,apiKey:'demo-api-key'},'recovery-app');
	const client={auth:getAuth(app),db:getFirestore(app)};
	connectAuthEmulator(client.auth,'http://127.0.0.1:9098',{disableWarnings:true});connectFirestoreEmulator(client.db,'127.0.0.1',8089);
	const environment=await initializeTestEnvironment({projectId:target,firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync('firestore.rules','utf8')}});
	try{
		const keyFile=path.join(directory,'key'),file=path.join(directory,'snapshot.enc');fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600});
		writeEncryptedBackup(file,snapshot,keyFile);
		const decrypted=readEncryptedBackup(file,keyFile);
		assert.equal(await restoreToEmulator(decrypted,target,{remapInternalReferences:true}),records.length);
		const restored=await exportSnapshot({projectId:target,local:true,maxDocuments:100});
		const proof=compareSnapshots(snapshot,restored,{remappedReferences:true});assert.equal(proof.equal,true);
		// Synthetic Auth emulator import: preserve UID using a known local test password, never real hashes.
		const imported=await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${target}/accounts:batchCreate`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({allowOverwrite:false,users:[{localId:uid,email:'restored@lumus.test',rawPassword:DEMO_PASSWORD}]})});
		assert.equal(imported.status,200);const response=await imported.json() as {error?:unknown};assert.deepEqual(response.error??[],[]);
		await signInWithEmailAndPassword(client.auth,'restored@lumus.test',DEMO_PASSWORD);assert.equal(client.auth.currentUser!.uid,uid);
		assert.equal((await loadProfile(client,uid))?.profile.createdAt?.getUTCFullYear(),2020);
		const first=await readOwnBankPage(client,uid),second=await readOwnBankPage(client,uid,first.nextCursor!);
		assert.equal(first.banks.length,20);assert.equal(second.banks.length,2);
		assert.equal(new Set([...first.banks,...second.banks].map(bank=>bank.id)).size,22);
		const expense=(await getDocFromServer(doc(client.db,'expenses','history'))).data()!;
		assert.equal(expense.valueInCents,12345);assert.equal(expense.bankReference.firestore.app.options.projectId,target);
		assert.equal((await getDocFromServer(expense.bankReference)).id,'bank00');
		await assert.rejects(restoreToEmulator(snapshot,target));
		fs.mkdirSync('artifacts/security-stage03',{recursive:true});fs.writeFileSync('artifacts/security-stage03/restoration-proof.json',JSON.stringify({...proof,synthetic:true,encrypted:true,uidPreserved:true,appProfileParsed:true,pagination:[20,2],internalReferenceResolvedLocally:true,financialFieldsPreserved:true,pointInTime:false,productionDataUsed:false},null,2)+'\n');
	}finally{await terminate(client.db);await deleteApp(app);await environment.cleanup();fs.rmSync(directory,{recursive:true,force:true});}
});

test('restore interruption is detected, cannot overwrite partial results and is never marked valid',async(context)=>{
	const source='demo-lumus-partial-source',target='demo-lumus-partial-target';
	await commit(source,Array.from({length:101},(_,index)=>({path:`records/${index}`,fields:{value:{integerValue:String(index)}}})));
	const snapshot=await exportSnapshot({projectId:source,local:true,maxDocuments:200});
	const originalFetch=globalThis.fetch;let commits=0;
	const mock=context.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],options?:Parameters<typeof fetch>[1])=>{
		if(String(url).includes(target)&&String(url).endsWith(':commit')&&++commits===2)return new Response('{}',{status:503});
		return originalFetch(url,options);
	});
	await assert.rejects(restoreToEmulator(snapshot,target),/HTTP 503/);mock.mock.restore();
	const partial=await exportSnapshot({projectId:target,local:true,maxDocuments:200});assert.equal(partial.documentCount,100);
	assert.equal(compareSnapshots(snapshot,partial).equal,false);
	await assert.rejects(restoreToEmulator(snapshot,target),/contains documents/);
});
test('export budgets fail closed for bytes and metadata requests',async()=>{
	await assert.rejects(exportSnapshot({projectId:'demo-lumus-budget-empty',local:true,maxDocuments:10,maxRequests:0}),/budget/);
	await commit('demo-lumus-byte-budget',[{path:'records/large',fields:{text:{stringValue:'x'.repeat(1000)}}}]);
	await assert.rejects(exportSnapshot({projectId:'demo-lumus-byte-budget',local:true,maxDocuments:10,maxBytes:100}),/Byte budget/);
});


test('CLI restores and verifies encrypted version-1 backups including missing ancestors', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-v1-recovery-'));
	try {
		const documents = [
			{path:'records/existing',fields:{value:{integerValue:'12345'}}},
			{path:'parents/missing/children/deep',fields:{value:{nullValue:null}}},
		];
		const snapshot = {version:1,projectId:'demo-lumus-v1-source',documents,sha256:createHash('sha256').update(JSON.stringify(documents)).digest('hex')};
		const keyFile=path.join(directory,'key'), file=path.join(directory,'v1.enc');
		fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600});
		writeEncryptedBackup(file,snapshot,keyFile);
		const {stdout} = await promisify(execFile)(process.execPath,[
			'--require','./script/integration-network.cjs','script/firestore-snapshot.cjs',
			'restore-encrypted-local','demo-lumus-v1-restored',file,
		],{env:{...process.env,LUMUS_BACKUP_KEY_FILE:keyFile}});
		assert.match(stdout,/"equal":true/);
		assert.match(stdout,/"restoredCount":2/);
	} finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
