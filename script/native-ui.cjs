// Dedicated authorized Expo Go device only; hierarchy remains in protected memory.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
function nodeBounds(node){const values=node.bounds?.match(/-?\d+/g)?.map(Number);return values?.length===4&&values[0]>=0&&values[1]>=0&&values[2]>values[0]&&values[3]>values[1]?values:null;}
const matchesLabel=(node,label)=>!!nodeBounds(node)&&[node.text,node['content-desc']].some(value=>typeof value==='string'&&value.trim().replace(/^[^\p{L}\p{N}]+/u,'').toLocaleLowerCase('pt-BR')===label.toLocaleLowerCase('pt-BR'));
function deviceContext(expectedAccount){
 const config=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/lumus-homologation/devices.json'),'utf8'));
 const devices=config.devices.filter(device=>device.physical&&device.state==='device');if(devices.length!==1)throw Error('One authorized physical device required');
 const account=expectedAccount||JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/lumus-homologation/authorized-account.json'),'utf8'));
 const run=args=>{try{return execFileSync(config.adb,[...(config.port?['-P',String(config.port)]:[]),'-s',devices[0].serial,...args],{encoding:'utf8',timeout:25000,stdio:['ignore','pipe','pipe']});}catch{throw Error('Native test transport unavailable');}};
 const shell=command=>run(['shell',command]);
 function probe(){
  const focus=shell('dumpsys window | grep mCurrentFocus');
  if(!focus.includes('host.exp.exponent'))return {foreground:false};
  const xml=run(['shell','-tt','uiautomator dump /dev/tty']);
  const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(match=>Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(attribute=>[attribute[1],attribute[2]])));
  const text=nodes.map(node=>node.text+' '+node['content-desc']).join(' ');
  const flags={foreground:true,login:/\bEntrar\b/i.test(text),profile:/Meu perfil/i.test(text),expectedUid:xml.includes(account.uid),
   profileNameLoaded:nodes.some(node=>node['content-desc']==='Nome'&&node.class==='android.widget.EditText'&&!!node.text),
   existingProfileDateLoaded:nodes.some(node=>node['content-desc']?.startsWith('Membro desde')&&/\d{2}\/\d{2}\/\d{4}/.test(node.text)),
   expectedEmail:xml.includes(account.email),workspace:/Módulo financeiro temporariamente indisponível/.test(text),offline:/Sem conexão com o serviço/.test(text),incompatibleSdk:/incompatible with this version|not compatible with.*SDK|unsupported SDK/i.test(text),runtimeError:/Uncaught Error|Unable to resolve|TurboModuleRegistry|Something went wrong|Failed to load/i.test(text)};
  return {flags,nodes};
 }
 function tap(nodes,label){const node=nodes.find(node=>matchesLabel(node,label)&&node.clickable==='true')||nodes.find(node=>matchesLabel(node,label));if(!node?.bounds)throw Error('Expected native control not visible');const numbers=nodeBounds(node);shell(`input tap ${Math.floor((numbers[0]+numbers[2])/2)} ${Math.floor((numbers[1]+numbers[3])/2)}`);}
 return {model:devices[0].model,run,shell,probe,tap,open:()=>run(['shell','am','start','-a','android.intent.action.VIEW','-d','exp://127.0.0.1:8088/--/mobile/profile','-p','host.exp.exponent']),close:()=>run(['shell','am','force-stop','host.exp.exponent'])};
}
module.exports={deviceContext,matchesLabel,nodeBounds};
if(require.main===module){try{require('./firestore-recovery-run.cjs').protectedProcess(false);console.log(JSON.stringify(deviceContext().probe().flags||{foreground:false}));}catch{console.error('Native UI probe failed; no hierarchy or identifiers logged.');process.exitCode=1;}}
