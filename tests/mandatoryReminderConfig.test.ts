import {
	buildMandatoryReminderOffsets,
	formatMandatoryReminderSummary,
	isMandatoryReminderConfigured,
	normalizeMandatoryReminderDaysBefore,
} from '@/utils/mandatoryReminderConfig';

describe('mandatory reminder configuration', () => {
	it.each([
		[1, [1]],
		[2, [2, 1]],
		[3, [3, 2, 1]],
	])('expands %s selected days into cumulative daily offsets', (daysBefore, expected) => {
		expect(buildMandatoryReminderOffsets(daysBefore, false)).toEqual(expected);
	});

	it('adds a distinct due-date notification when requested', () => {
		expect(buildMandatoryReminderOffsets(3, true)).toEqual([3, 2, 1, 0]);
	});

	it('keeps legacy documents disabled until the new schema is saved', () => {
		expect(
			isMandatoryReminderConfigured({
				reminderEnabled: true,
				reminderHour: 9,
				reminderMinute: 0,
			}),
		).toBe(false);
		expect(
			isMandatoryReminderConfigured({
				reminderConfigVersion: 1,
				reminderEnabled: true,
				reminderDaysBefore: 2,
				reminderOnDueDate: false,
				reminderHour: 9,
				reminderMinute: 0,
			}),
		).toBe(true);
	});

	it('rejects an incomplete current schema but accepts a due-date-only reminder', () => {
		expect(
			isMandatoryReminderConfigured({
				reminderConfigVersion: 1,
				reminderEnabled: true,
				reminderOnDueDate: true,
				reminderHour: 9,
				reminderMinute: 0,
			}),
		).toBe(false);
		expect(
			isMandatoryReminderConfigured({
				reminderConfigVersion: 1,
				reminderEnabled: true,
				reminderDaysBefore: 0,
				reminderOnDueDate: true,
				reminderHour: 9,
				reminderMinute: 0,
			}),
		).toBe(true);
	});

	it('normalizes the expense selection and formats the full schedule', () => {
		expect(normalizeMandatoryReminderDaysBefore('3')).toBe(3);
		expect(
			formatMandatoryReminderSummary({
				enabled: true,
				daysBefore: 3,
				onDueDate: true,
				hour: 19,
				minute: 5,
			}),
		).toBe('3 dias seguidos antes + no vencimento • 19:05');
	});
});
