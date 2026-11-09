// Authorized physical device only. Password is entered manually; no UI hierarchy is retained.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');
require(path.join(repo,'script/firestore-recovery-run.cjs')).protectedProcess(false);
const {deviceContext,matchesLabel,nodeBounds}=require(path.join(repo,'script/native-ui.cjs'));
const device=deviceContext();
const hasControl=(probe,label)=>probe.nodes?.some(node=>matchesLabel(node,label));
const file=path.join(repo,'artifacts/stage03-final/physical-homologation.json');
const report={startedAt:new Date().toISOString(),platform:'android',model:device.model,physicalDeviceDetected:true,
 installedExpoGo:'57.0.9',projectSdk:57,steps:[],applicationFlowsHomologated:false,
 credentialsEnteredByAutomation:false,manualLoginReportedByOwner:true,initialLoginTransitionCaptured:false,
 rawIdentityRecorded:false,screenshotsTaken:false,financialWrites:0,productionAppReplaced:false};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const persist=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
function passed(name){report.steps.push({name,passed:true,checkedAt:new Date().toISOString()});persist();console.log(name+': passed');}
async function waitFor(predicate,seconds=60){
 const start=process.hrtime.bigint();
 while(Number(process.hrtime.bigint()-start)/1e9<seconds){
  let probe;try{probe=device.probe();}catch{await delay(1500);continue;}
  if(probe.flags?.runtimeError||probe.flags?.incompatibleSdk)throw Error('Native runtime/SDK error');
  if(predicate(probe))return probe;await delay(1500);
 }
 throw Error('Expected physical UI state was not observed');
}
async function scroll(direction){
 const probe=await waitFor(probe=>!!probe.nodes,15);
 const region=probe.nodes.find(node=>node.scrollable==='true'&&node.class==='android.widget.ScrollView');
 const area=nodeBounds(region||{});assert(area,'Scrollable profile unavailable');
 const labels=['Nome','Membro desde','E-mail de acesso','Informações da conta','Tipo de acesso','Cadastros monitorados','Contas vinculadas','Seu ID'];
 const candidates=probe.nodes.filter(node=>labels.includes(node.text)&&nodeBounds(node)).map(node=>nodeBounds(node)).filter(rect=>rect[1]>area[1]+20&&rect[3]<area[3]-20).sort((a,b)=>a[1]-b[1]);
 const anchor=direction==='up'?candidates[0]:candidates.at(-1);assert(anchor,'Static scroll anchor unavailable');
 // Begin on a noninteractive label; editable fields and edge gestures consume swipes.
 const x=Math.floor((anchor[0]+anchor[2])/2),y=Math.floor((anchor[1]+anchor[3])/2);
 const end=direction==='up'?area[3]-25:area[1]+25;
 device.shell(`input swipe ${x} ${y} ${x} ${end} 350`);await delay(500);
}
async function profile(){
 device.open();let result=await waitFor(probe=>probe.flags?.profile&&!probe.flags.login);
 for(let attempts=0;attempts<7&&!result.flags.expectedUid;attempts++){await scroll('down');result=await waitFor(probe=>!!probe.nodes,15);}
 assert(result.flags.expectedUid,'Existing UID was not visible on the authorized profile');
 return result;
}
async function top(){for(let i=0;i<8;i++){const probe=await waitFor(probe=>!!probe.nodes,15);if(hasControl(probe,'Atualizar perfil'))return;await scroll('up');}throw Error('Profile top was not reached');}
let networkBefore;
(async()=>{
 persist();console.log('Waiting for manual login on the authorized physical Android.');
 await waitFor(probe=>probe.flags?.workspace||probe.flags?.profile,600);passed('native-workspace-rendered-existing-authorized-session');
 await profile();passed('existing-authorized-session-profile-and-uid');
 await top();await waitFor(probe=>probe.flags?.expectedEmail&&probe.flags.profileNameLoaded&&probe.flags.existingProfileDateLoaded,30);passed('existing-profile-name-email-and-legacy-date-loaded');
 device.close();await delay(1500);device.open();await profile();passed('force-stop-and-reopen-preserves-session-and-uid');
 await top();
 const wifi=device.shell('settings get global wifi_on').trim(),mobile=device.shell('settings get global mobile_data').trim();
 assert(['0','1'].includes(wifi)&&['0','1'].includes(mobile),'Initial network state cannot be safely restored');networkBefore={wifi,mobile};
 try{
  if(wifi==='1')device.shell('svc wifi disable');if(mobile==='1')device.shell('svc data disable');await delay(2000);
  let probe=device.probe();device.tap(probe.nodes,'Atualizar perfil');await waitFor(probe=>probe.flags?.offline,50);passed('connection-loss-reports-explicit-error');
 }finally{
  if(wifi==='1')device.shell('svc wifi enable');if(mobile==='1')device.shell('svc data enable');networkBefore=null;
 }
 // Restart discards the in-memory profile; getDocFromServer must succeed again.
 await delay(4000);device.close();await delay(1500);device.open();await profile();await top();await waitFor(probe=>probe.flags?.profileNameLoaded&&probe.flags.existingProfileDateLoaded&&!probe.flags.offline,60);passed('connection-restored-cold-profile-read-and-same-uid');
 let probe=await waitFor(probe=>hasControl(probe,'Config'),20);device.tap(probe.nodes,'Config');
 probe=await waitFor(probe=>hasControl(probe,'Sair'),15);device.tap(probe.nodes,'Sair');
 probe=await waitFor(probe=>hasControl(probe,'Sair do Lumus?'),15);device.tap(probe.nodes,'Sair');
 await waitFor(probe=>probe.flags?.login&&!probe.flags.profile);passed('logout-clears-authenticated-workspace');
 device.close();await delay(1000);device.open();await waitFor(probe=>probe.flags?.login&&!probe.flags.profile&&!probe.flags.expectedUid);passed('logout-persists-and-protected-deep-link-returns-to-login');
 report.applicationFlowsHomologated=true;report.uidPreserved=true;report.networkStateRestored=true;report.environment='Expo Go physical Android, real Firebase, manual authorized account';
})().catch(error=>{report.error=['Native runtime/SDK error','Expected physical UI state was not observed','Native test transport unavailable','Expected native control not visible','Existing UID was not visible on the authorized profile','Initial network state cannot be safely restored','Logout confirmation missing'].includes(error.message)?error.message:'Physical scenario failed; no hierarchy or identity logged';process.exitCode=1;})
 .finally(()=>{if(networkBefore){if(networkBefore.wifi==='1')device.shell('svc wifi enable');if(networkBefore.mobile==='1')device.shell('svc data enable');}report.finishedAt=new Date().toISOString();persist();console.log(JSON.stringify({homologated:report.applicationFlowsHomologated,steps:report.steps.length}));});
