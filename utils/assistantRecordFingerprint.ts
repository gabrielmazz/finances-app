const asDate = (value: unknown): Date | null => {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
		const date = value.toDate();
		return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
	}
	return null;
};

const canonicalize = (value: unknown): unknown => {
	const date = asDate(value);
	if (date) return { $date: date.toISOString() };
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
			.sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
	}
	return value;
};

/** Compare a proposal with persisted data; this is a version check, never an authorization token. */
export const createAssistantRecordFingerprint = (value: Record<string, unknown>) => {
	const serialized = JSON.stringify(canonicalize(value));
	let hash = 2166136261;
	for (let index = 0; index < serialized.length; index += 1) {
		hash ^= serialized.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
};
