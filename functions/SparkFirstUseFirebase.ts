import { getAuth } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, SPARK_TRANSFER_PROOF_PROTOCOL } from './sparkFinancialProtocol';

/** [[Autenticação]]: somente autorização emitida por autoridade confiável permite primeiro uso. */
export async function initializeSparkFirstUseFirebase(firestore: Firestore, actorId: string) {
  assertSparkDocumentId(actorId);
  const groupId = `first_${actorId}`;
  assertSparkDocumentId(groupId);
  const current = () => { if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.'); };
  current();
  return runTransaction(firestore, async transaction => {
    current();
    const userRef = doc(firestore, 'users', actorId);
    const profile = (await transaction.get(userRef)).data();
    if (!profile) throw new Error('Perfil indisponível para preparar o grupo.');
    if (profile.financialGroupId != null || profile.financialGroupRole != null || profile.financialLegacyCutoverAt != null) {
      if (profile.financialGroupId !== groupId || profile.financialGroupRole !== 'admin') return { status: 'existing-account' as const };
      const group = (await transaction.get(doc(firestore, 'financialGroups', groupId))).data();
      const cash = (await transaction.get(doc(firestore, 'financialGroups', groupId, 'sparkPositions', 'cash'))).data();
      const receipt = (await transaction.get(doc(firestore, 'financialGroups', groupId, 'sparkOperations', 'first_use_cash'))).data();
      current();
      if (group?.status !== 'active' || group.sparkProtocol !== SPARK_TRANSFER_PROOF_PROTOCOL || group.members?.[actorId] !== 'admin' || group.firstUseActorId !== actorId || cash?.kind !== 'cash' || receipt?.actorId !== actorId || receipt.kind !== 'account_opening' || receipt.accountId !== 'cash' || receipt.openingBalanceInCents !== 0) throw new Error('A inicialização financeira precisa ser reconciliada.');
      return { status: 'ready' as const, groupId, idempotent: true };
    }
    if (profile.sparkFirstUseRequested !== true) return { status: 'existing-account' as const };
    const permit = (await transaction.get(doc(firestore, 'sparkFirstUseLocks', actorId))).data();
    current();
    if (!permit || permit.status === 'reviewing') return { status: 'awaiting-authorization' as const };
    if (permit.schemaVersion !== 1 || permit.status !== 'authorized' || permit.actorId !== actorId || permit.groupId !== groupId || !(permit.profileCreatedAt instanceof Timestamp)
      || !(profile.createdAt instanceof Timestamp) || !permit.profileCreatedAt.isEqual(profile.createdAt) || !(permit.expiresAt instanceof Timestamp)
      || typeof permit.lockId !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(permit.lockId)
      || typeof permit.cycle !== 'string' || !/^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(permit.cycle)) throw new Error('Autorização de primeiro uso inválida.');
    const calendar = (await transaction.get(doc(firestore, 'sparkCivilMonths', permit.cycle))).data();
    if (!(calendar?.startAt instanceof Timestamp) || !(calendar?.endAt instanceof Timestamp)) throw new Error('Calendário financeiro indisponível.');
    current();
    const groupRef = doc(firestore, 'financialGroups', groupId);
    transaction.set(groupRef, { status: 'active', members: { [actorId]: 'admin' }, sparkProtocol: SPARK_TRANSFER_PROOF_PROTOCOL, firstUseActorId: actorId, createdAt: serverTimestamp() });
    transaction.update(userRef, { financialGroupId: groupId, financialGroupRole: 'admin', financialLegacyCutoverAt: serverTimestamp() });
    transaction.set(doc(firestore, 'financialGroups', groupId, 'sparkPositions', 'cash'), { schemaVersion: 1, kind: 'cash', active: true,
      balanceInCents: 0, revision: 0, lastOperationId: 'first_use_cash', nextActivationAt: null, updatedAt: serverTimestamp() });
    transaction.set(doc(firestore, 'financialGroups', groupId, 'sparkOperations', 'first_use_cash'), { schemaVersion: 1, actorId, kind: 'account_opening',
      accountId: 'cash', accountKind: 'cash', openingBalanceInCents: 0, note: null, createdAt: serverTimestamp() });
    current();
    return { status: 'ready' as const, groupId, idempotent: false };
  });
}
