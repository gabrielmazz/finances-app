import { validCents } from './money';
import { validId } from './banks';
import type { CategorySource } from './categories';
import { referenceInstant } from './referenceTime';
import { financialDateKey } from '../utils/financialCivilDate';

export type MovementType = 'gain' | 'expense';
export const CASH_HISTORY_ID = 'cash-transactions';
export type ExpensePaymentMethod = 'debit' | 'credit';
export type ReferenceChoice = 'included' | 'after';
type ReferenceTreatment = ReferenceChoice | 'historical';
export type MovementInput = {
  name: string;
  type: MovementType;
  amountCents: number;
  accountId: string | null;
  paymentMethod?: ExpensePaymentMethod;
  categoryId: string;
  categorySource: CategorySource;
  date: string;
  time?: string;
  referenceTreatment?: ReferenceTreatment;
  explanation: string;
  paymentFormats: ('Variable' | 'External')[];
  isFromMandatory?: true;
};
export type Movement = MovementInput & {
  id: string;
  status: 'posted' | 'cancelled';
  revision: number;
};
export type BankOperationInput = Pick<MovementInput, 'amountCents' | 'date' | 'time' | 'referenceTreatment' | 'explanation'> & { accountId: string };
export type BankTransferInput = BankOperationInput & { destinationAccountId: string; destinationReferenceTreatment?: ReferenceChoice };
export type BankLedgerInput = BankOperationInput & Pick<MovementInput, 'name' | 'type' | 'paymentFormats'> & (
  { operation: 'cash-withdrawal' } |
  { operation: 'transfer-out' | 'transfer-in'; transferId: string }
);
export type LedgerInput = MovementInput | BankLedgerInput;
export type LedgerEntry = LedgerInput & Pick<Movement, 'id' | 'status' | 'revision'>;

export function movementDate(value: string, now = Date.now()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('movements/invalid-date');
  const date = new Date(`${value}T00:00:00.000Z`);
  const today = now === Number.POSITIVE_INFINITY ? now : financialDateKey(new Date(now));
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900 || date.getTime() > today) throw Error('movements/invalid-date');
  return date;
}

export function movementInstant(date: string, time: string, now = Date.now()): Date {
  try {
    return referenceInstant(date.split('-').reverse().join('/'), time, now);
  } catch (error) {
    if (error instanceof Error && error.message === 'banks/reference-time-future') throw Error('movements/future-time');
    throw Error('movements/invalid-time');
  }
}

export function validateMovement(input: MovementInput, now = Date.now()): MovementInput {
  if (input.accountId === null && input.referenceTreatment !== undefined) throw Error('movements/invalid-reference-treatment');
  if (input.paymentMethod !== undefined && (input.type !== 'expense' || input.accountId === null ||
      !['debit', 'credit'].includes(input.paymentMethod) || (input.paymentMethod === 'credit' && input.referenceTreatment !== undefined)))
    throw Error('movements/invalid-format');
  const value = validateMovementFields(input, now);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw Error('movements/invalid-name');
  if (!['gain', 'expense'].includes(input.type)) throw Error('movements/invalid-type');
  if (typeof input.categoryId !== 'string' || !input.categoryId || input.categoryId.includes('/') || input.categoryId === '.' || input.categoryId === '..' || !['new', 'legacy', 'group-root', 'group-legacy'].includes(input.categorySource)) throw Error('movements/invalid-category');
  if (!Array.isArray(input.paymentFormats) || input.paymentFormats.length > 1 || input.paymentFormats.some(value => value !== 'Variable' && value !== 'External') || (input.type === 'expense' && input.paymentFormats.length)) throw Error('movements/invalid-format');
  if (input.isFromMandatory !== undefined && input.isFromMandatory !== true) throw Error('movements/invalid-category');
  return { ...value, name, type: input.type, categoryId: input.categoryId, categorySource: input.categorySource,
    paymentFormats: input.paymentFormats, ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}), ...(input.isFromMandatory ? { isFromMandatory: true } : {}) };
}

export function validateBankOperation(input: BankOperationInput, now = Date.now()): BankOperationInput {
  return validateMovementFields(input, now);
}

function validateMovementFields<T extends string | null>(
  input: Omit<BankOperationInput, 'accountId'> & { accountId: T }, now: number,
) {
  if (!validCents(input.amountCents) || input.amountCents <= 0) throw Error('movements/invalid-amount');
  if (input.accountId !== null && !validId(input.accountId)) throw Error('movements/invalid-account');
  movementDate(input.date, now);
  if (input.time !== undefined) movementInstant(input.date, input.time, now);
  if (input.referenceTreatment !== undefined && !['included', 'after', 'historical'].includes(input.referenceTreatment)) throw Error('movements/invalid-reference-treatment');
  if (typeof input.explanation !== 'string' || input.explanation.length > 500 || /[\x00-\x1f\x7f]/.test(input.explanation)) throw Error('movements/invalid-explanation');
  return { accountId: input.accountId, amountCents: input.amountCents, date: input.date,
    ...(input.time !== undefined ? { time: input.time } : {}),
    ...(input.referenceTreatment !== undefined ? { referenceTreatment: input.referenceTreatment } : {}), explanation: input.explanation.trim() };
}

export function movementEffect(movement: Pick<Movement, 'accountId' | 'status' | 'type' | 'amountCents' | 'referenceTreatment' | 'paymentMethod'> | null, accountId: string): number {
  return movement && movement.status === 'posted' && movement.paymentMethod !== 'credit' && movement.accountId === accountId && movement.referenceTreatment !== 'included' && movement.referenceTreatment !== 'historical'
    ? (movement.type === 'gain' ? movement.amountCents : -movement.amountCents) : 0;
}

export function isIncomeOrExpenseTotal(item: { isBankTransfer?: boolean; isCashRescue?: boolean; isInvestmentDeposit?: boolean; isInvestmentRedemption?: boolean; isFinanceInvestment?: boolean; isFinanceInvestmentSync?: boolean; isBalanceAdjustment?: boolean }): boolean {
  return !item.isBankTransfer && !item.isCashRescue && !item.isInvestmentDeposit && !item.isInvestmentRedemption && !item.isFinanceInvestment && !item.isFinanceInvestmentSync && !item.isBalanceAdjustment;
}

// Equal IDs across storage namespaces do not prove that they are the same event.
export function hasAmbiguousMovementIds(items: { id: string; type: string; storageSource?: string }[]): boolean {
  const seen = new Map<string, string>();
  for (const item of items) {
    if (!item.storageSource) continue;
    const key = `${item.type}:${item.id}`;
    const source = seen.get(key);
    if (source && source !== item.storageSource) return true;
    seen.set(key, item.storageSource);
  }
  return false;
}
