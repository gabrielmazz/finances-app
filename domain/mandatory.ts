import { validCents } from './money';
import type { CategorySource } from './categories';
import { MAX_MANDATORY_INSTALLMENTS } from '../utils/mandatoryInstallments';
import { MAX_MONTHLY_BUSINESS_DAY } from '../utils/businessCalendar';
import type { MovementType } from './movements';

export type MandatoryInput = {
  type: MovementType;
  name: string;
  valueInCents: number;
  categoryId: string;
  categorySource: CategorySource;
  description: string;
  dueDay: number;
  usesBusinessDays: boolean;
  installmentTotal: number | null;
  installmentTotalValueInCents: number | null;
  installmentStartDate: string | null;
};

export type MandatoryTemplate = MandatoryInput & {
  id: string;
  revision: number;
  isActive: boolean;
  installmentsCompleted: number;
  lastCycle: string | null;
  lastMovementDate: string | null;
  lastAmountCents: number | null;
  lastInstallments: number;
};

export function civilDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function civilDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (year < 1900 || civilDay(date) !== value) throw Error('mandatory/invalid-date');
  return date;
}

export function validateMandatory(input: MandatoryInput): MandatoryInput {
  const name = input.name.trim(), description = input.description.trim();
  if (!name || name.length > 100 || description.length > 500) throw Error('mandatory/invalid-content');
  if (!validCents(input.valueInCents) || input.valueInCents <= 0) throw Error('mandatory/invalid-amount');
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > (input.usesBusinessDays ? MAX_MONTHLY_BUSINESS_DAY : 31)) throw Error('mandatory/invalid-due-day');
  const total = input.installmentTotal, totalValue = input.installmentTotalValueInCents;
  if (total === null) {
    if (totalValue !== null || input.installmentStartDate !== null) throw Error('mandatory/invalid-installments');
  } else {
    if (!Number.isInteger(total) || total < 1 || total > MAX_MANDATORY_INSTALLMENTS || !validCents(totalValue) ||
      totalValue < total || Math.floor(totalValue / total) !== input.valueInCents || !input.installmentStartDate) throw Error('mandatory/invalid-installments');
    civilDate(input.installmentStartDate);
  }
  return { ...input, name, description };
}

export function mandatoryAmount(template: MandatoryTemplate, installments: number): number {
  if (!Number.isSafeInteger(installments) || installments < 1) throw Error('mandatory/invalid-installments');
  if (template.installmentTotal === null) {
    if (installments !== 1) throw Error('mandatory/invalid-installments');
    return template.valueInCents;
  }
  const completed = template.installmentsCompleted + installments;
  if (completed > template.installmentTotal) throw Error('mandatory/invalid-installments');
  const amount = completed === template.installmentTotal
    ? template.installmentTotalValueInCents! - template.installmentsCompleted * template.valueInCents
    : installments * template.valueInCents;
  return amount;
}
