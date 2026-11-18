import { referenceInstant } from '../domain/referenceTime';

test('a referência usa o horário de São Paulo independentemente do fuso do dispositivo', () => {
	expect(referenceInstant('02/01/2025', '12:30').toISOString()).toBe('2025-01-02T15:30:00.000Z');
	expect(referenceInstant('01/01/2018', '12:30').toISOString()).toBe('2018-01-01T14:30:00.000Z');
});

test('rejeita data impossível, hora inválida, futuro e hora repetida ou inexistente', () => {
	for (const [date, time] of [['31/02/2025', '12:00'], ['01/01/2025', '25:00']]) expect(() => referenceInstant(date, time)).toThrow('banks/invalid-date');
	expect(() => referenceInstant('', '12:00')).toThrow('banks/reference-date-required');
	expect(() => referenceInstant('01/01/2025', '')).toThrow('banks/reference-time-required');
	expect(() => referenceInstant('01/01/2099', '12:00')).toThrow('banks/reference-time-future');
	for (const date of ['04/11/2018', '17/02/2018']) expect(() => referenceInstant(date, date.startsWith('04') ? '00:30' : '23:30')).toThrow('banks/reference-time-ambiguous');
});
