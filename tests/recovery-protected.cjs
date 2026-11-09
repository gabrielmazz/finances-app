// Linux operator test: synthetic data only, real namespace/cgroup protections.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'lumus-protected-test-'));
fs.chmodSync(directory,0o700);
for(const name of ['data','keys','missing-java-guard'])fs.mkdirSync(path.join(directory,name),{mode:0o700});
const protectionDirectory = execFileSync(process.execPath,[path.join(repo,'script/build-operator-protection.cjs')],{encoding:'utf8'}).trim();
function run(suffix,guardDirectory) {
	const input={file:path.join(directory,'data',suffix+'.enc'),keyFile:path.join(directory,'keys',suffix+'.key'),target:'demo-lumus-protected-probe',emulatorJar:process.env.FIRESTORE_EMULATOR_JAR||path.join(os.homedir(),'.cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar')};
	const child = spawn('systemd-run',['--user','--wait','--pipe','--quiet','--setenv=LUMUS_OPERATOR_PROTECTION_DIR='+guardDirectory,'-p','MemorySwapMax=0','-p','LimitCORE=0','-p','RuntimeMaxSec=180','--','unshare','--user','--map-root-user','--net','--','/bin/sh','-c','ip link set lo up && exec "$@"','sh',process.execPath,path.join(repo,'script/firestore-recovery-run.cjs'),'self-test'],{stdio:['pipe','pipe','pipe']});
	return new Promise((resolve,reject)=>{
		let output='',errors='';child.stdin.end(JSON.stringify(input));
		child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{errors+=chunk;});
		child.on('error',reject);child.on('exit',code=>resolve({code,output,errors}));
	});
}
(async()=>{
	try {
		const positive=await run('valid',protectionDirectory);assert.equal(positive.code,0,positive.errors);
		const proof=JSON.parse(positive.output);
		assert(proof.equal && proof.privateNetwork && proof.swapDisabled && proof.coreDumpsDisabled && proof.javaCoreDumpsDisabled && proof.synthetic);
		assert.equal(proof.profilesInterpreted,2);assert.equal(proof.foreignProfilesDenied,2);assert.equal(proof.sourceCount,4);
		const missingGuard=path.join(directory,'missing-java-guard');
		fs.copyFileSync(path.join(protectionDirectory,'protection.node'),path.join(missingGuard,'protection.node'));
		const negative=await run('missing-guard',missingGuard);
		assert.notEqual(negative.code,0);assert.equal(negative.output,'');
		const artifact=path.join(repo,'artifacts/security-publication-20261109');fs.mkdirSync(artifact,{recursive:true});
		fs.writeFileSync(path.join(artifact,'protected-self-test.json'),JSON.stringify({...proof,missingJavaGuardFailsClosed:true},null,2)+'\n');
		console.log('Protected recovery passed; missing Java dump protection fails before restoration.');
	} finally {fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
