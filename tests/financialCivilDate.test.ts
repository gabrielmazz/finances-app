import { financialDayStart } from '../utils/financialCivilDate';

test('São Paulo day boundaries preserve dates and historical daylight-saving changes', () => {
  expect(financialDayStart(new Date('2025-03-01T00:00:00Z')).toISOString()).toBe('2025-03-01T03:00:00.000Z');
  expect(financialDayStart(new Date('2018-11-04T00:00:00Z')).toISOString()).toBe('2018-11-04T03:00:00.000Z');
  expect(financialDayStart(new Date('2018-11-05T00:00:00Z')).toISOString()).toBe('2018-11-05T02:00:00.000Z');
});
