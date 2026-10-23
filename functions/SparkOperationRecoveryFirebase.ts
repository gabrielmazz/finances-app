import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import type { SparkIdentity } from './sparkFinancialProtocol';
import { assertClientActionId } from '../utils/financialLedger';

export type SparkRecoveryIntent = {
  schemaVersion: 1; groupId: string; kind: string;
  status: 'pending' | 'committed' | 'cancelled' | 'resolved';
  createdAt: Timestamp; updatedAt: Timestamp;
};
export type SparkRecoveryEntry = SparkRecoveryIntent & { operationId: string };

type Session = { uid: string | null; known: Set<string>; running: Map<string, number>; listeners: Set<() => void> };
const sessions = new WeakMap<Firestore, Session>();
const key = (identity: SparkIdentity) => `${identity.actorId}/${identity.groupId}/${identity.clientActionId}`;
function session(firestore: Firestore): Session {
  let value = sessions.get(firestore);
  if (!value) {
    value = { uid: getAuth(firestore.app).currentUser?.uid ?? null, known: new Set(), running: new Map(), listeners: new Set() };
    sessions.set(firestore, value);
    const state = value;
    onAuthStateChanged(getAuth(firestore.app), user => {
      if (state.uid !== (user?.uid ?? null)) {
        state.uid = user?.uid ?? null; state.known.clear(); state.running.clear();
        state.listeners.forEach(listener => listener());
      }
    });
  }
  return value;
}
export function subscribeSparkRecoverySession(firestore: Firestore, listener: () => void): () => void {
  const state = session(firestore); state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
export function sparkRecoveryIsVisible(firestore: Firestore, identity: SparkIdentity, status: SparkRecoveryIntent['status']): boolean {
  const state = session(firestore), id = key(identity);
  return status === 'pending' ? !state.running.has(id) : status === 'committed' && !state.known.has(id);
}
export function trackSparkRecoveryAttempt(firestore: Firestore, identity: SparkIdentity): () => void {
  const state = session(firestore), id = key(identity);
  state.running.set(id, (state.running.get(id) ?? 0) + 1); state.listeners.forEach(listener => listener());
  return () => {
    const count = state.running.get(id) ?? 0;
    if (count > 1) state.running.set(id, count - 1); else state.running.delete(id);
    state.listeners.forEach(listener => listener());
  };
}
export function rememberSparkRecoveryConfirmation(firestore: Firestore, identity: SparkIdentity): void {
  if (getAuth(firestore.app).currentUser?.uid !== identity.actorId) return;
  const state = session(firestore); state.known.add(key(identity)); state.listeners.forEach(listener => listener());
}
function assertActor(firestore: Firestore, actorId: string): void {
  if (!actorId || actorId.includes('/') || getAuth(firestore.app).currentUser?.uid !== actorId) throw new Error('A sessão autenticada mudou.');
}
export function sparkRecoveryRefs(firestore: Firestore, identity: SparkIdentity) {
  return { index: doc(firestore, 'sparkOperationRecovery', identity.actorId),
    intent: doc(firestore, 'sparkOperationRecovery', identity.actorId, 'intents', identity.clientActionId) };
}
export function parseSparkRecoveryIntent(value: Record<string, unknown>): SparkRecoveryIntent {
  if (value.schemaVersion !== 1 || typeof value.groupId !== 'string' || !value.groupId.length || value.groupId.length > 160 || value.groupId.includes('/')
    || typeof value.kind !== 'string' || !/^[a-z_]{1,64}$/.test(value.kind)
    || !['pending', 'committed', 'cancelled', 'resolved'].includes(value.status as string)
    || !(value.createdAt instanceof Timestamp) || !(value.updatedAt instanceof Timestamp)) throw new Error('Conferência do envio anterior inválida.');
  return value as SparkRecoveryIntent;
}
function recoveryRequired() {
  return Object.assign(new Error('Confira o envio anterior no aviso do aplicativo antes de iniciar outra operação.'), { code: 'spark/recovery-required' });
}

/** [[Recuperação de Operações Spark]]: somente identificação; nenhum rascunho ou autorização de chat. */
export async function reserveSparkRecoveryInTransaction(
  transaction: Transaction, firestore: Firestore, identity: SparkIdentity, kind: string,
): Promise<void> {
  assertActor(firestore, identity.actorId);
  const refs = sparkRecoveryRefs(firestore, identity), index = (await transaction.get(refs.index)).data();
  const snapshot = await transaction.get(refs.intent);
  if (snapshot.exists()) {
    const intent = parseSparkRecoveryIntent(snapshot.data());
    if (intent.status === 'cancelled') throw Object.assign(new Error('Este envio foi cancelado. Prepare uma nova confirmação.'), { sparkIntentCancelled: true });
    if (intent.status !== 'pending' || intent.groupId !== identity.groupId || intent.kind !== kind
      || index?.operationId !== identity.clientActionId || index.groupId !== identity.groupId) throw recoveryRequired();
    return;
  }
  let previous: ReturnType<typeof doc> | null = null;
  if (index) {
    assertClientActionId(index.operationId);
    previous = doc(refs.index, 'intents', index.operationId);
    const old = parseSparkRecoveryIntent((await transaction.get(previous)).data() ?? {});
    if (old.status === 'pending' || old.status === 'committed' && !session(firestore).known.has(key({ actorId: identity.actorId, groupId: old.groupId, clientActionId: index.operationId }))) throw recoveryRequired();
    if (old.status !== 'committed') previous = null;
  }
  const quotaRef = doc(firestore, 'sparkOperationIntentQuotas', identity.actorId), quota = (await transaction.get(quotaRef)).data();
  const windowStartInMillis = Math.floor(Date.now() / 60000) * 60000;
  const count = quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1;
  if (count > 120) throw new Error('Limite temporário de confirmações atingido. Aguarde o próximo minuto.');
  if (previous) transaction.update(previous, { status: 'resolved', updatedAt: serverTimestamp() });
  transaction.set(refs.index, { schemaVersion: 1, groupId: identity.groupId, operationId: identity.clientActionId, updatedAt: serverTimestamp() });
  transaction.set(refs.intent, { schemaVersion: 1, groupId: identity.groupId, kind, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  transaction.set(quotaRef, { groupId: identity.groupId, operationId: identity.clientActionId, windowStartInMillis, count, updatedAt: serverTimestamp() });
}

export async function requireSparkRecoveryInTransaction(transaction: Transaction, firestore: Firestore, identity: SparkIdentity, kind: string) {
  const refs = sparkRecoveryRefs(firestore, identity);
  const intent = parseSparkRecoveryIntent((await transaction.get(refs.intent)).data() ?? {});
  const index = (await transaction.get(refs.index)).data();
  if (intent.status === 'cancelled') throw Object.assign(new Error('Este envio foi cancelado. Prepare uma nova confirmação.'), { sparkIntentCancelled: true });
  if (intent.status !== 'pending' || intent.groupId !== identity.groupId || intent.kind !== kind
    || index?.operationId !== identity.clientActionId || index.groupId !== identity.groupId) throw recoveryRequired();
  return refs.intent;
}

export async function readSparkRecoveryFirebase(firestore: Firestore, actorId: string): Promise<SparkRecoveryEntry | null> {
  assertActor(firestore, actorId);
  const result = await runTransaction(firestore, async transaction => {
    const indexRef = doc(firestore, 'sparkOperationRecovery', actorId), index = (await transaction.get(indexRef)).data();
    if (!index) return null;
    assertClientActionId(index.operationId);
    const intent = parseSparkRecoveryIntent((await transaction.get(doc(indexRef, 'intents', index.operationId))).data() ?? {});
    if (intent.groupId !== index.groupId) throw new Error('Conferência do envio anterior inválida.');
    return { ...intent, operationId: index.operationId };
  });
  assertActor(firestore, actorId); return result;
}

/** Cancelar concorre com o commit sobre o mesmo documento; ausência de recibo não basta. */
export async function cancelSparkRecoveryFirebase(firestore: Firestore, identity: SparkIdentity): Promise<SparkRecoveryIntent['status']> {
  assertActor(firestore, identity.actorId); assertClientActionId(identity.clientActionId);
  const attempt = () => runTransaction(firestore, async transaction => {
    const { intent: ref } = sparkRecoveryRefs(firestore, identity), intent = parseSparkRecoveryIntent((await transaction.get(ref)).data() ?? {});
    if (intent.groupId !== identity.groupId) throw new Error('Conferência do envio anterior inválida.');
    assertActor(firestore, identity.actorId);
    if (intent.status !== 'pending') return intent.status;
    transaction.update(ref, { status: 'cancelled', updatedAt: serverTimestamp() }); return 'cancelled' as const;
  });
  let result: SparkRecoveryIntent['status'];
  try { result = await attempt(); } catch (error) {
    if (!['permission-denied', 'aborted', 'unavailable', 'deadline-exceeded', 'unknown'].includes((error as { code?: string })?.code ?? '')) throw error;
    // A disputa pode ser recusada pelas Rules antes do retry do SDK; conferir sem reenviar a escrita.
    result = await runTransaction(firestore, async transaction => {
      const intent = parseSparkRecoveryIntent((await transaction.get(sparkRecoveryRefs(firestore, identity).intent)).data() ?? {});
      if (intent.groupId !== identity.groupId || intent.status === 'pending') throw error;
      return intent.status;
    });
  }
  assertActor(firestore, identity.actorId); return result;
}

export async function acknowledgeSparkRecoveryFirebase(firestore: Firestore, identity: SparkIdentity): Promise<void> {
  assertActor(firestore, identity.actorId); assertClientActionId(identity.clientActionId);
  await runTransaction(firestore, async transaction => {
    const { intent: ref } = sparkRecoveryRefs(firestore, identity), intent = parseSparkRecoveryIntent((await transaction.get(ref)).data() ?? {});
    if (intent.groupId !== identity.groupId || !['committed', 'resolved'].includes(intent.status)) throw recoveryRequired();
    assertActor(firestore, identity.actorId);
    if (intent.status === 'committed') transaction.update(ref, { status: 'resolved', updatedAt: serverTimestamp() });
  });
  assertActor(firestore, identity.actorId);
}
