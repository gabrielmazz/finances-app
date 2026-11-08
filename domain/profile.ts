import type { UserProfile } from '../types/presentation/user-profile';

export function validateProfileName(name: string): string | null {
	if (!name.trim()) return 'Informe seu nome.';
	if (name.trim().length > 100) return 'Use até 100 caracteres no nome.';
	if (/[\u0000-\u001f\u007f]/.test(name)) return 'Use apenas texto no nome.';
	return null;
}

function readDate(value: unknown): Date | null {
	let date: Date;
	if (value instanceof Date) date = value;
	else if (typeof value === 'string') date = new Date(value);
	else if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function')
		date = value.toDate();
	else if (value && typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number')
		date = new Date(value.seconds * 1000);
	else return null;
	return Number.isFinite(date.getTime()) ? date : null;
}

export function parseProfile(uid: string, data: Record<string, unknown>, email: string | null): UserProfile {
	return {
		uid,
		name: typeof data.name === 'string' ? data.name : '',
		email: email || '',
		createdAt: readDate(data.createdAt),
		// Legacy flags were writable by other users under the published Rules; never grant authority.
		adminUser: false,
	};
}
