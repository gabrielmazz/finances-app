// Serialize intent rotation and allocation in the native JS process.
const locks = new Map<string, Promise<unknown>>();
export async function bankIntentLock<T>(key: string, action: () => Promise<T>): Promise<T> {
	const previous = locks.get(key) || Promise.resolve();
	const next = previous.catch(() => undefined).then(action);
	locks.set(key, next);
	try {
		return await next;
	} finally {
		if (locks.get(key) === next) locks.delete(key);
	}
}
