import React from 'react';
import { NumberInput, TextInput, Textarea } from '@mantine/core';

import BankActionsheetSelector, { type BankActionsheetOption } from '@/components/uiverse/banks/bank-actionsheet-selector';
import TagActionsheetSelector, { type TagActionsheetOption } from '@/components/uiverse/categories/tag-actionsheet-selector';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import TimePickerField from '@/components/uiverse/recurring/time-picker-field';
import WebSelectField from '@/components/web/shared/web-select-field';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';
import { isAssistantOptionField, type AssistantInlineFieldProps } from './assistant-inline-field.types';

export type { AssistantFieldOption } from './assistant-inline-field.types';

const fieldClassNames = {
	root: 'w-full',
	wrapper: 'w-full',
	input: ASSISTANT_CLASS_NAMES.inlineFieldInput,
	label: ASSISTANT_CLASS_NAMES.inlineFieldLabel,
	error: 'mt-2 text-sm text-error-600 dark:text-error-400',
};

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
	const selectedChoice = selectedChoiceIndex >= 0 ? choices[selectedChoiceIndex] : undefined;
	const isOption = isAssistantOptionField(definition);
	const showUnavailableChoice = isOption && choices.length === 0;
	const disabled = !canEdit || isSaving;
	const isBankField = definition.kind === 'bank' || definition.choiceSource === 'banks';
	const isCategoryField = definition.kind === 'category';
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

	if (showUnavailableChoice) {
		return (
			<div className="flex flex-col gap-2">
				<TextInput
					label={definition.label}
					name={definition.key}
					aria-label={definition.label}
					value={valueLabel}
					disabled
					error={error}
					classNames={fieldClassNames}
				/>
				<p className={ASSISTANT_CLASS_NAMES.cardMeta}>Nenhuma opção disponível para este campo.</p>
			</div>
		);
	}

	if (isOption) {
		return (
			<div className="flex w-full flex-col gap-2">
				<label className={ASSISTANT_CLASS_NAMES.inlineFieldLabel}>{definition.label}</label>
				{isBankField ? (
					<BankActionsheetSelector
						options={bankOptions}
						selectedId={value || null}
						selectedLabel={selectedChoice?.label ?? null}
						selectedOption={selectedOption}
						onSelect={bank => onSelectChoice(bank.id)}
						isDisabled={disabled}
						isDarkMode={isDarkMode}
						bodyTextClassName={bodyText}
						helperTextClassName={helperText}
						triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
						placeholder="Selecione um banco"
						sheetTitle="Escolha o banco"
						accessibilityLabel={definition.label}
					/>
				) : isCategoryField ? (
					<TagActionsheetSelector
						options={categoryOptions}
						selectedId={value || null}
						selectedLabel={selectedChoice?.label ?? null}
						selectedOption={selectedOption}
						onSelect={category => onSelectChoice(category.id)}
						isDisabled={disabled}
						isDarkMode={isDarkMode}
						bodyTextClassName={bodyText}
						helperTextClassName={helperText}
						triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
						placeholder="Selecione uma categoria"
						sheetTitle="Escolha a categoria"
						accessibilityLabel={definition.label}
					/>
				) : (
					<WebSelectField
						value={selectedChoiceIndex >= 0 ? String(selectedChoiceIndex) : ''}
						options={choices.map((choice, index) => ({
							value: String(index),
							label: choice.label,
							disabled: choice.disabled,
						}))}
						onChange={selectedIndex => {
							const selected = choices[Number(selectedIndex)];
							if (selected) onSelectChoice(selected.value);
						}}
						isDisabled={disabled}
						placeholder="Escolha uma opção"
						accessibilityLabel={definition.label}
					/>
				)}
				{error ? <p role="alert" className="text-xs text-error-600 dark:text-error-400">{error}</p> : null}
			</div>
		);
	}

	if (definition.kind === 'date' || definition.kind === 'time') {
		return (
			<div className="flex w-full flex-col gap-2">
				<label className={ASSISTANT_CLASS_NAMES.inlineFieldLabel}>{definition.label}</label>
				{definition.kind === 'date' ? (
					<DatePickerField
						accessibilityLabel={definition.label}
						value={value}
						onChange={formattedValue => {
							onChangeValue(formattedValue);
							onBlur();
						}}
						placeholder="DD/MM/AAAA"
						triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
						inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
						isDisabled={disabled}
					/>
				) : (
					<TimePickerField
						accessibilityLabel={definition.label}
						value={value}
						onChange={nextValue => {
							onChangeValue(nextValue);
							onBlur();
						}}
						placeholder="Selecione o horário"
						triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
						inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
						isDisabled={disabled}
					/>
				)}
				{error ? <p role="alert" className="text-xs text-error-600 dark:text-error-400">{error}</p> : null}
			</div>
		);
	}

	if (definition.kind === 'money' || definition.kind === 'number') {
		const isMoney = definition.kind === 'money';
		const isRate = definition.key === 'annualRateInBasisPoints' || definition.key === 'cdiPercentageInBasisPoints';
		return (
			<NumberInput
				label={definition.label}
				name={definition.key}
				aria-label={definition.label}
				placeholder={isMoney ? 'R$ 0,00' : 'Digite um número'}
				value={value}
				error={error}
				onChange={nextValue => onChangeValue(String(nextValue))}
				onBlur={onBlur}
				disabled={disabled}
				prefix={isMoney ? 'R$ ' : undefined}
				decimalSeparator=","
				thousandSeparator="."
				decimalScale={isMoney || isRate ? 2 : 0}
				fixedDecimalScale={false}
				allowNegative
				hideControls
				classNames={fieldClassNames}
			/>
		);
	}

	if (definition.key === 'description' || definition.key === 'explanation') {
		return (
			<Textarea
				label={definition.label}
				name={definition.key}
				aria-label={definition.label}
				placeholder="Digite aqui"
				value={value}
				onChange={event => onChangeValue(event.currentTarget.value)}
				onBlur={onBlur}
				disabled={disabled}
				maxLength={800}
				minRows={2}
				autosize
				error={error}
				classNames={{ ...fieldClassNames, input: ASSISTANT_CLASS_NAMES.inlineFieldTextarea }}
			/>
		);
	}

	return (
		<TextInput
			label={definition.label}
			name={definition.key}
			aria-label={definition.label}
			placeholder={definition.kind === 'month' ? 'AAAA-MM' : 'Digite aqui'}
			type={definition.kind === 'month' ? 'month' : undefined}
			value={value}
			error={error}
			onChange={event => onChangeValue(event.currentTarget.value)}
			onBlur={onBlur}
			disabled={disabled}
			maxLength={definition.kind === 'text' ? 120 : undefined}
			autoComplete="off"
			spellCheck={definition.kind === 'text'}
			classNames={fieldClassNames}
		/>
	);
};
