import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, runTransaction, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { assertSparkDocumentId, parseSparkPosition, SPARK_TRANSFER_PROOF_PROTOCOL } from './sparkFinancialProtocol';
import { compareSparkTime, sparkHistoryEvent } from './sparkHistoryEvent';
import type { SparkHistoryProof, SparkPreparationOptions } from './SparkHistoryFirebase';
import { SparkPreparationError, SPARK_PREPARATION_DAY_MS, SPARK_PREPARATION_UID_READ_UNITS, SPARK_PREPARATION_UID_WRITES,
  SPARK_PREPARATION_PROJECT_READ_UNITS, SPARK_PREPARATION_PROJECT_WRITES, SPARK_SEGMENT_READ_UNITS, SPARK_SEGMENT_WRITES,
  SPARK_SEGMENT_MAX_NODES } from '../utils/sparkPreparationBudget';

export type SparkHistorySegment = {
  schemaVersion: 1; accountId: string; nodeCount: number; firstRevision: number; lastRevision: number;
  lastOperationId: string; previousOperationId: string; leftId: string; rightId: string;
  minAt: Timestamp; maxAt: Timestamp; deltaInCents: number; absoluteDeltaInCents: number; actorId: string; createdAt?: Timestamp;
};
export type SparkSegmentInput = { groupId: string; actorId: string; accountId: string; nodeCount: number; lastRevision: number;
  olderOperationId?: string; newerOperationId?: string };
export const sparkSegmentId = (count: number, last: number) => `${count}_${last}`;
export const sparkSegmentRef = (db: Firestore, groupId: string, accountId: string, id: string) =>
  doc(db, 'financialGroups', groupId, 'sparkHistorySegments', accountId, 'nodes', id);
