import type { AssistantMissingField } from '@/types/lumusAssistant';

export type AssistantFieldOption = {
	value: unknown;
	label: string;
	description?: string;
	disabled?: boolean;
};

export type AssistantInlineFieldProps = {
	definition: AssistantMissingField;
	valueLabel: string;
	value: string;
	choices: AssistantFieldOption[];
	canEdit: boolean;
	isSaving: boolean;
	isDarkMode: boolean;
	error?: string | null;
	onChangeValue(value: string): void;
	onBlur(): void;
	onSelectChoice(value: unknown): void;
};

export const isAssistantOptionField = (field: AssistantMissingField) =>
	Boolean(field.choiceSource) || ['boolean', 'bank', 'category', 'choice', 'investment', 'record'].includes(field.kind);
