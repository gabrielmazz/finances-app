import type { TagUsageType } from '@/utils/tagUsage';

export type CategoryPlacement = 'expense' | 'mandatory-expense' | 'gain' | 'mandatory-gain';

export type CategoryAvailabilityPreset =
	| CategoryPlacement
	| 'expense-everywhere'
	| 'gain-everywhere'
	| 'regular-everywhere'
	| 'everywhere';

export type CategoryAvailabilityFields = {
	usageType: TagUsageType;
	isMandatoryExpense: boolean;
	isMandatoryGain: boolean;
	showInBothLists: boolean;
};

export type CategoryPlacementOption = {
	id: CategoryPlacement;
	label: string;
	description: string;
};

export type CategoryAvailabilityPresetOption = {
	id: CategoryAvailabilityPreset;
	label: string;
	description: string;
};

const placementFields: Record<CategoryPlacement, CategoryAvailabilityFields> = {
	expense: {
		usageType: 'expense',
		isMandatoryExpense: false,
		isMandatoryGain: false,
		showInBothLists: false,
	},
	'mandatory-expense': {
		usageType: 'expense',
		isMandatoryExpense: true,
		isMandatoryGain: false,
		showInBothLists: false,
	},
	gain: {
		usageType: 'gain',
		isMandatoryExpense: false,
		isMandatoryGain: false,
		showInBothLists: false,
	},
	'mandatory-gain': {
		usageType: 'gain',
		isMandatoryExpense: false,
		isMandatoryGain: true,
		showInBothLists: false,
	},
};

const presetFields: Record<CategoryAvailabilityPreset, CategoryAvailabilityFields> = {
	...placementFields,
	'expense-everywhere': {
		usageType: 'expense',
		isMandatoryExpense: true,
		isMandatoryGain: false,
		showInBothLists: true,
	},
	'gain-everywhere': {
		usageType: 'gain',
		isMandatoryExpense: false,
		isMandatoryGain: true,
		showInBothLists: true,
	},
	'regular-everywhere': {
		usageType: 'both',
		isMandatoryExpense: false,
		isMandatoryGain: false,
		showInBothLists: false,
	},
	everywhere: {
		usageType: 'both',
		isMandatoryExpense: true,
		isMandatoryGain: true,
		showInBothLists: true,
	},
};

export const categoryPlacementOptions: readonly CategoryPlacementOption[] = [
	{
		id: 'expense',
		label: 'Despesas do dia a dia - (Despesas comuns)',
		description: 'Para gastos como mercado, transporte ou lazer.',
	},
	{
		id: 'mandatory-expense',
		label: 'Despesas recorrentes - (Despesas obrigatórias)',
		description: 'Para compromissos como aluguel, internet ou assinaturas.',
	},
	{
		id: 'gain',
		label: 'Ganhos do dia a dia - (Ganhos comuns)',
		description: 'Para entradas pontuais, vendas ou rendas extras.',
	},
	{
		id: 'mandatory-gain',
		label: 'Ganhos recorrentes - (Ganhos obrigatórios)',
		description: 'Para entradas previstas, como salário ou aluguel recebido.',
	},
];

export const categoryAvailabilityPresetOptions: readonly CategoryAvailabilityPresetOption[] = [
	...categoryPlacementOptions.map(option => ({
		...option,
		description: `Usar somente em ${option.label.toLocaleLowerCase('pt-BR')}.`,
	})),
	{
		id: 'expense-everywhere',
		label: 'Todas as despesas',
		description: 'Usar em despesas do dia a dia e recorrentes.',
	},
	{
		id: 'gain-everywhere',
		label: 'Todos os ganhos',
		description: 'Usar em ganhos do dia a dia e recorrentes.',
	},
	{
		id: 'regular-everywhere',
		label: 'Ganhos e despesas do dia a dia - (Ganhos e despesas comuns)',
		description: 'Compartilhar nos lançamentos comuns de ganhos e despesas.',
	},
	{
		id: 'everywhere',
		label: 'Todos os lançamentos',
		description: 'Disponibilizar nas quatro telas de lançamento.',
	},
];

export function isCategoryPlacement(value: unknown): value is CategoryPlacement {
	return typeof value === 'string' && categoryPlacementOptions.some(option => option.id === value);
}

export function isCategoryAvailabilityPreset(value: unknown): value is CategoryAvailabilityPreset {
	return typeof value === 'string' && categoryAvailabilityPresetOptions.some(option => option.id === value);
}

export function getCategoryAvailabilityFields(
	preset: CategoryAvailabilityPreset,
): CategoryAvailabilityFields {
	return { ...presetFields[preset] };
}

export function getCategoryPlacementFields(placement: CategoryPlacement): CategoryAvailabilityFields {
	return { ...placementFields[placement] };
}

export function getCategoryPlacementOption(placement: CategoryPlacement): CategoryPlacementOption {
	return categoryPlacementOptions.find(option => option.id === placement) ?? categoryPlacementOptions[0];
}

export function getCategoryAvailabilityPresetOption(
	preset: CategoryAvailabilityPreset,
): CategoryAvailabilityPresetOption {
	return (
		categoryAvailabilityPresetOptions.find(option => option.id === preset) ??
		categoryAvailabilityPresetOptions[0]
	);
}

export function getCategoryAvailabilityPreset(
	fields: Partial<CategoryAvailabilityFields>,
): CategoryAvailabilityPreset | null {
	const usageType = fields.usageType;

	if (usageType !== 'expense' && usageType !== 'gain' && usageType !== 'both') {
		return null;
	}

	const normalized: CategoryAvailabilityFields = {
		usageType,
		isMandatoryExpense: Boolean(fields.isMandatoryExpense),
		isMandatoryGain: Boolean(fields.isMandatoryGain),
		showInBothLists: Boolean(fields.showInBothLists),
	};

	for (const [preset, presetValue] of Object.entries(presetFields) as Array<
		[CategoryAvailabilityPreset, CategoryAvailabilityFields]
	>) {
		if (
			presetValue.usageType === normalized.usageType &&
			presetValue.isMandatoryExpense === normalized.isMandatoryExpense &&
			presetValue.isMandatoryGain === normalized.isMandatoryGain &&
			presetValue.showInBothLists === normalized.showInBothLists
		) {
			return preset;
		}
	}

	return null;
}

export function getCategoryAvailabilitySummary(fields: Partial<CategoryAvailabilityFields>) {
	const preset = getCategoryAvailabilityPreset(fields);

	if (!preset) {
		return 'Uso personalizado existente';
	}

	return getCategoryAvailabilityPresetOption(preset).label;
}
