// [[Guia de Testes Locais]]: emuladores próprios e efêmeros, sem Functions ou publicação.
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { resolve } = require('node:path');

const mode = process.argv[2];
if (!['web', 'mobile', 'check'].includes(mode)) throw new Error('Modo esperado: web, mobile ou check.');
if (process.platform === 'win32') throw new Error('Execute este comando no terminal Ubuntu/WSL em /programacao/finances-app. Veja Arquitetura/Guia de Testes Locais.md.');
const root = resolve(__dirname, '..');

async function requireFreePort(port) {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`A porta ${port} está ocupada. Encerre o ambiente anterior antes de iniciar o Spark local.`)));
    server.listen(port, '0.0.0.0', () => server.close(resolvePort));
  });
}

async function main() {
  for (const port of [4000, 4400, 4500, 5001, 8080, 9099, ...(mode === 'check' ? [] : [8082])]) await requireFreePort(port);
  // O executor encerra os emuladores quando o aplicativo/teste termina, inclusive em caso de erro.
  const child = spawn('npx', [
    '-y', 'firebase-tools@15.34.0', 'emulators:exec', '--project', 'demo-lumus-financas',
    '--config', 'firebase.spark.local.json', '--only', 'auth,firestore',
    `node script/spark_dev_client.js ${mode}`,
  ], { cwd: root, stdio: 'inherit', env: { ...process.env, FIREBASE_PROJECT_ID: 'demo-lumus-financas' } });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
