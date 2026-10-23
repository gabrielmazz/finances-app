import { doc, serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore';
import type { SparkIdentity } from './sparkFinancialProtocol';
import { validateSparkMovementDetails, type SparkMovementDetails } from '../utils/sparkMovementDetails';

export function sparkMovementDetailsMaterial(input: SparkMovementDetails | undefined) {
  const details = input === undefined ? null : validateSparkMovementDetails(input);
  return { details, material: details ? { hasDetails: true as const, details } : {} };
}

/** A escrita devolvida só roda depois de todas as leituras de conta/categoria/checkpoint. */
export async function prepareSparkMovementDetails(firestore: Firestore, transaction: Transaction, identity: SparkIdentity, details: SparkMovementDetails | null) {
  if (!details) return () => {};
  const ref = doc(firestore, 'financialGroups', identity.groupId, 'sparkMovementDetails', identity.clientActionId);
  if ((await transaction.get(ref)).exists()) throw new Error('Detalhes anteriores exigem revisão antes do lançamento.');
  return () => transaction.set(ref, { schemaVersion: 1, actorId: identity.actorId, operationId: identity.clientActionId, ...details, createdAt: serverTimestamp() });
}
