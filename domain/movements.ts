import { validCents } from './money';
import { validId } from './banks';
import type { CategorySource } from './categories';

export type MovementType = 'gain' | 'expense';
export type MovementInput = {
  name: string;
  type: MovementType;
  amountCents: number;
  accountId: string;
  categoryId: string;
  categorySource: CategorySource;
  date: string;
  explanation: string;
  paymentFormats: ('Variable' | 'External')[];
};
export type Movement = MovementInput & {
  id: string;
  status: 'posted' | 'cancelled';
  revision: number;
};

export function movementDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('movements/invalid-date');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1900 || date.getTime() > Date.now()) throw Error('movements/invalid-date');
  return date;
}

export function validateMovement(input: MovementInput): MovementInput {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw Error('movements/invalid-name');
  if (!['gain', 'expense'].includes(input.type)) throw Error('movements/invalid-type');
  if (!validCents(input.amountCents) || input.amountCents <= 0) throw Error('movements/invalid-amount');
  if (!validId(input.accountId)) throw Error('movements/invalid-account');
  if (typeof input.categoryId !== 'string' || !input.categoryId || input.categoryId.includes('/') || input.categoryId === '.' || input.categoryId === '..' || !['new', 'legacy', 'group-root', 'group-legacy'].includes(input.categorySource)) throw Error('movements/invalid-category');
  movementDate(input.date);
  if (typeof input.explanation !== 'string' || input.explanation.length > 500 || /[\x00-\x1f\x7f]/.test(input.explanation)) throw Error('movements/invalid-explanation');
  if (!Array.isArray(input.paymentFormats) || input.paymentFormats.length > 1 || input.paymentFormats.some(value => value !== 'Variable' && value !== 'External') || (input.type === 'expense' && input.paymentFormats.length)) throw Error('movements/invalid-format');
  return { ...input, name, explanation: input.explanation.trim() };
}

export function movementEffect(movement: Pick<Movement, 'accountId' | 'status' | 'type' | 'amountCents'> | null, accountId: string): number {
  return movement && movement.status === 'posted' && movement.accountId === accountId ? (movement.type === 'gain' ? movement.amountCents : -movement.amountCents) : 0;
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
