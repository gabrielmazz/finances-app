import { validId } from '../../domain/banks';
import { cents, digest, flag, requiredDate, Review, target, text, type Identity, type MigrationDocument, type Scope } from './records';

const supported = new Set(['bankAccounts', 'accountOpenings', 'categories', 'movements', 'mandatoryTemplates']);
const memberId = /^[A-Za-z0-9]{20}(?:-credit|-\d{4}-(?:0[1-9]|1[0-2]))?$/;

export function verifyCanonical(doc: MigrationDocument, documents: ReadonlyMap<string, MigrationDocument>, identities: Identity[]) {
  const parts = doc.path.split('/');
  const [, key, collection, id] = parts;
  const [kind, contextId, extra] = key?.split(':') ?? [];
  if (extra !== undefined || !validId(contextId) || (kind !== 'personal' && kind !== 'group')) throw new Review('unrecognized-canonical-context');
  const scope: Scope = { kind, id: contextId };
  if (kind === 'personal' ? !identities.some(user => user.uid === contextId) :
      !documents.has('financialGroups/' + contextId)) throw new Review('unverified-canonical-context');
  if (parts.length === 2) {
    if (text(doc, 'scopeKind') !== kind || text(doc, 'scopeId') !== contextId) throw new Review('unrecognized-context-metadata');
    return;
  }
  if (parts.length !== 4 || !supported.has(collection)) throw new Review('unrecognized-canonical-collection');
  if (collection !== 'mandatoryTemplates' &&
      (text(doc, 'scopeKind') !== kind || text(doc, 'scopeId') !== contextId || doc.fields.schemaVersion?.integerValue !== '1'))
    throw new Review('canonical-scope-or-schema-mismatch');

  const related = (name: string, value: string | undefined) => {
    if (!value || value.includes('/')) throw new Review('missing-canonical-reference');
    const record = documents.get(target(scope, name, value));
    if (!record || text(record, 'scopeId') !== contextId || text(record, 'scopeKind') !== kind)
      throw new Review('invalid-canonical-reference');
    return record;
  };
  if (collection === 'bankAccounts') {
    if (!/^[A-Za-z0-9]{20}$/.test(id) || !['active', 'archived'].includes(text(doc, 'status') ?? '') || !text(doc, 'name'))
      throw new Review('invalid-canonical-account');
    const opening = documents.get(target(scope, 'accountOpenings', id));
    if (!opening && !doc.fields.openingDate && !doc.fields.initialBalanceCents && !doc.fields.balanceCents && text(doc, 'historicalSourcePath')) return;
    if (!opening || text(opening, 'accountId') !== id || text(opening, 'scopeId') !== contextId || text(opening, 'scopeKind') !== kind ||
        cents(doc, 'initialBalanceCents') !== cents(opening, 'amountCents') ||
        digest(requiredDate(doc, 'openingDate')) !== digest(requiredDate(opening, 'date')))
      throw new Review('invalid-canonical-bank-opening');
    if (doc.fields.balanceCents) cents(doc, 'balanceCents');
  } else if (collection === 'accountOpenings') {
    related('bankAccounts', text(doc, 'accountId'));
    if (text(doc, 'accountId') !== id || !['opening', 'reference'].includes(text(doc, 'type') ?? '') ||
        (text(doc, 'type') === 'reference' && (!flag(doc, 'confirmed') || !flag(doc, 'pendingReviewed'))))
      throw new Review('invalid-canonical-opening');
  } else if (collection === 'categories') {
    if (!text(doc, 'name') || !['active', 'archived'].includes(text(doc, 'status') ?? '') ||
        (!['expense', 'gain', 'both'].includes(text(doc, 'usageType') ?? '') && (!doc.fields.usageType || !('nullValue' in doc.fields.usageType))))
      throw new Review('invalid-canonical-category');
  } else if (collection === 'mandatoryTemplates') {
    if (!text(doc, 'name') || !['gain', 'expense'].includes(text(doc, 'type') ?? '') || cents(doc, 'valueInCents') <= 0)
      throw new Review('invalid-canonical-template');
    if (text(doc, 'categorySource') !== 'new') throw new Review('canonical-template-uses-legacy-category');
    related('categories', text(doc, 'categoryId'));
  } else {
    if (!memberId.test(id) || !['posted', 'cancelled'].includes(text(doc, 'status') ?? '') ||
        !['gain', 'expense'].includes(text(doc, 'type') ?? '') || cents(doc, 'amountCents') <= 0)
      throw new Review('invalid-canonical-movement');
    requiredDate(doc, 'date');
    const operation = text(doc, 'operation');
    if (operation || !doc.fields.accountId || !('nullValue' in doc.fields.accountId) || !text(doc, 'historicalSourcePath'))
      related('bankAccounts', text(doc, 'accountId'));
    if (operation === 'transfer-out' || operation === 'transfer-in') {
      const outgoing = operation === 'transfer-out', transfer = text(doc, 'transferId');
      if (!transfer || id !== transfer + (outgoing ? '' : '-credit')) throw new Review('invalid-canonical-transfer-id');
      const other = related('movements', outgoing ? transfer + '-credit' : transfer);
      if (text(other, 'operation') !== (outgoing ? 'transfer-in' : 'transfer-out') || text(other, 'transferId') !== transfer ||
          text(other, 'accountId') === text(doc, 'accountId') || text(other, 'status') !== text(doc, 'status') ||
          cents(other, 'amountCents') !== cents(doc, 'amountCents') || digest(requiredDate(other, 'date')) !== digest(requiredDate(doc, 'date')))
        throw new Review('conflicting-canonical-transfer');
    } else if (!operation) {
      if (text(doc, 'categorySource') !== 'new') throw new Review('canonical-movement-uses-legacy-category');
      related('categories', text(doc, 'categoryId'));
    } else if (operation !== 'cash-withdrawal' || text(doc, 'type') !== 'expense') throw new Review('unrecognized-canonical-operation');
  }
}
