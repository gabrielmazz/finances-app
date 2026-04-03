// Mascara e validacao compartilhadas pelos lembretes obrigatorios conforme [[Notificações]], [[Despesas Fixas]] e [[Receitas Fixas]].

const REMINDER_TIME_DIGITS_REGEX = /\D/g;
const REMINDER_TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_MANDATORY_REMINDER_HOUR = 9;
export const DEFAULT_MANDATORY_REMINDER_MINUTE = 0;
export const DEFAULT_MANDATORY_REMINDER_TIME = '09:00';

const sanitizeDigits = (value: string) => value.replace(REMINDER_TIME_DIGITS_REGEX, '').slice(0, 4);

export const formatMandatoryReminderTime = (hour: number, minute: number) =>
	`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export const formatMandatoryReminderTimeInput = (value: string) => {
	const digits = sanitizeDigits(value);

	if (!digits) {
		return '';
	}

	if (digits.length <= 2) {
		return digits;
	}

	return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

export const finalizeMandatoryReminderTimeInput = (value: string) => {
	const digits = sanitizeDigits(value);

	if (!digits) {
		return DEFAULT_MANDATORY_REMINDER_TIME;
	}

	let completedDigits = digits;

	if (digits.length <= 2) {
		completedDigits = digits.padStart(2, '0').padEnd(4, '0');
	} else if (digits.length === 3) {
		completedDigits = `${digits.slice(0, 2)}${digits.slice(2)}0`;
	}

	const formattedTime = `${completedDigits.slice(0, 2)}:${completedDigits.slice(2, 4)}`;

	return REMINDER_TIME_REGEX.test(formattedTime) ? formattedTime : null;
};

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
