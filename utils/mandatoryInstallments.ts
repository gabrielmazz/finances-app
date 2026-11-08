export const MAX_MANDATORY_INSTALLMENTS = 360;

// Máscaras e prévia de datas dos campos de parcelas, sem quitação ou avanço de ciclos.
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



export const normalizeMandatoryInstallmentDate = (value: unknown): Date | null => {
	if (!value) {
		return null;
	}

	const toLocalDay = (date: Date) => {
		if (Number.isNaN(date.getTime())) {
			return null;
		}
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
	};

	if (value instanceof Date) {
		return toLocalDay(value);
	}

	if (typeof value === 'object' && value !== null) {
		const candidate = value as { toDate?: () => Date };
		if (typeof candidate.toDate === 'function') {
			return toLocalDay(candidate.toDate());
		}
	}

	if (typeof value === 'string' || typeof value === 'number') {
		return toLocalDay(new Date(value));
	}

	return null;
};

export const formatMandatoryInstallmentDateLabel = (value: Date | null) => {
	if (!value) {
		return 'data não definida';
	}

	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(value);
};

const getMonthDistance = (startDate: Date, endDate: Date) =>
	(endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());

export const getMandatoryInstallmentTotalFromDateRange = (startDate: Date | null, endDate: Date | null) => {
	if (!startDate || !endDate) {
		return null;
	}

	const monthDistance = getMonthDistance(startDate, endDate);
	return normalizeMandatoryInstallmentTotal(Math.max(1, monthDistance + 1));
};

export const getMandatoryInstallmentEndDateFromTotal = (
	startDate: Date | null,
	installmentTotal: number | null,
) => {
	if (!startDate || installmentTotal === null) {
		return null;
	}

	const monthIndex = startDate.getMonth() + installmentTotal - 1;
	const targetYear = startDate.getFullYear() + Math.floor(monthIndex / 12);
	const targetMonth = ((monthIndex % 12) + 12) % 12;
	const targetLastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
	const targetDay = Math.min(startDate.getDate(), targetLastDay);

	return new Date(targetYear, targetMonth, targetDay);
};
