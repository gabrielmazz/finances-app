import { validCents } from './money';

export type BankScope = { kind: 'personal' | 'group'; id: string; uid: string };
export type AccountType = 'checking' | 'savings' | 'payment' | 'cash';
export type BankSource = 'new' | 'legacy' | 'group-legacy';
export type BankRef = { id: string; source: BankSource };
export type BankMetadata = {
	name: string;
	institutionKey: string;
	institutionName: string;
	accountType: AccountType;
	colorHex: string | null;
};
export type BankCreation = BankMetadata & {
	initialBalanceCents: number;
	openingDate: string;
	reason: string;
};
export type BankAccount = BankRef & {
	scope: BankScope;
	name: string;
	institutionKey: string;
	institutionName: string;
	accountType: AccountType | 'unknown';
	colorHex: string | null;
	balanceInCents: number | null;
	openingDate: string | null;
	status: 'active' | 'archived';
	revision: number;
	issue: string | null;
	blocked?: boolean;
};
export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'checking', label: 'Conta corrente' },
	{ value: 'savings', label: 'Poupança' },
	{ value: 'payment', label: 'Conta de pagamento' },
	{ value: 'cash', label: 'Carteira em dinheiro' },
];
export function validId(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function validateMetadata(input: BankMetadata): BankMetadata {
	if (
		typeof input.name !== 'string' ||
		!input.name.trim() ||
		input.name.trim().length > 100 ||
		/[\x00-\x1f\x7f]/.test(input.name)
	)
		throw Error('banks/invalid-name');
	if (typeof input.institutionKey !== 'string' || !/^[a-z0-9-]{1,64}$/.test(input.institutionKey))
		throw Error('banks/invalid-institution');
	if (
		typeof input.institutionName !== 'string' ||
		!input.institutionName.trim() ||
		input.institutionName.trim().length > 100 ||
		/[\x00-\x1f\x7f]/.test(input.institutionName)
	)
		throw Error('banks/invalid-institution');
	if (!ACCOUNT_TYPES.some((type) => type.value === input.accountType)) throw Error('banks/invalid-type');
	if (input.colorHex !== null && !/^#[a-fA-F0-9]{6}$/.test(input.colorHex))
		throw Error('banks/invalid-color');
	return {
		name: input.name.trim(),
		institutionKey: input.institutionKey,
		institutionName: input.institutionName.trim(),
		accountType: input.accountType,
		colorHex: input.colorHex,
	};
}
export function openingTimestamp(text: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw Error('banks/invalid-date');
	const date = new Date(text + 'T00:00:00.000Z');
	if (
		!Number.isFinite(date.getTime()) ||
		date.toISOString().slice(0, 10) !== text ||
		date.getUTCFullYear() < 1900 ||
		date.getTime() > Date.now()
	)
		throw Error('banks/invalid-date');
	return date;
}
export function validateCreation(input: BankCreation): BankCreation {
	const metadata = validateMetadata(input);
	if (!validCents(input.initialBalanceCents)) throw Error('banks/invalid-money');
	openingTimestamp(input.openingDate);
	if (
		typeof input.reason !== 'string' ||
		input.reason.length > 500 ||
		/[\x00-\x1f\x7f]/.test(input.reason) ||
		(input.initialBalanceCents < 0 && input.reason.trim().length < 3)
	)
		throw Error('banks/invalid-reason');
	return {
		...metadata,
		initialBalanceCents: input.initialBalanceCents,
		openingDate: input.openingDate,
		reason: input.initialBalanceCents < 0 ? input.reason.trim() : '',
	};
}
export function parseBank(
	id: string,
	source: BankSource,
	data: Record<string, any>,
	scope: BankScope,
): BankAccount {
	if (!validId(id) || !validId(scope.id) || !validId(scope.uid)) throw Error('banks/incompatible');
	if (source === 'new') {
		validateMetadata(data as BankMetadata);
		if (
			data.schemaVersion !== 1 ||
			data.scopeKind !== scope.kind ||
			data.scopeId !== scope.id ||
			!validCents(data.initialBalanceCents) ||
			(data.balanceCents !== undefined && !validCents(data.balanceCents)) ||
			!['active', 'archived'].includes(data.status) ||
			!Number.isSafeInteger(data.revision) ||
			data.revision < 0 ||
			!validId(data.createdBy) ||
			!validId(data.updatedBy) ||
			typeof data.createdAt?.toDate !== 'function' ||
			typeof data.updatedAt?.toDate !== 'function' ||
			typeof data.openingDate?.toDate !== 'function'
		)
			throw Error('banks/incompatible');
		return {
			id,
			source,
			scope,
			...validateMetadata(data as BankMetadata),
			balanceInCents: data.balanceCents ?? data.initialBalanceCents,
			openingDate: data.openingDate.toDate().toISOString().slice(0, 10),
			status: data.status,
			revision: data.revision,
			issue: null,
		};
	}
	if (
		(source === 'legacy' && (scope.kind !== 'personal' || data.personId !== scope.id || data.groupId != null || data.financialGroupId != null || data.ledgerGroupId != null)) ||
		(source === 'group-legacy' && (scope.kind !== 'group' || (data.groupId != null && data.groupId !== scope.id) || (data.financialGroupId != null && data.financialGroupId !== scope.id))) ||
		typeof data.name !== 'string' ||
		!data.name.trim() ||
		data.name.length > 100
	)
		throw Error('banks/incompatible');
	const invalidState = (data.isActive != null && typeof data.isActive !== 'boolean') ||
		(data.archived != null && typeof data.archived !== 'boolean') ||
		(data.status != null && !['active', 'archived'].includes(data.status));
	const archived = data.archived === true || data.status === 'archived';
	const inactive = data.isActive === false;
	return {
		id,
		source,
		scope,
		name: data.name,
		institutionName:
			typeof data.institutionName === 'string' &&
			data.institutionName.trim() &&
			data.institutionName.length <= 100
				? data.institutionName
				: data.name,
		institutionKey:
			typeof data.bankIconKey === 'string' && /^[a-z0-9-]{1,64}$/.test(data.bankIconKey)
				? data.bankIconKey
				: 'outro-banco',
		accountType: ACCOUNT_TYPES.some((type) => type.value === data.accountType) ? data.accountType : 'unknown',
		colorHex:
			typeof data.colorHex === 'string' && /^#[a-fA-F0-9]{6}$/.test(data.colorHex) ? data.colorHex : null,
		balanceInCents: null,
		openingDate: null,
		status: archived ? 'archived' : 'active',
		revision: Number.isSafeInteger(data.metadataRevision) ? data.metadataRevision : 0,
		blocked: invalidState || inactive,
		issue: invalidState ? 'A situação desta conta antiga precisa de revisão.' : inactive ? 'Conta antiga inativa; saldo e origem aguardam conciliação.' : 'Conta antiga: saldo e origem aguardam conciliação. O histórico foi preservado.',
	};
}
