import { authorizationGeneration, parseAuthorization } from '../../domain/authorization';
import { validId } from '../../domain/banks';
import { digest, flag, idOf, Review, scopeKey, text, type Identity, type MigrationDocument, type Scope } from './records';

export type OwnershipReview = {
  path: string;
  sourceHash: string;
  scope: Scope;
  ownerUid: string;
  evidence: string;
};

export function ownership(records: ReadonlyMap<string, MigrationDocument>, identities: Identity[], reviews: OwnershipReview[]) {
  const uidMap = new Map(identities.map(user => [user.uid, user]));
  const reviewMap = new Map(reviews.map(review => [review.path, review]));
  if (uidMap.size !== identities.length || reviewMap.size !== reviews.length ||
      identities.some(user => !validId(user.uid) || typeof user.disabled !== 'boolean'))
    throw Error('invalid-or-repeated-identity-evidence');
  for (const decision of reviews) {
    const source = records.get(decision.path);
    if (!source || digest(source) !== decision.sourceHash || decision.evidence.trim().length < 12)
      throw Error('review-does-not-match-source');
  }

  const groupMembers = new Map<string, Set<string>>();
  for (const user of identities) {
    if (user.disabled || !authorizationGeneration(user.generation)) continue;
    const doc = records.get('_authorizations/' + user.uid);
    if (!doc) continue;
    const groups = Object.fromEntries(Object.entries(doc.fields.groups?.mapValue?.fields ?? {})
      .map(([id, role]) => [id, role.stringValue]));
    const readOwners = doc.fields.readOwners?.arrayValue?.values?.map(owner => owner.stringValue) ??
      (doc.fields.readOwners?.arrayValue ? [] : undefined);
    try {
      const grant = parseAuthorization({ enabled: flag(doc, 'enabled'), generation: text(doc, 'generation'), groups, readOwners }, user.generation!);
      for (const id of Object.keys(grant.groups)) {
        if (!groupMembers.has(id)) groupMembers.set(id, new Set());
        groupMembers.get(id)!.add(user.uid);
      }
    } catch {
      // A disabled or inconsistent grant confers no authority.
    }
  }

  function validateScope(scope: Scope, uid: string) {
    if (!validId(scope.id) || !['personal', 'group'].includes(scope.kind) || uidMap.get(uid)?.disabled !== false) throw new Review('owner-uid-unverified');
    if (scope.kind === 'personal' && uid !== scope.id) throw new Review('personal-owner-mismatch');
    if (scope.kind === 'group' && (text(records.get('financialGroups/' + scope.id), 'status') !== 'active' ||
      !groupMembers.get(scope.id)?.has(uid))) throw new Review('author-without-current-group-grant');
  }

  return (doc: MigrationDocument, inherited: Scope[] = []) => {
    const parts = doc.path.split('/');
    const nested = parts[0] === 'financialGroups' && parts.length === 4 ? parts[1] : undefined;
    const bindingRoot = parts.length === 2 ? { banks: '_bankScopes', tags: '_categoryScopes' }[parts[0] as 'banks' | 'tags'] : undefined;
    const binding = bindingRoot && records.get(bindingRoot + '/' + idOf(doc)) || undefined;
    const fieldNames = ['groupId', 'financialGroupId', 'ledgerGroupId'];
    const groups = fieldNames.flatMap(name => {
      if (!doc.fields[name] || 'nullValue' in doc.fields[name]) return [];
      const group = text(doc, name);
      return validId(group) ? [group] : ['#invalid'];
    });
    const uid = text(doc, 'personId');
    const bindingKind = text(binding, 'scopeKind'), bindingId = text(binding, 'scopeId');
    if (binding && (Object.keys(binding.fields).length !== 2 || !validId(bindingId) || (bindingKind !== 'personal' && bindingKind !== 'group')))
      throw new Review('invalid-protected-binding');
    const protectedScope = binding && bindingKind && bindingId ? { kind: bindingKind as Scope['kind'], id: bindingId } : undefined;
    const evidence = [...inherited, ...(protectedScope ? [protectedScope] : []), ...(nested ? [{ kind: 'group' as const, id: nested }] : [])];
    const decision = reviewMap.get(doc.path);
    if (decision) {
      validateScope(decision.scope, decision.ownerUid);
      if (uid && uidMap.has(uid) && uid !== decision.ownerUid) throw new Review('review-conflicts-with-known-source-uid');
      if (evidence.some(scope => scopeKey(scope) !== scopeKey(decision.scope)) ||
          groups.some(group => decision.scope.kind !== 'group' || group !== decision.scope.id))
        throw new Review('review-conflicts-with-record-context');
      return { scope: decision.scope, uid: decision.ownerUid, evidence: ['individual-review', ...groups.map(() => 'declared-group')] };
    }
    if (!evidence.length) throw new Review('missing-independent-context-evidence');
    const scope = evidence[0];
    if (evidence.some(other => scopeKey(other) !== scopeKey(scope)) ||
      groups.some(id => scope.kind !== 'group' || id !== scope.id))
      throw new Review('conflicting-protected-or-related-context');
    if (!uid) throw new Review('missing-source-person-id');
    validateScope(scope, uid);
    return {
      scope, uid, evidence: ['auth-uid', ...(binding ? ['protected-binding'] : []),
        ...(nested ? ['protected-group-path'] : []), ...(inherited.length ? ['verified-dependencies'] : [])],
    };
  };
}
