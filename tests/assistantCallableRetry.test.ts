import { AssistantOperationCancelled, withCallableRateLimitRetry } from '@/services/lumusAssistant/assistantCallableRetry';

const limited = (retryAfterMs: unknown = 1000) => ({ code: 'functions/resource-exhausted', details: { reason: 'rate-limit', retryAfterMs } });

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('waits for the server window and repeats only the same rejected request', async () => {
	const input = Object.freeze({ clientActionId: 'same-operation', valueInCents: 1200 });
	const callable = jest.fn().mockRejectedValueOnce(limited()).mockResolvedValue({ transactionId: 'saved' });
	const onRateLimit = jest.fn();
	const result = withCallableRateLimitRetry(() => callable(input), { canContinue: () => true, onRateLimit });
	await jest.advanceTimersByTimeAsync(999);
	expect(callable).toHaveBeenCalledTimes(1);
	expect(onRateLimit).toHaveBeenCalledTimes(1);
	await jest.advanceTimersByTimeAsync(1);
	await expect(result).resolves.toEqual({ transactionId: 'saved' });
	expect(callable.mock.calls.map(call => call[0])).toEqual([input, input]);
});

test.each([
	{ code: 'functions/unavailable' }, { code: 'functions/resource-exhausted' },
	limited(0), limited(-1), limited(NaN), limited(Infinity), limited(61_001), limited('1000'),
])('does not retry uncertain failures, other quotas or invalid wait metadata: %j', async error => {
	const request = jest.fn().mockRejectedValue(error);
	await expect(withCallableRateLimitRetry(request, { canContinue: () => true })).rejects.toBe(error);
	expect(request).toHaveBeenCalledTimes(1);
	expect(jest.getTimerCount()).toBe(0);
});

test('aborting a quota wait removes its timer and never starts another request', async () => {
	const controller = new AbortController();
	const request = jest.fn().mockRejectedValue(limited());
	const result = withCallableRateLimitRetry(request, { canContinue: () => true, signal: controller.signal });
	const rejected = expect(result).rejects.toBeInstanceOf(AssistantOperationCancelled);
	await jest.advanceTimersByTimeAsync(1);
	controller.abort();
	await rejected;
	await jest.advanceTimersByTimeAsync(60_000);
	expect(request).toHaveBeenCalledTimes(1);
	expect(jest.getTimerCount()).toBe(0);
});

test('a revoked authorization or changed UID during the wait prevents a resend', async () => {
	let active = true;
	const request = jest.fn().mockRejectedValue(limited());
	const result = withCallableRateLimitRetry(request, { canContinue: () => active });
	const rejected = expect(result).rejects.toBeInstanceOf(AssistantOperationCancelled);
	await jest.advanceTimersByTimeAsync(1);
	active = false;
	await jest.advanceTimersByTimeAsync(1000);
	await rejected;
	expect(request).toHaveBeenCalledTimes(1);
});

test('abort after a request began still returns its confirmed commit', async () => {
	const controller = new AbortController();
	let commit!: (value: string) => void;
	const request = jest.fn(() => new Promise<string>(resolve => { commit = resolve; }));
	const result = withCallableRateLimitRetry(request, { canContinue: () => true, signal: controller.signal });
	controller.abort();
	commit('saved');
	await expect(result).resolves.toBe('saved');
	expect(request).toHaveBeenCalledTimes(1);
});

test('persistent contention stops after three waits instead of retrying forever', async () => {
	const error = limited();
	const request = jest.fn().mockRejectedValue(error);
	const result = withCallableRateLimitRetry(request, { canContinue: () => true });
	const rejected = expect(result).rejects.toBe(error);
	await jest.advanceTimersByTimeAsync(3000);
	await rejected;
	expect(request).toHaveBeenCalledTimes(4);
	expect(jest.getTimerCount()).toBe(0);
});

test('no authorization context means a single attempt, without automatic recovery', async () => {
	const error = limited();
	const request = jest.fn().mockRejectedValue(error);
	await expect(withCallableRateLimitRetry(request)).rejects.toBe(error);
	expect(request).toHaveBeenCalledTimes(1);
});
