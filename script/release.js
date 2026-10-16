#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline/promises');

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
	const [major, minor] = process.versions.node.split('.').map(Number);
	if (major < 22 || (major === 22 && minor < 13)) fail('O release exige Node.js >=22.13.0.');
	const backendNode = require(path.join(root, 'backend/package.json')).engines.node;
	const runtime = require(path.join(root, 'firebase.json')).functions[0].runtime;
	if (backendNode !== '22' || runtime !== 'nodejs22') fail('Alinhe backend/package.json e firebase.json ao runtime Node.js 22.');
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

const exportBundle = (platform, env) => {
	const output = platform === 'android'
		? fs.mkdtempSync(path.join(os.tmpdir(), 'lumus-android-export-')) : path.join(root, 'dist');
	try {
		run(path.join(root, 'node_modules/.bin/expo'), ['export', '--platform', platform, '--output-dir', output], env);
		const artifact = platform === 'android' ? 'metadata.json' : 'index.html';
		if (!fs.existsSync(path.join(output, artifact))) fail(`Exportação ${platform} sem ${artifact}.`);
	} finally {
		if (platform === 'android') fs.rmSync(output, { recursive: true, force: true });
	}
};

const verify = (env, { offline = false, backendOnly = false, diagnostic = false } = {}) => {
	const results = [];
	const stage = (name, task) => {
		console.log(`\n[Release] ${name}`);
		try {
			task();
			results.push({ etapa: name, resultado: 'PASSOU' });
		} catch (error) {
			console.error(`[Release] FALHOU: ${name}.`);
			if (!diagnostic) throw error;
			results.push({ etapa: name, resultado: 'FALHOU' });
			console.error(error instanceof Error ? error.message : error);
		}
	};
	// Firebase isolado valida o projeto backend/ publicado, conforme [[Processo de Release]].
	if (backendOnly) {
		console.log('Verificações Firebase: lockfile, audit do backend, compilação, integração e App Check.');
	}
	if (!backendOnly) {
		stage('Consistência do lockfile do aplicativo', () => run('npm', ['ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error']));
	}
	stage('Consistência do lockfile do backend', () => run('npm', ['--prefix', 'backend', 'ci', '--dry-run', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error']));
	if (!backendOnly) {
		stage('Auditoria de dependências do aplicativo', () => run('npm', ['audit', '--audit-level=high']));
	}
	stage('Auditoria de dependências do backend', () => run('npm', ['--prefix', 'backend', 'audit', '--audit-level=high']));
	if (!backendOnly) stage('Estilos, tipos e testes do aplicativo', () => run('npm', ['run', 'check']));
	stage('Compilação do backend', () => run('npm', ['--prefix', 'backend', 'run', 'build']));
	if (!offline) {
		stage('Integração nos emuladores', () => run('npm', ['run', 'test:integration']));
		stage('App Check nos emuladores', () => run('npm', ['--prefix', 'backend', 'run', 'test:app-check:emulator']));
	}
	if (!backendOnly) {
		stage('Exportação Android', () => exportBundle('android', env));
		stage('Exportação Web', () => exportBundle('web', env));
	}
	if (diagnostic) {
		console.table(results);
		console.log('Diagnóstico local: não verifica cobrança Blaze, credenciais EAS nem funcionamento em aparelho.');
		const failures = results.filter(result => result.resultado === 'FALHOU');
		if (failures.length) fail(`Diagnóstico: ${failures.length} etapa(s) com falha. Nenhuma publicação executada.`);
	}
};

const deployBackend = (projectId, env) => {
	run('npx', ['-y', 'firebase-tools@15.33.0', 'deploy', '--project', projectId, '--only', 'functions,firestore'], env);
};

const deployWeb = (profile, projectId, env) => {
	const firebaseCli = ['-y', 'firebase-tools@15.33.0'];
	if (profile === 'preview') {
		run('npx', [...firebaseCli, 'hosting:channel:deploy', 'preview', '--project', projectId, '--expires', '7d'], env);
	} else {
		run('npx', [...firebaseCli, 'deploy', '--project', projectId, '--only', 'hosting'], env);
	}
};

const buildAndroid = (buildProfile, env) => {
	run('eas', ['build', '--platform', 'android', '--profile', buildProfile], env);
};

const RELEASE_TARGETS = ['firebase', 'web', 'apk', 'aab'];
const RELEASE_TARGET_ALIASES = new Map([
	['1', 'firebase'], ['backend', 'firebase'],
	['2', 'web'], ['hosting', 'web'],
	['3', 'apk'],
	['4', 'aab'],
]);

const parseReleaseTargets = input => {
	const selections = input.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
	if (selections.length === 0 || (selections.length === 1 && selections[0] === '0')) return [];
	if (selections.length === 1 && ['5', 'all', 'tudo'].includes(selections[0])) return RELEASE_TARGETS;
	if (selections.includes('0') || selections.some(value => ['5', 'all', 'tudo'].includes(value))) {
		fail('Use “tudo” sozinho ou escolha etapas individuais.');
	}
	const targets = selections.map(selection => RELEASE_TARGET_ALIASES.get(selection) ?? selection);
	const invalidTargets = targets.filter(target => !RELEASE_TARGETS.includes(target));
	if (invalidTargets.length > 0) {
		fail(`Etapa inválida: ${invalidTargets.join(', ')}. Use firebase, web, apk, aab ou tudo.`);
	}
	return RELEASE_TARGETS.filter(target => targets.includes(target));
};

const chooseReleaseTargets = async () => {
	const directSelection = process.argv.slice(4).join(' ');
	if (directSelection) return parseReleaseTargets(directSelection);
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		fail('Informe as etapas sem interação: npm run release:production -- firebase,web,apk,aab.');
	}

	console.log('\nRelease de produção — selecione uma ou mais etapas:');
	console.log('  1. Firebase (Functions, Rules e índices)');
	console.log('  2. Web (Firebase Hosting)');
	console.log('  3. Android APK (build interno para inspeção)');
	console.log('  4. Android AAB (build para Play Store)');
	console.log('  5. Tudo');
	console.log('  0. Cancelar');
	const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		return parseReleaseTargets(await prompt.question('Escolha pelo número ou nome, separados por vírgula: '));
	} finally {
		prompt.close();
	}
};

const executeRelease = (env, projectId, targets) => {
	if (targets.length === 0) {
		console.log('Release cancelado.');
		return;
	}
	requireCleanTree();
	console.log(`Etapas selecionadas: ${targets.join(', ')}.`);
	verify(env, { backendOnly: targets.length === 1 && targets[0] === 'firebase' });
	// Executa somente as etapas escolhidas, na ordem definida em [[Processo de Release]].
	if (targets.includes('firebase')) deployBackend(projectId, env);
	if (targets.includes('web')) deployWeb(profile, projectId, env);
	if (targets.includes('apk')) buildAndroid('production-apk', env);
	if (targets.includes('aab')) buildAndroid('production', env);
};

const main = () => {
	const { env, projectId } = preflight();
	if (action === 'preflight') return;
	if (!['verify', 'verify-offline', 'diagnose', 'deploy-backend', 'deploy-web', 'build-android', 'release'].includes(action)) fail('Ação inválida: preflight, verify, verify-offline, diagnose, deploy-backend, deploy-web, build-android ou release.');
	if (action === 'release') {
		if (profile !== 'production') fail('O seletor de release está disponível somente para production.');
		return chooseReleaseTargets().then(targets => executeRelease(env, projectId, targets));
	}
	const buildProfile = process.argv[4] ?? profile;
	if (action === 'build-android' && buildProfile !== profile && !(profile === 'production' && buildProfile === 'production-apk')) {
		fail('Perfil EAS Android incompatível com o ambiente validado.');
	}
	if (['deploy-backend', 'deploy-web', 'build-android'].includes(action)) requireCleanTree();
	verify(env, { offline: action === 'verify-offline', backendOnly: action === 'deploy-backend', diagnostic: action === 'diagnose' });
	if (action === 'deploy-backend') {
		deployBackend(projectId, env);
	}
	if (action === 'deploy-web') {
		deployWeb(profile, projectId, env);
	}
	if (action === 'build-android') {
		buildAndroid(buildProfile, env);
	}
};

const reportError = error => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
};

try {
	const pending = main();
	if (pending && typeof pending.catch === 'function') pending.catch(reportError);
} catch (error) {
	reportError(error);
}
