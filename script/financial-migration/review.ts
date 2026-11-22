import { planMigration, sourceEntityPaths, type CategoryReferenceReview, type Plan } from './plan';
import { canonicalId, idOf, target, text, type Identity, type MigrationDocument, type Scope } from './records';
import type { OwnershipReview } from './authority';

const groupFields = ['groupId', 'financialGroupId', 'ledgerGroupId'] as const;

export function pending(entry: Plan['entries'][number]) {
  return ['REQUIRES_REVIEW', 'DUPLICATE_CANDIDATE', 'INVALID_SOURCE'].includes(entry.classification);
}

export function reviewExceptions(documents: MigrationDocument[], identities: Identity[], plan: Plan, reviews: OwnershipReview[],
  categoryReviews: CategoryReferenceReview[] = []) {
  const records = new Map(documents.map(doc => [doc.path, doc]));
  const entries = new Map(plan.entries.map(entry => [entry.path, entry]));
  const people = new Map(identities.map(user => [user.uid, user]));
  const aliases = new Map([...new Set(documents.flatMap(doc => {
    const uid = text(doc, 'personId');
    return uid ? [uid] : [];
  }))].sort().map((uid, index) => [uid, 'titular-' + (index + 1)]));
  const incoming = new Map<string, Set<string>>();
  const rootsBySource = new Map<string, Set<string>>();
  const missing = new Map<string, Set<string>>();

  function link(source: string, path: string) {
    if (!incoming.has(path)) incoming.set(path, new Set());
    incoming.get(path)!.add(source);
  }

  for (const doc of documents) {
    const info = entries.get(doc.path)!;
    if (!['movement', 'template', 'transfer'].includes(info.kind) || info.reason === 'preserved-in-place') continue;
    const paths = new Set<string>();
    for (const [kind, fields] of [
      ['bank', ['bankId', 'accountId', 'sourceBankId', 'targetBankId', 'bankTransferSourceBankId', 'bankTransferTargetBankId']],
      ['category', ['tagId', 'categoryId']],
    ] as const) {
      for (const field of fields) {
        const id = text(doc, field);
        if (!id) continue;
        const candidates = sourceEntityPaths(doc, id, kind);
        const existing = candidates.filter(path => records.has(path));
        if (!existing.length) {
          const key = candidates[0] ?? kind + '/invalid-id';
          if (!missing.has(key)) missing.set(key, new Set());
          missing.get(key)!.add(doc.path);
        }
        for (const path of existing) {
          paths.add(path);
          link(doc.path, path);
        }
      }
    }
    for (const [field, collection] of [
      ['expenseId', 'expenses'], ['gainId', 'gains'], ['bankTransferPairId', 'bankTransfers'],
      ['lastPaymentExpenseId', 'expenses'], ['lastReceiptGainId', 'gains'],
    ]) {
      const id = text(doc, field);
      if (!id) continue;
      const ref = collection + '/' + id;
      if (records.has(ref)) link(doc.path, ref);
      else {
        if (!missing.has(ref)) missing.set(ref, new Set());
        missing.get(ref)!.add(doc.path);
      }
    }
    rootsBySource.set(doc.path, paths);
  }
  function dependents(path: string) {
    const result = new Set<string>(), queue = [path];
    for (let index = 0; index < queue.length; index++) {
      for (const next of incoming.get(queue[index]) ?? []) {
        if (next === path || result.has(next)) continue;
        result.add(next);
        queue.push(next);
      }
    }
    return [...result].sort();
  }

  const decisions = plan.entries.filter(entry => pending(entry) && ['bank', 'category'].includes(entry.kind)).map(entry => {
    const doc = records.get(entry.path)!;
    const uid = text(doc, 'personId');
    const root = doc.path.split('/')[0];
    const bindingPath = (root === 'banks' ? '_bankScopes/' : '_categoryScopes/') + idOf(doc);
    const binding = root === 'banks' || root === 'tags' ? records.get(bindingPath) : undefined;
    const historicalGroups = Object.fromEntries(groupFields.map(field => [field, doc.fields[field] ?? 'absent']));
    const inferredGroup = root === 'financialGroups' || groupFields.some(field => doc.fields[field] && !('nullValue' in doc.fields[field]));
    const proposed: Scope | null = !binding && !inferredGroup && uid && people.get(uid)?.disabled === false
      ? { kind: 'personal', id: uid } : null;
    return { path: doc.path, sourceHash: entry.sourceHash, kind: entry.kind, name: text(doc, 'name') ?? null,
      declaredOwnerUid: uid ?? null, ownerAlias: uid ? aliases.get(uid) : null, historicalGroups,
      currentContext: entry.context ?? null, protectedBinding: binding ? { path: binding.path, fields: binding.fields } : null,
      evidence: { authUidExists: !!uid && people.has(uid), authEnabled: !!uid && people.get(uid)?.disabled === false,
        profileExists: !!uid && records.has('users/' + uid), relationsObserved: dependents(doc.path).length },
      proposedScope: proposed,
      proposedDestination: proposed ? target(proposed, entry.kind === 'bank' ? 'bankAccounts' : 'categories',
        entry.kind === 'bank' ? canonicalId(doc) : idOf(doc)) : null,
      dependents: dependents(doc.path),
      consequence: entry.kind === 'bank' ? 'Projeta a conta sem saldo. Lançamentos só herdam o contexto quando todas as relações e o UID concordam.' :
        'Projeta a categoria. Lançamentos de outro contexto continuam bloqueados; a confirmação não compartilha registros.',
      reason: entry.reason,
    };
  });

  // Forecast only. This plan never goes into the authorized manifest or execution path.
  const modeled = decisions.flatMap(decision => decision.proposedScope && decision.reason === 'missing-independent-context-evidence'
    ? [{ path: decision.path, sourceHash: decision.sourceHash, scope: decision.proposedScope,
      ownerUid: decision.proposedScope.id, evidence: 'Hipótese somente para medir dependências' }] : []);
  const forecast = modeled.length ? planMigration(documents, identities, [...reviews, ...modeled], categoryReviews) : plan;
  const projected = new Map(forecast.entries.map(entry => [entry.path, entry]));
  const resolved = plan.entries.filter(pending).filter(entry => !pending(projected.get(entry.path)!));
  type ExceptionGroup = {
    reason: string;
    declaredOwner: string;
    verifiedContext: string | null;
    relatedOrigins: { path: string; verifiedContext: string | null; modeledContext: string | null; exists: boolean }[];
    originPaths: string[];
    documents: string[];
  };
  const grouped = new Map<string, ExceptionGroup>();
  for (const item of forecast.entries.filter(pending)) {
    const doc = records.get(item.path)!;
    const uid = text(doc, 'personId');
    const owner = uid ? aliases.get(uid)! : 'sem-titular-declarado';
    const references = [...(rootsBySource.get(item.path) ?? [])];
    if (item.kind === 'bank' || item.kind === 'category') references.push(item.path);
    for (const [ref, dependents] of missing) if (dependents.has(item.path)) references.push(ref);
    references.sort();
    const verifiedContext = entries.get(item.path)?.context ?? null;
    const key = JSON.stringify([item.reason, owner, verifiedContext, references]);
    const group = grouped.get(key) ?? { reason: item.reason, declaredOwner: owner, verifiedContext, originPaths: references,
      relatedOrigins: references.map(path => ({ path, exists: records.has(path), verifiedContext: entries.get(path)?.context ?? null,
        modeledContext: projected.get(path)?.context ?? null })), documents: [] };
    group.documents.push(item.path);
    grouped.set(key, group);
  }

  const buckets = new Map<string, { paths: Set<string>; sourcePaths: Set<string>; potentiallyResolved: number }>();
  for (const entry of plan.entries.filter(pending)) {
    const bucket = buckets.get(entry.reason) ?? { paths: new Set(), sourcePaths: new Set(), potentiallyResolved: 0 };
    bucket.paths.add(entry.path);
    if (!pending(projected.get(entry.path)!)) bucket.potentiallyResolved++;
    const refs = new Set(rootsBySource.get(entry.path));
    if (entry.kind === 'bank' || entry.kind === 'category') refs.add(entry.path);
    for (const [path, sources] of missing) if (sources.has(entry.path)) refs.add(path);
    for (const path of refs) bucket.sourcePaths.add(path);
    buckets.set(entry.reason, bucket);
  }
  const forecastReasons: Record<string, number> = {};
  for (const item of forecast.entries.filter(pending)) forecastReasons[item.reason] = (forecastReasons[item.reason] ?? 0) + 1;
  const categoryDecisions = categoryReviews.filter(
    (review): review is Exclude<CategoryReferenceReview, { templatePath: string }> => !('templatePath' in review),
  ).map(review => {
    const categoryName = text(records.get(review.categoryPath), 'name') ?? null;
    if ('cashOwnerUid' in review) return {
      ...review, bankPath: null, context: 'personal:' + review.cashOwnerUid, categoryName,
      movements: review.cashMovements.filter(movement => entries.get(movement.path)?.evidence?.includes('reviewed-historical-cash-category') &&
        !pending(entries.get(movement.path)!)).map(movement => movement.path),
    };
    const selectedPaths = review.bankMovements ? new Set(review.bankMovements.map(movement => movement.path)) : null;
    return {
      ...review, context: entries.get(review.bankPath)?.context ?? null, categoryName,
      movements: plan.steps.filter(step => step.sources.includes(review.bankPath) && step.sources.includes(review.categoryPath) &&
        step.destinations.some(destination => destination.path.includes('/movements/')))
        .flatMap(step => step.sources.filter(path => path !== review.bankPath && path !== review.categoryPath))
        .filter(path => selectedPaths ? selectedPaths.has(path) : !entries.get(path)?.evidence?.includes('reviewed-bank-preserve-author')),
    };
  });
  const templateDecisions = categoryReviews.filter(review => 'templatePath' in review).map(review => {
    const entry = entries.get(review.templatePath);
    return { ...review, templateName: text(records.get(review.templatePath), 'name') ?? null,
      categoryName: text(records.get(review.categoryPath), 'name') ?? null, validated: !!entry && !pending(entry) };
  });
  return {
    decisions, categoryDecisions, templateDecisions, exceptionGroups: [...grouped.values()],
    missingReferences: [...missing].map(([path, sources]) => ({ path, sources: [...sources] })),
    summary: { ownershipDecisions: decisions.length, current: [...buckets].map(([reason, bucket]) => ({ reason,
      documents: bucket.paths.size, distinctReferencedPaths: bucket.sourcePaths.size, potentiallyResolved: bucket.potentiallyResolved })),
      forecast: { reviewedOrigins: modeled.length, potentiallyResolvedOrigins: resolved.filter(entry => ['bank', 'category'].includes(entry.kind)).length,
        potentiallyResolvedDependents: resolved.filter(entry => !['bank', 'category'].includes(entry.kind)).length,
        pendingAfterHypothesis: forecast.entries.filter(pending).length, reasons: forecastReasons },
    },
  };
}
