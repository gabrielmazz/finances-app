import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { compareSparkTime, prepareSparkHistoryProofFirebase, SparkPreparationError, type SparkHistoryProof, type SparkPreparationOptions } from './SparkHistoryFirebase';
import { assertSparkBalance, assertSparkDocumentId, parseSparkPosition, runSparkOperation, SPARK_MAX_CENTS, type SparkIdentity } from './sparkFinancialProtocol';

export type SparkMonthlyActivationInput = SparkIdentity & { accountId: string; asOf: Timestamp; expectedRevision: number };

/** [[Protocolo Financeiro Spark]]: materializa uma contagem autorizada, sem criar outro movimento histórico. */
export async function activateSparkMonthlyOpeningFirebase(firestore: Firestore, input: SparkMonthlyActivationInput) {
  input = { ...input }; assertSparkDocumentId(input.accountId);
  if (!(input.asOf instanceof Timestamp) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error('Instante ou revisão da ativação inválidos.');
  }
  const groupRef = doc(firestore, 'financialGroups', input.groupId);
  const material = { kind: 'monthly_activation', accountId: input.accountId, proofId: input.clientActionId,
    asOf: input.asOf, expectedRevision: input.expectedRevision };
  return runSparkOperation(firestore, { groupId: input.groupId, actorId: input.actorId, clientActionId: input.clientActionId }, () => material,
    async transaction => {
      const positionRef = doc(groupRef, 'sparkPositions', input.accountId);
      const positionData = (await transaction.get(positionRef)).data() ?? {};
      const position = parseSparkPosition(positionData);
      const proof = (await transaction.get(doc(groupRef, 'sparkHistoryProofs', input.clientActionId))).data() as SparkHistoryProof | undefined;
      if (!proof || proof.actorId !== input.actorId || proof.accountId !== input.accountId || proof.purpose !== 'activation'
        || proof.phase !== 'done' || !proof.asOf.isEqual(input.asOf)) throw new Error('Conclua a projeção de ativação correspondente.');
      if (position.revision !== input.expectedRevision || proof.headRevision !== position.revision || proof.headOperationId !== position.lastOperationId) {
        throw new Error('A projeção de ativação ficou desatualizada. Prepare outra com novo identificador.');
      }
      if (position.kind !== 'bank' || !position.nextActivationAt || compareSparkTime(input.asOf, position.nextActivationAt) < 0
        || compareSparkTime(input.asOf, positionData.updatedAt) < 0 || !proof.baselineAt || !proof.baselineOperationId
        || compareSparkTime(proof.baselineAt, position.nextActivationAt) < 0
        || compareSparkTime(input.asOf, Timestamp.now()) > 0
        || (proof.nextCheckpointAt && compareSparkTime(Timestamp.now(), proof.nextCheckpointAt) >= 0)) {
        throw new Error('A projeção não cobre as aberturas vencidas no instante atual.');
      }
      // A autoridade do saldo vem da cadeia certificada; a ativação não solicita outra justificativa.
      assertSparkBalance('bank', proof.balanceInCents, 'Contagem mensal previamente autorizada.');
      const currentEffectInCents = proof.balanceInCents - position.balanceInCents;
      if (!Number.isSafeInteger(currentEffectInCents) || Math.abs(currentEffectInCents) > 2 * SPARK_MAX_CENTS) throw new Error('Efeito de ativação inválido.');
      transaction.update(positionRef, { balanceInCents: proof.balanceInCents, revision: position.revision + 1,
        lastOperationId: input.clientActionId, nextActivationAt: proof.nextCheckpointAt, updatedAt: serverTimestamp() });
      transaction.set(doc(groupRef, 'sparkCheckpoints', input.accountId), {
        operationId: proof.baselineOperationId, effectiveAt: proof.baselineAt, countedBalanceInCents: proof.baselineBalanceInCents,
        includesBoundary: proof.includesBoundary, activationOperationId: input.clientActionId,
      });
      return { previousOperationId: position.lastOperationId, baselineOperationId: proof.baselineOperationId,
        effectiveAt: proof.baselineAt, targetBalanceInCents: proof.baselineBalanceInCents, includesBoundary: proof.includesBoundary,
        projectedBalanceInCents: proof.balanceInCents, differenceInCents: 0, currentEffectInCents, nextActivationAt: proof.nextCheckpointAt };
    });
}

/** A leitura guardada usa request.time; cache e relógio do aparelho não certificam atualidade. */
export async function readCurrentSparkPositionFirebase(firestore: Firestore, input: Pick<SparkIdentity, 'groupId' | 'actorId'> & { accountId: string }) {
  input = { ...input }; [input.groupId, input.actorId, input.accountId].forEach(assertSparkDocumentId);
  return runTransaction(firestore, async transaction => {
    if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
    const position = parseSparkPosition((await transaction.get(doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', input.accountId))).data() ?? {});
    // Documento virtual: Rules conferem o prazo na posição protegida, sem gravar um relógio.
    await transaction.get(doc(firestore, 'financialGroups', input.groupId, 'sparkCurrentPositions', input.accountId));
    if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
    return position;
  });
}

/** Retomável: uma projeção parcial ou posição não conferida pelo servidor não retorna status current. */
export async function refreshSparkMonthlyOpeningFirebase(firestore: Firestore, input: SparkIdentity & { accountId: string }, maxSteps = 100, options?: SparkPreparationOptions) {
  if (options?.signal?.aborted) throw new SparkPreparationError('paused', 'Preparação pausada.');
  input = { ...input }; assertSparkDocumentId(input.accountId);
  const positionRef = doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', input.accountId);
  const position = parseSparkPosition((await getDocFromServer(positionRef)).data() ?? {});
  if (!position.nextActivationAt || compareSparkTime(position.nextActivationAt, Timestamp.now()) > 0) {
    return { status: 'current' as const, position: await readCurrentSparkPositionFirebase(firestore, input) };
  }
  // Reutilizar a data original permite retomar em outra sessão sem trocar a intenção da prova.
  const existing = (await getDocFromServer(doc(firestore, 'financialGroups', input.groupId, 'sparkHistoryProofs', input.clientActionId))).data() as SparkHistoryProof | undefined;
  const proof = await prepareSparkHistoryProofFirebase(firestore, { ...input, asOf: existing?.asOf ?? Timestamp.now(), purpose: 'activation' }, maxSteps, options);
  if (proof.phase !== 'done') return { status: 'preparing' as const, proof };
  if (options?.signal?.aborted) throw new SparkPreparationError('paused', 'Preparação pausada antes da ativação.');
  await activateSparkMonthlyOpeningFirebase(firestore, { ...input, asOf: proof.asOf, expectedRevision: proof.headRevision });
  // Uma nova fronteira pode vencer até esta leitura; conferir antes de expor como atual.
  const current = await readCurrentSparkPositionFirebase(firestore, input);
  return { status: 'current' as const, position: current };
}
