import { closeSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical, inventorySnapshot, LocalFirestore, LocalSnapshotError, MAX_SNAPSHOT_BYTES, validateSnapshot } from './lib/sparkLocalSnapshot';
import { parseSparkInstant, prepareSparkBootstrap } from './lib/sparkBootstrapPreflight';
import { buildSparkLedgerImport, importSparkLedgerLocal } from './lib/sparkLedgerImport';
import { normalizeSparkLegacy } from './lib/sparkLegacyNormalization';
import { inspectSparkAccount } from './lib/sparkAccountPreflight';
import { buildLegacyLedgerCandidate } from './lib/sparkLegacyLedgerCandidate';
import { previewLegacySpark } from './lib/sparkLegacySparkPreview';

function diagnostic(error: unknown) {
  if (error instanceof LocalSnapshotError) return error.message;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'EEXIST') return 'Arquivo de saída já existe; escolha outro caminho. Nenhum arquivo será sobrescrito.';
  if (code === 'ENOENT') return 'Arquivo de entrada ou pasta de saída não existe.';
  if (code === 'EACCES' || code === 'EPERM') return 'Sem permissão para ler ou gravar o arquivo local.';
  if (error instanceof SyntaxError) return 'Arquivo ou resposta local contém JSON inválido.';
  return 'Falha de transporte ou execução local; confira os hosts explícitos e o estado do Emulator Hub.';
}

// Arquivos privados e exclusivos; não recebe credenciais, URL remota ou comando de shell.
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const accepted: Record<string, string[]> = {
    capture: ['--project', '--host', '--hub', '--output'], inventory: ['--input', '--output'],
    'inspect-account': ['--input', '--uid', '--output'],
    restore: ['--project', '--host', '--hub', '--input', '--output'], prepare: ['--input', '--group', '--as-of', '--output'],
    'normalize-legacy': ['--input', '--scope', '--output'], 'candidate-legacy-ledger': ['--input', '--scope', '--output'], 'preview-legacy-spark': ['--input', '--scope', '--output'], 'plan-ledger': ['--input', '--group', '--as-of', '--output'],
    'import-ledger': ['--input', '--group', '--as-of', '--project', '--host', '--hub', '--plan-sha256', '--output'],
  };
  if (!Object.hasOwn(accepted, command) || args.length % 2) throw new LocalSnapshotError('Informe uma operação spark:snapshot e suas opções documentadas.');
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    if (!accepted[command].includes(args[index]) || options.has(args[index]) || !args[index + 1] || args[index + 1].startsWith('--')) throw new LocalSnapshotError('Opção inválida ou repetida.');
    options.set(args[index], args[index + 1]);
  }
  if (options.size !== accepted[command].length) throw new LocalSnapshotError('Informe todas as opções documentadas para a operação.');
  const option = (name: string) => options.get(name)!;
  const base = process.env.INIT_CWD || process.cwd();
  const output = resolve(base, option('--output'));
  // Antes de qualquer acesso ao Emulator, reserva a saída para não escrever e depois falhar por colisão.
  const outputDescriptor = openSync(output, 'wx', 0o600);
  try {
    let result: unknown;
    if (command === 'capture') {
      const client = new LocalFirestore(option('--project'), option('--host'), option('--hub'));
      result = await client.capture({ rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), indexes: readFileSync(resolve(__dirname, '../../firestore.indexes.json'), 'utf8') });
    } else {
      const input = resolve(base, option('--input'));
      if (statSync(input).size > MAX_SNAPSHOT_BYTES) throw new LocalSnapshotError('Snapshot excede o limite local de 128 MiB.');
      const snapshot: unknown = JSON.parse(readFileSync(input, 'utf8')); validateSnapshot(snapshot);
      if (command === 'inventory') result = inventorySnapshot(snapshot);
      else if (command === 'inspect-account') result = inspectSparkAccount(snapshot, option('--uid'));
      else if (command === 'normalize-legacy' || command === 'candidate-legacy-ledger' || command === 'preview-legacy-spark') {
        const scopePath = resolve(base, option('--scope'));
        if (statSync(scopePath).size > MAX_SNAPSHOT_BYTES) throw new LocalSnapshotError('Escopo excede o limite local.');
        const scope = JSON.parse(readFileSync(scopePath, 'utf8'));
        result = command === 'normalize-legacy' ? normalizeSparkLegacy(snapshot, scope)
          : command === 'candidate-legacy-ledger' ? buildLegacyLedgerCandidate(snapshot, scope) : previewLegacySpark(snapshot, scope);
        if (command === 'normalize-legacy' && !(result as ReturnType<typeof normalizeSparkLegacy>).canReviewNormalization) process.exitCode = 2;
      } else if (['prepare', 'plan-ledger', 'import-ledger'].includes(command)) {
        const asOf = parseSparkInstant(option('--as-of'));
        if (command === 'prepare') {
          result = prepareSparkBootstrap(snapshot, option('--group'), asOf);
          if (!(result as ReturnType<typeof prepareSparkBootstrap>).canReviewInitialization) process.exitCode = 2;
        } else if (command === 'plan-ledger') {
          const { documents: _, ...plan } = buildSparkLedgerImport(snapshot, option('--group'), asOf); result = plan;
        } else {
          const client = new LocalFirestore(option('--project'), option('--host'), option('--hub'));
          result = await importSparkLedgerLocal(client, snapshot, option('--group'), asOf, option('--plan-sha256'),
            (completed, total) => console.log(`Importação local: ${completed}/${total} documentos.`));
        }
      } else {
        const client = new LocalFirestore(option('--project'), option('--host'), option('--hub'));
        result = { snapshotSha256: snapshot.sha256, ...await client.restore(snapshot) };
      }
    }
    writeFileSync(outputDescriptor, canonical(result) + '\n');
    console.log(`Spark local: ${command} concluído; arquivo salvo. Nenhuma aprovação de corte foi concedida.`);
  } catch (error) {
    writeFileSync(outputDescriptor, canonical({ status: 'failed', command, partialRestorePossible: ['restore', 'import-ledger'].includes(command),
      reason: diagnostic(error) }) + '\n');
    throw error;
  } finally { closeSync(outputDescriptor); }
}
main().catch(error => {
  console.error(diagnostic(error));
  console.error('Operação local interrompida. Confira opções, integridade e Hub sem Functions. Restore exige destino vazio; import-ledger pode retomar o mesmo plano em destino isolado e sem alterações, usando novo arquivo de saída.');
  process.exitCode = 1;
});
