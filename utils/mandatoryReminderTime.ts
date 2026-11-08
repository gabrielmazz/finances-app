const REMINDER_TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_MANDATORY_REMINDER_HOUR = 9;

export const DEFAULT_MANDATORY_REMINDER_MINUTE = 0;

export const DEFAULT_MANDATORY_REMINDER_TIME = '09:00';

export const formatMandatoryReminderTime = (hour: number, minute: number) =>
	`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export const isMandatoryReminderTimeValid = (value: string) => REMINDER_TIME_REGEX.test(value);

export const parseMandatoryReminderTime = (value: string) => {
	if (!isMandatoryReminderTimeValid(value)) {
		return null;
	}

	const [hour, minute] = value.split(':').map(part => Number(part));

	return {
		hour,
		minute,
	};
};
