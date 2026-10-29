import { createLegacyMigrationPlan } from '../../../utils/financialLedgerMigration';
import { reconcileSparkLedgerSnapshot } from '../../../utils/sparkFinancialReconciliation';
import { normalizeSparkLegacy } from './sparkLegacyNormalization';
import { digest, LocalSnapshotError, validateSnapshot, type LocalSnapshot } from './sparkLocalSnapshot';

/** Candidato local e revisável. Não autoriza escrita, migração ou ativação. */
export function buildLegacyLedgerCandidate(snapshot: LocalSnapshot, scope: unknown) {
  validateSnapshot(snapshot);
  const report = normalizeSparkLegacy(snapshot, scope);
  if (!report.canReviewNormalization || !report.reconciliation) {
    throw new LocalSnapshotError('Normalização legada contém pendências; nenhuma conversão parcial será aprovada.');
  }
  const plan = createLegacyMigrationPlan(report.normalized);
  if (plan.issues.length) throw new LocalSnapshotError('O contrato legado contém pendências.');
  const sourceIndex = new Map(report.sources.map(source => [source.path, source]));
  const transactions = plan.transactions.map(event => {
    const refs = event.sourceReferences ?? [];
    const authors = [...new Set(refs.map(ref => sourceIndex.get(`${ref.collection}/${ref.id}`)?.actorId))];
    if (!refs.length || authors.length !== 1 || !authors[0]) {
      throw new LocalSnapshotError('Não foi possível comprovar uma autoria única para todos os eventos; o candidato foi bloqueado.');
    }
    return { ...event, actorId: authors[0] };
  });
  const entries = report.reconciliation.accounts.flatMap(account => account.entries);
  const openingsById = new Map(entries.filter(item => item.kind === 'checkpoint' && item.source.collection === 'accountReconciliations').map(item => [item.source.id, item]));
  const accountsById = new Map(report.reconciliation.accounts.map(account => [account.sourceAccountId, account]));
  const reconciliations = plan.reconciliations.map(opening => {
    const entry = openingsById.get(opening.id);
    if (!entry) throw new LocalSnapshotError('A origem de uma abertura não foi reconciliada.');
    return { ...opening, effectiveAt: entry.effectiveAt };
  });
  const accounts = plan.accounts.map(account => {
    const verified = accountsById.get(account.id);
    if (!verified || verified.differenceInCents !== 0) throw new LocalSnapshotError('Saldo da conta não foi reconciliado.');
    return { ...account, currentBalanceInCents: verified.sourceBalanceInCents };
  });
  const verified = reconcileSparkLedgerSnapshot({ groupId: report.proposedGroupId, asOf: report.cutoff, accounts, transactions, reconciliations });
  if (!verified.eligibleForReviewedBootstrap) throw new LocalSnapshotError('O candidato diverge da reconciliação; nenhuma conversão parcial será aprovada.');
  const { eligibleForReviewedBootstrap: _eligibility, ...reconciliation } = verified;
  const candidate = { format: 'lumus-legacy-ledger-candidate', schemaVersion: 1, sourceSnapshotSha256: snapshot.sha256,
    scopeSha256: digest(scope), normalizedSha256: report.normalizedSha256, groupId: report.proposedGroupId, cutoff: report.cutoff,
    memberIds: report.normalized.memberIds, cashConfirmation: { amountInCents: report.normalized.confirmedCashBalanceInCents, confirmedAt: report.normalized.confirmedAt },
    accounts, transactions, reconciliations, sources: report.sources, reconciliation, reconciliationChecksPassed: true,
    canApply: false, readyForCutover: false,
    limitations: ['local-demo-snapshot-only', 'source-completeness-unverified', 'cash-adjustments-require-explicit-authorship',
      'historical-boundaries-not-fully-verified', 'special-formats-and-metadata-not-converted', 'spark-import-and-activation-not-implemented'] };
  return { ...candidate, candidateSha256: digest(candidate) };
}
