import { validId } from '../../domain/banks';
import { ownership, type OwnershipReview } from './authority';
import { bankFields, categoryFields, movementFields, templateFields } from './convert';
import { verifyCanonical } from './canonical';
import {
  b, canonicalId, cents, digest, flag, i, idOf, requiredDate, Review, s, scopeKey, state, target, text,
  type Destination, type Fields, type Identity, type MigrationDocument, type Scope,
} from './records';

export type { MigrationDocument, Identity } from './records';

export type Classification = 'AUTO_MIGRATABLE' | 'REQUIRES_REVIEW' | 'DUPLICATE_CANDIDATE' | 'ALREADY_MIGRATED' |
  'INVALID_SOURCE' | 'PRESERVED' | 'PRESERVED_EXCEPTION';
type Kind = 'bank' | 'category' | 'movement' | 'template' | 'transfer' | 'protected' | 'archive' | 'canonical';
type Entry = {
  path: string; sourceHash: string; kind: Kind; classification: Classification;
  reason: string; ownerUid?: string; context?: string; evidence?: string[]; destinations: string[];
};
export type Step = { sources: string[]; destinations: Destination[] };
type MovementReferenceReview = { path: string; sourceHash: string };
export type PreservedException = MovementReferenceReview & { evidence: string };
export type CategoryReferenceReview = { categoryPath: string; categoryHash: string; evidence: string } & (
  { bankPath: string; bankHash: string; bankMovements?: MovementReferenceReview[] } |
  { cashOwnerUid: string; cashMovements: MovementReferenceReview[] } |
  { templatePath: string; templateHash: string }
);
export type Plan = ReturnType<typeof planMigration>;
type Association = { scope: Scope; uid: string; evidence: string[] };
type Entity = { scope: Scope; id: string; source: MigrationDocument };
type HistoricalCategory = { sources: string[]; destination: Destination };

class Duplicate extends Error {}

function kindOf(record: MigrationDocument): Kind {
  const path = record.path.split('/');
  if (path[0] === 'financialContexts') return 'canonical';
  if (path.length === 2) {
    if (path[0] === 'banks') return 'bank';
    if (path[0] === 'tags') return 'category';
    if (['gains', 'expenses', 'cashRescues'].includes(path[0])) return 'movement';
    if (['mandatoryExpenses', 'mandatoryGains'].includes(path[0])) return 'template';
    if (path[0] === 'bankTransfers') return 'transfer';
  }
  if (path[0] === 'financialGroups' && path.length === 4) {
    if (path[2] === 'accounts') return 'bank';
    if (path[2] === 'tags') return 'category';
    if (path[2] === 'movements') return 'movement';
  }
  return /^(_|users\/|financialGroups\/|userRelationshipGrants\/|sparkUserRelationships\/)/.test(record.path) ? 'protected' : 'archive';
}

function isInvestment(record: MigrationDocument) {
  return ['isInvestmentDeposit', 'isInvestmentRedemption', 'isInvestmentPurchase', 'isFinanceInvestment', 'isFinanceInvestmentSync']
    .some(key => flag(record, key)) || Boolean(text(record, 'investmentId'));
}

function movementType(doc: MigrationDocument): 'gain' | 'expense' {
  const collection = doc.path.split('/')[0];
  const declared = text(doc, 'type');
  const type = collection === 'gains' ? 'gain' : ['expenses', 'cashRescues'].includes(collection) ? 'expense' : declared;
  if ((type !== 'gain' && type !== 'expense') || (declared && type !== declared)) throw new Review('unknown-or-conflicting-movement-type');
  return type;
}

function namedDestination(doc: MigrationDocument, association: Association, path: string, fields: Fields, scoped = true): Destination {
  return {
    path,
    fields: { ...fields, ...(scoped ? { schemaVersion: i(1), scopeKind: s(association.scope.kind), scopeId: s(association.scope.id) } : {}),
      historicalSourcePath: s(doc.path) },
  };
}

