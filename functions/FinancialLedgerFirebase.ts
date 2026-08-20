import { db, firebaseFunctions } from '@/FirebaseConfig';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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
};

export type TransferFundsInput = {
  groupId: string;
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

function parseFinancialAccount(id: string, value: unknown): FinancialLedgerAccount | null {
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
