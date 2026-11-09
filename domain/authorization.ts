export type Authorization = { generation: string; readOwners: string[]; groups: Record<string, 'admin' | 'member'> };
export function authorizationGeneration(claim: unknown): string | null {
	return typeof claim === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(claim) ? claim : null;
}
export function parseAuthorization(data: Record<string, unknown>, generation: string): Authorization {
	const owners = data.readOwners;
	const groups = data.groups;
	if (data.enabled !== true || data.generation !== generation || !Array.isArray(owners) || owners.length > 5 ||
		owners.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
		!groups || typeof groups !== 'object' || Array.isArray(groups) || Object.keys(groups).length > 5 ||
		Object.entries(groups).some(([id, role]) => !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !['admin','member'].includes(String(role)))) {
		throw new Error('context/access-denied');
	}
	return { generation, readOwners: owners as string[], groups: groups as Authorization['groups'] };
}
