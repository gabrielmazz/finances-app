import { secureOnCall } from './secureCallable';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { assertClientActionId } from '../../utils/financialLedger';
import { enforceCallableRateLimit } from './callableRateLimit';

// [[Gerenciamento de Bancos]]: cada membro autoriza um corte específico antes de qualquer leitura legada.
export const financialMigrationConsent = secureOnCall( async request => {
  const memberId = request.auth?.uid;
  if (!memberId) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  const data = request.data as Record<string, unknown> | null;
  const actorId = data?.actorId;
  const clientActionId = data?.clientActionId;
  if (typeof actorId !== 'string' || !actorId || actorId.includes('/') || actorId === memberId || typeof clientActionId !== 'string') {
    throw new HttpsError('invalid-argument', 'Informe o administrador e o identificador da migração.');
  }
  try { assertClientActionId(clientActionId); }
  catch { throw new HttpsError('invalid-argument', 'Identificador da migração inválido.'); }
  const action = data?.action;
  if (action !== 'approve' && action !== 'revoke') throw new HttpsError('invalid-argument', 'Ação inválida.');
  await enforceCallableRateLimit(memberId, 'migration-consent', 10);
  const db = getFirestore();
  const groupId = `group-${actorId}-${clientActionId}`;
  const memberRef = db.doc(`users/${memberId}`);
  const actorRef = db.doc(`users/${actorId}`);
  const consentRef = db.doc(`financialMigrationConsents/${groupId}/members/${memberId}`);
  if (action === 'revoke') {
    await consentRef.delete();
    return { approved: false, groupId };
  }
  await db.runTransaction(async transaction => {
    const [member, actor, group, memberCutover, actorCutover] = await Promise.all([
      transaction.get(memberRef), transaction.get(actorRef), transaction.get(db.doc(`financialGroups/${groupId}`)),
      transaction.get(db.doc(`financialCutovers/${memberId}`)), transaction.get(db.doc(`financialCutovers/${actorId}`)),
    ]);
    if (!member.exists || !actor.exists || member.data()?.financialGroupId || actor.data()?.financialGroupId
      || memberCutover.exists || actorCutover.exists
      || (group.exists && (group.data()?.status !== 'migrating' || group.data()?.createdBy !== actorId
        || group.data()?.members?.[actorId] !== 'admin' || group.data()?.members?.[memberId] !== 'member'))) {
      throw new HttpsError('failed-precondition', 'As contas já mudaram de grupo ou não estão disponíveis.');
    }
    transaction.set(consentRef, {
      actorId, memberId, groupId,
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
      approvedAt: FieldValue.serverTimestamp(),
    });
  });
  return { approved: true, groupId };
});
