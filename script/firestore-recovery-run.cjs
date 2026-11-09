// Operator-only orchestration. Run in a systemd user service with swap/core dumps
// disabled; restore additionally requires a private network namespace (loopback only).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const { exportSnapshot, restoreToEmulator, compareSnapshots } = require('./firestore-snapshot.cjs');
const { writeEncryptedBackup, readEncryptedBackup } = require('./snapshot-encryption.cjs');

function protectedProcess(isRestore) {
	const protectionDirectory = process.env.LUMUS_OPERATOR_PROTECTION_DIR;
	assert(protectionDirectory && path.isAbsolute(protectionDirectory), 'Build the native operator dump guard first');
	assert(require(path.join(protectionDirectory,'protection.node')).isProtected(), 'Kernel core dumps must be disabled');
	const group = fs.readFileSync('/proc/self/cgroup', 'utf8').trim().split('::')[1];
	assert.equal(fs.readFileSync('/sys/fs/cgroup' + group + '/memory.swap.max', 'utf8').trim(), '0', 'Swap must be disabled for this process group');
	assert.match(fs.readFileSync('/proc/self/limits', 'utf8'), /Max core file size\s+0\s+0/);
	if (isRestore) {
		const interfaces = fs.readFileSync('/proc/self/net/dev','utf8').trim().split('\n').slice(2).map(line=>line.split(':')[0].trim());
		assert.deepEqual(interfaces, ['lo'], 'Restore needs a loopback-only network namespace');
		assert.equal(fs.statfsSync('/dev/shm').type,0x01021994,'Private scratch must be tmpfs');
		const initialFetch = globalThis.fetch;
		globalThis.fetch = (input, options) => {
			const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
			if (url.origin !== 'http://127.0.0.1:8089') throw Error('Only the isolated emulator may be contacted');
			return initialFetch(input, options);
		};
	}
}
function privateDirectory(directory) {
	const resolved = fs.realpathSync(directory);
	assert(!resolved.startsWith(repo + path.sep) && resolved !== repo);
	assert.equal(fs.statSync(resolved).mode & 0o077, 0, 'Private directory required');
	return resolved;
}
function rootCounts(snapshot) {
	const result = {};
	for (const document of snapshot.documents) if (document.path.split('/').length === 2) result[document.path.split('/')[0]] = (result[document.path.split('/')[0]] || 0) + 1;
	return result;
}
async function recover(snapshot, input) {
	const target = input.target;
	assert(/^demo-lumus-[a-z0-9-]+$/.test(target));
	const scratch = fs.mkdtempSync('/dev/shm/lumus-private-recovery-');
	const emulator = spawn('/usr/bin/java', ['-XX:-CreateCoredumpOnCrash','-Djava.io.tmpdir=' + scratch, '-jar', input.emulatorJar, '--host', '127.0.0.1', '--port', '8089', '--project_id', target, '--rules', path.join(repo, 'firestore.rules')], {cwd:scratch, stdio:['ignore','ignore','ignore','pipe'], env:{PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,LD_PRELOAD:path.join(process.env.LUMUS_OPERATOR_PROTECTION_DIR,'no-core.so')}});
	const closed = new Promise(resolve => emulator.once('exit', resolve));
	let environment;
	try {
		// The loader can ignore a missing preload library; require an acknowledgement
		// from its constructor before any real document enters the Java process.
		await new Promise((resolve,reject)=>{
			const timer=setTimeout(()=>reject(Error('Java dump guard not confirmed')),5000);
			emulator.stdio[3].once('data',data=>{clearTimeout(timer);if(data.length===1&&data[0]===68)resolve();else reject(Error('Invalid Java dump guard confirmation'));});
			emulator.once('error',()=>{clearTimeout(timer);reject(Error('Java launch failed'));});
		});
		let ready = false;
		for (let attempt = 0; attempt < 200; attempt++) {
			if (emulator.exitCode !== null) throw Error('Isolated emulator failed to start');
			try { await fetch('http://127.0.0.1:8089/', {signal:AbortSignal.timeout(500)}); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve,100)); }
		}
		assert(ready, 'Isolated emulator did not become ready');
		await restoreToEmulator(snapshot, target, {remapInternalReferences:true});
		const restored = await exportSnapshot({projectId:target,local:true,maxDocuments:1500,maxRequests:3000,maxBytes:33554432});
		const comparison = compareSnapshots(snapshot, restored, {remappedReferences:true});
		assert(comparison.equal, 'Restored documents differ');
		// Only domain parsing/Rules reads, never log financial documents or identities.
		require('tsx/cjs/api').register();
		const {parseProfile} = require(path.join(repo, 'domain/profile.ts'));
		const {initializeTestEnvironment} = require('@firebase/rules-unit-testing');
		const {setLogLevel} = require('firebase/firestore'); setLogLevel('silent');
		environment = await initializeTestEnvironment({projectId:target,firestore:{host:'127.0.0.1',port:8089,rules:fs.readFileSync(path.join(repo,'firestore.rules'),'utf8')}});
		const profiles = snapshot.documents.filter(document => /^users\/[^/]+$/.test(document.path));
		let interpreted = 0, foreignDenied = 0;
		for (const profile of profiles) {
			const uid = profile.path.split('/')[1];
			const db = environment.authenticatedContext(uid).firestore();
			const document = await db.doc(profile.path).get();
			const parsed = parseProfile(uid,document.data(),null);
			assert.equal(parsed.uid,uid); assert.equal(parsed.adminUser,false);
			assert.equal(parsed.name,document.data().name || ''); interpreted++;
			const banks = await db.collection('banks').where('personId','==',uid).limit(20).get();
			assert(banks.docs.every(bank => bank.data().personId === uid));
			const foreign = profiles.find(other => other.path !== profile.path);
			if (foreign) { await assert.rejects(db.doc(foreign.path).get(), error => error.code === 'permission-denied'); foreignDenied++; }
		}
		return {...comparison,javaCoreDumpsDisabled:true,profilesInterpreted:interpreted,foreignProfilesDenied:foreignDenied,ownBankQueriesPassed:true,uidPathsPreserved:true,internalReferencesRemapped:true};
	} finally {
		await environment?.cleanup(); emulator.kill('SIGTERM'); await closed;
		fs.rmSync(scratch,{recursive:true,force:true});
	}
}

