import type { HomeSnapshot } from '../functions/HomeFirebase';

/** [[Dashboard Home]]: cache não prorroga o prazo protegido de uma abertura mensal Spark. */
export function getHomeSnapshotFreshness(snapshot: HomeSnapshot | undefined, now = Date.now()): { expired: boolean; refreshAfterMs: number | false } {
  if (snapshot?.financialSource !== 'spark' || snapshot.currentUntil == null) return { expired: false, refreshAfterMs: false };
  if (!Number.isFinite(snapshot.currentUntil)) return { expired: true, refreshAfterMs: 1000 };
  return { expired: now >= snapshot.currentUntil, refreshAfterMs: Math.min(2_147_483_647, Math.max(1000, snapshot.currentUntil - now + 50)) };
}