const earlier = (a: Timestamp, b: Timestamp) => compareSparkTime(a, b) < 0 ? a : b;
const later = (a: Timestamp, b: Timestamp) => compareSparkTime(a, b) > 0 ? a : b;
function checkPaused(options?: SparkPreparationOptions) {
  if (options?.signal?.aborted) throw new SparkPreparationError('paused', 'Preparação pausada; certificados confirmados foram preservados.');
}
function checkActor(db: Firestore, actorId: string, options?: SparkPreparationOptions) {
  checkPaused(options);
  if (getAuth(db.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
}
async function read(transaction: Transaction, ref: ReturnType<typeof doc>, options?: SparkPreparationOptions) {
  if (options?.metrics) options.metrics.explicitReads += 1;
  return transaction.get(ref);
}
async function readServer(ref: ReturnType<typeof doc>, options?: SparkPreparationOptions) {
  checkPaused(options);
  if (options?.metrics) options.metrics.explicitReads += 1;
  return getDocFromServer(ref);
}
function checkRange(count: number, last: number) {
  if (!Number.isSafeInteger(count) || count < 2 || count > SPARK_SEGMENT_MAX_NODES || !Number.isInteger(Math.log2(count))
    || !Number.isSafeInteger(last) || last < count - 1 || last >= 1_000_000_000_000 || (last + 1) % count !== 0) throw new Error('Intervalo de certificado inválido.');
}
function movement(operation: Record<string, any>, accountId: string) {
  const event = sparkHistoryEvent(operation, accountId);
  if (event.checkpoint || ['account_opening', 'account_bootstrap'].includes(operation.kind)) return null;
  if (!(event.at instanceof Timestamp) || !(event.inverseAt instanceof Timestamp)) throw new Error('Data do movimento inválida.');
  return { ...event, minAt: earlier(event.at, event.inverseAt), maxAt: later(event.at, event.inverseAt),
    sum: event.delta + event.inverseDelta, absolute: Math.abs(event.delta) + Math.abs(event.inverseDelta) };
}

/** [[Agregados Históricos Spark]]: fontes imutáveis e filhos preexistentes, sem soma declarada pelo cliente. */
export async function certifySparkHistorySegmentFirebase(db: Firestore, input: SparkSegmentInput, options?: SparkPreparationOptions) {
  input = { ...input }; [input.groupId, input.actorId, input.accountId].forEach(assertSparkDocumentId); checkRange(input.nodeCount, input.lastRevision);
  const id = sparkSegmentId(input.nodeCount, input.lastRevision);
  if (input.nodeCount === 2) [input.olderOperationId, input.newerOperationId].forEach(value => assertSparkDocumentId(value!));
  const result = await runTransaction(db, async transaction => {
    checkActor(db, input.actorId, options); if (options?.metrics) options.metrics.attempts += 1;
    const group = (await read(transaction, doc(db, 'financialGroups', input.groupId), options)).data();
    if (group?.status !== 'active' || group.sparkProtocol !== SPARK_TRANSFER_PROOF_PROTOCOL
      || !['admin', 'member'].includes(group.members?.[input.actorId])) throw new Error('Grupo Spark indisponível ou acesso revogado.');
    const ref = sparkSegmentRef(db, input.groupId, input.accountId, id);
    const existing = (await read(transaction, ref, options)).data() as SparkHistorySegment | undefined;
    if (existing) {
      if (input.nodeCount === 2 && (existing.leftId !== input.olderOperationId || existing.rightId !== input.newerOperationId)) throw new Error('Certificado existente aponta para outros eventos.');
      return { segment: existing, created: false };
    }
    let material: Omit<SparkHistorySegment, 'schemaVersion' | 'actorId' | 'accountId' | 'createdAt'>;
    if (input.nodeCount === 2) {
      const oldData = (await read(transaction, doc(db, 'financialGroups', input.groupId, 'sparkOperations', input.olderOperationId!), options)).data();
      const newData = (await read(transaction, doc(db, 'financialGroups', input.groupId, 'sparkOperations', input.newerOperationId!), options)).data();
      if (!oldData || !newData) throw new Error('Histórico incompleto.');
      const old = movement(oldData, input.accountId); const next = movement(newData, input.accountId);
      if (!old || !next) return { segment: null, created: false };
      if (old.revision !== input.lastRevision - 1 || next.revision !== input.lastRevision || next.previous !== input.olderOperationId
        || typeof old.previous !== 'string') throw new Error('Encadeamento do certificado inválido.');
      material = { nodeCount: 2, firstRevision: input.lastRevision - 1, lastRevision: input.lastRevision,
        leftId: input.olderOperationId!, rightId: input.newerOperationId!, lastOperationId: input.newerOperationId!, previousOperationId: old.previous,
        minAt: earlier(old.minAt, next.minAt), maxAt: later(old.maxAt, next.maxAt), deltaInCents: old.sum + next.sum, absoluteDeltaInCents: old.absolute + next.absolute };
    } else {
      const half = input.nodeCount / 2; const leftId = sparkSegmentId(half, input.lastRevision - half); const rightId = sparkSegmentId(half, input.lastRevision);
      const left = (await read(transaction, sparkSegmentRef(db, input.groupId, input.accountId, leftId), options)).data() as SparkHistorySegment | undefined;
      const right = (await read(transaction, sparkSegmentRef(db, input.groupId, input.accountId, rightId), options)).data() as SparkHistorySegment | undefined;
      if (!left || !right) return { segment: null, created: false };
      if (left.accountId !== input.accountId || right.accountId !== input.accountId || right.previousOperationId !== left.lastOperationId) throw new Error('Filhos do certificado divergentes.');
      material = { nodeCount: input.nodeCount, firstRevision: left.firstRevision, lastRevision: right.lastRevision,
        leftId, rightId, lastOperationId: right.lastOperationId, previousOperationId: left.previousOperationId,
        minAt: earlier(left.minAt, right.minAt), maxAt: later(left.maxAt, right.maxAt), deltaInCents: left.deltaInCents + right.deltaInCents,
        absoluteDeltaInCents: left.absoluteDeltaInCents + right.absoluteDeltaInCents };
    }
    if (![material.deltaInCents, material.absoluteDeltaInCents].every(Number.isSafeInteger)) return { segment: null, created: false };
    const userRef = doc(db, 'sparkPreparationUserQuotas', input.actorId); const projectRef = doc(db, 'sparkPreparationQuotas', 'project');
    const user = (await read(transaction, userRef, options)).data(); const project = (await read(transaction, projectRef, options)).data();
    const day = Math.floor(Date.now() / SPARK_PREPARATION_DAY_MS) * SPARK_PREPARATION_DAY_MS;
    const totals = (data: typeof user) => ({ schemaVersion: 1, windowStartInMillis: day,
      readUnits: (data?.windowStartInMillis === day ? data.readUnits : 0) + SPARK_SEGMENT_READ_UNITS,
      writeUnits: (data?.windowStartInMillis === day ? data.writeUnits : 0) + SPARK_SEGMENT_WRITES, updatedAt: serverTimestamp() });
    const u = totals(user); const p = totals(project);
    if (u.readUnits > SPARK_PREPARATION_UID_READ_UNITS || u.writeUnits > SPARK_PREPARATION_UID_WRITES
      || p.readUnits > SPARK_PREPARATION_PROJECT_READ_UNITS || p.writeUnits > SPARK_PREPARATION_PROJECT_WRITES) {
      throw new SparkPreparationError('budget-exhausted', 'Orçamento diário de certificação esgotado; retome os certificados imutáveis depois.');
    }
    checkActor(db, input.actorId, options);
    const segment = { schemaVersion: 1 as const, actorId: input.actorId, accountId: input.accountId, ...material };
    transaction.set(ref, { ...segment, createdAt: serverTimestamp() });
    transaction.set(userRef, { ...u, workKind: 'segment', groupId: input.groupId, accountId: input.accountId, segmentId: id });
    transaction.set(projectRef, p);
    return { segment, created: true };
  });
  if (result.created && options?.metrics) options.metrics.confirmedWrites += SPARK_SEGMENT_WRITES;
  return result;
}

export function sparkSegmentClass(proof: SparkHistoryProof, at: Timestamp) {
  const upper = compareSparkTime(at, proof.asOf);
  if (upper > 0 || (upper === 0 && proof.purpose === 'monthly')) return 'tail';
  if (!proof.baselineAt || compareSparkTime(at, proof.baselineAt) > 0
    || (compareSparkTime(at, proof.baselineAt) === 0 && proof.includesBoundary)) return 'balance';
  return 'ignore';
}
export function canApplySparkHistorySegment(proof: SparkHistoryProof, segment: SparkHistorySegment) {
  if (segment.accountId !== proof.accountId || segment.lastRevision !== proof.cursorRevision || segment.lastOperationId !== proof.nextOperationId) return false;
  if (proof.phase === 'checkpoints') return true;
  if (proof.phase !== 'movements') return false;
  // O segmento não guarda a distinção entre data declarada e commit. Na fronteira exata, conferir cada revisão.
  if (proof.baselineAt && !proof.includesBoundary && compareSparkTime(segment.minAt, proof.baselineAt) <= 0
    && compareSparkTime(segment.maxAt, proof.baselineAt) >= 0) return false;
  const kind = sparkSegmentClass(proof, segment.minAt);
  if (kind !== sparkSegmentClass(proof, segment.maxAt)) return false;
  const value = kind === 'balance' ? proof.balanceInCents : kind === 'tail' ? proof.tailDeltaInCents : 0;
  return kind === 'ignore' || (Number.isSafeInteger(value - segment.absoluteDeltaInCents) && Number.isSafeInteger(value + segment.absoluteDeltaInCents));
}
export function applySparkHistorySegment(proof: SparkHistoryProof, segment: SparkHistorySegment): SparkHistoryProof {
  if (!canApplySparkHistorySegment(proof, segment)) throw new Error('Segmento não cobre uniformemente a janela da prova.');
  const kind = proof.phase === 'movements' ? sparkSegmentClass(proof, segment.minAt) : 'ignore';
  return { ...proof, segmentId: sparkSegmentId(segment.nodeCount, segment.lastRevision), cursorRevision: segment.firstRevision - 1,
    nextOperationId: segment.previousOperationId, balanceInCents: proof.balanceInCents + (kind === 'balance' ? segment.deltaInCents : 0),
    tailDeltaInCents: proof.tailDeltaInCents + (kind === 'tail' ? segment.deltaInCents : 0) };
}
export async function findSparkHistorySegment(db: Firestore, transaction: Transaction, groupId: string, proof: SparkHistoryProof, options?: SparkPreparationOptions) {
  let size = 2;
  if ((proof.cursorRevision + 1) % size !== 0) return null;
  while (size * 2 <= SPARK_SEGMENT_MAX_NODES && (proof.cursorRevision + 1) % (size * 2) === 0) size *= 2;
  for (let probe = 0; size >= 2 && probe < 4; size /= 2, probe += 1) {
    const segment = (await read(transaction, sparkSegmentRef(db, groupId, proof.accountId, sparkSegmentId(size, proof.cursorRevision)), options)).data() as SparkHistorySegment | undefined;
    if (segment && canApplySparkHistorySegment(proof, segment)) return segment;
  }
  return null;
}

/** Cursor é somente progresso do construtor; toda autoridade é recertificada em cada create. */
export async function warmSparkHistorySegmentsFirebase(db: Firestore, input: { groupId: string; actorId: string; accountId: string;
  cursor?: { revision: number; operationId: string | null }; maxPairs?: number }, options?: SparkPreparationOptions) {
  input = { ...input }; [input.groupId, input.actorId, input.accountId].forEach(assertSparkDocumentId);
  const maxPairs = input.maxPairs ?? 32;
  if (!Number.isInteger(maxPairs) || maxPairs < 1 || maxPairs > 32) throw new Error('Limite de construção inválido.');
  checkActor(db, input.actorId, options);
  const position = parseSparkPosition((await readServer(doc(db, 'financialGroups', input.groupId, 'sparkPositions', input.accountId), options)).data() ?? {});
  let revision = input.cursor?.revision ?? position.revision; let operationId = input.cursor ? input.cursor.operationId : position.lastOperationId;
  if (!Number.isSafeInteger(revision) || revision < -1 || revision >= 1_000_000_000_000 || (revision >= 0 && !operationId)) throw new Error('Cursor de construção inválido.');
  let created = 0; let examined = 0;
  for (; examined < maxPairs && revision >= 0; examined += 1) {
    if (created >= 64) return { done: false, cursor: { revision, operationId }, created, examined };
    checkActor(db, input.actorId, options);
    const operation = (await readServer(doc(db, 'financialGroups', input.groupId, 'sparkOperations', operationId!), options)).data();
    if (!operation) throw new Error('Histórico incompleto.');
    const event = sparkHistoryEvent(operation, input.accountId);
    if (event.revision !== revision) throw new Error('Cursor de construção não corresponde ao evento.');
    if (revision % 2 === 0) { revision -= 1; operationId = event.previous; continue; }
    const originalRevision = revision; const originalOperationId = operationId;
    const result = await certifySparkHistorySegmentFirebase(db, { ...input, nodeCount: 2, lastRevision: revision,
      olderOperationId: event.previous!, newerOperationId: operationId! }, options);
    if (result.created) created += 1;
    const older = (await readServer(doc(db, 'financialGroups', input.groupId, 'sparkOperations', event.previous!), options)).data();
    if (!older) throw new Error('Histórico incompleto.');
    let current = result.segment;
    while (current && current.nodeCount * 2 <= SPARK_SEGMENT_MAX_NODES && current.firstRevision % (current.nodeCount * 2) === 0) {
      if (created >= 64) return { done: false, cursor: { revision: originalRevision, operationId: originalOperationId }, created, examined };
      const parent = await certifySparkHistorySegmentFirebase(db, { ...input, nodeCount: current.nodeCount * 2,
        lastRevision: current.lastRevision + current.nodeCount }, options);
      if (parent.created) created += 1;
      current = parent.segment;
    }
    revision -= 2; operationId = sparkHistoryEvent(older, input.accountId).previous;
  }
  return { done: revision < 0, cursor: { revision, operationId }, created, examined };
}
