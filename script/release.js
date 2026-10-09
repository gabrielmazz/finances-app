#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const action = process.argv[2] ?? 'verify';
const profile = process.argv[3] ?? 'production';
const app = require(path.join(root, 'app.json')).expo;
const pkg = require(path.join(root, 'package.json'));
const lock = require(path.join(root, 'package-lock.json'));
const eas = require(path.join(root, 'eas.json'));
const firebase = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
const build = eas.build[profile];

const fail = message => { throw new Error(message); };
const run = (command, args, env = process.env) => {
	const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) fail(`${command} ${args.join(' ')} falhou (${result.status}).`);
};

const requireCleanTree = () => {
	const result = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
	if (result.status !== 0 || result.stdout.trim()) {
		fail('Publique somente a partir de uma árvore Git limpa e revisada.');
	}
};

const releaseEnvironment = () => ({
	...process.env,
	...build.env,
	EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN: '',
});

const preflight = () => {
	if (!['production', 'preview'].includes(profile) || !build) fail('Use o perfil production ou preview.');
	const version = app.version;
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ||
		pkg.version !== version || lock.version !== version || lock.packages?.['']?.version !== version) {
		fail('app.json, package.json e package-lock.json precisam ter a mesma versão SemVer.');
	}
	for (const file of ['screens/mobile/LoginScreen.tsx', 'screens/web/LoginScreen.web.tsx']) {
		if (!fs.readFileSync(path.join(root, file), 'utf8').includes(`Versão ${version}</Text>`)) {
			fail(`${file} não exibe a versão ${version}.`);
		}
	}
	const env = releaseEnvironment();
	const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
	const required = ['EXPO_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
		'EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
		'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID',
		'EXPO_PUBLIC_FIREBASE_APP_CHECK_RECAPTCHA_ENTERPRISE_KEY'];
	for (const name of required) if (!env[name]) fail(`Falta ${name} no ambiente ${profile}.`);
	if (profile === 'production' && (projectId !== firebase.projects.production || env.EXPO_PUBLIC_FIREBASE_TARGET !== 'production')) {
		fail('O perfil production deve usar exclusivamente o projeto Firebase de produção.');
	}
	if (profile === 'preview' &&
		(!projectId || projectId === firebase.projects.production || projectId === firebase.projects.emulator || env.EXPO_PUBLIC_FIREBASE_TARGET !== 'preview')) {
		fail('O perfil preview exige um projeto Firebase separado de produção e Emulator.');
	}
	if (env.EXPO_PUBLIC_FIREBASE_APP_CHECK_ANDROID_PROVIDER !== (profile === 'preview' ? 'debug' : 'playIntegrity')) {
		fail('O provider Android App Check não corresponde ao perfil de release.');
	}
	if (app.android.package !== 'com.gabrielmazz.lumusfinances') fail('Pacote Android inesperado.');
	if (eas.cli.appVersionSource !== 'remote' || build.autoIncrement !== (profile === 'production')) {
		fail('A configuração de versionCode remoto do EAS não corresponde ao perfil.');
	}
	console.log(`Preflight ${profile}: versão ${version}, Firebase ${projectId}, pacote ${app.android.package}.`);
	return { env, projectId };
};

const exportBundles = env => {
	const androidOutput = fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-android-export-'));
	try {
		run(path.join(root, 'node_modules/.bin/expo'), ['export', '--platform', 'android', '--output-dir', androidOutput], env);
		if (!fs.existsSync(path.join(androidOutput, 'metadata.json'))) fail('Exportação Android sem metadata.json.');
	} finally {
		fs.rmSync(androidOutput, { recursive: true, force: true });
	}
	run(path.join(root, 'node_modules/.bin/expo'), ['export', '--platform', 'web', '--output-dir', 'dist'], env);
	if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) fail('Exportação Web sem index.html.');
};

try {
	const { env, projectId } = preflight();
	if (action === 'preflight') process.exit(0);
	if (!['verify', 'verify-offline', 'deploy-backend', 'deploy-web', 'build-android'].includes(action)) fail('Ação inválida: preflight, verify, verify-offline, deploy-backend, deploy-web ou build-android.');
	if (['deploy-backend', 'deploy-web', 'build-android'].includes(action)) requireCleanTree();
	run('npm', ['run', 'check']);
	run('npm', ['--prefix', 'backend', 'run', 'build']);
	if (action !== 'verify-offline') run('npm', ['run', 'test:integration']);
	exportBundles(env);
	if (action === 'deploy-backend') {
		run('npx', ['-y', 'firebase-tools@15.33.0', 'deploy', '--project', projectId, '--only', 'functions,firestore'], env);
	}
	if (action === 'deploy-web') {
		const firebaseCli = ['-y', 'firebase-tools@15.33.0'];
		if (profile === 'preview') {
			run('npx', [...firebaseCli, 'hosting:channel:deploy', 'preview', '--project', projectId, '--expires', '7d'], env);
		} else {
			run('npx', [...firebaseCli, 'deploy', '--project', projectId, '--only', 'hosting'], env);
		}
	}
	if (action === 'build-android') {
		const buildProfile = process.argv[4] ?? profile;
		if (buildProfile !== profile && !(profile === 'production' && buildProfile === 'production-apk')) {
			fail('Perfil EAS Android incompatível com o ambiente validado.');
		}
		run('eas', ['build', '--platform', 'android', '--profile', buildProfile], env);
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
