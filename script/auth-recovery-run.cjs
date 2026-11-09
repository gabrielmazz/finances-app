// Privileged local operator only. Exports/inspects encrypted Auth archives; never imports production users.
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const {protectedProcess,privateDirectory}=require('./firestore-recovery-run.cjs');
const {exportAuthSnapshot,writeAuthBackup,readAuthBackup}=require('./auth-snapshot.cjs');
const {readEncryptedBackup}=require('./snapshot-encryption.cjs');
function recoveryCoverage(snapshot){
 const config=snapshot.hashConfig;
 const parametersPresent=config?.algorithm==='SCRYPT'&&typeof config.signerKey==='string'&&config.signerKey.length>0&&Number.isInteger(config.rounds)&&Number.isInteger(config.memoryCost)&&typeof config.saltSeparator==='string';
 const passwords=snapshot.users.filter(user=>user.passwordHash||user.providerUserInfo?.some(provider=>provider.providerId==='password'));
 return {userCount:snapshot.userCount,passwordAccounts:passwords.length,passwordHashesPresent:passwords.filter(user=>user.passwordHash&&user.salt).length,passwordParametersPresent:parametersPresent,providerRecordCount:snapshot.users.reduce((sum,user)=>sum+(user.providerUserInfo?.length||0),0),mfaRequiresSeparateReview:snapshot.users.some(user=>user.mfaInfo?.length),realPasswordRestoreHomologated:false};
}
module.exports={recoveryCoverage};
if(require.main===module)(async()=>{
 process.umask(0o077);const action=process.argv[2];if(!['export','inspect'].includes(action))throw Error('Use export or inspect; production import is unsupported');
 protectedProcess(action==='inspect');const input=JSON.parse(fs.readFileSync(0,'utf8'));
 if(privateDirectory(path.dirname(input.file))===privateDirectory(path.dirname(input.keyFile)))throw Error('Use distinct private subdirectories for encrypted data and key');
 if(action==='export'){
  if(input.authorization!=='export-existing-auth-users'||input.projectId!=='finances-app-e8685')throw Error('Explicit authorized project/scope required');
  if(fs.existsSync(input.file)||fs.existsSync(input.keyFile))throw Error('Never overwrite an Auth archive/key');
  fs.writeFileSync(input.keyFile,randomBytes(32),{flag:'wx',mode:0o600});
  const snapshot=await exportAuthSnapshot({projectId:input.projectId,token:input.token,maxUsers:100});writeAuthBackup(input.file,snapshot,input.keyFile);
 }
 const snapshot=readAuthBackup(input.file,input.keyFile);const coverage=recoveryCoverage(snapshot);
 let association=null;
 if(input.firestoreFile&&input.firestoreKeyFile){
  const documents=readEncryptedBackup(input.firestoreFile,input.firestoreKeyFile);
  const profileIds=new Set(documents.documents.filter(document=>/^users\/[^/]+$/.test(document.path)).map(document=>document.path.split('/')[1]));
  association={profiles:profileIds.size,authUsersWithProfile:snapshot.users.filter(user=>profileIds.has(user.localId)).length};
 }
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),...coverage,sha256:snapshot.sha256,encrypted:true,integrityVerified:true,association,pointInTime:false,productionAccountWrites:0,productionImportSupported:false,hashParametersLogged:false}));
})().catch(()=>{console.error('Protected Auth archive operation failed; no production accounts were imported or changed.');process.exitCode=1;});
