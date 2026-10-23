import { doc, runTransaction, serverTimestamp, Timestamp, type Firestore, type Transaction } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { assertClientActionId } from '../utils/financialLedger';
import { getSparkQuotaBoundaryRecovery } from '../utils/sparkQuotaBoundary';
import { cancelSparkRecoveryFirebase, rememberSparkRecoveryConfirmation, requireSparkRecoveryInTransaction,
  reserveSparkRecoveryInTransaction, trackSparkRecoveryAttempt } from './SparkOperationRecoveryFirebase';

export const SPARK_TRANSFER_PROOF_PROTOCOL = 'financial-proof-v17';
export const SPARK_MAX_CENTS = 1_000_000_000_000;
export type SparkIdentity = { groupId: string; actorId: string; clientActionId: string };
export type SparkPosition = {
  schemaVersion: 1; kind: 'bank' | 'cash' | 'investment'; active: true;
  balanceInCents: number; revision: number; lastOperationId: string | null;
  nextActivationAt: Timestamp | null;
};
export type SparkStoredPosition = Omit<SparkPosition, 'active'> & { active: boolean };

export function assertSparkDocumentId(value: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || value.includes('/')) {
    throw new Error('Identificador de documento inválido.');
  }
}

export function parseSparkStoredPosition(value: Record<string, unknown>): SparkStoredPosition {
  if (value.schemaVersion !== 1 || typeof value.active !== 'boolean'
    || !['bank', 'cash', 'investment'].includes(value.kind as string)
    || !Number.isSafeInteger(value.balanceInCents) || Math.abs(value.balanceInCents as number) > SPARK_MAX_CENTS
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || (value.revision as number) > SPARK_MAX_CENTS
    || !(value.nextActivationAt === null || value.nextActivationAt instanceof Timestamp)) {
    throw new Error('Posição financeira inválida ou inativa.');
  }
  return value as SparkStoredPosition;
}

