const { spawn } = require('node:child_process');
const path = require('node:path');
const mode = process.argv[2];
if (!['start', 'test', 'web', 'native', 'export'].includes(mode))
	throw Error('Use start, test, web, native or export');
const env = { ...process.env, EXPO_PUBLIC_FIREBASE_MODE: 'emulator' };
const cli = path.resolve('node_modules/firebase-tools/lib/bin/firebase.js');
const common = [
	'--project',
	'demo-lumus-foundation',
	'--config',
	'firebase.local.json',
	'--only',
	'auth,firestore',
];
let args;
if (mode === 'start') args = [cli, 'emulators:start', ...common];
if (mode === 'test')
	args = [cli, 'emulators:exec', ...common, 'node --require ./script/integration-network.cjs --import tsx --test --test-concurrency=1 tests/integration/*.integration.ts'];
if (mode === 'web' || mode === 'native')
	args = [
		path.resolve('node_modules/expo/bin/cli'),
		'start',
		...(mode === 'web' ? ['--web'] : ['--go']),
		...process.argv.slice(3),
	];
if (mode === 'export') args = [path.resolve('node_modules/expo/bin/cli'), 'export', '--platform', 'web'];
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
	console.error(error.message);
	process.exitCode = 1;
});
child.on('exit', (code) => {
	process.exitCode = code ?? 1;
});
