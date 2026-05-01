export const MAX_MANDATORY_INSTALLMENTS = 360;

// Regras de parcelamento documentadas no vault em [[Despesas Fixas]] e [[Receitas Fixas]].
export const sanitizeMandatoryInstallmentInput = (value: string) => value.replace(/\D/g, '').slice(0, 3);

export const normalizeMandatoryInstallmentTotal = (value: unknown): number | null => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	const normalizedValue = Math.floor(value);
	if (normalizedValue < 1 || normalizedValue > MAX_MANDATORY_INSTALLMENTS) {
		return null;
	}

	return normalizedValue;
};

export const normalizeMandatoryInstallmentsCompleted = (
	value: unknown,
	installmentTotal: number | null,
) => {
	const normalizedValue = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
	const nonNegativeValue = Math.max(0, normalizedValue);

	if (installmentTotal !== null) {
		return Math.min(nonNegativeValue, installmentTotal);
	}

	return nonNegativeValue;
};

export const isMandatoryInstallmentPlanComplete = (
	installmentTotal: number | null,
	installmentsCompleted: number,
) => installmentTotal !== null && installmentsCompleted >= installmentTotal;

export const getMandatoryInstallmentDisplayNumber = (
	installmentTotal: number | null,
	installmentsCompleted: number,
	isCurrentCycleCompleted: boolean,
) => {
	if (installmentTotal === null) {
		return null;
	}

	const safeCompleted = normalizeMandatoryInstallmentsCompleted(installmentsCompleted, installmentTotal);

	if (safeCompleted >= installmentTotal) {
		return installmentTotal;
	}

	if (isCurrentCycleCompleted) {
		return Math.max(1, safeCompleted);
	}

	return Math.min(safeCompleted + 1, installmentTotal);
};

export const formatMandatoryInstallmentLabel = (
	installmentTotal: number | null,
	installmentsCompleted: number,
	isCurrentCycleCompleted: boolean,
) => {
	const currentInstallment = getMandatoryInstallmentDisplayNumber(
		installmentTotal,
		installmentsCompleted,
		isCurrentCycleCompleted,
	);

	if (currentInstallment === null || installmentTotal === null) {
		return null;
	}

	return `Parcela ${currentInstallment} de ${installmentTotal}`;
};
