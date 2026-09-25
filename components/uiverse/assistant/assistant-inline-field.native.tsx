import React from 'react';

import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import { Box } from '@/components/ui/box';
import { Input, InputField } from '@/components/ui/input';
import {
	Select,
	SelectBackdrop,
	SelectContent,
	SelectDragIndicator,
	SelectDragIndicatorWrapper,
	SelectIcon,
	SelectInput,
	SelectItem,
	SelectPortal,
	SelectTrigger,
} from '@/components/ui/select';
import { Text } from '@/components/ui/text';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import { TimePickerField } from '@/components/uiverse/recurring/time-picker-field';
import { DatePickerField } from '@/components/uiverse/shared/date-picker';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';
import { isAssistantOptionField, type AssistantInlineFieldProps } from './assistant-inline-field.types';

export type { AssistantFieldOption } from './assistant-inline-field.types';

export const AssistantInlineField = ({
	definition,
	valueLabel,
	value,
	choices,
	canEdit,
	isSaving,
	isDarkMode,
	error,
	onChangeValue,
	onBlur,
	onSelectChoice,
}: AssistantInlineFieldProps) => {
	const bodyText = LUMUS_CLASS_NAMES.body;
	const helperText = LUMUS_CLASS_NAMES.helper;
	const selectedChoiceIndex = choices.findIndex(choice => String(choice.value) === String(value));
	const selectedChoiceLabel = selectedChoiceIndex >= 0 ? choices[selectedChoiceIndex]?.label : undefined;
	const selectedChoice = selectedChoiceIndex >= 0 ? choices[selectedChoiceIndex] : undefined;
	const isOption = isAssistantOptionField(definition);
	const showUnavailableChoice = isOption && choices.length === 0;
	const isBankField = definition.kind === 'bank' || definition.choiceSource === 'banks';
	const isCategoryField = definition.kind === 'category';
	const multiline = definition.key === 'description' || definition.key === 'explanation';
	const keyboardType = definition.kind === 'money' || definition.kind === 'number'
		? 'decimal-pad'
		: definition.kind === 'time' ? 'numbers-and-punctuation' : 'default';
	const placeholder = definition.kind === 'money'
		? 'R$ 0,00'
		: definition.kind === 'date'
			? 'DD/MM/AAAA'
			: definition.kind === 'time'
				? 'Selecione o horário'
				: definition.kind === 'month'
					? 'AAAA-MM'
					: definition.kind === 'number'
						? 'Digite um número'
						: 'Digite aqui';
	const bankOptions: BankActionsheetOption[] = choices.map(choice => ({
		id: String(choice.value),
		name: choice.label,
		description: choice.description,
	}));
	const categoryOptions: TagActionsheetOption[] = choices.map(choice => ({
		id: String(choice.value),
		name: choice.label,
		description: choice.description,
	}));
	const selectedOption = selectedChoice
		? {
				id: String(selectedChoice.value),
				name: selectedChoice.label,
				description: selectedChoice.description,
			}
		: null;

	return (
		<Box className={ASSISTANT_CLASS_NAMES.inlineFieldEditor}>
			<Text className={ASSISTANT_CLASS_NAMES.inlineFieldLabel}>{definition.label}</Text>
			{showUnavailableChoice ? (
				<>
					<Input isDisabled className={ASSISTANT_CLASS_NAMES.inlineFieldInput}>
						<InputField accessibilityLabel={definition.label} value={valueLabel} className={ASSISTANT_CLASS_NAMES.inlineFieldInputText} />
					</Input>
					<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Nenhuma opção disponível para este campo.</Text>
				</>
			) : definition.kind === 'date' ? (
				<DatePickerField
					accessibilityLabel={definition.label}
					value={value}
					onChange={formattedValue => {
						onChangeValue(formattedValue);
						onBlur();
					}}
					placeholder={placeholder}
					triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
					inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
					isDisabled={!canEdit || isSaving}
				/>
			) : definition.kind === 'time' ? (
				<TimePickerField
					accessibilityLabel={definition.label}
					value={value}
					onChange={nextValue => {
						onChangeValue(nextValue);
						onBlur();
					}}
					placeholder={placeholder}
					triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
					inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
					isDisabled={!canEdit || isSaving}
				/>
			) : isOption && isBankField ? (
				<BankActionsheetSelector
					options={bankOptions}
					selectedId={value || null}
					selectedLabel={selectedChoice?.label ?? null}
					selectedOption={selectedOption}
					onSelect={bank => onSelectChoice(bank.id)}
					isDisabled={!canEdit || isSaving}
					isDarkMode={isDarkMode}
					bodyTextClassName={bodyText}
					helperTextClassName={helperText}
					triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
					placeholder="Selecione um banco"
					sheetTitle="Escolha o banco"
					accessibilityLabel={definition.label}
				/>
			) : isOption && isCategoryField ? (
				<TagActionsheetSelector
					options={categoryOptions}
					selectedId={value || null}
					selectedLabel={selectedChoice?.label ?? null}
					selectedOption={selectedOption}
					onSelect={category => onSelectChoice(category.id)}
					isDisabled={!canEdit || isSaving}
					isDarkMode={isDarkMode}
					bodyTextClassName={bodyText}
					helperTextClassName={helperText}
					triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
					placeholder="Selecione uma categoria"
					sheetTitle="Escolha a categoria"
					accessibilityLabel={definition.label}
				/>
			) : isOption ? (
				<Select
					selectedValue={selectedChoiceIndex >= 0 ? String(selectedChoiceIndex) : ''}
					onValueChange={selectedValue => {
						const selected = choices[Number(selectedValue)];
						if (selected) onSelectChoice(selected.value);
					}}
					isDisabled={!canEdit || isSaving}
				>
					<SelectTrigger accessibilityLabel={definition.label} variant="outline" size="md" className={ASSISTANT_CLASS_NAMES.inlineFieldInput}>
						<SelectInput value={selectedChoiceLabel} placeholder="Escolha uma opção" className={ASSISTANT_CLASS_NAMES.inlineFieldInputText} />
						<SelectIcon />
					</SelectTrigger>
					<SelectPortal>
						<SelectBackdrop />
						<SelectContent>
							<SelectDragIndicatorWrapper>
								<SelectDragIndicator />
							</SelectDragIndicatorWrapper>
							{choices.map((choice, index) => (
								<SelectItem key={`${definition.key}-${index}`} label={choice.label} value={String(index)} />
							))}
						</SelectContent>
					</SelectPortal>
				</Select>
			) : multiline ? (
				<Textarea isDisabled={!canEdit || isSaving} className={ASSISTANT_CLASS_NAMES.inlineFieldTextarea}>
					<TextareaInput
						accessibilityLabel={definition.label}
						value={value}
						onChangeText={onChangeValue}
						onBlur={onBlur}
						placeholder={placeholder}
						maxLength={800}
						className={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
					/>
				</Textarea>
			) : (
				<Input isDisabled={!canEdit || isSaving} className={ASSISTANT_CLASS_NAMES.inlineFieldInput}>
					<InputField
						accessibilityLabel={definition.label}
						value={value}
						onChangeText={onChangeValue}
						onBlur={onBlur}
						placeholder={placeholder}
						keyboardType={keyboardType}
						autoCapitalize={definition.kind === 'text' ? 'sentences' : 'none'}
						autoCorrect={definition.kind === 'text'}
						maxLength={definition.kind === 'text' ? 120 : undefined}
						className={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
					/>
				</Input>
			)}
			{error ? <Text accessibilityRole="alert" className="text-xs text-error-600 dark:text-error-400">{error}</Text> : null}
		</Box>
	);
};
