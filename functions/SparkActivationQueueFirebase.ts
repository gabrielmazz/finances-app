import { getAuth } from 'firebase/auth';
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, startAfter, Timestamp, where,
  type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';
import { assertSparkDocumentId, parseSparkStoredPosition } from './sparkFinancialProtocol';
import { refreshSparkMonthlyOpeningFirebase, readCurrentSparkPositionFirebase } from './SparkMonthlyActivationFirebase';
import { getSparkPreparationProgress, SparkPreparationError, type SparkHistoryProof, type SparkPreparationOptions } from './SparkHistoryFirebase';

export type SparkPendingActivation = { accountId: string; name: string };
const assertSession = (firestore: Firestore, actorId: string) => {
  if (getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
};

/** [[Preparação Histórica Spark]]: descobre apenas fronteiras vencidas, sem confirmar dinheiro durante a leitura. */
export async function readSparkPendingActivationsFirebase(firestore: Firestore, actorId: string): Promise<SparkPendingActivation[]> {
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) return [];
  const result: SparkPendingActivation[] = []; let cursor: QueryDocumentSnapshot | undefined;
  do {
    assertSession(firestore, actorId);
    const page = await getDocsFromServer(query(collection(firestore, 'financialGroups', context.groupId, 'sparkPositions'),
      where('active', '==', true), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
    for (const row of page.docs) {
      const position = parseSparkStoredPosition(row.data());
      if (position.kind !== 'bank' || !position.nextActivationAt || position.nextActivationAt.toMillis() > Date.now()) continue;
      const catalog = (await getDocFromServer(doc(firestore, 'financialGroups', context.groupId, 'sparkAccountCatalog', row.id))).data();
      result.push({ accountId: row.id, name: typeof catalog?.name === 'string' ? catalog.name : 'Banco sem nome' });
    }
    if (page.size < 200) break; cursor = page.docs.at(-1);
  } while (cursor);
  if ((await getSparkContextFirebase(firestore, actorId))?.groupId !== context.groupId) throw new Error('O acesso ao grupo financeiro mudou.');
  assertSession(firestore, actorId); return result;
}

/** Recupera no servidor a prova privada da mesma cabeça; recarregar não reinicia o trabalho confirmado. */
export async function advanceSparkPendingActivationFirebase(firestore: Firestore, actorId: string, accountId: string,
  newId: () => string, options?: SparkPreparationOptions, maxPages = 20) {
  assertSparkDocumentId(accountId);
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context) throw new Error('Grupo Spark indisponível.');
  if (options?.signal?.aborted) throw new SparkPreparationError('paused', 'Preparação pausada.');
  const group = doc(firestore, 'financialGroups', context.groupId);
  const raw = (await getDocFromServer(doc(group, 'sparkPositions', accountId))).data();
  const position = parseSparkStoredPosition(raw ?? {});
  if (!position.active || position.kind !== 'bank') throw new Error('Selecione um banco ativo.');
  if (!position.nextActivationAt || position.nextActivationAt.toMillis() > Date.now()) {
    await readCurrentSparkPositionFirebase(firestore, { ...context, accountId });
    return { status: 'current' as const };
  }
  const candidates = await getDocsFromServer(query(collection(group, 'sparkHistoryProofs'), where('actorId', '==', actorId),
    where('accountId', '==', accountId), where('purpose', '==', 'activation'), where('headRevision', '==', position.revision),
    where('headOperationId', '==', position.lastOperationId), orderBy('asOf', 'desc'), limit(10)));
  const candidate = candidates.docs.find(row => {
    const proof = row.data() as SparkHistoryProof;
    return proof.asOf instanceof Timestamp && raw?.updatedAt instanceof Timestamp
      && proof.asOf.toMillis() >= Math.max(position.nextActivationAt!.toMillis(), raw.updatedAt.toMillis())
      && proof.asOf.toMillis() <= Date.now() && (!proof.nextCheckpointAt || proof.nextCheckpointAt.toMillis() > Date.now());
  });
  assertSession(firestore, actorId);
  const clientActionId = candidate?.id ?? newId();
  const result = await refreshSparkMonthlyOpeningFirebase(firestore, { ...context, accountId, clientActionId }, maxPages, options);
  assertSession(firestore, actorId);
  return result.status === 'current' ? { status: 'current' as const }
    : { status: 'preparing' as const, progress: getSparkPreparationProgress(result.proof), proofId: clientActionId };
}
