import { secureOnCall } from './secureCallable';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { enforceCallableRateLimit } from './callableRateLimit';

// [[Autenticação]]: sem política de retenção aprovada, a solicitação é registrada para tratamento controlado.
export const requestAccountDeletion = secureOnCall( async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta.');
  await enforceCallableRateLimit(uid, 'account-deletion', 3);
  const db = getFirestore();
  const profile = await db.doc(`users/${uid}`).get();
  if (!profile.exists) throw new HttpsError('failed-precondition', 'Perfil não encontrado.');
  const reference = db.doc(`accountDeletionRequests/${uid}`);
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(reference);
    if (!existing.exists) transaction.create(reference, {
      uid, status: 'pending-retention-policy', requestedAt: FieldValue.serverTimestamp(),
    });
  });
  return { status: 'pending-retention-policy' };
});
