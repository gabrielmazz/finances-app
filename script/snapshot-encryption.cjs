const {createCipheriv,createDecipheriv,randomBytes} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {validate} = require('./firestore-snapshot.cjs');

function readKey(file) {
	if(!file)throw Error('LUMUS_BACKUP_KEY_FILE is required');
	const stat=fs.lstatSync(file);
	if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Key must be a private regular file (0600), outside Git');
	const key=fs.readFileSync(file);
	if(key.length!==32)throw Error('AES-256 key must contain exactly 32 random bytes');
	return key;
}
function encryptPayload(snapshot,key,format) {
	if(!['lumus-firestore-encrypted-v1','lumus-auth-encrypted-v1'].includes(format))throw Error('Unsupported encrypted format');
	const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce,{authTagLength:16});
	const header={format,algorithm:'AES-256-GCM'};
	cipher.setAAD(Buffer.from(JSON.stringify(header)));
	const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
	return {...header,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
function decryptPayload(envelope,key,format) {
	if(!['lumus-firestore-encrypted-v1','lumus-auth-encrypted-v1'].includes(format)||envelope.format!==format||envelope.algorithm!=='AES-256-GCM')throw Error('Unsupported encrypted backup');
	const nonce=Buffer.from(envelope.nonce,'base64'),tag=Buffer.from(envelope.tag,'base64');
	if(nonce.length!==12||tag.length!==16)throw Error('Invalid encryption nonce or authentication tag');
	const decipher=createDecipheriv('aes-256-gcm',key,nonce,{authTagLength:16});
	decipher.setAAD(Buffer.from(JSON.stringify({format:envelope.format,algorithm:envelope.algorithm})));
	decipher.setAuthTag(tag);
	return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8'));
}
function outsideRepository(file) {
	const directory=fs.realpathSync(path.dirname(path.resolve(file)));
	const repo=fs.realpathSync(path.resolve(__dirname,'..'));
	if(directory===repo||directory.startsWith(repo+path.sep))throw Error('Real backup and key must remain outside the repository');
	return path.join(directory,path.basename(file));
}
function writeEncryptedPayload(file,snapshot,keyFile,format) {
	preflightEncryptedBackup(file,keyFile);
	file=outsideRepository(file);
	const key=readKey(keyFile),temporary=file+'.partial-'+randomBytes(8).toString('hex');
	try{
		fs.writeFileSync(temporary,JSON.stringify(encryptPayload(snapshot,key,format)),{flag:'wx',mode:0o600});
		fs.linkSync(temporary,file); // Atomic publication; an existing backup is never replaced.
	}finally{key.fill(0);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function preflightEncryptedBackup(file,keyFile) {
	const target=outsideRepository(file);
	if(fs.existsSync(target))throw Error('Backup output already exists');
	outsideRepository(keyFile||'');
	readKey(keyFile).fill(0);
}
function readEncryptedPayload(file,keyFile,format) {
	file=outsideRepository(file);outsideRepository(keyFile||'');
	const stat=fs.lstatSync(file);
	if(!stat.isFile()||stat.isSymbolicLink()||stat.size>192*1024*1024)throw Error('Invalid encrypted backup file or size');
	const key=readKey(keyFile);
	try{return decryptPayload(JSON.parse(fs.readFileSync(file,'utf8')),key,format);}finally{key.fill(0);}
}
const FIRESTORE_FORMAT='lumus-firestore-encrypted-v1';
function encryptSnapshot(snapshot,key){return encryptPayload(validate(snapshot),key,FIRESTORE_FORMAT);}
function decryptSnapshot(envelope,key){return validate(decryptPayload(envelope,key,FIRESTORE_FORMAT));}
function writeEncryptedBackup(file,snapshot,keyFile){return writeEncryptedPayload(file,validate(snapshot),keyFile,FIRESTORE_FORMAT);}
function readEncryptedBackup(file,keyFile){return validate(readEncryptedPayload(file,keyFile,FIRESTORE_FORMAT));}
module.exports={encryptSnapshot,decryptSnapshot,writeEncryptedBackup,readEncryptedBackup,preflightEncryptedBackup,encryptPayload,decryptPayload,writeEncryptedPayload,readEncryptedPayload};
