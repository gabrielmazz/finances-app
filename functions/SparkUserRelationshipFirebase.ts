import { getAuth } from 'firebase/auth';
import { collectionGroup, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, serverTimestamp, startAfter, Timestamp, where, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { assertClientActionId } from '../utils/financialLedger';

export type UserRelationshipCommand = {
  action: 'preview' | 'link' | 'unlink'; relatedUserId: string;
  clientActionId?: string; expectedFingerprint?: string; isCurrent?: () => boolean;
};
export type UserRelationshipResult = {
  relatedUserName: string; isLinked?: boolean; hasIncomingInvite?: boolean;
  status?: 'invited' | 'linked' | 'unlinked'; fingerprint?: string; changed?: boolean; idempotent?: boolean;
};
type Pair = {
  schemaVersion: 1; participants: [string, string]; senderId: string; senderName: string;
  status: 'invited' | 'linked' | 'revoked'; revision: number; inviteId: string;
  createdAt: Timestamp; updatedAt: Timestamp; acceptedAt: Timestamp | null;
  lastActorId: string; lastOperationId: string;
};
const INVITE_LIFETIME = 7 * 24 * 60 * 60 * 1000;
function validUid(uid: string) {
  if (typeof uid !== 'string' || !uid || uid.length > 128 || /[\/\u0000-\u001f\u007f]/.test(uid)) throw new Error('Informe um ID de conta válido.');
}
function current(firestore: Firestore, uid: string, isCurrent?: () => boolean) {
  if (!uid || getAuth(firestore.app).currentUser?.uid !== uid || (isCurrent && !isCurrent())) throw new Error('A conta ou a tela mudou. Confira o pedido novamente.');
}
export function sparkRelationshipRef(firestore: Firestore, uid: string, other: string) {
  validUid(uid); validUid(other);
  if (uid === other) throw new Error('Você não pode vincular sua própria conta.');
  const [first, second] = [uid, other].sort();
  return doc(firestore, 'sparkUserRelationships', first, 'sparkRelationshipPairs', second);
}
function parsePair(value: Record<string, any>, uid: string, other: string): Pair {
  const participants = [uid, other].sort();
  if (value.schemaVersion !== 1 || JSON.stringify(value.participants) !== JSON.stringify(participants)
    || !participants.includes(value.senderId) || !['invited', 'linked', 'revoked'].includes(value.status)
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 1_000_000_000
    || typeof value.inviteId !== 'string' || typeof value.senderName !== 'string'
    || !(value.createdAt instanceof Timestamp) || !(value.updatedAt instanceof Timestamp)
    || !(value.acceptedAt === null || value.acceptedAt instanceof Timestamp)) throw new Error('O vínculo precisa ser conferido antes de continuar.');
  return value as Pair;
}
const freshInvite = (pair: Pair | null) => Boolean(pair && pair.status === 'invited' && pair.createdAt.toMillis() <= Date.now() && pair.createdAt.toMillis() > Date.now() - INVITE_LIFETIME);
function fingerprint(pair: Pair | null, legacyLinked: boolean, uid: string) {
  return JSON.stringify([pair?.revision ?? 0, pair?.inviteId ?? null, pair?.status ?? null, legacyLinked, freshInvite(pair) && pair?.senderId !== uid, freshInvite(pair) && pair?.senderId === uid]);
}
async function legacyLinked(firestore: Firestore, uid: string, other: string, own: Record<string, any>) {
  if (!Array.isArray(own.relatedIdUsers) || !own.relatedIdUsers.includes(other)) return false;
  const grant = await getDocFromServer(doc(firestore, 'userRelationshipGrants', uid, 'related', other));
  if (!grant.exists()) return false;
  // [[Gerenciamento de Usuários]]: as Rules conferem também a concessão/perfil recíprocos.
  await getDocFromServer(doc(firestore, 'users', other));
  return true;
}
async function pairRows(firestore: Firestore, uid: string) {
  const rows: Pair[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const page = await getDocsFromServer(query(collectionGroup(firestore, 'sparkRelationshipPairs'), where('participants', 'array-contains', uid), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
    current(firestore, uid);
    for (const snapshot of page.docs) {
      const value = snapshot.data(), other = value.participants?.find((id: string) => id !== uid);
      if (!other || snapshot.ref.path !== sparkRelationshipRef(firestore, uid, other).path) throw new Error('Lista de vínculos inválida.');
      rows.push(parsePair(value, uid, other));
    }
    cursor = page.size === 100 ? page.docs.at(-1) : undefined;
  } while (cursor);
  return rows;
}
export async function loadSparkUserRelationshipsFirebase(firestore: Firestore, uid: string) {
  current(firestore, uid);
  const own = (await getDocFromServer(doc(firestore, 'users', uid))).data();
  if (!own) throw new Error('Seu perfil não foi encontrado.');
  const rows = await pairRows(firestore, uid);
  const states = new Map(rows.map(pair => [pair.participants.find(id => id !== uid)!, pair]));
  const ids = new Set(rows.filter(pair => pair.status === 'linked').map(pair => pair.participants.find(id => id !== uid)!));
  for (const other of Array.isArray(own.relatedIdUsers) ? own.relatedIdUsers : []) {
    if (typeof other !== 'string' || states.has(other) || other === uid) continue;
    if (await legacyLinked(firestore, uid, other, own)) ids.add(other);
    current(firestore, uid);
  }
  const linked = await Promise.all([...ids].map(async id => {
    const snapshot = await getDocFromServer(doc(firestore, 'users', id));
    if (!snapshot.exists()) throw new Error('Uma conta vinculada precisa ser conferida.');
    return { ...snapshot.data(), id, name: typeof snapshot.data().name === 'string' ? snapshot.data().name : 'Conta sem nome' };
  }));
  current(firestore, uid);
  const incoming = rows.filter(pair => freshInvite(pair) && pair.senderId !== uid).map(pair => ({ id: pair.senderId, name: pair.senderName || 'Conta sem nome' }));
  const outgoing = rows.filter(pair => freshInvite(pair) && pair.senderId === uid).map(pair => ({ id: pair.participants.find(id => id !== uid)!, name: 'Conta informada' }));
  return { linked, incoming, outgoing };
}

/** [[Gerenciamento de Usuários]]: um par, aceite do destinatário e recibo atômico; nenhum perfil alheio é escrito. */
export async function runSparkUserRelationshipFirebase(firestore: Firestore, uid: string, command: UserRelationshipCommand): Promise<UserRelationshipResult> {
  command = { ...command };
  current(firestore, uid, command.isCurrent);
  const other = command.relatedUserId.trim(), pairRef = sparkRelationshipRef(firestore, uid, other);
  if (!['preview', 'link', 'unlink'].includes(command.action)) throw new Error('Operação de vínculo inválida.');
  const own = (await getDocFromServer(doc(firestore, 'users', uid))).data();
  current(firestore, uid, command.isCurrent);
  if (!own) throw new Error('Seu perfil não foi encontrado.');
  const snapshot = await getDocFromServer(pairRef);
  current(firestore, uid, command.isCurrent);
  const pair = snapshot.exists() ? parsePair(snapshot.data(), uid, other) : null;
  const oldLinked = !pair && await legacyLinked(firestore, uid, other, own);
  current(firestore, uid, command.isCurrent);
  const linked = pair?.status === 'linked' || oldLinked;
  let name = freshInvite(pair) && pair?.senderId === other ? pair.senderName : 'Conta informada';
  if (linked) name = (await getDocFromServer(doc(firestore, 'users', other))).data()?.name || 'Conta sem nome';
  current(firestore, uid, command.isCurrent);
  if (command.action === 'preview') return { relatedUserName: name, isLinked: linked, hasIncomingInvite: freshInvite(pair) && pair?.senderId === other, fingerprint: fingerprint(pair, oldLinked, uid) };
  assertClientActionId(command.clientActionId!);
  if (typeof command.expectedFingerprint !== 'string' || command.expectedFingerprint.length > 512) throw new Error('Confira o vínculo antes de confirmar.');
  const receiptRef = doc(firestore, 'sparkUserRelationshipOperations', uid, 'receipts', command.clientActionId!);
  return runTransaction(firestore, async transaction => {
    const [receipt, actual] = await Promise.all([transaction.get(receiptRef), transaction.get(pairRef)]);
    current(firestore, uid, command.isCurrent);
    if (receipt.exists()) {
      const data = receipt.data();
      if (data.relatedUserId !== other || data.action !== command.action || data.expectedFingerprint !== command.expectedFingerprint) throw new Error('Este código já pertence a outro pedido.');
      return { relatedUserName: name, status: data.status, changed: true, idempotent: true };
    }
    const now = actual.exists() ? parsePair(actual.data(), uid, other) : null;
    if (fingerprint(now, oldLinked, uid) !== command.expectedFingerprint) throw new Error('Os vínculos mudaram. Confira o efeito e confirme novamente.');
    const wasLinked = now?.status === 'linked' || (!now && oldLinked);
    const active = freshInvite(now);
    if (command.action === 'link' && (wasLinked || (active && now?.senderId === uid))) return { relatedUserName: name, status: wasLinked ? 'linked' : 'invited', changed: false, idempotent: false };
    if (command.action === 'unlink' && ((!now && !oldLinked) || now?.status === 'revoked')) return { relatedUserName: name, status: 'unlinked', changed: false, idempotent: false };
    const quotaRef = doc(firestore, 'sparkUserRelationshipQuotas', uid);
    const quota = command.action === 'link' ? (await transaction.get(quotaRef)).data() : null;
    current(firestore, uid, command.isCurrent);
    const windowStartInMillis = Math.floor(Date.now() / 60_000) * 60_000;
    const count = quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1;
    if (command.action === 'link' && count > 10) throw Object.assign(new Error('Limite de convites e aceites atingido. Aguarde o próximo minuto.'), { code: 'resource-exhausted' });
    const accepting = command.action === 'link' && active && now?.senderId === other;
    const status = command.action === 'unlink' ? 'revoked' : accepting ? 'linked' : 'invited';
    const revision = (now?.revision ?? 0) + 1;
    const state = { schemaVersion: 1, participants: [uid, other].sort(), senderId: accepting || status === 'revoked' ? now?.senderId ?? uid : uid,
      senderName: accepting || status === 'revoked' ? now?.senderName ?? (own.name || 'Conta sem nome') : (own.name || 'Conta sem nome'),
      status, revision, inviteId: accepting || status === 'revoked' ? now?.inviteId ?? command.clientActionId : command.clientActionId,
      createdAt: accepting || status === 'revoked' ? now?.createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(), acceptedAt: accepting ? serverTimestamp() : status === 'revoked' ? now?.acceptedAt ?? null : null,
      lastActorId: uid, lastOperationId: command.clientActionId };
    if (command.action === 'link') transaction.set(quotaRef, { windowStartInMillis, count, lastOperationId: command.clientActionId, updatedAt: serverTimestamp() });
    transaction.set(pairRef, state);
    const resultStatus = status === 'revoked' ? 'unlinked' : status;
    transaction.set(receiptRef, { relatedUserId: other, action: command.action, expectedFingerprint: command.expectedFingerprint, revision, status: resultStatus, createdAt: serverTimestamp() });
    return { relatedUserName: name, status: resultStatus, changed: true, idempotent: false };
  });
}