module.exports = {protectedProcess, privateDirectory, rootCounts};
if (require.main === module) (async () => {
	process.umask(0o077);
	const action = process.argv[2];
	assert(['export','restore','self-test'].includes(action));
	protectedProcess(action !== 'export');
	const input = JSON.parse(fs.readFileSync(0,'utf8'));
	const dataDirectory=privateDirectory(path.dirname(input.file));
	const keyDirectory=privateDirectory(path.dirname(input.keyFile));
	assert.notEqual(dataDirectory,keyDirectory,'Store keys separately');
	let snapshot;
	if (action === 'export') {
		assert.equal(input.projectId,'finances-app-e8685');
		assert(input.token);
		assert(!fs.existsSync(input.file) && !fs.existsSync(input.keyFile));
		fs.writeFileSync(input.keyFile,randomBytes(32),{flag:'wx',mode:0o600});
		snapshot = await exportSnapshot({projectId:input.projectId,token:input.token,maxDocuments:1500,maxRequests:3000,maxBytes:33554432,delayMs:25});
		assert.deepEqual(rootCounts(snapshot),input.expectedRootCounts,'Inventory changed during traversal');
		writeEncryptedBackup(input.file,snapshot,input.keyFile);
		const verified = readEncryptedBackup(input.file,input.keyFile);
		assert.equal(verified.sha256,snapshot.sha256);
		console.log(JSON.stringify({complete:true,documentCount:snapshot.documentCount,scannedDocuments:snapshot.scannedDocuments,serializedDocumentBytes:snapshot.serializedDocumentBytes,sha256:snapshot.sha256,startedAt:snapshot.startedAt,exportedAt:snapshot.exportedAt,pointInTime:false,encrypted:true,swapDisabled:true,coreDumpsDisabled:true,productionWrites:0}));
	} else {
		if (action === 'self-test') {
			const documents = [{path:'users/other',fields:{name:{stringValue:'Outra pessoa sintética'}}},{path:'users/synthetic',fields:{name:{stringValue:'Pessoa sintética'},adminUser:{booleanValue:true},createdAt:{timestampValue:'2020-01-01T00:00:00Z'}}},{path:'banks/synthetic',fields:{personId:{stringValue:'synthetic'},name:{stringValue:'Banco sintético'}}},{path:'parents/missing/children/orphan',fields:{value:{integerValue:'12345'}}}];
			snapshot={version:1,projectId:'demo-lumus-protected-source',documents,sha256:require('node:crypto').createHash('sha256').update(JSON.stringify(documents)).digest('hex')};
			fs.writeFileSync(input.keyFile,randomBytes(32),{flag:'wx',mode:0o600});writeEncryptedBackup(input.file,snapshot,input.keyFile);
		}
		snapshot = readEncryptedBackup(input.file,input.keyFile);
		const report = await recover(snapshot,input);
		console.log(JSON.stringify({...report,sourceSHA256:snapshot.sha256,encrypted:true,pointInTime:false,privateNetwork:true,swapDisabled:true,coreDumpsDisabled:true,productionWrites:0,authAccountsIncluded:false,synthetic:action==='self-test'}));
	}
})().catch(() => { console.error('Protected recovery failed; no production writes were performed. Inspect only private operator state.'); process.exitCode=1; });
