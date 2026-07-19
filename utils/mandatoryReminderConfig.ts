export const MANDATORY_REMINDER_CONFIG_VERSION = 1 as const;

export type MandatoryReminderDaysBefore = 1 | 2 | 3;

type ReminderConfigurationSource = Record<string, unknown> | null | undefined;

type MandatoryReminderSummaryOptions = {
	enabled: boolean;
	daysBefore: number;
	onDueDate: boolean;
	hour: number;
	minute: number;
};

const isValidReminderHour = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;

const isValidReminderMinute = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59;

export const normalizeMandatoryReminderDaysBefore = (
	value: unknown,
	fallback: MandatoryReminderDaysBefore = 1,
): MandatoryReminderDaysBefore => {
	const normalized = typeof value === 'number' ? Math.trunc(value) : Number(value);
	return normalized === 2 || normalized === 3 ? normalized : normalized === 1 ? 1 : fallback;
};

export const normalizeMandatoryReminderLeadDays = (value: unknown, fallback = 0) => {
	const normalized = typeof value === 'number' ? Math.trunc(value) : Number(value);
	if (normalized >= 0 && normalized <= 3) {
		return normalized;
	}

	return Math.min(Math.max(Math.trunc(fallback) || 0, 0), 3);
};

export const buildMandatoryReminderOffsets = (daysBefore: number, onDueDate: boolean) => {
	const normalizedDaysBefore = normalizeMandatoryReminderLeadDays(daysBefore);
	const offsets = Array.from({ length: normalizedDaysBefore }, (_, index) => normalizedDaysBefore - index);

	if (onDueDate) {
		offsets.push(0);
	}

	return offsets;
};

// Configurações anteriores à versão atual ficam opt-out. O usuário precisa salvar o novo card
// para que agendas quebradas de versões legadas não sejam reativadas silenciosamente.
export const isMandatoryReminderConfigured = (source: ReminderConfigurationSource) => {
	if (!source || source.reminderConfigVersion !== MANDATORY_REMINDER_CONFIG_VERSION || source.reminderEnabled !== true) {
		return false;
	}

	const daysBefore =
		typeof source.reminderDaysBefore === 'number'
			? source.reminderDaysBefore
			: Number(source.reminderDaysBefore);
	const onDueDate = source.reminderOnDueDate === true;

	return (
		Number.isInteger(daysBefore) &&
		daysBefore >= 0 &&
		daysBefore <= 3 &&
		(daysBefore > 0 || onDueDate) &&
		isValidReminderHour(source.reminderHour) &&
		isValidReminderMinute(source.reminderMinute)
	);
};

const formatReminderClock = (hour: number, minute: number) =>
	`${String(Math.min(Math.max(Math.trunc(hour) || 0, 0), 23)).padStart(2, '0')}:${String(
		Math.min(Math.max(Math.trunc(minute) || 0, 0), 59),
	).padStart(2, '0')}`;

export const formatMandatoryReminderSummary = ({
	enabled,
	daysBefore,
	onDueDate,
	hour,
	minute,
}: MandatoryReminderSummaryOptions) => {
	if (!enabled) {
		return 'Desativado';
	}

	const normalizedDaysBefore = normalizeMandatoryReminderLeadDays(daysBefore);
	const advanceLabel =
		normalizedDaysBefore === 1
			? '1 dia antes'
			: normalizedDaysBefore > 1
				? `${normalizedDaysBefore} dias seguidos antes`
				: '';
	const scheduleLabel = [advanceLabel, onDueDate ? 'no vencimento' : ''].filter(Boolean).join(' + ');

	return `${scheduleLabel || 'No vencimento'} • ${formatReminderClock(hour, minute)}`;
};
