import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encryptSnapshot, decryptSnapshot, writeEncryptedBackup, readEncryptedBackup, preflightEncryptedBackup } from '../script/snapshot-encryption.cjs';
import { authorizationGeneration, parseAuthorization } from '../domain/authorization';

describe('backup confidentiality and trusted authorizations',()=>{
	const documents=[{path:'users/synthetic',fields:{name:{stringValue:'private-synthetic-value'}}}];
	const snapshot={version:1,projectId:'demo-test',documents,sha256:createHash('sha256').update(JSON.stringify(documents)).digest('hex')};
	it('authenticates ciphertext, rejects a wrong key/tampering and does not expose document contents',()=>{
		const key=randomBytes(32),encrypted=encryptSnapshot(snapshot,key);
		expect(JSON.stringify(encrypted)).not.toContain('private-synthetic-value');
		expect(decryptSnapshot(encrypted,key)).toEqual(snapshot);
		expect(()=>decryptSnapshot(encrypted,randomBytes(32))).toThrow();
		expect(()=>decryptSnapshot({...encrypted,tag:randomBytes(16).toString('base64')},key)).toThrow();
		expect(()=>decryptSnapshot({...encrypted,algorithm:'plaintext'},key)).toThrow();
		for(const length of [4,8,12])expect(()=>decryptSnapshot({...encrypted,tag:Buffer.from(encrypted.tag,'base64').subarray(0,length).toString('base64')},key)).toThrow('authentication tag');
		expect(()=>decryptSnapshot({...encrypted,nonce:randomBytes(16).toString('base64')},key)).toThrow('nonce');
	});
	it('publishes a private encrypted file atomically, refuses overwrite and rejects an exposed key',()=>{
		const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lumus-backup-test-'));
		try{
			const keyFile=path.join(directory,'key'),output=path.join(directory,'copy.enc');
			fs.writeFileSync(keyFile,randomBytes(32),{mode:0o600});
			writeEncryptedBackup(output,snapshot,keyFile);
			expect(fs.statSync(output).mode&0o777).toBe(0o600);
			expect(readEncryptedBackup(output,keyFile)).toEqual(snapshot);
			expect(()=>writeEncryptedBackup(output,snapshot,keyFile)).toThrow('already exists');
			expect(fs.readdirSync(directory).some(file=>file.includes('.partial-'))).toBe(false);
			fs.chmodSync(keyFile,0o644);
			expect(()=>preflightEncryptedBackup(path.join(directory,'other.enc'),keyFile)).toThrow('private regular file');
			expect(()=>preflightEncryptedBackup(path.join(process.cwd(),'backup.enc'),keyFile)).toThrow('outside the repository');
		}finally{fs.rmSync(directory,{recursive:true,force:true});}
	});
	it('never derives permission from legacy roles and validates bounded IAM authorizations',()=>{
		expect(authorizationGeneration({adminUser:true})).toBeNull();
		expect(authorizationGeneration('short')).toBeNull();
		const generation='synthetic-authority-stage03';
		expect(parseAuthorization({generation,enabled:true,readOwners:['owner'],groups:{group:'member'}},generation).groups.group).toBe('member');
		for(const change of [{generation:'stale'}, {enabled:false}, {readOwners:new Array(6).fill('owner')}, {groups:{group:'root'}}, {readOwners:[12]}])
			expect(()=>parseAuthorization({generation,enabled:true,readOwners:[],groups:{},...change},generation)).toThrow();
	});
});
