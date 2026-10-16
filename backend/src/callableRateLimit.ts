import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// [[Firebase Config]]: a cota vive no Firestore para funcionar entre instâncias da Function.
export async function enforceCallableRateLimit(uid: string, operation: string, limit: number) {
  const windowStart = Math.floor(Date.now() / 60_000);
  const id = createHash('sha256').update(`${uid}:${operation}`).digest('hex');
  const reference = getFirestore().doc(`callableRateLimits/${id}`);
  await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const count = snapshot.data()?.windowStart === windowStart && typeof snapshot.data()?.count === 'number'
      ? snapshot.data()!.count : 0;
    if (count >= limit) throw new HttpsError('resource-exhausted', 'Muitos pedidos. Aguarde um minuto e tente novamente.', {
      reason: 'rate-limit',
      retryAfterMs: Math.max(250, (windowStart + 1) * 60_000 - Date.now() + 250),
    });
    transaction.set(reference, {
      count: count + 1,
      windowStart,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
