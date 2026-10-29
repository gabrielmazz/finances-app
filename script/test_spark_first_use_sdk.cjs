// The parent Firebase CLI starts an isolated Firestore emulator; Auth is mocked.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^127\.0\.0\.1:[1-9]\d{0,4}$/.test(host) || Number(host.split(':')[1]) > 65535) {
  throw new Error('O teste exige FIRESTORE_EMULATOR_HOST no loopback.');
}
const root = resolve(__dirname, '..');
const child = spawnSync(process.execPath, [require.resolve('jest/bin/jest'), '--config', resolve(__dirname, 'jest.spark-first-use.config.cjs'),
  '--runInBand', '--watchman=false', '--runTestsByPath', resolve(root, 'tests/sparkFirstUseRulesIntegration.test.ts')],
{ cwd: root, stdio: 'inherit', env: { ...process.env, RUN_SPARK_FIRST_USE_RULES: '1' } });
if (child.error) { console.error(child.error.message); process.exitCode = 1; }
else process.exitCode = child.status ?? 1;
