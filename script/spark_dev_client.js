const { spawnSync, spawn } = require('node:child_process');
const { resolve } = require('node:path');
const mode = process.argv[2];
if (!['web', 'mobile', 'check'].includes(mode)) throw new Error('Modo inválido.');
const root = resolve(__dirname, '..');
const env = { ...process.env, FIREBASE_PROJECT_ID: 'demo-lumus-financas', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
const seed = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/sparkDemoSeed.ts'], { cwd: resolve(root, 'backend'), env, stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);
if (mode === 'check') {
  const check = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/sparkDemo.emulator.test.ts'], { cwd: resolve(root, 'backend'), env, stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 1);
  const pairs = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/sparkPairForms.emulator.test.ts'], { cwd: resolve(root, 'backend'), env, stdio: 'inherit' });
  if (pairs.status !== 0) process.exit(pairs.status ?? 1);
  const balances = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'tests/sparkBalanceForms.emulator.test.ts'], { cwd: resolve(root, 'backend'), env, stdio: 'inherit' });
  if (balances.status !== 0) process.exit(balances.status ?? 1);
  const financialForms = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/sparkRecurringForms.emulator.test.ts', 'tests/sparkInvestmentForms.emulator.test.ts'], { cwd: resolve(root, 'backend'), env, stdio: 'inherit' });
  if (financialForms.status !== 0) process.exit(financialForms.status ?? 1);
  const readers = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--runInBand', '--runTestsByPath', 'tests/sparkDemoHome.emulator.test.ts'],
    { cwd: root, env: { ...env, RUN_SPARK_DEMO: '1' }, stdio: 'inherit' });
  process.exit(readers.status ?? 1);
}
const clientHost = process.env.SPARK_DEV_CLIENT_HOST || '127.0.0.1';
if (!/^(127\.0\.0\.1|10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(clientHost)
  || clientHost.split('.').some(part => Number(part) > 255)) throw new Error('SPARK_DEV_CLIENT_HOST deve ser um endereço local/privado.');
const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', ...(mode === 'web' ? ['--web'] : ['--go']),
  '--host', mode === 'web' ? 'localhost' : 'lan', '--port', '8082', '--max-workers', '2'], { cwd: root, stdio: 'inherit',
  env: { ...env, EXPO_PUBLIC_APP_ENV: 'development', EXPO_PUBLIC_FIREBASE_TARGET: 'emulator',
    EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: clientHost, EXPO_NO_DOTENV: '1', BROWSER: 'none' } });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
