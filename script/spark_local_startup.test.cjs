const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, 'spark_dev_client.js'), 'utf8');
function run(mode, seedStatus = 0, host = undefined) {
  const calls = [];
  const proc = { argv: ['node', 'client', mode], env: host ? { SPARK_DEV_CLIENT_HOST: host } : {}, execPath: 'node', exit: code => { throw Object.assign(new Error('exit'), { code }); } };
  const requireFake = name => {
    if (name === 'node:child_process') return {
      spawnSync: (command, args, options) => { calls.push({ type: 'seed', command, args, options }); return { status: seedStatus }; },
      spawn: (command, args, options) => { calls.push({ type: 'expo', command, args, options }); return { on() {} }; },
    };
    if (name === 'node:path') return path;
    throw new Error(`unexpected module ${name}`);
  };
  requireFake.resolve = () => '/test/expo/cli';
  try { vm.runInNewContext(script, { require: requireFake, process: proc, __dirname: path.resolve(__dirname), console }); }
  catch (error) { return { calls, error }; }
  return { calls };
}
for (const [mode, flag] of [['web','--web'], ['mobile','--go'], ['android','--android'], ['client','--dev-client']]) {
  test(`${mode} prepara o mesmo grupo e aponta o aplicativo aos emuladores`, () => {
    const { calls, error } = run(mode); assert.equal(error, undefined);
    assert.equal(calls.length, 2); assert.equal(calls[0].type, 'seed');
    assert.equal(calls[0].args.at(-1), 'scripts/sparkDemoSeed.ts');
    assert.equal(calls[0].options.env.FIREBASE_PROJECT_ID, 'demo-lumus-financas');
    assert.equal(calls[1].type, 'expo'); assert.ok(calls[1].args.includes(flag));
    assert.equal(calls[1].options.env.EXPO_PUBLIC_FIREBASE_TARGET, 'emulator');
    assert.equal(calls[1].options.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST, '127.0.0.1');
    assert.equal(calls[1].options.env.EXPO_NO_DOTENV, '1');
  });
}
test('recusa iniciar Expo quando a preparação da conta falha', () => {
  const { calls, error } = run('web', 1); assert.equal(error.code, 1); assert.equal(calls.length, 1);
});
test('recusa host externo para o cliente', () => {
  const { calls, error } = run('web', 0, 'example.com'); assert.match(error.message, /local\/privado/); assert.equal(calls.length, 1);
});


test('atalhos usuais usam o supervisor Spark e não executam o seed legado', () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')).scripts;
  assert.equal(scripts.start, 'node script/spark_dev.js mobile');
  assert.equal(scripts.web, 'node script/spark_dev.js web');
  assert.equal(scripts['dev:local'], scripts.start);
  assert.equal(scripts['dev:local:web'], scripts.web);
  const launcher = fs.readFileSync(path.join(__dirname, 'build_and_run.sh'), 'utf8');
  assert.match(launcher, /start\|run\) exec node script\/spark_dev\.js mobile/);
  assert.match(launcher, /--web\|web\) exec node script\/spark_dev\.js web/);
  assert.doesNotMatch(launcher, /npm --prefix backend run seed/);
});
