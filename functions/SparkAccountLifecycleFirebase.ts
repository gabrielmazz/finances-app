import { doc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { assertSparkDocumentId, parseSparkStoredPosition, runSparkOperation, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkAccountLifecycleInput = SparkIdentity & {
  accountId: string; expectedPositionRevision: number; expectedLifecycleRevision: number | null; isActive: boolean; archived: boolean;
};

/** [[Ciclo de Vida de Contas Spark]]: estado separado da cadeia financeira, sem apagar saldo ou histórico. */
export async function setSparkAccountLifecycleFirebase(firestore: Firestore, input: SparkAccountLifecycleInput) {
  input = { ...input }; assertSparkDocumentId(input.accountId);
  if (typeof input.isActive !== 'boolean' || typeof input.archived !== 'boolean'
    || !Number.isSafeInteger(input.expectedPositionRevision) || input.expectedPositionRevision < 0 || input.expectedPositionRevision >= SPARK_MAX_CENTS
    || input.expectedLifecycleRevision !== null && (!Number.isSafeInteger(input.expectedLifecycleRevision) || input.expectedLifecycleRevision < 0 || input.expectedLifecycleRevision >= SPARK_MAX_CENTS)) throw new Error('Estado ou revisão da conta inválidos.');
  const identity = { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId };
  return runSparkOperation(firestore, identity, (_transaction, role) => {
    if (role !== 'admin') throw new Error('Alterar o estado da conta exige administrador do grupo.');
    return { kind: 'account_lifecycle_update', accountId: input.accountId, expectedPositionRevision: input.expectedPositionRevision,
      expectedLifecycleRevision: input.expectedLifecycleRevision, isActive: input.isActive, archived: input.archived };
  }, async transaction => {
    const group = doc(firestore, 'financialGroups', input.groupId);
    const positionRef = doc(group, 'sparkPositions', input.accountId), ref = doc(group, 'sparkAccountStates', input.accountId);
    const position = (await transaction.get(positionRef)).data(), previous = (await transaction.get(ref)).data();
    if (!position || typeof position.active !== 'boolean') throw new Error('Conta indisponível.');
    const parsed = parseSparkStoredPosition(position);
    if (parsed.kind === 'cash') throw new Error('O Caixa canônico deve permanecer ativo.');
    if (parsed.revision !== input.expectedPositionRevision || (previous?.revision ?? null) !== input.expectedLifecycleRevision) throw new Error('A conta mudou. Atualize a confirmação.');
    if (position.active !== (previous ? previous.isActive && !previous.archived : true)) throw new Error('O estado da conta precisa ser reconciliado antes da edição.');
    transaction.set(ref, { schemaVersion: 1, accountId: input.accountId, isActive: input.isActive, archived: input.archived,
      archivedAt: input.archived ? previous?.archivedAt ?? serverTimestamp() : null,
      revision: (previous?.revision ?? -1) + 1, lastOperationId: input.clientActionId, updatedAt: serverTimestamp() });
    transaction.update(positionRef, { active: input.isActive && !input.archived });
  });
}
