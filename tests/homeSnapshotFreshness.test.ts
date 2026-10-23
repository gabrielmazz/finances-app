import { getHomeSnapshotFreshness } from '@/utils/homeSnapshotFreshness';
import type { HomeSnapshot } from '@/functions/HomeFirebase';
const snapshot = (deadline: number | null) => ({ financialSource: 'spark', currentUntil: deadline } as HomeSnapshot);
test('cache não estende o prazo Spark e agenda leitura ao alcançar a abertura mensal', () => {
  expect(getHomeSnapshotFreshness(snapshot(10000), 5000)).toEqual({ expired: false, refreshAfterMs: 5050 });
  expect(getHomeSnapshotFreshness(snapshot(10000), 9999).expired).toBe(false);
  expect(getHomeSnapshotFreshness(snapshot(10000), 10000)).toEqual({ expired: true, refreshAfterMs: 1000 });
  expect(getHomeSnapshotFreshness(snapshot(10000), 15000).expired).toBe(true);
});
test('sem abertura futura não há polling; cache legado conserva sua política anterior', () => {
  expect(getHomeSnapshotFreshness(snapshot(null))).toEqual({ expired: false, refreshAfterMs: false });
  expect(getHomeSnapshotFreshness({ currentUntil: 1 } as HomeSnapshot)).toEqual({ expired: false, refreshAfterMs: false });
  expect(getHomeSnapshotFreshness(undefined)).toEqual({ expired: false, refreshAfterMs: false });
});
test('prazo ilegível de cache Spark não comprova saldo atual', () => {
  expect(getHomeSnapshotFreshness(snapshot(NaN)).expired).toBe(true);
});
test('abertura distante não estoura o limite do temporizador nem dispara leituras em loop', () => {
  expect(getHomeSnapshotFreshness(snapshot(4_000_000_000), 100).refreshAfterMs).toBe(2_147_483_647);
});
