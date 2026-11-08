export const MANDATORY_REMINDER_CONFIG_VERSION = 1 as const;

export type MandatoryReminderDaysBefore = 0 | 1 | 2 | 3;

type ReminderConfigurationSource = Record<string, unknown> | null | undefined;

const isValidReminderHour = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;

const isValidReminderMinute = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 59;

export const normalizeMandatoryReminderDaysBefore = (
	value: unknown,
	fallback: MandatoryReminderDaysBefore = 1,
): MandatoryReminderDaysBefore => {
	const normalized = typeof value === 'number' ? Math.trunc(value) : typeof value === 'string' && value.trim() ? Number(value) : NaN;
	return normalized === 2 || normalized === 3 ? normalized : normalized === 0 || normalized === 1 ? normalized : fallback;
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
