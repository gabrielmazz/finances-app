import { getAuth } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { assertClientActionId } from '../utils/financialLedger';
import { assertSparkDocumentId, parseSparkPosition, SPARK_TRANSFER_PROOF_PROTOCOL, type SparkIdentity } from './sparkFinancialProtocol';
import { SparkPreparationError, estimateSparkPreparation, SPARK_HISTORY_PAGE_SIZE, SPARK_PREPARATION_DAY_MS, SPARK_PREPARATION_LEASE_PAGES,
  SPARK_PREPARATION_MAX_CALL_PAGES, SPARK_PREPARATION_PAGE_READ_UNITS, SPARK_PREPARATION_GRANT_READ_UNITS,
  SPARK_PREPARATION_GRANT_WRITES, SPARK_PREPARATION_UID_READ_UNITS, SPARK_PREPARATION_PROJECT_READ_UNITS,
  SPARK_PREPARATION_UID_WRITES, SPARK_PREPARATION_PROJECT_WRITES, type SparkPreparationMetrics } from '../utils/sparkPreparationBudget';

export type SparkHistoryProof = {
  schemaVersion: 1; actorId: string; accountId: string; asOf: Timestamp; purpose: 'instant' | 'monthly' | 'activation';
  headRevision: number; headOperationId: string;
  phase: 'checkpoints' | 'movements' | 'done'; cursorRevision: number; nextOperationId: string | null;
  baselineAt: Timestamp | null; baselineRevision: number; baselineBalanceInCents: number; includesBoundary: boolean;
  baselineOperationId: string | null; nextCheckpointAt: Timestamp | null;
  latestCheckpointAt: Timestamp | null; balanceInCents: number; tailDeltaInCents: number;
  createdAt?: Timestamp; updatedAt?: Timestamp;
  segmentId: string | null;
  workRevision: number; leaseRevision: number; leaseWindowStartInMillis: number; leaseEndWorkRevision: number;
};
export type SparkHistoryInput = SparkIdentity & { accountId: string; asOf: Timestamp; purpose: SparkHistoryProof['purpose'] };
export { compareSparkTime, sparkHistoryEvent } from './sparkHistoryEvent';
import { compareSparkTime, sparkHistoryEvent } from './sparkHistoryEvent';
import { findSparkHistorySegment, applySparkHistorySegment } from './sparkHistorySegments';
export type SparkPreparationOptions = { signal?: AbortSignal; metrics?: SparkPreparationMetrics; useSegments?: boolean };
export { SparkPreparationError } from '../utils/sparkPreparationBudget';
function assertNotPaused(options?: SparkPreparationOptions) {
  if (options?.signal?.aborted) throw new SparkPreparationError('paused', 'Preparação pausada; o progresso confirmado foi preservado.');
}
function beginAttempt(options?: SparkPreparationOptions) { assertNotPaused(options); if (options?.metrics) options.metrics.attempts += 1; }
async function readHistory(transaction: Transaction, ref: ReturnType<typeof doc>, options?: SparkPreparationOptions) {
  if (options?.metrics) options.metrics.explicitReads += 1;
  return transaction.get(ref);
}
function confirmed(options: SparkPreparationOptions | undefined, writes: number, grant = false) {
  if (options?.metrics) { options.metrics.confirmedWrites += writes; options.metrics.grants += grant ? 1 : 0; options.metrics.pages += grant ? 0 : writes; }
}
const budgetDay = () => Math.floor(Date.now() / SPARK_PREPARATION_DAY_MS) * SPARK_PREPARATION_DAY_MS;

function remainingPages(proof: SparkHistoryProof) {
  return proof.phase === 'done' ? 0 : Math.ceil(Math.max(0, proof.cursorRevision + 1) / SPARK_HISTORY_PAGE_SIZE) + 1
    + (proof.phase === 'checkpoints' ? Math.ceil((proof.headRevision + 1) / SPARK_HISTORY_PAGE_SIZE) + 1 : 0);
}

/** [[Protocolo Financeiro Spark]]: links por conta provam completude, sem confiar em queries do cliente. */
export function isSparkProofMovementIncluded(proof: SparkHistoryProof, at: Timestamp) {
  return (!proof.baselineAt || compareSparkTime(at, proof.baselineAt) > 0
    || (proof.includesBoundary && compareSparkTime(at, proof.baselineAt) === 0))
    && (compareSparkTime(at, proof.asOf) < 0 || (compareSparkTime(at, proof.asOf) === 0 && proof.purpose !== 'monthly'));
}

