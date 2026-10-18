/** [[Protocolo Financeiro Spark]]: unidades de admissão, não medição de cobrança do Firestore. */
export const SPARK_HISTORY_PAGE_SIZE = 1;
export const SPARK_PREPARATION_LEASE_PAGES = 64;
export const SPARK_PREPARATION_MAX_CALL_PAGES = 100;
export const SPARK_PREPARATION_DAY_MS = 86_400_000;
export const SPARK_PREPARATION_PAGE_READ_UNITS = 10;
export const SPARK_PREPARATION_GRANT_READ_UNITS = 40;
export const SPARK_PREPARATION_GRANT_WRITES = 3;
export const SPARK_PREPARATION_UID_READ_UNITS = 22_000;
export const SPARK_PREPARATION_PROJECT_READ_UNITS = 24_000;
export const SPARK_PREPARATION_UID_WRITES = 6000;
export const SPARK_PREPARATION_PROJECT_WRITES = 8000;

export function estimateSparkPreparation(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > 1_000_000_000_000) throw new Error('Revisão inválida.');
  const nodes = revision + 1;
  const pages = 2 * Math.ceil(nodes / SPARK_HISTORY_PAGE_SIZE) + 2;
  const grants = Math.ceil(pages / SPARK_PREPARATION_LEASE_PAGES);
  return { nodes, eventReads: 2 * nodes, pages, grants,
    writes: pages + SPARK_PREPARATION_GRANT_WRITES * grants,
    readUnits: pages * SPARK_PREPARATION_PAGE_READ_UNITS + grants * SPARK_PREPARATION_GRANT_READ_UNITS };
}

export type SparkPreparationMetrics = { attempts: number; explicitReads: number; confirmedWrites: number; pages: number; grants: number; segmentPages: number; reusedNodes: number };
export const createSparkPreparationMetrics = (): SparkPreparationMetrics => ({ attempts: 0, explicitReads: 0, confirmedWrites: 0, pages: 0, grants: 0, segmentPages: 0, reusedNodes: 0 });

export class SparkPreparationError extends Error {
  constructor(public readonly reason: 'paused' | 'budget-exhausted' | 'lease-required' | 'stale' | 'revision', message: string) { super(message); this.name = 'SparkPreparationError'; }
}

export const SPARK_SEGMENT_READ_UNITS = 20;
export const SPARK_SEGMENT_WRITES = 3;
export const SPARK_SEGMENT_MAX_NODES = 1_048_576;
