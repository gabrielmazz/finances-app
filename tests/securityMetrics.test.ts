import {collectMetrics} from '../script/collect-security-metrics.cjs';

const series = (resourceType: string, value: number) => ({
 resource: {type: resourceType}, points: [{value: {int64Value: String(value)}}],
});

describe('production monitoring evidence', () => {
 afterEach(() => jest.restoreAllMocks());

 it('does not report a partial page as a complete metric total', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
   const url = new URL(String(input));
   if (url.searchParams.get('pageToken')) throw Error('Second page unavailable');
   return {ok: true, json: async () => url.searchParams.get('filter')?.includes('document/read_count')
    ? {timeSeries: [series('firestore.googleapis.com/Database', 7)], nextPageToken: 'more'}
    : {}} as Response;
  });
  const report = await collectMetrics('synthetic-token', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z');
  expect(report.metrics[0].total).toBeNull();
  expect(report.metrics[0].status).toBe('unavailable-with-current-service-or-permissions');
  expect(report.metrics[0].series).toHaveLength(1);
 });

 it('does not double count the same traffic exposed under two resource types', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({ok: true, json: async () => ({timeSeries: [
   series('datastore_request', 7), series('firestore.googleapis.com/Database', 7),
  ]})} as Response);
  const report = await collectMetrics('synthetic-token', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z');
  expect(report.metrics[0].total).toBe(7);
  expect(report.metrics[0].resourceDuplicatesNotSummed).toBe(true);
 });
});