export function advanceSparkHistory(proof: SparkHistoryProof, operation?: Record<string, any>): SparkHistoryProof {
  if (proof.phase === 'done') return proof;
  if (proof.cursorRevision < 0) {
    if (proof.nextOperationId !== null) throw new Error('Raiz do histórico inválida.');
    return proof.phase === 'checkpoints'
      ? { ...proof, phase: 'movements', cursorRevision: proof.headRevision, nextOperationId: proof.headOperationId,
        balanceInCents: proof.baselineBalanceInCents }
      : { ...proof, phase: 'done' };
  }
  if (!operation) throw new Error('Histórico incompleto: operação ausente.');
  const event = sparkHistoryEvent(operation, proof.accountId);
  if (event.revision !== proof.cursorRevision || !(event.at instanceof Timestamp)
    || (proof.cursorRevision === 0 ? event.previous !== null : typeof event.previous !== 'string')) {
    throw new Error('Histórico incompleto ou revisão inválida.');
  }
  const next = { ...proof, cursorRevision: proof.cursorRevision - 1, nextOperationId: event.previous };
  if (proof.phase === 'checkpoints') {
    if (!proof.createdAt) throw new Error('Projeção sem instante de criação certificado.');
    if (event.checkpoint && compareSparkTime(event.at, proof.createdAt) <= 0
      && (!next.latestCheckpointAt || compareSparkTime(event.at, next.latestCheckpointAt) > 0)) {
      next.latestCheckpointAt = event.at;
    }
    if (event.checkpoint && compareSparkTime(event.at, proof.asOf) > 0
      && (!next.nextCheckpointAt || compareSparkTime(event.at, next.nextCheckpointAt) < 0)) next.nextCheckpointAt = event.at;
    if (event.checkpoint && compareSparkTime(event.at, proof.asOf) <= 0
      && (!proof.baselineAt || compareSparkTime(event.at, proof.baselineAt) > 0
        || (compareSparkTime(event.at, proof.baselineAt) === 0 && event.revision > proof.baselineRevision))) {
      Object.assign(next, { baselineAt: event.at, baselineRevision: event.revision,
        baselineOperationId: proof.nextOperationId, baselineBalanceInCents: event.counted, includesBoundary: event.inclusive });
    }
  } else if (!event.checkpoint) {
    // Substituição conserva dois instantes; somar só o líquido apagaria a diferença entre as datas.
    let balanceDelta = 0; let tailDelta = 0;
    for (const [at, delta] of [[event.at, event.delta], [event.inverseAt, event.inverseDelta]] as const) {
      if (isSparkProofMovementIncluded(proof, at)) balanceDelta += delta;
      const asOfComparison = compareSparkTime(at, proof.asOf);
      if (asOfComparison > 0 || (asOfComparison === 0 && proof.purpose === 'monthly')) tailDelta += delta;
    }
    // Somar o efeito líquido do evento evita arredondamento intermediário perto de MAX_SAFE_INTEGER.
    if (![balanceDelta, tailDelta].every(Number.isSafeInteger)) throw new Error('Histórico excede o limite inteiro seguro.');
    next.balanceInCents += balanceDelta; next.tailDeltaInCents += tailDelta;
  }
  if (![next.balanceInCents, next.tailDeltaInCents].every(Number.isSafeInteger)) throw new Error('Histórico excede o limite inteiro seguro.');
  return next;
}

async function assertHistoryAccess(firestore: Firestore, input: SparkIdentity, transaction: Transaction, purpose: SparkHistoryProof['purpose'], options?: SparkPreparationOptions) {
  if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
  const group = (await readHistory(transaction, doc(firestore, 'financialGroups', input.groupId), options)).data();
  const role = group?.members?.[input.actorId];
  if (group?.sparkProtocol !== SPARK_TRANSFER_PROOF_PROTOCOL || group.status !== 'active'
    || !(role === 'admin' || (purpose === 'activation' && role === 'member'))) {
    throw new Error('A projeção exige administrador de grupo Spark ativo.');
  }
}

