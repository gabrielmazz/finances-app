// Owner performs the real logout; the observer verifies its effects and persistence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..');
require(path.join(repo,'script/firestore-recovery-run.cjs')).protectedProcess(false);
const device=require(path.join(repo,'script/native-ui.cjs')).deviceContext();
const file=path.join(repo,'artifacts/stage03-final/physical-homologation.json');
const proof=JSON.parse(fs.readFileSync(file));
assert.equal(proof.model,device.model);assert.equal(proof.projectSdk,57);
assert.equal(proof.steps.length,6);assert(proof.steps.every(step=>step.passed));
assert(proof.steps.some(step=>step.name==='connection-restored-cold-profile-read-and-same-uid'));
const report={startedAt:new Date().toISOString(),manualLogoutRequested:true,steps:[],screenshotsTaken:false,rawIdentityRecorded:false};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function guest(seconds){
 const start=process.hrtime.bigint();
 while(Number(process.hrtime.bigint()-start)/1e9<seconds){
  let probe;try{probe=device.probe();}catch{await delay(1500);continue;}
  if(probe.flags?.login&&!probe.flags.profile&&!probe.flags.expectedUid)return;
  await delay(1500);
 }
 throw Error('Logged-out UI was not confirmed');
}
function passed(name){report.steps.push({name,passed:true,checkedAt:new Date().toISOString()});}
(async()=>{
 console.log('Waiting for owner to select and confirm logout on the physical device.');
 await guest(600);passed('manual-logout-clears-authenticated-workspace');
 device.close();await delay(1000);device.open();await guest(90);passed('logout-persists-and-protected-deep-link-returns-to-login');
 const source=path.join(repo,'artifacts/stage03-final/physical-before-manual-logout.json');
 if(!fs.existsSync(source))fs.writeFileSync(source,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
 const combined={...proof,previousAttemptError:proof.error,previousAttemptEndedAt:proof.finishedAt,
  steps:[...proof.steps,...report.steps],applicationFlowsHomologated:true,uidPreserved:true,
  manualActions:['owner-reported-login','owner-opened-navigation-menu','owner-selected-and-confirmed-logout'],
  initialLoginTransitionCaptured:false,logoutEffectsAutomaticallyVerified:true,networkStateRestored:true,
  finishedAt:new Date().toISOString(),evidenceSegments:['physical-before-manual-logout.json','physical-logout.json']};
 delete combined.error;fs.writeFileSync(file,JSON.stringify(combined,null,2)+'\n');report.passed=true;
})().catch(()=>{report.passed=false;report.error='Physical logout verification incomplete; no identity logged';process.exitCode=1;})
 .finally(()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(repo,'artifacts/stage03-final/physical-logout.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,steps:report.steps.length}));});
