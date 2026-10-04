import { db, firebaseFunctions } from '@/FirebaseConfig';
import { collection, doc, documentId, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { validateLedgerTransaction, type LedgerTransaction } from '@/utils/financialLedger';

export type FinancialLedgerContext = {
  groupId: string;
  role: 'admin' | 'member';
};

export type FinancialLedgerAccount = {
  id: string;
  groupId: string;
  kind: 'bank' | 'cash' | 'investment';
  name: string;
  currentBalanceInCents: number;
  legacyBankId?: string | null;
  legacyInvestmentId?: string | null;
  colorHex?: string | null;
  iconKey?: string | null;
  archivedAt?: unknown;
  assistantActionId?: string;
  isActive?: boolean;
  bankAccountId?: string | null;
  personId?: string;
  initialValueInCents?: number;
  cdiPercentageInBasisPoints?: number;
  assetType?: string;
  valuationMethod?: string;
  redemptionTerm?: string;
  description?: string | null;
  date?: unknown;
};

export type TransferFundsInput = {
  groupId: string;
  assistantRequestFingerprint?: string; expectedActorId?: string;
  fromAccountId: string;
  toAccountId: string;
  amountInCents: number;
  effectiveAt: Date;
  clientActionId: string;
  note?: string | null;
  overdraftReason?: string | null;
  kind?: 'transfer' | 'investment_deposit' | 'investment_redemption';
};

const financialFunctions = firebaseFunctions;

function dataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseFinancialAccount(id: string, value: unknown): FinancialLedgerAccount | null {
  const data = dataRecord(value);
  const currentBalanceInCents = data.currentBalanceInCents;
  if (
    typeof data.groupId !== 'string' ||
    (data.kind !== 'bank' && data.kind !== 'cash' && data.kind !== 'investment') ||
    typeof data.name !== 'string' ||
    typeof currentBalanceInCents !== 'number' ||
    !Number.isSafeInteger(currentBalanceInCents)
  ) {
    return null;
  }
  return {
    id,
    groupId: data.groupId,
    kind: data.kind,
    name: data.name,
    currentBalanceInCents,
    legacyBankId: typeof data.legacyBankId === 'string' ? data.legacyBankId : null,
    legacyInvestmentId: typeof data.legacyInvestmentId === 'string' ? data.legacyInvestmentId : null,
    colorHex: typeof data.colorHex === 'string' ? data.colorHex : null,
    iconKey: typeof data.iconKey === 'string' ? data.iconKey : null,
    archivedAt: data.archivedAt ?? null,
    ...(typeof data.assistantActionId === 'string' ? { assistantActionId: data.assistantActionId } : {}),
    isActive: data.isActive !== false,
    bankAccountId: typeof data.bankAccountId === 'string' ? data.bankAccountId : null,
    ...(typeof data.personId === 'string' ? { personId: data.personId } : {}),
    ...(Number.isSafeInteger(data.initialValueInCents) ? { initialValueInCents: data.initialValueInCents as number } : {}),
    ...(Number.isSafeInteger(data.cdiPercentageInBasisPoints) ? { cdiPercentageInBasisPoints: data.cdiPercentageInBasisPoints as number } : {}),
    ...(typeof data.assetType === 'string' ? { assetType: data.assetType } : {}),
    ...(typeof data.valuationMethod === 'string' ? { valuationMethod: data.valuationMethod } : {}),
    ...(typeof data.redemptionTerm === 'string' ? { redemptionTerm: data.redemptionTerm } : {}),
    description: typeof data.description === 'string' ? data.description : null, date: data.date ?? null,
  };
}

/**
 * Returns null while a user is still on the read/write legacy layout. This is
 * the compatibility switch used by screens during the group-by-group rollout.
 */
export async function getFinancialLedgerContextFirebase(userId: string): Promise<FinancialLedgerContext | null> {
  const userSnapshot = await getDoc(doc(db, 'users', userId));
  if (!userSnapshot.exists()) return null;
  const data = dataRecord(userSnapshot.data());
  if (
    typeof data.financialGroupId !== 'string' ||
    (data.financialGroupRole !== 'admin' && data.financialGroupRole !== 'member')
  ) {
    return null;
  }
  return {
    groupId: data.financialGroupId,
    role: data.financialGroupRole,
  };
}

export async function getFinancialLedgerAccountsFirebase(groupId: string): Promise<FinancialLedgerAccount[]> {
  const snapshot = await getDocs(query(
    collection(db, 'financialAccounts'),
    where('groupId', '==', groupId),
  ));
  return snapshot.docs
    .flatMap((document) => {
      const account = parseFinancialAccount(document.id, document.data());
      return account ? [account] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

export function createFinancialClientActionId(prefix = 'financial'): string {
  const random = Math.random().toString(36).slice(2, 12);
  return prefix + '_' + Date.now().toString(36) + '_' + random;
}

export async function transferFundsFinancialLedgerFirebase(input: TransferFundsInput): Promise<{
  transactionId: string;
  idempotent: boolean;
}> {
  const callable = httpsCallable<TransferFundsInput, { transactionId: string; idempotent: boolean }>(
    financialFunctions,
    'transferFunds',
  );
  const result = await callable(input);
  return result.data;
}

export async function postLedgerMovementFirebase(input: {
  groupId: string;
  assistantRequestFingerprint?: string; expectedActorId?: string;
  accountId: string;
  direction: 'income' | 'expense';
  amountInCents: number;
  effectiveAt: Date;
  clientActionId: string;
  categoryId?: string | null;
  note?: string | null;
  overdraftReason?: string | null;
}) {
  const callable = httpsCallable<typeof input, { transactionId: string; idempotent: boolean }>(
    financialFunctions,
    'postMovement',
  );
  const result = await callable(input);
  return result.data;
}

export async function reverseFinancialLedgerTransactionFirebase(input: {
  groupId: string; assistantRequestFingerprint?: string; expectedActorId?: string; transactionId: string; clientActionId: string; effectiveAt: Date; note?: string | null;
}) {
  return (await httpsCallable<typeof input, { transactionId: string; idempotent: boolean }>(financialFunctions, 'reverseTransaction')(input)).data;
}

export async function correctFinancialLedgerMovementFirebase(input: {
  groupId: string; assistantRequestFingerprint?: string; expectedActorId?: string; originalTransactionId: string; accountId: string; direction: 'income' | 'expense';
  amountInCents: number; effectiveAt: Date; clientActionId: string; categoryId?: string | null;
  note?: string | null; overdraftReason?: string | null;
}) {
  return (await httpsCallable<typeof input, { transactionId: string; reversalTransactionId: string; idempotent: boolean }>(financialFunctions, 'correctMovement')(input)).data;
}

export async function manageFinancialLedgerAccountFirebase(input: {
  groupId: string; assistantRequestFingerprint?: string; expectedActorId?: string; action: 'create' | 'update' | 'rename' | 'archive'; clientActionId: string; accountId?: string;
  kind?: 'bank' | 'cash' | 'investment'; name?: string; initialBalanceInCents?: number; initialCountedBalanceInCents?: number; effectiveAt?: Date;
  overdraftReason?: string | null; expectedName?: string; expectedFingerprint?: string; fundingAccountId?: string; metadata?: Record<string, unknown>; countedBalanceInCents?: number; initialValueInCents?: number;
}) {
  return (await httpsCallable<typeof input, { accountId: string; idempotent: boolean }>(financialFunctions, 'manageAccount')(input)).data;
}

export async function reconcileFinancialLedgerAccountFirebase(input: {
  groupId: string; assistantRequestFingerprint?: string; expectedActorId?: string; accountId: string; countedBalanceInCents: number; effectiveAt: Date; clientActionId: string;
  note?: string | null; overdraftReason?: string | null;
}) {
  return (await httpsCallable<typeof input, { reconciliationId: string; transactionId: string | null; differenceInCents: number }>(financialFunctions, 'reconcileAccount')(input)).data;
}

/** Complete group history, including reversals outside a report's selected period. */
export async function getFinancialLedgerTransactionsFirebase(groupId: string): Promise<LedgerTransaction[]> {
  const transactions: LedgerTransaction[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    const snapshot = await getDocs(query(
      collection(db, 'ledgerTransactions'), where('groupId', '==', groupId),
      orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200),
    ));
    for (const document of snapshot.docs) {
      const data = document.data();
      const storedDate = data.effectiveAt;
      const effectiveAt = storedDate instanceof Date ? storedDate
        : storedDate && typeof storedDate.toDate === 'function' ? storedDate.toDate()
          : new Date(storedDate);
      const transaction = { ...data, id: document.id, effectiveAt } as LedgerTransaction;
      validateLedgerTransaction(transaction);
      if (transaction.groupId !== groupId) throw new Error('Evento financeiro fora do grupo solicitado.');
      transactions.push(transaction);
    }
    if (snapshot.docs.length < 200) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  } while (cursor);
  return transactions;
}

export async function manageFinancialMetadataFirebase(input: {
  groupId?: string; assistantRequestFingerprint?: string; expectedActorId?: string; domain: 'category' | 'mandatoryExpense' | 'mandatoryGain' | 'cdi';
  action: 'create' | 'update' | 'delete' | 'upsert'; clientActionId: string; fields: Record<string, unknown>;
  recordId?: string; expectedFingerprint?: string;
}) {
  return (await httpsCallable<typeof input, { recordId: string; idempotent: boolean }>(financialFunctions, 'manageFinancialMetadata')(input)).data;
}

export async function completeFinancialRecurringFirebase(input: {
  groupId: string; assistantRequestFingerprint?: string; expectedActorId?: string; templateId: string; recurringType: 'expense' | 'gain'; action: 'settle' | 'undo';
  effectiveAt: Date; clientActionId: string; accountId?: string; installmentsToAdvance?: number;
  valueInCents?: number; overdraftReason?: string | null; expectedFingerprint?: string;
}) {
  return (await httpsCallable<typeof input, { transactionId: string; amountInCents: number; idempotent: boolean }>(financialFunctions, 'completeFinancialRecurring')(input)).data;
}