async function assertHistoryHead(firestore: Firestore, transaction: Transaction, input: SparkIdentity, proof: SparkHistoryProof, options?: SparkPreparationOptions) {
  const position = parseSparkPosition((await readHistory(transaction, doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', proof.accountId), options)).data() ?? {});
  if (proof.headRevision !== position.revision || proof.headOperationId !== position.lastOperationId) {
    throw new SparkPreparationError('stale', 'A prévia ficou desatualizada. Prepare outra projeção com novo identificador.');
  }
}

async function recoverHistoryProgress(firestore: Firestore, input: SparkIdentity, error: unknown,
  matches: (proof: SparkHistoryProof) => boolean, options?: SparkPreparationOptions) {
  if (!['permission-denied', 'aborted', 'unavailable', 'deadline-exceeded', 'unknown'].includes((error as { code?: string })?.code ?? '')) return null;
  try {
    return await runTransaction(firestore, async transaction => {
      beginAttempt(options);
      const proof = (await readHistory(transaction, doc(firestore, 'financialGroups', input.groupId, 'sparkHistoryProofs', input.clientActionId), options)).data() as SparkHistoryProof | undefined;
      if (!proof || proof.actorId !== input.actorId || !matches(proof)) return null;
      await assertHistoryAccess(firestore, input, transaction, proof.purpose, options);
      await assertHistoryHead(firestore, transaction, input, proof, options);
      return proof;
    });
  } catch { return null; }
}

async function reserveHistoryBudget(firestore: Firestore, transaction: Transaction, input: SparkIdentity,
  proof: SparkHistoryProof, requestedPages: number, options?: SparkPreparationOptions) {
  const userRef = doc(firestore, 'sparkPreparationUserQuotas', input.actorId);
  const projectRef = doc(firestore, 'sparkPreparationQuotas', 'project');
  const user = (await readHistory(transaction, userRef, options)).data();
  const project = (await readHistory(transaction, projectRef, options)).data();
  const day = budgetDay();
  const used = (data: typeof user, field: string) => data?.windowStartInMillis === day ? data[field] as number : 0;
  const fits = (data: typeof user, reads: number, writes: number) => Math.min(
    Math.floor((reads - used(data, 'readUnits') - SPARK_PREPARATION_GRANT_READ_UNITS) / SPARK_PREPARATION_PAGE_READ_UNITS),
    writes - used(data, 'writeUnits') - SPARK_PREPARATION_GRANT_WRITES);
  const pages = Math.min(SPARK_PREPARATION_LEASE_PAGES, requestedPages, remainingPages(proof),
    fits(user, SPARK_PREPARATION_UID_READ_UNITS, SPARK_PREPARATION_UID_WRITES),
    fits(project, SPARK_PREPARATION_PROJECT_READ_UNITS, SPARK_PREPARATION_PROJECT_WRITES));
  if (pages < 1) throw new SparkPreparationError('budget-exhausted', 'Orçamento diário de preparação esgotado. O progresso foi preservado para retomada.');
  const leaseRevision = proof.leaseRevision + 1;
  const budget = (data: typeof user) => ({ schemaVersion: 1, windowStartInMillis: day,
    readUnits: used(data, 'readUnits') + SPARK_PREPARATION_GRANT_READ_UNITS + pages * SPARK_PREPARATION_PAGE_READ_UNITS,
    writeUnits: used(data, 'writeUnits') + SPARK_PREPARATION_GRANT_WRITES + pages, updatedAt: serverTimestamp() });
  assertNotPaused(options);
  if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
  transaction.set(userRef, { ...budget(user), groupId: input.groupId, proofId: input.clientActionId, reservedPages: pages, leaseRevision });
  transaction.set(projectRef, budget(project));
  return { ...proof, leaseRevision, leaseWindowStartInMillis: day, leaseEndWorkRevision: proof.workRevision + pages };
}

export async function startSparkHistoryProofFirebase(firestore: Firestore, input: SparkHistoryInput,
  options?: SparkPreparationOptions, requestedPages = SPARK_PREPARATION_LEASE_PAGES): Promise<SparkHistoryProof> {
  input = { ...input };
  [input.groupId, input.actorId, input.accountId].forEach(assertSparkDocumentId);
  assertClientActionId(input.clientActionId);
  if (!(input.asOf instanceof Timestamp) || input.asOf.seconds < 0 || !['instant', 'monthly', 'activation'].includes(input.purpose)) {
    throw new Error('Data ou finalidade da projeção inválida.');
  }
  if (!Number.isInteger(requestedPages) || requestedPages < 1 || requestedPages > SPARK_PREPARATION_LEASE_PAGES) throw new Error('Reserva de preparação inválida.');
  const result = await runTransaction(firestore, async transaction => {
    beginAttempt(options);
    await assertHistoryAccess(firestore, input, transaction, input.purpose, options);
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkHistoryProofs', input.clientActionId);
    const existing = (await readHistory(transaction, ref, options)).data() as SparkHistoryProof | undefined;
    if (existing) {
      if (existing.actorId !== input.actorId || existing.accountId !== input.accountId
        || !existing.asOf.isEqual(input.asOf) || existing.purpose !== input.purpose) throw new Error('Identificador de projeção já utilizado com outros argumentos.');
      await assertHistoryHead(firestore, transaction, input, existing, options);
      return { proof: existing, wrote: false };
    }
    const position = parseSparkPosition((await readHistory(transaction, doc(firestore, 'financialGroups', input.groupId, 'sparkPositions', input.accountId), options)).data() ?? {});
    if (!position.lastOperationId) throw new Error('Esta conta exige reconciliação de bootstrap antes da projeção.');
    const proof = { schemaVersion: 1 as const, actorId: input.actorId, accountId: input.accountId, asOf: input.asOf, purpose: input.purpose,
      headRevision: position.revision, headOperationId: position.lastOperationId, phase: 'checkpoints' as const,
      cursorRevision: position.revision, nextOperationId: position.lastOperationId,
      baselineAt: null, baselineRevision: -1, baselineBalanceInCents: 0, includesBoundary: false,
      baselineOperationId: null, nextCheckpointAt: null,
      latestCheckpointAt: null, balanceInCents: 0, tailDeltaInCents: 0,
      segmentId: null, workRevision: 0, leaseRevision: 0, leaseWindowStartInMillis: 0, leaseEndWorkRevision: 0 };
    const reserved = await reserveHistoryBudget(firestore, transaction, input, proof, requestedPages, options);
    transaction.set(ref, { ...reserved, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { proof: reserved, wrote: true };
  }).catch(async error => {
    const recovered = await recoverHistoryProgress(firestore, input, error,
      proof => proof.accountId === input.accountId && proof.asOf.isEqual(input.asOf) && proof.purpose === input.purpose, options);
    if (recovered) return { proof: recovered, wrote: false };
    throw error;
  });
  if (result.wrote) confirmed(options, SPARK_PREPARATION_GRANT_WRITES, true);
  return result.proof;
}

/** Reserva limitada. Reenvio do mesmo lease nunca duplica a cobrança nem reembolsa slots. */
export async function renewSparkHistoryBudgetFirebase(firestore: Firestore, input: SparkIdentity, expectedLeaseRevision: number,
  options?: SparkPreparationOptions, requestedPages = SPARK_PREPARATION_LEASE_PAGES): Promise<SparkHistoryProof> {
  input = { ...input };
  [input.groupId, input.actorId].forEach(assertSparkDocumentId); assertClientActionId(input.clientActionId);
  if (!Number.isSafeInteger(expectedLeaseRevision) || expectedLeaseRevision < 1 || !Number.isInteger(requestedPages)
    || requestedPages < 1 || requestedPages > SPARK_PREPARATION_LEASE_PAGES) throw new Error('Revisão ou reserva inválida.');
  const result = await runTransaction(firestore, async transaction => {
    beginAttempt(options);
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkHistoryProofs', input.clientActionId);
    const proof = (await readHistory(transaction, ref, options)).data() as SparkHistoryProof | undefined;
    if (!proof || proof.actorId !== input.actorId) throw new Error('Projeção não encontrada nesta sessão.');
    await assertHistoryAccess(firestore, input, transaction, proof.purpose, options);
    if (expectedLeaseRevision > proof.leaseRevision) throw new SparkPreparationError('revision', 'Revisão de reserva adiantada.');
    await assertHistoryHead(firestore, transaction, input, proof, options);
    if (proof.leaseRevision > expectedLeaseRevision || proof.phase === 'done'
      || (proof.leaseWindowStartInMillis === budgetDay() && proof.workRevision < proof.leaseEndWorkRevision)) return { proof, wrote: false };
    const next = await reserveHistoryBudget(firestore, transaction, input, proof, requestedPages, options);
    transaction.set(ref, { ...next, updatedAt: serverTimestamp() });
    return { proof: next, wrote: true };
  }).catch(async error => {
    const recovered = await recoverHistoryProgress(firestore, input, error, proof => proof.leaseRevision > expectedLeaseRevision, options);
    if (recovered) return { proof: recovered, wrote: false };
    throw error;
  });
  if (result.wrote) confirmed(options, SPARK_PREPARATION_GRANT_WRITES, true);
  return result.proof;
}

/** Página de um nó. expectedWorkRevision torna resposta perdida um reenvio sem outra escrita. */
export async function stepSparkHistoryProofFirebase(firestore: Firestore, input: SparkIdentity, expectedWorkRevision: number,
  options?: SparkPreparationOptions): Promise<SparkHistoryProof> {
  input = { ...input };
  [input.groupId, input.actorId].forEach(assertSparkDocumentId); assertClientActionId(input.clientActionId);
  if (!Number.isSafeInteger(expectedWorkRevision) || expectedWorkRevision < 0) throw new Error('Revisão de trabalho inválida.');
  const result = await runTransaction(firestore, async transaction => {
    beginAttempt(options);
    const ref = doc(firestore, 'financialGroups', input.groupId, 'sparkHistoryProofs', input.clientActionId);
    const proof = (await readHistory(transaction, ref, options)).data() as SparkHistoryProof | undefined;
    if (!proof || proof.actorId !== input.actorId) throw new Error('Projeção não encontrada nesta sessão.');
    await assertHistoryAccess(firestore, input, transaction, proof.purpose, options);
    if (expectedWorkRevision > proof.workRevision) throw new SparkPreparationError('revision', 'Revisão de trabalho adiantada.');
    await assertHistoryHead(firestore, transaction, input, proof, options);
    if (proof.workRevision > expectedWorkRevision || proof.phase === 'done') return { proof, wrote: false };
    if (proof.leaseWindowStartInMillis !== budgetDay() || proof.workRevision >= proof.leaseEndWorkRevision) {
      throw new SparkPreparationError('lease-required', 'Renove o orçamento preservando o cursor antes de continuar.');
    }
    const segment = options?.useSegments && proof.cursorRevision >= 0
      ? await findSparkHistorySegment(firestore, transaction, input.groupId, proof, options) : null;
    let next = { ...proof, segmentId: null as string | null };
    if (segment) next = applySparkHistorySegment(proof, segment);
    else if (proof.cursorRevision < 0) next = advanceSparkHistory(proof);
    else for (let node = 0; node < SPARK_HISTORY_PAGE_SIZE && next.cursorRevision >= 0; node += 1) {
      const operation = (await readHistory(transaction, doc(firestore, 'financialGroups', input.groupId, 'sparkOperations', next.nextOperationId!), options)).data();
      next = advanceSparkHistory(next, operation);
    }
    next = { ...next, segmentId: segment ? next.segmentId : null, workRevision: proof.workRevision + 1 };
    assertNotPaused(options);
    if (getAuth(firestore.app).currentUser?.uid !== input.actorId) throw new Error('A sessão autenticada mudou.');
    transaction.set(ref, { ...next, updatedAt: serverTimestamp() });
    return { proof: next, wrote: true, segmentNodes: segment?.nodeCount ?? 0 };
  }).catch(async error => {
    const recovered = await recoverHistoryProgress(firestore, input, error, proof => proof.workRevision > expectedWorkRevision, options);
    if (recovered) return { proof: recovered, wrote: false };
    throw error;
  });
  if (result.wrote) {
    confirmed(options, 1);
    if (options?.metrics && 'segmentNodes' in result && result.segmentNodes) { options.metrics.segmentPages += 1; options.metrics.reusedNodes += result.segmentNodes; }
  }
  return result.proof;
}

export async function prepareSparkHistoryProofFirebase(firestore: Firestore, input: SparkHistoryInput,
  maxPages = SPARK_PREPARATION_MAX_CALL_PAGES, options?: SparkPreparationOptions) {
  if (!Number.isInteger(maxPages) || maxPages < 0 || maxPages > SPARK_PREPARATION_MAX_CALL_PAGES) throw new Error('Limite de páginas inválido.');
  const requested = Math.max(1, Math.min(maxPages, options?.useSegments ? 16 : SPARK_PREPARATION_LEASE_PAGES));
  let proof = await startSparkHistoryProofFirebase(firestore, input, options, requested);
  for (let page = 0; page < maxPages && proof.phase !== 'done'; page += 1) {
    assertNotPaused(options);
    if (proof.leaseWindowStartInMillis !== budgetDay() || proof.workRevision >= proof.leaseEndWorkRevision) {
      proof = await renewSparkHistoryBudgetFirebase(firestore, input, proof.leaseRevision, options, requested);
    }
    proof = await stepSparkHistoryProofFirebase(firestore, input, proof.workRevision, options);
  }
  return proof;
}

export function getSparkPreparationProgress(proof: SparkHistoryProof) {
  return { estimateKind: 'unaccelerated-upper-bound' as const, total: estimateSparkPreparation(proof.headRevision), completedPages: proof.workRevision,
    remainingPages: remainingPages(proof), reservedPagesRemaining: proof.phase !== 'done' && proof.leaseWindowStartInMillis === budgetDay()
      ? Math.max(0, proof.leaseEndWorkRevision - proof.workRevision) : 0 };
}