export function parseSparkPosition(value: Record<string, unknown>): SparkPosition {
  const position = parseSparkStoredPosition(value);
  if (!position.active || position.revision >= SPARK_MAX_CENTS) throw new Error('Posição financeira inválida ou inativa.');
  return position as SparkPosition;
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
  const equalMaterial = (value: unknown, stored: unknown): boolean => {
    if (value instanceof Timestamp) return stored instanceof Timestamp && value.isEqual(stored);
    if (Array.isArray(value)) return Array.isArray(stored) && value.length === stored.length && value.every((item, index) => equalMaterial(item, stored[index]));
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      return !!stored && typeof stored === 'object' && !Array.isArray(stored)
        && Object.keys(value).length === Object.keys(stored).length
        && Object.entries(value).every(([key, item]) => Object.hasOwn(stored, key) && equalMaterial(item, (stored as Record<string, unknown>)[key]));
    }
    return stored === value;
  };
  const matches = (stored: Record<string, unknown>, material: Record<string, unknown>) =>
    Object.entries(material).every(([key, value]) => equalMaterial(value, stored[key]));

  let attemptedWindow: number | null = null, reservationWindow: number | null = null, reserved = false, boundaryRecovered = false;
  const readReceipt = () => runTransaction(firestore, async transaction => {
    const material = await prepared(transaction), receipt = await transaction.get(operationRef);
    return { result: receipt.exists() && matches(receipt.data(), material)
      ? { transactionId: identity.clientActionId, idempotent: true } : null, absent: !receipt.exists() };
  });
  const recoverBoundary = async (window: number | null) => {
    if (window === null || boundaryRecovered) return false;
    const recovery = getSparkQuotaBoundaryRecovery(window, Date.now());
    if (!recovery) return false;
    boundaryRecovered = true;
    if (recovery.waitMs) await new Promise(resolve => setTimeout(resolve, recovery.waitMs));
    const now = Date.now();
    return now >= recovery.readyAt && Math.floor(now / 60000) * 60000 === recovery.window;
  };
  const attempt = () => runTransaction(firestore, async transaction => {
      const material = await prepared(transaction);
      const existing = await transaction.get(operationRef);
      if (existing.exists()) {
        if (!matches(existing.data(), material)) throw new Error('Identificador de operação já utilizado com outros argumentos.');
        return { transactionId: identity.clientActionId, idempotent: true };
      }
      const recoveryRef = await requireSparkRecoveryInTransaction(transaction, firestore, identity, material.kind as string);
      const quota = (await transaction.get(quotaRef)).data();
      const windowStartInMillis = Math.floor(Date.now() / 60_000) * 60_000;
      attemptedWindow = windowStartInMillis;
      const count = quota?.windowStartInMillis === windowStartInMillis ? quota.count + 1 : 1;
      if (count > 120) throw new Error('Limite temporário de operações atingido. Aguarde o próximo minuto.');
      const derived = await apply(transaction, material);
      assertActor();
      transaction.set(operationRef, { ...material, ...derived, createdAt: serverTimestamp() });
      transaction.set(quotaRef, { groupId: identity.groupId, windowStartInMillis, count,
        lastOperationId: identity.clientActionId, updatedAt: serverTimestamp() });
      transaction.update(recoveryRef, { status: 'committed', updatedAt: serverTimestamp() });
      return { transactionId: identity.clientActionId, idempotent: false };
    });
  const execute = async () => {
    // Reserva confirmada antes de enviar dinheiro: reload conserva a identidade e permite cancelamento atômico.
    const reserve = () => runTransaction(firestore, async transaction => {
      const material = await prepared(transaction), receipt = await transaction.get(operationRef);
      if (receipt.exists()) {
        if (!matches(receipt.data(), material)) throw new Error('Identificador de operação já utilizado com outros argumentos.');
        return;
      }
      reservationWindow = Math.floor(Date.now() / 60000) * 60000;
      await reserveSparkRecoveryInTransaction(transaction, firestore, identity, material.kind as string);
    });
    try { await reserve(); } catch (error) {
      let observed: Awaited<ReturnType<typeof readReceipt>> | null = null;
      try { observed = await readReceipt(); } catch { /* Preservar a falha original sem autorização ou rede. */ }
      if (observed?.result) return observed.result;
      let pending = false;
      if (observed?.absent) {
        try {
          await runTransaction(firestore, async transaction => {
            const material = await prepared(transaction);
            await requireSparkRecoveryInTransaction(transaction, firestore, identity, material.kind as string);
          }); pending = true;
        } catch { /* Outra sessão pode ter reservado o mesmo ID; só retomar com registro confirmado. */ }
      }
      if (!pending) {
        // O recibo pode ter chegado entre a primeira leitura e a conferência da reserva.
        try { const latest = await readReceipt(); if (latest.result) return latest.result; } catch { /* Preservar a falha original. */ }
        if ((error as { code?: string })?.code === 'permission-denied' && observed?.absent && await recoverBoundary(reservationWindow)) await reserve();
        else throw error;
      }
    }
    reserved = true;
    try {
      return await attempt();
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // Conferir um commit concorrente só por leitura, sem reenviar escrita negada/incerta.
      try {
        const recovered = await readReceipt();
        if (recovered.result) return recovered.result;
        // A ausência autenticada permite uma única retomada nas bordas do minuto;
        // a nova transação revalida todas as guardas e conserva ID/material.
        if (code === 'permission-denied' && recovered.absent && await recoverBoundary(attemptedWindow)) return await attempt();
      } catch { /* Conservar a falha original se a sessão, permissão ou rede não permitir leitura. */ }
      throw error;
    }
  };
  const stopTracking = trackSparkRecoveryAttempt(firestore, identity);
  try {
    const result = await execute(); rememberSparkRecoveryConfirmation(firestore, identity); return result;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (reserved && (!code || code === 'permission-denied' || code === 'invalid-argument' || code === 'failed-precondition')) {
      try {
        const status = await cancelSparkRecoveryFirebase(firestore, identity);
        if (status === 'committed' || status === 'resolved') {
          const recovered = await readReceipt();
          if (recovered.result) { rememberSparkRecoveryConfirmation(firestore, identity); return recovered.result; }
        }
        if (status === 'cancelled' && error && typeof error === 'object') {
          Object.assign(error, { sparkIntentCancelled: true });
        }
      } catch { /* Sem confirmação do cancelamento, conservar a identificação para conferência explícita. */ }
    }
    throw error;
  } finally { stopTracking(); }
}
