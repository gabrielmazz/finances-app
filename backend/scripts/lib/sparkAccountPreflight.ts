import { inventorySnapshot, LocalSnapshotError, type LocalSnapshot } from './sparkLocalSnapshot';

// [[Importação Financeira Local Spark]]: evidência local não autoriza bootstrap ou corte.
const LEGACY_COLLECTIONS = [
  'banks', 'expenses', 'gains', 'monthlyBalances', 'bankTransfers', 'cashRescues',
  'investments', 'financeInvestments', 'financeInvestmentSyncs', 'investmentCdiRates', 'bankBalanceAdjustments', 'cards',
  'mandatoryExpenses', 'mandatoryGains', 'tags',
] as const;

/** Resume o bruto sem inventar saldo, nem inferir que uma conta sem documentos é nova. */
export function inspectSparkAccount(snapshot: LocalSnapshot, uid: string) {
  if (!uid || uid.length > 160 || uid.includes('/') || uid === '.' || uid === '..') throw new LocalSnapshotError('UID de análise inválido.');
  const inventory = inventorySnapshot(snapshot);
  const user = inventory.users.find(item => item.uid === uid);
  const counts: Record<string, number> = Object.fromEntries(LEGACY_COLLECTIONS.map(name => [name, 0]));
  const ambiguousSources: string[] = [];
  for (const row of snapshot.documents) {
    const parts = row.path.split('/');
    if (parts.length !== 2 || !Object.hasOwn(counts, parts[0])) continue;
    const owner = row.fields.personId?.stringValue;
    const alternate = row.fields.userId?.stringValue;
    const invalidOwner = row.fields.personId !== undefined && typeof owner !== 'string';
    const invalidAlternate = row.fields.userId !== undefined && typeof alternate !== 'string';
    if (invalidOwner || invalidAlternate || typeof owner !== 'string' || alternate !== undefined && alternate !== owner) {
      ambiguousSources.push(row.path);
      continue;
    }
    if (owner === uid) counts[parts[0]]++;
  }
  const observedDocuments = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const issues = inventory.issues.filter(issue => issue.path === `users/${uid}` || issue.path === `financialCutovers/${uid}`
    || user?.groupId && issue.path === `financialGroups/${user.groupId}`);
  const status = !user || user.storageModel === 'unknown' ? 'unknown' : user.storageModel === 'spark-marked' ? 'spark-marked'
    : user.storageModel === 'ledger' ? 'ledger' : observedDocuments ? 'legacy-with-observed-data' : 'no-legacy-documents-observed';
  return { schemaVersion: 1, mode: 'account-diagnostic', snapshotSha256: snapshot.sha256, uid, status,
    groupId: user?.groupId ?? null, observedDocuments, counts, ambiguousSources: ambiguousSources.sort(), issues,
    sourceCompleteness: inventory.sourceCompleteness, snapshotConsistency: snapshot.consistency,
    authIncluded: false, canInitialize: false, canMigrate: false, readyForCutover: false, writes: [],
    pending: ['verify-auth-and-original-account-creation', 'confirm-source-completeness', 'backup-and-restore-rehearsal',
      'resolve-ambiguous-ownership-and-history', 'reconcile-balances-and-contracts', 'consent-and-legacy-writer-cutover', 'reviewed-activation'] };
}
