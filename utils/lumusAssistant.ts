import type {
AssistantMessage
} from '@/types/lumusAssistant';

export const ASSISTANT_TIME_ZONE = 'America/Sao_Paulo' as const;

export const orderAssistantMessagesForDisplay = (messages: AssistantMessage[]): AssistantMessage[] => {
	const openQuestion = messages.find(message => message.type === 'question' && !message.answeredAt);
	return openQuestion ? [...messages.filter(message => message !== openQuestion), openQuestion] : messages;
};

const pad = (value: number) => String(value).padStart(2, '0');

const getSaoPauloDateTimeParts = (reference: Date) => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: ASSISTANT_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(reference);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find(part => part.type === type)?.value ?? 0);
	return {
		year: value('year'),
		month: value('month'),
		day: value('day'),
		hour: value('hour'),
		minute: value('minute'),
		second: value('second'),
	};
};

const getSaoPauloDateParts = (reference: Date) => {
	const { year, month, day } = getSaoPauloDateTimeParts(reference);
	return { year, month, day };
};

const formatCivilDate = (year: number, month: number, day: number) =>
	`${year}-${pad(month)}-${pad(day)}`;

const isValidCivilDate = (year: number, month: number, day: number) => {
	const candidate = new Date(Date.UTC(year, month - 1, day, 12));
	return candidate.getUTCFullYear() === year &&
		candidate.getUTCMonth() === month - 1 &&
		candidate.getUTCDate() === day;
};

const createSaoPauloDate = (
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
) => {
	const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
	let candidate = new Date(targetWallClock);
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const rendered = getSaoPauloDateTimeParts(candidate);
		const renderedWallClock = Date.UTC(
			rendered.year,
			rendered.month - 1,
			rendered.day,
			rendered.hour,
			rendered.minute,
			rendered.second,
		);
		const correction = targetWallClock - renderedWallClock;
		if (correction === 0) break;
		candidate = new Date(candidate.getTime() + correction);
	}
	const rendered = getSaoPauloDateTimeParts(candidate);
	return rendered.year === year && rendered.month === month && rendered.day === day &&
		rendered.hour === hour && rendered.minute === minute
		? candidate
		: null;
};

export const formatIsoDate = (date: Date) => {
	const { year, month, day } = getSaoPauloDateParts(date);
	return formatCivilDate(year, month, day);
};

export const parseIsoDateAtLocalNoon = (dateValue: unknown, timeValue?: unknown): Date | null => {
	if (typeof dateValue !== 'string') {
		return null;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
	if (!match) {
		return null;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	let hour = 12;
	let minute = 0;
	if (typeof timeValue === 'string') {
		const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeValue.trim());
		if (timeMatch) {
			hour = Number(timeMatch[1]);
			minute = Number(timeMatch[2]);
		}
	}

	if (!isValidCivilDate(year, month, day)) {
		return null;
	}
	return createSaoPauloDate(year, month, day, hour, minute);
};

export const normalizeAssistantDateInput = (
	value: unknown,
	reference = new Date(),
): string | null => {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return formatIsoDate(value);
	}
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value
		.trim()
		.toLocaleLowerCase('pt-BR')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
	if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
		return parseIsoDateAtLocalNoon(normalized) ? normalized : null;
	}

	const { year, month, day } = getSaoPauloDateParts(reference);
	const relativeDays: Record<string, number> = { hoje: 0, ontem: -1, anteontem: -2, amanha: 1 };
	if (normalized in relativeDays) {
		const date = new Date(Date.UTC(year, month - 1, day + relativeDays[normalized]!, 12));
		return formatCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	const currentMonthMatch = /^(?:dia\s+)?(\d{1,2})(?:\s+(?:deste|desse)\s+mes)?$/.exec(normalized);
	if (currentMonthMatch) {
		const requestedDay = Number(currentMonthMatch[1]);
		return isValidCivilDate(year, month, requestedDay)
			? formatCivilDate(year, month, requestedDay)
			: null;
	}

	const brDateMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(normalized);
	if (brDateMatch) {
		const parsedYear = brDateMatch[3]
			? Number(brDateMatch[3]) < 100
				? 2000 + Number(brDateMatch[3])
				: Number(brDateMatch[3])
			: year;
		const parsedMonth = Number(brDateMatch[2]);
		const parsedDay = Number(brDateMatch[1]);
		return isValidCivilDate(parsedYear, parsedMonth, parsedDay)
			? formatCivilDate(parsedYear, parsedMonth, parsedDay)
			: null;
	}

	return null;
};

export const parseMoneyToCents = (value: unknown): number | null => {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.round(value * 100);
	}
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value
		.trim()
		.toLocaleLowerCase('pt-BR')
		.replace(/r\$/g, '')
		.replace(/reais?/g, '')
		.replace(/\s/g, '');
	if (!normalized) {
		return null;
	}

	const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.';
	let numeric = normalized;
	if (numeric.includes(',') && numeric.includes('.')) {
		numeric = decimalSeparator === ',' ? numeric.replace(/\./g, '').replace(',', '.') : numeric.replace(/,/g, '');
	} else if (decimalSeparator === ',') {
		numeric = numeric.replace(',', '.');
	} else if (/^\d{1,3}(?:\.\d{3})+$/.test(numeric)) {
		numeric = numeric.replace(/\./g, '');
	}

	const parsed = Number(numeric);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
};

export const formatCents = (valueInCents: number) =>
	new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100);

export const maskFinancialValuesInText = (text: string) =>
	text
		.replace(/R\$\s*-?[\d.]+(?:,\d{1,2})?/gi, 'valor oculto')
		.replace(/\b-?\d+(?:[.,]\d{1,2})?\s*(?:reais?|centavos?)\b/gi, 'valor oculto')
		.replace(/\b-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\b/g, 'valor oculto');
