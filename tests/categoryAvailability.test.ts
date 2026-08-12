import {
	categoryAvailabilityPresetOptions,
	getCategoryAvailabilityFields,
	getCategoryAvailabilityPreset,
	getCategoryAvailabilitySummary,
	getCategoryPlacementFields,
	getCategoryPlacementOption,
} from '@/utils/categoryAvailability';

describe('category availability', () => {
	it.each([
		['expense', { usageType: 'expense', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false }],
		['mandatory-expense', { usageType: 'expense', isMandatoryExpense: true, isMandatoryGain: false, showInBothLists: false }],
		['gain', { usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false }],
		['mandatory-gain', { usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: true, showInBothLists: false }],
	] as const)('maps placement %s to the stored fields', (placement, expected) => {
		expect(getCategoryPlacementFields(placement)).toEqual(expected);
	});

	it.each([
		['expense-everywhere', { usageType: 'expense', isMandatoryExpense: true, isMandatoryGain: false, showInBothLists: true }],
		['gain-everywhere', { usageType: 'gain', isMandatoryExpense: false, isMandatoryGain: true, showInBothLists: true }],
		['regular-everywhere', { usageType: 'both', isMandatoryExpense: false, isMandatoryGain: false, showInBothLists: false }],
		['everywhere', { usageType: 'both', isMandatoryExpense: true, isMandatoryGain: true, showInBothLists: true }],
	] as const)('maps preset %s to the stored fields', (preset, expected) => {
		expect(getCategoryAvailabilityFields(preset)).toEqual(expected);
	});

	it('recognizes known legacy field combinations without changing them', () => {
		const fields = { usageType: 'gain' as const, isMandatoryExpense: false, isMandatoryGain: true, showInBothLists: false };

		expect(getCategoryAvailabilityPreset(fields)).toBe('mandatory-gain');
		expect(getCategoryAvailabilitySummary(fields)).toBe('Ganhos recorrentes - (Ganhos obrigatórios)');
	});

	it('preserves unsupported legacy combinations as custom usage', () => {
		const fields = { usageType: 'both' as const, isMandatoryExpense: true, isMandatoryGain: false, showInBothLists: false };

		expect(getCategoryAvailabilityPreset(fields)).toBeNull();
		expect(getCategoryAvailabilitySummary(fields)).toBe('Uso personalizado existente');
	});

	it('keeps all availability presets available for creation and editing', () => {
		expect(getCategoryPlacementOption('mandatory-expense')).toMatchObject({
		label: 'Despesas recorrentes - (Despesas obrigatórias)',
	});
		expect(categoryAvailabilityPresetOptions).toHaveLength(8);
	});
});
