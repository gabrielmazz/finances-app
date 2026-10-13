import { httpsCallable } from 'firebase/functions';
import { auth, firebaseFunctions } from '@/FirebaseConfig';

export async function setFinancialMigrationConsentFirebase(uid: string, actorId: string, clientActionId: string, action: 'approve' | 'revoke') {
  if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
  const result = await httpsCallable<{
    action: 'approve' | 'revoke'; actorId: string; clientActionId: string;
  }, { approved: boolean; groupId: string }>(firebaseFunctions, 'financialMigrationConsent')({
    action, actorId, clientActionId,
  });
  if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou.');
  return result.data;
}
