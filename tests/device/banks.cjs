// Assisted UI on the authorized physical Android; only the synthetic demo project.
require('../../script/firestore-recovery-run.cjs').protectedProcess(false);
require('../../script/integration-network.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {initializeApp,deleteApp}=require('firebase/app'),{getAuth,connectAuthEmulator,signInWithEmailAndPassword}=require('firebase/auth');
const {getFirestore,connectFirestoreEmulator,collection,query,limit,getDocs,getDocFromServer,doc,terminate}=require('firebase/firestore');
const {deviceContext}=require('../../script/native-ui.cjs');
const directory='artifacts/banks-stage04',file=directory+'/android.json',action=process.argv[2];
const device=deviceContext({uid:'synthetic-stage04',email:'banks-mobile@lumus.test'});
const proof=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {synthetic:true,projectId:'demo-lumus-foundation',model:device.model,productionWrites:0,assistedLogin:true,assistedAccountCreation:true,checks:[]};
function screen(){const p=device.probe(),text=p.nodes?.map(n=>n.text+' '+n['content-desc']).join(' ')||'';assert(p.flags?.foreground&&!p.flags.runtimeError&&/Bancos e saldo inicial disponíveis em testes/.test(text),'Synthetic workspace must be visible');return {p,text};}
function shot(name){const c=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/lumus-homologation/devices.json')));const devices=c.devices.filter(d=>d.physical&&d.state==='device');assert.equal(devices.length,1);const bytes=execFileSync(c.adb,[...(c.port?['-P',String(c.port)]:[]),'-s',devices[0].serial,'exec-out','screencap','-p'],{timeout:20000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});fs.writeFileSync(directory+'/'+name+'.png',bytes);}
async function server(){
 const app=initializeApp({projectId:'demo-lumus-foundation',apiKey:'demo-api-key'},'native-bank-proof');
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9098',{disableWarnings:true});const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8089);
 try{
  const {user}=await signInWithEmailAndPassword(auth,'banks-mobile@lumus.test','Lumus-local-2026!');
  const result=await getDocs(query(collection(db,'financialContexts','personal:'+user.uid,'bankAccounts'),limit(20)));
  const accounts=[];for(const item of result.docs){const opening=await getDocFromServer(doc(db,'financialContexts','personal:'+user.uid,'accountOpenings',item.id));assert(opening.exists());assert.equal(opening.data().amountCents,item.data().initialBalanceCents);assert.equal(opening.data().accountId,item.id);accounts.push({id:item.id,name:item.data().name,status:item.data().status,cents:item.data().initialBalanceCents,revision:item.data().revision,openingCents:opening.data().amountCents});}
  return {uidSHA256:createHash('sha256').update(user.uid).digest('hex'),accounts};
 }finally{await terminate(db);await deleteApp(app);}
}
(async()=>{
 if(action==='restart'){device.close();device.run(['shell','am','start','-a','android.intent.action.VIEW','-d','exp://127.0.0.1:8088/--/mobile/home','-p','host.exp.exponent']);proof.restartRequested=true;}
 else{
  const {p,text}=screen(),state=await server();
  assert(state.accounts.some(a=>a.cents===150000));assert(/1.500,00/.test(text));
  if(proof.uidSHA256)assert.equal(state.uidSHA256,proof.uidSHA256);
  proof.uidSHA256=state.uidSHA256;
  if(action==='created'||action==='reopened'){
   assert.equal(state.accounts.length,1);assert.equal(state.accounts[0].status,'active');assert(text.includes('Conta Android 1500'));assert(text.includes('Cadastrar conta'));assert(!p.flags.login);
   if(proof.accountId)assert.equal(state.accounts[0].id,proof.accountId);proof.accountId=state.accounts[0].id;
  }
  if(action==='final'){
   assert.equal(state.accounts.length,2);assert.equal(state.accounts.filter(a=>a.status==='archived').length,1);assert.notEqual(state.accounts.find(a=>a.cents===150000).name,'Conta Android 1500');assert.equal(state.accounts.find(a=>a.status==='archived').cents,0);assert.equal(state.accounts.filter(a=>a.status==='active').reduce((s,a)=>s+a.cents,0),150000);
   assert(text.includes(state.accounts.find(a=>a.cents===150000).name));assert(text.includes('Saldo total das contas ativas:'));
  }
  if(action==='archived'){assert(text.includes(state.accounts.find(a=>a.status==='archived').name));assert(text.includes('Arquivada'));}
  shot('android-'+action);proof.checks.push({action,checkedAt:new Date().toISOString(),ui150000:true,uiWorkspace:true,server:state.accounts});
 }
 fs.writeFileSync(file,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({action,passed:true,physical:true,model:device.model,synthetic:true}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
