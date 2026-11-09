// Only the owner's connected test device. Serial/transport identifiers stay private.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const privateFile=path.join(os.homedir(),'.config/lumus-homologation/devices.json');
try {
const config=JSON.parse(fs.readFileSync(privateFile,'utf8'));
function adb(args){try{return execFileSync(config.adb,[...(config.port?['-P',String(config.port)]:[]),...args],{encoding:'utf8',timeout:20000,windowsHide:true,stdio:['ignore','pipe','pipe']});}catch{throw Error('ADB transport/permission failure');}}
const devices=adb(['devices','-l']).split(/\r?\n/).filter(line=>/\s(device|unauthorized|offline)\b/.test(line)).map(line=>{const tokens=line.trim().split(/\s+/);return {serial:tokens[0],state:tokens[1],model:tokens.find(token=>token.startsWith('model:'))?.slice(6)};});
for(const device of devices)if(device.state==='device'){
 const emulator=adb(['-s',device.serial,'shell','getprop','ro.kernel.qemu']).trim()==='1';device.physical=!emulator&&!device.serial.startsWith('emulator-');
 if(device.physical)device.expoGoInstalled=adb(['-s',device.serial,'shell','pm','path','host.exp.exponent']).includes('package:');
}
fs.writeFileSync(privateFile,JSON.stringify({...config,devices},null,2)+'\n',{mode:0o600});
const report={checkedAt:new Date().toISOString(),adbAvailable:true,deviceCount:devices.length,devices:devices.map(({state,model,physical,expoGoInstalled})=>({state,model,physical,expoGoInstalled})),physicalHomologationPerformed:false};
if(process.argv[2]==='open'){
 const physical=devices.filter(device=>device.physical&&device.state==='device');if(physical.length!==1||!physical[0].expoGoInstalled)throw Error('One authorized physical device with Expo Go is required');
 adb(['-s',physical[0].serial,'reverse','tcp:8088','tcp:8088']);
 adb(['-s',physical[0].serial,'shell','am','start','-a','android.intent.action.VIEW','-d','exp://127.0.0.1:8088/--/mobile/profile','-p','host.exp.exponent']);report.launchRequested=true;
}
fs.writeFileSync('artifacts/stage03-final/device-readiness.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

}catch{console.error('Device readiness check failed; device/transport identifiers were not logged.');process.exitCode=1;}
