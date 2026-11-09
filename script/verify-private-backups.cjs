// Recheck the owner's approved destination. No cloud access, deletion or rotation.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
const directory='/programacao/finances-app-recovery-20261108/encrypted-data-20261109';
const guard=path.join(os.homedir(),'.cache/lumus-operator-protection');
function isolated(worker,action,input){
 return new Promise((resolve,reject)=>{
  const child=spawn('systemd-run',['--user','--quiet','--wait','--pipe','--collect',
   '--setenv=LUMUS_OPERATOR_PROTECTION_DIR='+guard,'-p','MemorySwapMax=0','-p','LimitCORE=0','-p','RuntimeMaxSec=240',
   '--','unshare','--user','--map-root-user','--net','--','/bin/sh','-c','ip link set lo up && exec "$@"','sh',
   process.execPath,path.join(repo,'script',worker),action],{stdio:['pipe','pipe','pipe']});
  let output='';child.stdin.end(JSON.stringify(input));child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.resume();
  child.on('error',()=>reject(Error('Cannot start isolated verification')));
  child.on('exit',code=>{if(code!==0)return reject(Error('Isolated integrity/recovery check failed'));try{resolve(JSON.parse(output));}catch{reject(Error('Invalid verification receipt'));}});
 });
}
(async()=>{
 const files={file:path.join(directory,'auth-20261109.enc'),keyFile:path.join(directory,'.keys/auth-aes.key'),
  firestoreFile:path.join(directory,'firestore-c1ee1b62.enc'),firestoreKeyFile:path.join(directory,'.keys/firestore-aes.key')};
 for(const file of Object.values(files))if((fs.statSync(file).mode&0o077)!==0)throw Error('Private archive/key permissions required');
 const startedAt=new Date().toISOString();
 const auth=await isolated('auth-recovery-run.cjs','inspect',files);
 const firestore=await isolated('firestore-recovery-run.cjs','restore',{
  file:files.firestoreFile,keyFile:files.firestoreKeyFile,target:'demo-lumus-destination-recheck',
  emulatorJar:path.join(os.homedir(),'.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar'),
 });
 const report={startedAt,finishedAt:new Date().toISOString(),verifiedFromApprovedDestination:true,
  auth,firestore,independentStorage:false,ownerAcceptedCoLocatedKey:true,productionWrites:0,
  retention:{verification:'weekly, manual execution',review:'every 30 days',automaticDeletion:false,
   minimumCopies:'Keep this verified baseline until a newer archive is independently verified; no off-host copy has been verified.'}};
 const output=path.join(repo,'artifacts/stage03-final/destination-recovery.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({verified:true,documents:firestore.sourceCount,authUsers:auth.userCount,
  restoredFromApprovedDestination:true,productionWrites:0,independentStorage:false}));
})().catch(()=>{console.error('Private backup verification failed. No cloud resources, accounts or backups were changed.');process.exitCode=1;});
