import type { AssistantOperationOptions } from '@/types/lumusAssistant';

export type CallableRetryOptions = AssistantOperationOptions & { canContinue(): boolean };

export class AssistantOperationCancelled extends Error {
	constructor() { super('Pedido cancelado antes de iniciar uma nova chamada.'); }
}

export function isCallableRateLimitError(error: unknown): error is { details: { reason: string; retryAfterMs?: unknown } } {
	if (!error || typeof error !== 'object') return false;
	const value = error as { code?: unknown; details?: { reason?: unknown } };
	return value.code === 'functions/resource-exhausted' && value.details?.reason === 'rate-limit';
}

function assertActive(options: CallableRetryOptions) {
	if (options.signal?.aborted || !options.canContinue()) throw new AssistantOperationCancelled();
}

function waitForQuota(milliseconds: number, options: CallableRetryOptions): Promise<void> {
	assertActive(options);
	return new Promise((resolve, reject) => {
		const cancel = () => {
			clearTimeout(timer);
			options.signal?.removeEventListener('abort', cancel);
			reject(new AssistantOperationCancelled());
		};
		const timer = setTimeout(() => {
			options.signal?.removeEventListener('abort', cancel);
			resolve();
		}, milliseconds);
		options.signal?.addEventListener('abort', cancel, { once: true });
	});
}

/** [[Assistente Lumus]]: só repetir uma recusa de cota anterior ao handler financeiro. */
export async function withCallableRateLimitRetry<T>(request: () => Promise<T>, options?: CallableRetryOptions): Promise<T> {
	for (let retries = 0; ; retries++) {
		if (options) assertActive(options);
		try { return await request(); }
		catch (error) {
			if (!options || !isCallableRateLimitError(error) || retries >= 3) throw error;
			const delay = error.details.retryAfterMs;
			if (typeof delay !== 'number' || !Number.isFinite(delay) || delay <= 0 || delay > 61_000) throw error;
			assertActive(options);
			options.onRateLimit?.();
			await waitForQuota(delay, options);
		}
	}
}
