// Web Locks serialize creation of the durable operation ID across browser tabs.
export async function bankIntentLock<T>(key: string, action: () => Promise<T>): Promise<T> {
	if (!navigator.locks) throw Error('banks/intent-storage-unavailable');
	return navigator.locks.request(key, action);
}
