import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const backend = fileURLToPath(new URL('../', import.meta.url));
const environmentFile = new URL('../.env.local', import.meta.url);
let previous;
try { previous = await readFile(environmentFile, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: backend, stdio: 'inherit', shell: process.platform === 'win32' });
  const interrupt = () => child.kill('SIGINT');
  process.once('SIGINT', interrupt);
  child.once('error', error => { process.removeListener('SIGINT', interrupt); reject(error); });
  child.once('exit', code => {
    process.removeListener('SIGINT', interrupt);
    if (code === 0) resolve(); else reject(new Error(`Emulator verification exited with ${code}.`));
  });
});
try {
  await writeFile(environmentFile, (previous ?? '').replace(/^LUMUS_ENFORCE_APP_CHECK=.*\r?\n?/gm, '')
    + '\nLUMUS_ENFORCE_APP_CHECK=true\n');
  await run('npm', ['run', 'build']);
  await run('npm', ['run', 'test:app-check:transport']);
  await run('npx', ['-y', 'firebase-tools@15.33.0', 'emulators:exec', '--project', 'demo-lumus-financas',
    '--config', '../firebase.json', '--only', 'auth,functions,firestore', 'npm run test:app-check']);
} finally {
  if (previous === undefined) await unlink(environmentFile);
  else await writeFile(environmentFile, previous);
}
