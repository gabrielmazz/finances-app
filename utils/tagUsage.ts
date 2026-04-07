export type FinancialTagUsageType = 'expense' | 'gain';
export type TagUsageType = FinancialTagUsageType | 'both';

type TagUsageMetadata = {
	usageType?: unknown;
	isMandatoryExpense?: boolean | null;
	isMandatoryGain?: boolean | null;
	showInBothLists?: boolean | null;
};

export function normalizeTagUsageType(value: unknown): TagUsageType | undefined {
	if (value === 'expense' || value === 'gain' || value === 'both') {
		return value;
	}

	return undefined;
}

export function tagSupportsUsage(
	usageType: unknown,
	targetUsage: FinancialTagUsageType,
	options: { allowUndefined?: boolean } = {},
) {
	const normalizedUsageType = normalizeTagUsageType(usageType);

	if (normalizedUsageType === targetUsage || normalizedUsageType === 'both') {
		return true;
	}

	return Boolean(options.allowUndefined) && normalizedUsageType === undefined;
}

export function getTagMandatoryFlag(tag: TagUsageMetadata, targetUsage: FinancialTagUsageType) {
	return targetUsage === 'expense' ? Boolean(tag.isMandatoryExpense) : Boolean(tag.isMandatoryGain);
}

export function isTagVisibleInRegularUsageList(
	tag: TagUsageMetadata,
	targetUsage: FinancialTagUsageType,
	options: { allowUndefinedUsageType?: boolean } = {},
) {
	const normalizedUsageType = normalizeTagUsageType(tag.usageType);

	if (!tagSupportsUsage(normalizedUsageType, targetUsage, { allowUndefined: options.allowUndefinedUsageType })) {
		return false;
	}

	if (normalizedUsageType === 'both') {
		return true;
	}

	const isMandatory = getTagMandatoryFlag(tag, targetUsage);
	return !isMandatory || Boolean(tag.showInBothLists);
}

export function isTagVisibleInMandatoryUsageList(
	tag: TagUsageMetadata,
	targetUsage: FinancialTagUsageType,
) {
	return tagSupportsUsage(tag.usageType, targetUsage) && getTagMandatoryFlag(tag, targetUsage);
}

export function getTagUsageTypeLabel(usageType: unknown) {
	const normalizedUsageType = normalizeTagUsageType(usageType);

	if (normalizedUsageType === 'expense') {
		return 'Despesas';
	}

	if (normalizedUsageType === 'gain') {
		return 'Ganhos';
	}

	if (normalizedUsageType === 'both') {
		return 'Ganhos e despesas';
	}

	return 'Nao definido';
}
