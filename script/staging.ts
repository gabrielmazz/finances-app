import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFirebaseConfig, STAGING_APP_ID, STAGING_PROJECT_ID } from '../firebase/config';

const root = path.resolve(__dirname, '..');
const directory = path.join(os.homedir(), '.config', 'lumus-staging');
const output = path.join(os.homedir(), '.cache', 'lumus-staging', 'web');
const configFile = path.join(directory, 'firebase.json');

async function prepare() {
  const auth = require('firebase-tools/lib/auth');
  auth.setActiveAccount({ project: STAGING_PROJECT_ID }, auth.getGlobalDefaultAccount());
  const token = await require('firebase-tools/lib/apiv2').getAccessToken();
  const project = 'projects/' + STAGING_PROJECT_ID;
  const read = async (url: string) => {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error('HTTP ' + response.status + ' during environment verification');
    return response.json();
  };
  const [billing, database, config, release] = await Promise.all([
    read('https://cloudbilling.googleapis.com/v1/' + project + '/billingInfo'),
    read('https://firestore.googleapis.com/v1/' + project + '/databases/(default)'),
    read('https://firebase.googleapis.com/v1beta1/' + project + '/webApps/' + STAGING_APP_ID + '/config'),
    read('https://firebaserules.googleapis.com/v1/' + project + '/releases/cloud.firestore'),
  ]);
  assert(billing.billingEnabled === false && database.freeTier && database.databaseEdition === 'STANDARD');
  assert(config.projectId === STAGING_PROJECT_ID && config.appId === STAGING_APP_ID && config.apiKey);
  readFirebaseConfig({ mode: 'staging', apiKey: config.apiKey });
  assert(release.rulesetName.startsWith(project + '/rulesets/'));
  const active = await read('https://firebaserules.googleapis.com/v1/' + release.rulesetName);
  const local = fs.readFileSync(path.join(root, 'security/financial-canonical.rules'), 'utf8');
  assert.equal(active.source.files.length, 1, 'Unexpected Rules sources');
  assert.equal(active.source.files[0].content, local, 'Rules in staging differ from the local candidate');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assert.equal(fs.statSync(directory).mode & 0o077, 0, 'Staging directory must be private');
  fs.writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
  console.log(JSON.stringify({ projectId: STAGING_PROJECT_ID, edition: database.databaseEdition, billingEnabled: false,
    rules: createHash('sha256').update(local).digest('hex'), published: true }));
}

async function main() {
  const action = process.argv[2];
  if (action === 'prepare') return prepare();
  if (action === 'test') await prepare();
  if (action === 'serve-web') {
    require('./serve_web.cjs').createWebServer(output).listen(4175, '127.0.0.1',
      () => console.log('Web de homologação em http://127.0.0.1:4175/web'));
    return;
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert(config.projectId === STAGING_PROJECT_ID && config.appId === STAGING_APP_ID && config.apiKey, 'Run staging:prepare');
  readFirebaseConfig({ mode: 'staging', apiKey: config.apiKey });
  const env = { ...process.env, EXPO_NO_DOTENV: '1', EXPO_NO_CLIENT_ENV_VARS: '0', EXPO_PUBLIC_FIREBASE_MODE: 'staging',
    EXPO_PUBLIC_FIREBASE_API_KEY: config.apiKey, EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '', LUMUS_HOMOLOGATION: '' };
  const expo = path.join(root, 'node_modules/expo/bin/cli');
  const commands: Record<string, string[]> = {
    web: [expo, 'start', '--web', '--host', 'localhost', '--port', '8087'],
    'export-web': [expo, 'export', '--platform', 'web', '--output-dir', output],
    'prebuild-android': [expo, 'prebuild', '--platform', 'android', '--no-install'],
    test: ['--import', 'tsx', '--test', 'tests/staging/finance.ts'],
  };
  const android = path.join(root, 'android');
  if (action === 'build-android') {
    const gradle = fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8');
    assert(/applicationId\s+['"]com\.gabrielmazz\.lumusfinances\.hml['"]/.test(gradle), 'Android package is not staging');
  } else assert(commands[action], 'Invalid staging action');
  const child = action === 'build-android'
    ? spawn(path.join(android, 'gradlew'), [':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', ...process.argv.slice(3)], { cwd: android, env, stdio: 'inherit' })
    : spawn(process.execPath, commands[action], { cwd: root, env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => child.kill(signal));
  child.once('exit', code => { process.exitCode = code ?? 1; });
  child.once('error', () => { process.exitCode = 1; });
}

main().catch(() => { console.error('Homologação indisponível. Verifique a configuração local e as Rules publicadas no projeto isolado.'); process.exitCode = 1; });
