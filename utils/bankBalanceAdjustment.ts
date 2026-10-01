import { isSafeIntegerCents } from './monthlyBalance';

export type BankBalanceAdjustment = {
	id: string;
	bankId: string;
	personId: string;
	date: Date;
	differenceInCents: number;
	previousBalanceInCents: number;
	targetBalanceInCents: number;
	description: string | null;
	status: 'active' | 'reversed' | 'replaced';
	reversesAdjustmentId?: string | null;
	groupId?: string | null;
};

export function calculateBankBalanceAdjustment(previous: number, target: number): number {
	const difference = target - previous;
	if (!isSafeIntegerCents(previous) || !isSafeIntegerCents(target) || !isSafeIntegerCents(difference)) {
		throw new Error('Informe um saldo válido em centavos.');
	}
	return difference;
}

export const canChangeBankBalanceAdjustment = (adjustment: Pick<BankBalanceAdjustment, 'status' | 'reversesAdjustmentId'>) =>
	adjustment.status === 'active' && !adjustment.reversesAdjustmentId;
