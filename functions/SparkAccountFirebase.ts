import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, runSparkOperation, sparkText, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkOpeningInput = SparkIdentity & {
  accountId: string; kind: 'bank' | 'cash'; note?: string | null;
};

/** Criação zero por identidade da conta; não deriva nem importa saldo do histórico. */
export async function openSparkAccountFirebase(firestore: Firestore, input: SparkOpeningInput) {
  input = { ...input };
  assertSparkDocumentId(input.accountId);
  if (!['bank', 'cash'].includes(input.kind) || (input.kind === 'cash') !== (input.accountId === 'cash')) {
    throw new Error('Tipo ou identidade da conta inválidos.');
  }
  const material = { kind: 'account_opening', accountId: input.accountId,
    accountKind: input.kind, openingBalanceInCents: 0, note: sparkText(input.note, 2000) };
  return runSparkOperation(firestore, input, (_transaction, role) => {
    if (role !== 'admin') throw new Error('A abertura exige administrador do grupo.');
    return material;
  }, async transaction => {
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', input.accountId);
    if ((await transaction.get(ref)).exists()) throw new Error('Esta conta já possui abertura.');
    transaction.set(ref, { schemaVersion: 1, kind: input.kind, active: true, balanceInCents: 0,
      revision: 0, lastOperationId: input.clientActionId, nextActivationAt: null, updatedAt: serverTimestamp() });
  });
}
