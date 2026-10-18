import { estimateSparkPreparation } from '../utils/sparkPreparationBudget';

describe('Spark preparation estimates', () => {
  it.each([[0, 1, 4, 1, 7, 80], [2, 3, 8, 1, 11, 120], [999, 1000, 2002, 32, 2098, 21300]])(
    'estimates revision %i with both passes, turns and reservations', (revision, nodes, pages, grants, writes, readUnits) => {
      expect(estimateSparkPreparation(revision)).toEqual({ nodes, pages, grants, writes, readUnits, eventReads: 2 * nodes });
    });
  it.each([-1, 0.5, NaN, Infinity, 1_000_000_000_001])('rejects invalid revision %s', revision => {
    expect(() => estimateSparkPreparation(revision)).toThrow('Revisão inválida');
  });
  it('estimates histories above the daily budget without a permanent account size ban', () => {
    expect(estimateSparkPreparation(10_000).readUnits).toBeGreaterThan(24_000);
  });
});
