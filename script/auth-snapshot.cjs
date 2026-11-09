// Auth archive is separate from Firestore. Production import is deliberately absent.
const {createHash} = require('node:crypto');
const encryption = require('./snapshot-encryption.cjs');
const FORMAT='lumus-auth-encrypted-v1';
function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
function digest(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function validateAuthSnapshot(snapshot){
	if(snapshot?.version!==1||snapshot.kind!=='firebase-auth-snapshot'||snapshot.complete!==true||typeof snapshot.projectId!=='string'||!(/^(demo-[a-z0-9-]+|finances-app-e8685)$/).test(snapshot.projectId)||!Array.isArray(snapshot.users)||snapshot.users.length!==snapshot.userCount||snapshot.users.length>10000)throw Error('Invalid Auth archive');
	const {sha256,...content}=snapshot;if(sha256!==digest(content))throw Error('Auth archive checksum mismatch');
	const ids=new Set();
	for(const user of snapshot.users){
		if(typeof user.localId!=='string'||!user.localId.length||user.localId.length>128||ids.has(user.localId)||'rawPassword'in user||'password'in user)throw Error('Invalid Auth identity/credential schema');
		if(!snapshot.projectId.startsWith('demo-')&&String(user.passwordHash||'').startsWith('fakeHash:'))throw Error('Emulator credentials cannot describe production');
		ids.add(user.localId);
	}
	return snapshot;
}
function authApi(projectId,{local,token}){
	if(local&&!/^demo-[a-z0-9-]+$/.test(projectId))throw Error('Auth restore/export requires a demo project');
	if(!local&&(projectId!=='finances-app-e8685'||!token))throw Error('Existing project and read-only OAuth required');
	const root=local?`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${projectId}`:`https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
	return async(action,body,parameters='')=>{
		if(!local&&action!=='batchGet')throw Error('Production Auth writes forbidden');
		const response=await fetch(root+'/accounts:'+action+parameters,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+(local?'owner':token),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
		if(!response.ok)throw Error('Auth archive API HTTP '+response.status);
		return response.json();
	};
}
/** @param {{projectId:string,token?:string,local?:boolean,maxUsers?:number}} options */
async function exportAuthSnapshot({projectId,token,local=false,maxUsers=1000}){
	if(!Number.isSafeInteger(maxUsers)||maxUsers<1||maxUsers>10000)throw Error('Invalid Auth user budget');
	if(!local)require('./firestore-recovery-run.cjs').protectedProcess(false);
	const startedAt=new Date().toISOString(),api=authApi(projectId,{token,local}),users=[],seenTokens=new Set();let next;
	for(let page=0;page<100;page++){
		const parameters=new URLSearchParams({maxResults:String(Math.min(100,maxUsers-users.length+1)),...(next?{nextPageToken:next}:{})});
		const result=await api('batchGet',undefined,'?'+parameters);
		users.push(...(result.users||[]));if(users.length>maxUsers||Buffer.byteLength(JSON.stringify(users))>8*1024*1024)throw Error('Auth archive budget exceeded');
		next=result.nextPageToken;if(!next)break;
		if(seenTokens.has(next)||page===99)throw Error('Auth archive traversal incomplete');seenTokens.add(next);
	}
	let hashConfig=null;
	if(!local){
		const response=await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?fields=signIn.hashConfig`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
		if(response.ok)hashConfig=(await response.json()).signIn?.hashConfig||null;
		else if(![401,403].includes(response.status))throw Error('Auth hash configuration unavailable');
	}
	users.sort((a,b)=>a.localId.localeCompare(b.localId));
	const content={version:1,kind:'firebase-auth-snapshot',projectId,startedAt,exportedAt:new Date().toISOString(),complete:true,pointInTime:false,userCount:users.length,passwordVerification:local?'emulator-fake-only':'firebase-scrypt-requires-complete-hash-configuration',hashConfig,users};
	return validateAuthSnapshot({...content,sha256:digest(content)});
}
async function restoreAuthToEmulator(snapshot,targetProject){
	validateAuthSnapshot(snapshot);const api=authApi(targetProject,{local:true});
	const existing=await api('batchGet',undefined,'?maxResults=1');if(existing.users?.length)throw Error('Auth target must be empty; no user may be overwritten');
	// Emulator preserves imported records but does not verify production SCRYPT.
	for(let start=0;start<snapshot.users.length;start+=100){
		const result=await api('batchCreate',{allowOverwrite:false,users:snapshot.users.slice(start,start+100),...(snapshot.hashConfig?{hashAlgorithm:snapshot.hashConfig.algorithm,signerKey:snapshot.hashConfig.signerKey,saltSeparator:snapshot.hashConfig.saltSeparator,rounds:snapshot.hashConfig.rounds,memoryCost:snapshot.hashConfig.memoryCost}:{})});
		if(result.error?.length)throw Error('Auth restoration partially failed; use another empty demo target');
	}
	return snapshot.userCount;
}
function writeAuthBackup(file,snapshot,keyFile){encryption.writeEncryptedPayload(file,validateAuthSnapshot(snapshot),keyFile,FORMAT);}
function readAuthBackup(file,keyFile){return validateAuthSnapshot(encryption.readEncryptedPayload(file,keyFile,FORMAT));}
module.exports={exportAuthSnapshot,restoreAuthToEmulator,validateAuthSnapshot,writeAuthBackup,readAuthBackup,digest};
