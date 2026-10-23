import { collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, Timestamp, where, type Firestore } from 'firebase/firestore';
import { getSparkContextFirebase } from './SparkContextFirebase';

export type SparkChangeCursor = { seconds: number; nanoseconds: number; id: string };
export const isSparkChangeCursor = (value: unknown): value is SparkChangeCursor => {
  const cursor = value as SparkChangeCursor | null;
  return !!cursor && Number.isSafeInteger(cursor.seconds) && cursor.seconds >= -62135596800 && cursor.seconds < 253402300800
    && Number.isInteger(cursor.nanoseconds) && cursor.nanoseconds >= 0 && cursor.nanoseconds < 1e9
    && typeof cursor.id === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(cursor.id);
};
const kinds = new Set(['recurring_plan_create', 'recurring_plan_update', 'recurring_replan', 'recurring_replan_reversal', 'recurring_metadata_update', 'recurring_settlement', 'recurring_reversal']);

/** [[Notificações]]: página limitada de recibos existentes, sem executor/push com aplicativos fechados. */
export async function readSparkSharedChangesFirebase(firestore: Firestore, actorId: string, groupId: string, cursor: SparkChangeCursor | null) {
  if (cursor !== null && !isSparkChangeCursor(cursor)) throw new Error('Marcador local de avisos inválido.');
  const context = await getSparkContextFirebase(firestore, actorId);
  if (!context || context.groupId !== groupId) throw new Error('O grupo financeiro mudou.');
  const source = collection(firestore, 'financialGroups', groupId, 'sparkOperations');
  const events = where('kind', 'in', [...kinds]);
  const snapshot = await getDocsFromServer(cursor
    ? query(source, events, orderBy('createdAt'), orderBy(documentId()), startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id), limit(100))
    : query(source, events, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(1)));
  const last = snapshot.docs.at(-1), data = last?.data(), at = data?.createdAt;
  if (last && !(at instanceof Timestamp)) throw new Error('Recibo financeiro sem data de confirmação válida.');
  const nextCursor = last ? { seconds: at!.seconds, nanoseconds: at!.nanoseconds, id: last.id } : cursor ?? { seconds: 0, nanoseconds: 0, id: 'baseline_00000000' };
  const changedCount = cursor ? snapshot.docs.filter(document => {
    const event = document.data(); return event.actorId !== actorId && kinds.has(event.kind);
  }).length : 0;
  const current = await getSparkContextFirebase(firestore, actorId);
  if (current?.groupId !== groupId) throw new Error('O acesso ao grupo financeiro mudou.');
  return { cursor: nextCursor, changedCount, hasMore: cursor !== null && snapshot.size === 100 };
}
