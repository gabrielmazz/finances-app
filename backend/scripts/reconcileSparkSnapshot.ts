import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconcileSparkLedgerSnapshot, reconcileSparkLegacySnapshot } from '../../utils/sparkFinancialReconciliation';

// [[Protocolo Financeiro Spark]]: diagnóstico local; nenhum SDK, login ou escrita remota.
try {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Informe ${name}.`);
    return args[index + 1];
  };
  const baseDirectory = process.env.INIT_CWD || process.cwd();
  const mode = option('--mode'), inputPath = resolve(baseDirectory, option('--input')), outputPath = resolve(baseDirectory, option('--output'));
  if (!['ledger', 'legacy'].includes(mode)) throw new Error('Modo deve ser ledger ou legacy.');
  if (inputPath === outputPath) throw new Error('O relatório deve ter caminho diferente do snapshot.');
  const input = JSON.parse(readFileSync(inputPath, 'utf8'), (key, value) =>
    ['effectiveAt', 'asOf', 'confirmedAt'].includes(key) && typeof value === 'string' ? new Date(value)
      : key === 'verificationDates' && Array.isArray(value) ? value.map(item => new Date(item)) : value);
  const required = mode === 'ledger' ? ['accounts', 'transactions', 'reconciliations']
    : ['memberIds', 'banks', 'expenses', 'gains', 'bankTransfers', 'cashRescues', 'investments', 'monthlyBalances'];
  if (!input || typeof input.groupId !== 'string' || !input.groupId || !(input.asOf instanceof Date)
    || required.some(key => !Array.isArray(input[key]))) throw new Error('Snapshot normalizado inválido; confira o contrato documentado.');
  const result = mode === 'ledger' ? reconcileSparkLedgerSnapshot(input) : reconcileSparkLegacySnapshot(input);
  writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`Reconciliação local: ${result.accounts.length} contas; ${result.issues.length} pendências. Relatório salvo.`);
  process.exitCode = result.eligibleForReviewedBootstrap ? 0 : 2;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Não foi possível analisar o snapshot.');
  process.exitCode = 1;
}
