type Metric = { calls: number; documents: number; failures: number };
const metrics: Record<string, Metric> = {};
let authObservers = 0;

// Local logical counts: retries, indexes and dependent Rules reads can add billed reads.
export async function measureRead<T>(
	operation: string,
	read: () => Promise<T>,
	count: (result: T) => number,
): Promise<T> {
	const metric = (metrics[operation] ??= { calls: 0, documents: 0, failures: 0 });
	metric.calls++;
	try {
		const result = await read();
		metric.documents += count(result);
		return result;
	} catch (error) {
		metric.failures++;
		const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown';
		if (typeof __DEV__ !== 'undefined' && __DEV__ && ['permission-denied', 'failed-precondition', 'unavailable'].includes(code))
			console.warn(`[Firebase] ${operation}: ${code}`);
		throw error;
	}
}
export function trackAuthObserver() {
	authObservers++;
	return () => {
		authObservers--;
	};
}
export function getFirebaseDiagnostics() {
	return {
		authObservers,
		firestoreListeners: 0,
		operations: Object.fromEntries(Object.entries(metrics).map(([name, metric]) => [name, { ...metric }])),
	};
}