export function sourceEntityPaths(doc: MigrationDocument, id: string | undefined, kind: 'bank' | 'category') {
  if (!id || id.includes('/') || id === '.' || id === '..') return [];
  const parts = doc.path.split('/');
  const collection = kind === 'bank' ? 'banks' : 'tags';
  const nestedCollection = kind === 'bank' ? 'accounts' : 'tags';
  return [collection + '/' + id, ...(parts[0] === 'financialGroups' && parts.length === 4
    ? [parts.slice(0, 2).join('/') + '/' + nestedCollection + '/' + id] : [])];
}

const categoryReviewKey = (bankPath: string, categoryPath: string) => JSON.stringify([bankPath, categoryPath]);

export function planMigration(documents: MigrationDocument[], identities: Identity[], reviews: OwnershipReview[] = [],
  categoryReviews: CategoryReferenceReview[] = [], preservedExceptions: PreservedException[] = [], capturedAt?: string) {
  const ordered = [...documents].sort((a, b) => a.path < b.path ? -1 : a.path === b.path ? 0 : 1);
  const records = new Map(ordered.map(doc => [doc.path, doc]));
  if (records.size !== documents.length) throw Error('repeated-source-path');
  const referenceFloor = capturedAt ? Date.parse(capturedAt) : null;
  const referenceDates = new Map<string, number>();
  if (referenceFloor !== null) {
    if (!Number.isFinite(referenceFloor)) throw Error('invalid-reference-floor');
    for (const doc of ordered) {
      if (kindOf(doc) !== 'movement') continue;
      const date = Date.parse(doc.fields.date?.timestampValue ?? '');
      if (date < referenceFloor || !Number.isFinite(date)) continue;
      for (const key of ['accountId', 'bankId']) {
        for (const bank of sourceEntityPaths(doc, text(doc, key), 'bank')) {
          referenceDates.set(bank, Math.max(referenceDates.get(bank) ?? referenceFloor, date + 1));
        }
      }
    }
  }
  const authorize = ownership(records, identities, reviews);
  const approvedCategories = new Set<string>();
  const approvedBankMovements = new Map<string, { bankPath: string; categoryPath: string }>();
  const approvedCashCategories = new Map<string, { ownerUid: string; categoryPath: string }>();
  const approvedTemplateCategories = new Map<string, string>();
  for (const review of categoryReviews) {
    const category = records.get(review.categoryPath);
    if (!category || kindOf(category) !== 'category' || review.categoryHash !== digest(category) || review.evidence.trim().length < 12)
      throw Error('category-review-does-not-match-source');
    if ('cashOwnerUid' in review) {
      if (!review.cashMovements.length) throw Error('cash-category-review-does-not-match-source');
      for (const approval of review.cashMovements) {
        const doc = records.get(approval.path);
        if (!doc || !/^(gains|expenses)\/[^/]+$/.test(doc.path) || approval.sourceHash !== digest(doc) ||
            text(doc, 'personId') !== review.cashOwnerUid || flag(doc, 'moneyFormat') !== true ||
            !doc.fields.bankId || !('nullValue' in doc.fields.bankId) || doc.fields.accountId ||
            !sourceEntityPaths(doc, text(doc, 'tagId') ?? text(doc, 'categoryId'), 'category').includes(category.path))
          throw Error('cash-category-review-does-not-match-source');
        if (approvedCashCategories.has(doc.path) || approvedBankMovements.has(doc.path)) throw Error('repeated-category-review');
        approvedCashCategories.set(doc.path, { ownerUid: review.cashOwnerUid, categoryPath: category.path });
      }
      continue;
    }
    if ('templatePath' in review) {
      const template = records.get(review.templatePath);
      if (!template || kindOf(template) !== 'template' || review.templateHash !== digest(template))
        throw Error('template-category-review-does-not-match-source');
      if (approvedTemplateCategories.has(template.path)) throw Error('repeated-category-review');
      approvedTemplateCategories.set(template.path, category.path);
      continue;
    }
    const bank = records.get(review.bankPath);
    if (!bank || kindOf(bank) !== 'bank' || review.bankHash !== digest(bank)) throw Error('category-review-does-not-match-source');
    if (review.bankMovements !== undefined) {
      if (!review.bankMovements.length) throw Error('bank-movement-review-does-not-match-source');
      for (const approval of review.bankMovements) {
        const doc = records.get(approval.path);
        if (!doc || !/^(gains|expenses)\/[^/]+$/.test(doc.path) || approval.sourceHash !== digest(doc) ||
            !sourceEntityPaths(doc, text(doc, 'bankId') ?? text(doc, 'accountId'), 'bank').includes(bank.path) ||
            !sourceEntityPaths(doc, text(doc, 'tagId') ?? text(doc, 'categoryId'), 'category').includes(category.path))
          throw Error('bank-movement-review-does-not-match-source');
        if (approvedBankMovements.has(doc.path) || approvedCashCategories.has(doc.path)) throw Error('repeated-category-review');
        approvedBankMovements.set(doc.path, { bankPath: bank.path, categoryPath: category.path });
      }
      continue;
    }
    const key = categoryReviewKey(bank.path, category.path);
    if (approvedCategories.has(key)) throw Error('repeated-category-review');
    approvedCategories.add(key);
  }
  const entries = new Map<string, Entry>();
  const steps: Step[] = [];
  const projected = new Map<string, Destination>();
  const entities = new Map<string, Entity>();
  const counts = new Map<Classification, number>();
  const effects = new Map<string, bigint>();
  const entityCandidates = new Map<string, MigrationDocument[]>();
  for (const doc of ordered) {
    const kind = kindOf(doc);
    if (kind !== 'bank' && kind !== 'category') continue;
    try {
      const { scope } = authorize(doc);
      const path = target(scope, kind === 'bank' ? 'bankAccounts' : 'categories', kind === 'bank' ? canonicalId(doc) : idOf(doc));
      entityCandidates.set(path, [...(entityCandidates.get(path) ?? []), doc]);
    } catch { /* The main pass records the exact association problem. */ }
  }

  function entry(doc: MigrationDocument, classification: Classification, reason: string, paths: string[] = [], association?: Association) {
    entries.set(doc.path, {
      path: doc.path, kind: kindOf(doc), sourceHash: digest(doc), classification, reason, destinations: paths,
      ...(association ? { ownerUid: association.uid, context: scopeKey(association.scope), evidence: association.evidence } : {}),
    });
  }

  function reject(docs: MigrationDocument[], error: unknown, association?: Association) {
    const classification = error instanceof Duplicate ? 'DUPLICATE_CANDIDATE' :
      error instanceof Review ? 'REQUIRES_REVIEW' : 'INVALID_SOURCE';
    for (const doc of docs) entry(doc, classification, error instanceof Error ? error.message : 'transformation-failed', [], association);
  }

  function accept(docs: MigrationDocument[], expected: Destination[], association: Association, historicalCategory?: HistoricalCategory) {
    const missing: Destination[] = [];
    for (const dest of expected) {
      if (dest.path.includes('/movements/')) {
        const source = docs.find(doc => doc.path === text(dest, 'historicalSourcePath'));
        if (!source || kindOf(source) !== 'movement' ||
            cents(source, 'valueInCents', 'amountCents') !== cents(dest, 'amountCents') ||
            digest(source.fields.date) !== digest(dest.fields.date) ||
            text(dest, 'type') !== movementType(source) ||
            text(dest, 'status') !== (state(source, 'cancelled') ? 'cancelled' : 'posted') ||
            text(dest, 'createdBy') !== (text(source, 'createdBy') ?? text(source, 'personId') ?? text(dest, 'createdBy')) ||
            text(dest, 'updatedBy') !== (text(source, 'updatedBy') ?? text(source, 'personId') ?? text(dest, 'updatedBy')))
          throw new Review('historical-movement-projection-differs');
      }
      if (projected.has(dest.path)) throw new Duplicate('multiple-sources-for-destination');
      const existing = records.get(dest.path);
      if (!existing) missing.push(dest);
      else if (digest(existing.fields) !== digest(dest.fields)) throw new Duplicate('destination-content-differs');
    }
    if (missing.length !== expected.length && missing.length > 0) throw new Duplicate('partial-related-destination-exists');
    const sourcePaths = docs.map(doc => doc.path);
    if (historicalCategory) {
      const { destination, sources } = historicalCategory;
      const existing = projected.get(destination.path) ?? records.get(destination.path);
      if (existing && digest(existing.fields) !== digest(destination.fields)) throw new Duplicate('historical-category-destination-differs');
      if (!existing) {
        if (!missing.length) throw new Review('historical-movement-without-category');
        steps.push({ sources, destinations: [destination] });
        projected.set(destination.path, destination);
      }
      sourcePaths.push(...sources);
    }
    if (missing.length) steps.push({ sources: sourcePaths, destinations: missing });
    for (const dest of expected) projected.set(dest.path, dest);
    for (const doc of docs) entry(doc, missing.length ? 'AUTO_MIGRATABLE' : 'ALREADY_MIGRATED',
      missing.length ? 'verified-transform' : 'exact-destination-match', expected.map(dest => dest.path), association);
  }

  function entity(doc: MigrationDocument, id: string | undefined, kind: 'bank' | 'category'): Entity {
    const candidates = sourceEntityPaths(doc, id, kind).filter(path => records.has(path));
    if (candidates.length > 1) throw new Duplicate('ambiguous-' + kind + '-reference');
    const related = entities.get(candidates[0]);
    if (!related) throw new Review(candidates.length ? 'unverified-' + kind + '-reference' : 'missing-' + kind + '-reference');
    return related;
  }

  function bankOrCategory(doc: MigrationDocument, kind: 'bank' | 'category') {
    let association: Association | undefined;
    try {
      association = authorize(doc);
      const id = kind === 'bank' ? canonicalId(doc) : idOf(doc);
      const collection = kind === 'bank' ? 'bankAccounts' : 'categories';
      const path = target(association.scope, collection, id);
      if ((entityCandidates.get(path)?.length ?? 0) > 1) throw new Duplicate('multiple-sources-for-destination');
      const existing = records.get(path);
      const openingPath = target(association.scope, 'accountOpenings', id);
      const opening = records.get(openingPath);
      if (kind === 'bank' && existing && opening && text(existing, 'legacyBankId') === idOf(doc) &&
          text(existing, 'scopeId') === association.scope.id && text(existing, 'scopeKind') === association.scope.kind &&
          text(opening, 'scopeId') === association.scope.id && text(opening, 'scopeKind') === association.scope.kind &&
          text(existing, 'name') === text(doc, 'name') && text(opening, 'accountId') === id &&
          text(opening, 'type') === 'reference' && flag(opening, 'confirmed') && flag(opening, 'pendingReviewed') &&
          cents(existing, 'initialBalanceCents') === cents(opening, 'amountCents') &&
          digest(requiredDate(existing, 'openingDate')) === digest(requiredDate(opening, 'date'))) {
        entry(doc, 'ALREADY_MIGRATED', 'verified-existing-reference-opening', [path, openingPath], association);
      } else {
        const fields = kind === 'bank' ? bankFields(doc, association.uid) : categoryFields(doc, association.uid);
        if (kind === 'bank' && referenceFloor !== null) {
          const establishedFloor = text(existing, 'historicalSourcePath') === doc.path ? existing?.fields.referenceNotBefore : undefined;
          const date = referenceDates.get(doc.path) ?? referenceFloor;
          fields.referenceNotBefore = establishedFloor ?? { timestampValue: new Date(date).toISOString() };
        }
        accept([doc], [namedDestination(doc, association, path, fields)], association);
      }
      entities.set(doc.path, { scope: association.scope, id, source: doc });
    } catch (error) { reject([doc], error, association); }
  }

  for (const doc of ordered) {
    const kind = kindOf(doc);
    if (kind === 'bank' || kind === 'category') bankOrCategory(doc, kind);
    else if (kind === 'protected' || kind === 'archive' || (kind === 'movement' && isInvestment(doc)))
      entry(doc, 'PRESERVED', 'preserved-in-place');
    else if (kind === 'canonical') {
      try {
        verifyCanonical(doc, records, identities);
        entry(doc, 'ALREADY_MIGRATED', 'existing-canonical-validated', [doc.path]);
      } catch (error) { reject([doc], error); }
    }
  }

  function standardMovement(doc: MigrationDocument, bank: Entity | null, category: Entity, actorUid: string): Fields {
    const type = movementType(doc);
    if (text(doc, 'operation') || flag(doc, 'isCashRescue') || flag(doc, 'isBankTransfer'))
      throw new Review('unsupported-or-unpaired-operation');
    return { ...movementFields(doc, actorUid, bank?.id ?? null, type), categoryId: s(category.id), categorySource: s('new'),
      ...(flag(doc, 'isFromMandatory') ? { isFromMandatory: b(true) } : {}) };
  }

  function archivedCategory(category: Entity, association: Association, relatedSources: string[] = []): HistoricalCategory {
    const original = categoryFields(category.source, category.scope.id);
    const path = target(association.scope, 'categories', category.id);
    return { sources: [...relatedSources, category.source.path],
      destination: namedDestination(category.source, association, path, { ...original, status: s('archived') }) };
  }

  const templates = ordered.filter(doc => kindOf(doc) === 'template').map(doc => {
    const type = doc.path.startsWith('mandatoryGains/') ? 'gain' : 'expense';
    const prefix = type === 'gain' ? 'lastReceipt' : 'lastPayment';
    const movementCollection = type === 'gain' ? 'gains' : 'expenses';
    const movementId = text(doc, prefix + (type === 'gain' ? 'GainId' : 'ExpenseId'));
    return { doc, type, prefix, movementId, movementPath: movementId ? movementCollection + '/' + movementId : null } as const;
  });
  const templateMovements = Map.groupBy(templates.filter(template => template.movementPath), template => template.movementPath!);
  for (const { doc, type, prefix, movementId, movementPath } of templates) {
    const movement = movementPath ? records.get(movementPath) : undefined;
    const linked = movement && !entries.has(movement.path) ? [doc, movement] : [doc];
    let association: Association | undefined;
    try {
      const historical = entity(doc, text(doc, 'tagId') ?? text(doc, 'categoryId'), 'category');
      const reviewedCategoryPath = approvedTemplateCategories.get(doc.path);
      let category = historical;
      if (reviewedCategoryPath) {
        const selected = entities.get(reviewedCategoryPath);
        if (!selected || selected.scope.kind !== 'personal' || historical.scope.kind !== 'personal' ||
            scopeKey(selected.scope) === scopeKey(historical.scope)) throw new Review('unverified-future-template-category');
        const selectedFields = categoryFields(selected.source, selected.scope.id);
        const mandatoryFlag = type === 'gain' ? 'isMandatoryGain' : 'isMandatoryExpense';
        if (selectedFields.status.stringValue !== 'active' || ![type, 'both'].includes(selectedFields.usageType.stringValue ?? '') ||
            selectedFields[mandatoryFlag].booleanValue !== true) throw new Review('incompatible-future-template-category');
        category = selected;
      }
      association = authorize(doc, [category.scope]);
      const id = canonicalId(doc);
      const fields = templateFields(doc, association.uid, category.id, type);
      const cycle = text(doc, prefix + 'Cycle');
      const dest: Destination[] = [];
      let historicalCategory: HistoricalCategory | undefined;
      if (reviewedCategoryPath || cycle || movementId || doc.fields[prefix + 'Date']?.timestampValue) {
        if (!cycle || !/^\d{4}-(0[1-9]|1[0-2])$/.test(cycle) || !validId(movementId)) throw new Review('unverified-confirmed-cycle');
        if (!movement || entries.has(movement.path) || templateMovements.get(movement.path)?.length !== 1 || isInvestment(movement))
          throw new Review('missing-or-reused-confirmed-movement');
        const movementCategory = entity(movement, text(movement, 'tagId'), 'category');
        const confirmedCash = reviewedCategoryPath ? approvedCashCategories.get(movement.path) : undefined;
        if (reviewedCategoryPath && (confirmedCash?.ownerUid !== association.uid ||
            confirmedCash.categoryPath !== historical.source.path || movementCategory.source.path !== historical.source.path))
          throw new Review('unverified-template-cash-payment');
        const bank = confirmedCash ? null : entity(movement, text(movement, 'bankId'), 'bank');
        const related = authorize(movement, bank ? [association.scope, bank.scope, movementCategory.scope] : [association.scope]);
        if (related.uid !== association.uid || movementCategory.id !== historical.id) throw new Review('conflicting-confirmed-cycle');
        const transaction = standardMovement(movement, bank, movementCategory, related.uid);
        if (transaction.status.stringValue !== 'posted') throw new Review('confirmed-movement-not-posted');
        const lastMovementDate = requiredDate(doc, prefix + 'Date');
        if (digest(lastMovementDate) !== digest(transaction.date)) throw new Review('confirmed-cycle-date-differs');
        const count = doc.fields[prefix + 'InstallmentsCount']?.integerValue;
        const installments = count ? Number(count) : 1;
        if (!Number.isSafeInteger(installments) || installments < 1 ||
            (fields.installmentTotal.integerValue && Number(fields.installmentsCompleted.integerValue) < installments))
          throw new Review('invalid-confirmed-installments');
        Object.assign(fields, { lastCycle: s(cycle), lastMovementDate, lastAmountCents: transaction.amountCents, lastInstallments: i(installments) });
        dest.push(namedDestination(movement, related, target(related.scope, 'movements', id + '-' + cycle), {
          ...transaction, isFromMandatory: b(true), recurringTemplateId: s(id), installmentCount: i(installments),
        }));
        if (confirmedCash) {
          historicalCategory = archivedCategory(movementCategory, related, [category.source.path]);
          association.evidence.push('reviewed-future-mandatory-category', 'reviewed-historical-cash-category');
        }
      }
      dest.unshift(namedDestination(doc, association, target(association.scope, 'mandatoryTemplates', id), fields, false));
      accept(linked, dest, association, historicalCategory);
    } catch (error) { reject(linked, error, association); }
  }

  for (const doc of ordered.filter(doc => kindOf(doc) === 'transfer')) {
    const outgoing = records.get('expenses/' + text(doc, 'expenseId'));
    const incoming = records.get('gains/' + text(doc, 'gainId'));
    const linked = [doc, ...[outgoing, incoming].filter((item): item is MigrationDocument => Boolean(item) && !entries.has(item!.path))];
    let association: Association | undefined;
    try {
      if (!outgoing || !incoming || linked.length !== 3) throw new Review('missing-or-reused-transfer-leg');
      const sourceId = text(doc, 'sourceBankId'), destinationId = text(doc, 'targetBankId');
      const source = entity(doc, sourceId, 'bank'), destination = entity(doc, destinationId, 'bank');
      if (source.id === destination.id) throw new Review('same-account-transfer');
      association = authorize(doc, [source.scope, destination.scope]);
      const transferId = canonicalId(outgoing);
      const projection = ([outgoing, incoming] as const).map((leg, direction) => {
        const expectedBank = direction === 0 ? sourceId : destinationId;
        const expectedDirection = direction === 0 ? 'outgoing' : 'incoming';
        const related = authorize(leg, [association!.scope]);
        if (related.uid !== association!.uid || !flag(leg, 'isBankTransfer') || text(leg, 'bankTransferPairId') !== idOf(doc) ||
            text(leg, 'bankTransferDirection') !== expectedDirection || text(leg, 'bankId') !== expectedBank ||
            text(leg, 'bankTransferSourceBankId') !== sourceId || text(leg, 'bankTransferTargetBankId') !== destinationId ||
            text(leg, 'bankTransferExpenseId') !== idOf(outgoing) || text(leg, 'bankTransferGainId') !== idOf(incoming) ||
            cents(leg, 'valueInCents') !== cents(doc, 'valueInCents') ||
            digest(requiredDate(leg, 'date')) !== digest(requiredDate(doc, 'date')))
          throw new Review('conflicting-transfer-leg');
        const fields = movementFields(leg, related.uid, direction === 0 ? source.id : destination.id, direction === 0 ? 'expense' : 'gain');
        return namedDestination(leg, related, target(related.scope, 'movements', direction === 0 ? transferId : transferId + '-credit'),
          { ...fields, operation: s(direction === 0 ? 'transfer-out' : 'transfer-in'), transferId: s(transferId) });
      });
      if (digest(projection[0].fields.status) !== digest(projection[1].fields.status)) throw new Review('conflicting-transfer-status');
      accept(linked, projection, association);
    } catch (error) { reject(linked, error, association); }
  }

  const signatures = new Map<string, MigrationDocument[]>();
  for (const doc of ordered.filter(doc => !entries.has(doc.path) && kindOf(doc) === 'movement')) {
    const signature = digest([doc.fields.personId, doc.fields.date, doc.fields.bankId, doc.fields.tagId, doc.fields.name,
      doc.fields.valueInCents, doc.path.split('/').at(-2)]);
    signatures.set(signature, [...(signatures.get(signature) ?? []), doc]);
  }
  for (const pending of signatures.values()) {
    if (pending.length > 1) {
      reject(pending, new Duplicate('identical-historical-movement-signature'));
      continue;
    }
    const [doc] = pending;
    let association: Association | undefined;
    try {
      if (flag(doc, 'isBankTransfer') || text(doc, 'bankTransferPairId')) throw new Review('unpaired-transfer-leg');
      const cash = doc.path.startsWith('cashRescues/') || flag(doc, 'isCashRescue');
      const accountless = !cash && doc.fields.bankId && 'nullValue' in doc.fields.bankId && !doc.fields.accountId;
      const bank = accountless ? null : entity(doc, text(doc, 'bankId') ?? text(doc, 'accountId'), 'bank');
      const category = cash ? undefined : entity(doc, text(doc, 'tagId') ?? text(doc, 'categoryId'), 'category');
      const sameBankReference = bank && ['bankId', 'accountId'].every(field => !text(doc, field) || text(doc, field) === idOf(bank.source));
      const sameCategoryReference = category && ['tagId', 'categoryId'].every(field => !text(doc, field) || text(doc, field) === category.id);
      const regular = !templateMovements.has(doc.path) && !flag(doc, 'isFromMandatory');
      const bankReview = approvedBankMovements.get(doc.path);
      if (bankReview) {
        if (!bank || !category || !sameBankReference || !sameCategoryReference || !regular ||
            bank.source.path !== bankReview.bankPath || category.source.path !== bankReview.categoryPath ||
            bank.scope.kind !== 'personal' || category.scope.kind !== 'personal' || bank.scope.id === category.scope.id)
          throw new Review('unverified-reviewed-bank-movement');
        const author = authorize(doc, [category.scope]);
        association = { scope: bank.scope, uid: bank.scope.id, evidence: [...author.evidence, 'reviewed-bank-preserve-author'] };
        const fields = standardMovement(doc, bank, category, author.uid);
        const movement = namedDestination(doc, association, target(association.scope, 'movements', canonicalId(doc)), fields);
        accept([doc], [movement], association, archivedCategory(category, association, [bank.source.path]));
        continue;
      }
      const cashReview = approvedCashCategories.get(doc.path);
      const cashScope: Scope | undefined = cashReview && accountless && cashReview.categoryPath === category?.source.path
        ? { kind: 'personal', id: cashReview.ownerUid } : undefined;
      const reviewedScope = bank?.scope ?? cashScope;
      const approvedBankCategory = bank && category && sameBankReference &&
        approvedCategories.has(categoryReviewKey(bank.source.path, category.source.path));
      const useHistoricalCategory = category && reviewedScope?.kind === 'personal' && category.scope.kind === 'personal' &&
        reviewedScope.id !== category.scope.id && text(doc, 'personId') === reviewedScope.id &&
        sameCategoryReference && regular && (cashScope || approvedBankCategory);
      association = authorize(doc, useHistoricalCategory ? [reviewedScope]
        : [bank?.scope, category?.scope].filter((scope): scope is Scope => scope !== undefined));
      const fields = category ? standardMovement(doc, bank, category, association.uid) :
        { ...movementFields(doc, association.uid, bank!.id, 'expense'), operation: s('cash-withdrawal') };
      let historicalCategory: HistoricalCategory | undefined;
      if (useHistoricalCategory) {
        historicalCategory = archivedCategory(category, association, bank ? [bank.source.path] : []);
        association.evidence.push(bank ? 'reviewed-historical-category' : 'reviewed-historical-cash-category');
      }
      accept([doc], [namedDestination(doc, association, target(association.scope, 'movements', canonicalId(doc)), fields)], association,
        historicalCategory);
    } catch (error) { reject([doc], error, association); }
  }

  if (entries.size !== ordered.length) throw Error('incomplete-source-dispositions');
  for (const decision of preservedExceptions) {
    const item = entries.get(decision.path);
    if (!item || item.kind === 'canonical' || !['REQUIRES_REVIEW', 'INVALID_SOURCE', 'DUPLICATE_CANDIDATE'].includes(item.classification) ||
        item.sourceHash !== decision.sourceHash || typeof decision.evidence !== 'string' || decision.evidence.trim().length < 12)
      throw Error('exception-does-not-match-pending-source');
    entries.set(decision.path, { ...item, classification: 'PRESERVED_EXCEPTION', evidence: [...(item.evidence ?? []), decision.evidence] });
  }
  for (const doc of ordered) {
    const classification = entries.get(doc.path)!.classification;
    counts.set(classification, (counts.get(classification) ?? 0) + 1);
  }
  let income = 0n, expense = 0n;
  for (const doc of projected.values()) {
    if (!doc.path.includes('/movements/') || doc.fields.status.stringValue !== 'posted') continue;
    const value = BigInt(doc.fields.amountCents.integerValue!);
    if (!doc.fields.operation && doc.fields.type.stringValue === 'gain') income += value;
    if (!doc.fields.operation && doc.fields.type.stringValue === 'expense') expense += value;
    if (!doc.fields.accountId.stringValue) continue;
    const account = doc.path.split('/').slice(0, 2).join('/') + '/bankAccounts/' + doc.fields.accountId.stringValue;
    effects.set(account, (effects.get(account) ?? 0n) + (doc.fields.type.stringValue === 'gain' ? value : -value));
  }
  return {
    entries: ordered.map(doc => entries.get(doc.path)!), steps,
    counts: Object.fromEntries(counts),
    financialImpact: { balanceAdjustmentCents: '0', historyIncomeCents: income.toString(), historyExpenseCents: expense.toString(),
      historicalNetByAccountCents: Object.fromEntries([...effects].map(([key, value]) => [key, value.toString()])) },
  };
}
