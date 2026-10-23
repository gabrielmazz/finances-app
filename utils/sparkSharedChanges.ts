import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { isSparkChangeCursor, readSparkSharedChangesFirebase } from '@/functions/SparkSharedChangesFirebase';

const pending = new Map<string, { task: Promise<'legacy' | 'spark' | 'cancelled'>; current: () => boolean }>();
/** [[Notificações]]: só marcar como visto depois de apresentar o aviso na sessão que pediu a leitura. */
export const synchronizeSparkSharedChanges = (actorId: string, shouldContinue: () => boolean, announce: (count: number, hasMore: boolean) => void) => {
  const current = () => shouldContinue() && auth.currentUser?.uid === actorId;
  if (!current()) return Promise.resolve('cancelled' as const);
  const existing = pending.get(actorId); if (existing?.current()) return existing.task;
  const task = (async (): Promise<'legacy' | 'spark' | 'cancelled'> => {
    const context = await getSparkContextFirebase(db, actorId);
    if (!current()) return 'cancelled';
    if (!context) return 'legacy';
    const key = `@lumusSparkChanges:v1:${encodeURIComponent(actorId)}:${encodeURIComponent(context.groupId)}`;
    const stored = await AsyncStorage.getItem(key);
    let cursor = null;
    if (stored) {
      try { const value: unknown = JSON.parse(stored); if (isSparkChangeCursor(value)) cursor = value; }
      catch { /* Uma preferência local corrompida reinicia a referência, sem carregar dados de outra conta. */ }
    }
    if (!current()) return 'cancelled';
    let changedCount = 0, hasMore = false;
    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      if (!current()) return 'cancelled';
      const page = await readSparkSharedChangesFirebase(db, actorId, context.groupId, cursor);
      changedCount += page.changedCount; cursor = page.cursor; hasMore = page.hasMore;
      if (!hasMore) break;
    }
    if (!current()) return 'cancelled';
    if (changedCount || hasMore) announce(changedCount, hasMore);
    if (cursor && current()) await AsyncStorage.setItem(key, JSON.stringify(cursor));
    return 'spark';
  })();
  pending.set(actorId, { task, current });
  void task.finally(() => { if (pending.get(actorId)?.task === task) pending.delete(actorId); }).catch(() => {});
  return task;
};
