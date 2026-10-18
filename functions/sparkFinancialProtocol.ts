import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { assertClientActionId } from '../utils/financialLedger';

export const SPARK_TRANSFER_PROOF_PROTOCOL = 'financial-proof-v6';
export const SPARK_MAX_CENTS = 1_000_000_000_000;
export type SparkIdentity = { groupId: string; actorId: string; clientActionId: string };
export type SparkPosition = {
  schemaVersion: 1; kind: 'bank' | 'cash' | 'investment'; active: true;
  balanceInCents: number; revision: number; lastOperationId: string | null;
  nextActivationAt: Timestamp | null;
};

export function assertSparkDocumentId(value: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value.includes('/')) {
    throw new Error('Identificador de documento inválido.');
  }
}

export function parseSparkPosition(value: Record<string, unknown>): SparkPosition {
  if (value.schemaVersion !== 1 || value.active !== true
    || !['bank', 'cash', 'investment'].includes(value.kind as string)
    || !Number.isSafeInteger(value.balanceInCents) || Math.abs(value.balanceInCents as number) > SPARK_MAX_CENTS
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.revision as number) >= SPARK_MAX_CENTS
    || !(value.nextActivationAt === null || value.nextActivationAt instanceof Timestamp)) {
    throw new Error('Posição financeira inválida ou inativa.');
  }
  return value as SparkPosition;
}

export function assertSparkPositionCurrent(position: SparkPosition): void {
  if (position.nextActivationAt && position.nextActivationAt.toMillis() <= Date.now()) {
    throw new Error('Ative as aberturas mensais vencidas antes de movimentar esta conta.');
  }
}

export function sparkText(value: string | null | undefined, max: number): string | null {
  if (value != null && typeof value !== 'string') throw new Error('Texto inválido.');
  const result = value?.trim() || null;
  if (result && result.length > max) throw new Error('Texto excede o limite permitido.');
  return result;
}

export function assertSparkBalance(kind: SparkPosition['kind'], balance: number, reason: string | null): void {
  if (!Number.isSafeInteger(balance) || Math.abs(balance) > SPARK_MAX_CENTS) throw new Error('Saldo fora do limite permitido.');
  if (balance < 0 && kind !== 'bank') throw new Error('Saldo insuficiente.');
  if (balance < 0 && (!reason || Array.from(reason).length < 3)) throw new Error('Saldo bancário negativo exige justificativa.');
}

/** [[Protocolo Financeiro Spark]]: callback só prepara efeitos; recibo/cota são obrigatórios. */
export async function runSparkOperation<T extends Record<string, unknown>>(
  firestore: Firestore,
  identity: SparkIdentity,
  prepare: (transaction: Transaction, role: 'admin' | 'member') => T | Promise<T>,
  apply: (transaction: Transaction, material: T) => Promise<Record<string, unknown> | void>,
): Promise<{ transactionId: string; idempotent: boolean }> {
  identity = { ...identity };
  if ('effectiveAt' in identity || 'date' in identity) {
    throw new Error('Esta prova não aceita data efetiva informada; use somente o instante de confirmação.');
  }
  [identity.groupId, identity.actorId].forEach(assertSparkDocumentId);
  assertClientActionId(identity.clientActionId);
  const assertActor = () => {
    if (getAuth(firestore.app).currentUser?.uid !== identity.actorId) throw new Error('A sessão autenticada mudou.');
  };
  const groupRef = doc(firestore, 'financialGroups', identity.groupId);
  const operationRef = doc(groupRef, 'sparkOperations', identity.clientActionId);
  const quotaRef = doc(firestore, 'sparkTransferQuotas', identity.actorId);
  const prepared = async (transaction: Transaction) => {
    assertActor();
    const group = (await transaction.get(groupRef)).data();
    const role = group?.members?.[identity.actorId];
    if (group?.sparkProtocol !== SPARK_TRANSFER_PROOF_PROTOCOL || group.status !== 'active' || !['admin', 'member'].includes(role)) {
      throw new Error('Grupo não habilitado para a prova Spark ou acesso revogado.');
    }
    return { schemaVersion: 1, actorId: identity.actorId, ...await prepare(transaction, role) };
  };
  const matches = (stored: Record<string, unknown>, material: Record<string, unknown>) =>
    Object.entries(material).every(([key, value]) => value instanceof Timestamp && stored[key] instanceof Timestamp
      ? value.isEqual(stored[key] as Timestamp) : stored[key] === value);

  try {
    return await runTransaction(firestore, async transaction => {
      const material = await prepared(transaction);
      const existing = await transaction.get(operationRef);
      if (existing.exists()) {
        if (!matches(existing.data(), material)) throw new Error('Identificador de operação já utilizado com outros argumentos.');
        return { transactionId: identity.clientActionId, idempotent: true };
      }
      const quota = (await transaction.get(quotaRef)).data();
      const windowStartInMillis = Math.floor(Date.now() / 60_000) * 60_000;
      const count = quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1;
      if (count > 120) throw new Error('Limite temporário de operações atingido. Aguarde o próximo minuto.');
      const derived = await apply(transaction, material);
      assertActor();
      transaction.set(operationRef, { ...material, ...derived, createdAt: serverTimestamp() });
      transaction.set(quotaRef, { groupId: identity.groupId, windowStartInMillis, count,
        lastOperationId: identity.clientActionId, updatedAt: serverTimestamp() });
      return { transactionId: identity.clientActionId, idempotent: false };
    });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code && ['permission-denied', 'aborted', 'unavailable', 'deadline-exceeded', 'unknown'].includes(code)) {
      // Conferir um commit concorrente só por leitura, sem reenviar escrita negada/incerta.
      try {
        const recovered = await runTransaction(firestore, async transaction => {
          const material = await prepared(transaction);
          const receipt = await transaction.get(operationRef);
          return receipt.exists() && matches(receipt.data(), material)
            ? { transactionId: identity.clientActionId, idempotent: true } : null;
        });
        if (recovered) return recovered;
      } catch { /* Conservar a falha original se a sessão, permissão ou rede não permitir leitura. */ }
    }
    throw error;
  }
}
