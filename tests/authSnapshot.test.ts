import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {digest,validateAuthSnapshot,writeAuthBackup,readAuthBackup,restoreAuthToEmulator} from '../script/auth-snapshot.cjs';
import {readEncryptedBackup} from '../script/snapshot-encryption.cjs';
import {recoveryCoverage} from '../script/auth-recovery-run.cjs';
import {analyseCoverage} from '../script/observe-security.cjs';
function archive(users:object[]){const content={version:1,kind:'firebase-auth-snapshot',projectId:'demo-auth-test',complete:true,userCount:users.length,users,hashConfig:null};return {...content,sha256:digest(content)};}
describe('Auth recovery and observation evidence',()=>{
 it('authenticates a distinct encrypted Auth format, detects corruption and rejects Firestore confusion',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lumus-auth-encryption-'));
  try{
   const key=path.join(directory,'key'),file=path.join(directory,'auth.enc');fs.writeFileSync(key,randomBytes(32),{mode:0o600});
   const snapshot=archive([{localId:'synthetic',email:'synthetic@lumus.test'}]);writeAuthBackup(file,snapshot,key);expect(readAuthBackup(file,key)).toEqual(snapshot);expect(fs.readFileSync(file,'utf8')).not.toContain('synthetic@lumus.test');expect(()=>readEncryptedBackup(file,key)).toThrow();
   const encrypted=JSON.parse(fs.readFileSync(file,'utf8'));encrypted.ciphertext=Buffer.from('corrupt').toString('base64');fs.writeFileSync(file,JSON.stringify(encrypted));expect(()=>readAuthBackup(file,key)).toThrow();
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 });
 it('rejects duplicate identities, plaintext password records, missing completeness and altered metadata',()=>{
  for(const users of [[{localId:'same'},{localId:'same'}],[{localId:'user',rawPassword:'never-export'}],[{localId:''}]])expect(()=>validateAuthSnapshot(archive(users))).toThrow();
  expect(()=>validateAuthSnapshot({...archive([]),userCount:1})).toThrow();expect(()=>validateAuthSnapshot({...archive([]),complete:false})).toThrow();
 });
 it('cannot import accounts into production even with a valid archive',async()=>{
  const fetchSpy=jest.spyOn(globalThis,'fetch');await expect(restoreAuthToEmulator(archive([]),'finances-app-e8685')).rejects.toThrow('demo');expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();
 });
 it('reports missing password parameters instead of promising password recovery',()=>{
  const report=recoveryCoverage(archive([{localId:'user',providerUserInfo:[{providerId:'password'}]}]));expect(report.passwordAccounts).toBe(1);expect(report.passwordHashesPresent).toBe(0);expect(report.passwordParametersPresent).toBe(false);expect(report.realPasswordRestoreHomologated).toBe(false);
 });
 it('requires a genuine hour and continuous passing probes; endpoints alone cannot prove coverage',()=>{
  const samples=Array.from({length:61},(_,index)=>({elapsedSeconds:index*60,verified:true}));
  expect(analyseCoverage(samples,3600).continuousHour).toBe(true);expect(analyseCoverage(samples,3599).continuousHour).toBe(false);expect(analyseCoverage([samples[0],samples.at(-1)],3600).continuousHour).toBe(false);expect(analyseCoverage(samples.map((sample,index)=>index===20?{...sample,verified:false}:sample),3600).continuousHour).toBe(false);
 });
});
