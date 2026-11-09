// Verify dedicated Chromium processes without reading their memory or environment.
const fs=require('node:fs'),{spawn}=require('node:child_process');
function canOpenMemory(pid){try{const fd=fs.openSync('/proc/'+pid+'/mem','r');fs.closeSync(fd);return true;}catch{return false;}}
async function verifyAccessProbe(){
 const child=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{env:{PATH:'/usr/bin:/bin'},stdio:'ignore'});
 try{await new Promise(resolve=>setTimeout(resolve,100));if(!canOpenMemory(child.pid))throw Error('Kernel dump protection cannot be distinguished here');}
 finally{child.kill('SIGTERM');}
}
async function verifyBrowserProtection(context){
 const session=await context.browser().newBrowserCDPSession();
 try{
  const result=await session.send('SystemInfo.getProcessInfo');
  const processes=result.processInfo.filter(process=>process.id>0);
  if(!processes.length||processes.some(process=>canOpenMemory(process.id)))throw Error('Chromium dump protection not verified');
  return {verified:true,processes:processes.length};
 }finally{await session.detach();}
}
module.exports={verifyAccessProbe,verifyBrowserProtection};
