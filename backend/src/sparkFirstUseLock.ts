import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Read inside the caller's write transaction so a concurrent lock forces a retry. */
export async function assertFirstUseUnlocked(transaction: Transaction, db: Firestore, userIds: string[]): Promise<void> {
  const snapshots = await Promise.all([...new Set(userIds)].map(uid =>
    transaction.get(db.doc(`sparkFirstUseLocks/${uid}`))));
  if (snapshots.some(snapshot => snapshot.exists)) {
    throw new HttpsError('failed-precondition', 'A conta está em preparação financeira. Tente novamente após a conclusão.');
  }
}
