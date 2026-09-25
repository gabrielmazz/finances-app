import React from 'react';
import { Pressable } from 'react-native';
import { Check, Pencil, X } from 'lucide-react-native';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
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
import { TimePickerField } from '@/components/uiverse/recurring/time-picker-field';
import { DatePickerField } from '@/components/uiverse/shared/date-picker';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import type { AssistantMissingField } from '@/types/lumusAssistant';

export type AssistantFieldOption = {
	value: unknown;
	label: string;
	description?: string;
};

type Props = {
	definition: AssistantMissingField;
	valueLabel: string;
	choices: AssistantFieldOption[];
	canEdit: boolean;
	isEditing: boolean;
	isSaving: boolean;
	editValue: string;
	error?: string | null;
	onStartEdit(): void;
	onChangeEditValue(value: string): void;
	onSave(): void;
	onSelectChoice(value: unknown): void;
	onCancel(): void;
};

const isOptionField = (field: AssistantMissingField) =>
	Boolean(field.choiceSource) || field.kind === 'boolean' || field.kind === 'choice';

export const AssistantInlineField = ({
	definition, valueLabel, choices, canEdit, isEditing, isSaving, editValue, error,
	onStartEdit, onChangeEditValue, onSave, onSelectChoice, onCancel,
}: Props) => {
	const selectedChoiceIndex = choices.findIndex(choice => String(choice.value) === String(editValue));
	const selectedChoiceLabel = selectedChoiceIndex >= 0 ? choices[selectedChoiceIndex]?.label : undefined;
	const showUnavailableChoice = isOptionField(definition) && choices.length === 0;
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

	return (
		<Box>
			<Text className={isEditing ? ASSISTANT_CLASS_NAMES.inlineFieldLabel : ASSISTANT_CLASS_NAMES.fieldLabel}>
				{definition.label}
			</Text>
			{isEditing ? (
				<Box className={ASSISTANT_CLASS_NAMES.inlineFieldEditor}>
					{showUnavailableChoice ? (
						<Text className={ASSISTANT_CLASS_NAMES.cardMeta}>Nenhuma opção disponível para este campo.</Text>
					) : definition.kind === 'date' ? (
						<DatePickerField
							accessibilityLabel={`Editar ${definition.label}`}
							value={editValue}
							onChange={formattedValue => onChangeEditValue(formattedValue)}
							placeholder={placeholder}
							triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
							inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
						/>
					) : definition.kind === 'time' ? (
						<TimePickerField
							accessibilityLabel={`Editar ${definition.label}`}
							value={editValue}
							onChange={onChangeEditValue}
							placeholder={placeholder}
							triggerClassName={ASSISTANT_CLASS_NAMES.inlineFieldInput}
							inputClassName={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
						/>
					) : isOptionField(definition) ? (
						<Select
							selectedValue={selectedChoiceIndex >= 0 ? String(selectedChoiceIndex) : ''}
							onValueChange={selectedValue => {
								const selected = choices[Number(selectedValue)];
								if (selected) onSelectChoice(selected.value);
							}}
							isDisabled={isSaving}
						>
							<SelectTrigger accessibilityLabel={`Editar ${definition.label}`} variant="outline" size="md" className={ASSISTANT_CLASS_NAMES.inlineFieldInput}>
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
						<Textarea isDisabled={isSaving} className={ASSISTANT_CLASS_NAMES.inlineFieldTextarea}>
							<TextareaInput
								accessibilityLabel={`Editar ${definition.label}`}
								autoFocus
								value={editValue}
								onChangeText={onChangeEditValue}
								placeholder={placeholder}
								maxLength={definition.key === 'description' || definition.key === 'explanation' ? 800 : 120}
								className={ASSISTANT_CLASS_NAMES.inlineFieldInputText}
							/>
						</Textarea>
					) : (
						<Input isDisabled={isSaving} className={ASSISTANT_CLASS_NAMES.inlineFieldInput}>
							<InputField
								accessibilityLabel={`Editar ${definition.label}`}
								autoFocus
								value={editValue}
								onChangeText={onChangeEditValue}
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
					<HStack className={ASSISTANT_CLASS_NAMES.inlineFieldActions}>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Cancelar edição de ${definition.label}`}
							disabled={isSaving}
							onPress={onCancel}
							className={ASSISTANT_CLASS_NAMES.inlineFieldCancel}
						>
							<Icon as={X} size="sm" className="text-slate-600 dark:text-slate-300" />
						</Pressable>
						{!isOptionField(definition) ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`Salvar ${definition.label}`}
								disabled={isSaving || showUnavailableChoice}
								onPress={onSave}
								className={ASSISTANT_CLASS_NAMES.inlineFieldSave}
							>
								<Icon as={Check} size="sm" className="text-lumus-on-accent" />
							</Pressable>
						) : null}
					</HStack>
				</Box>
			) : (
				<HStack className={ASSISTANT_CLASS_NAMES.fieldValueRow}>
					<Text className={ASSISTANT_CLASS_NAMES.fieldValue}>{valueLabel}</Text>
					{canEdit ? (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Editar ${definition.label}`}
							onPress={onStartEdit}
							className={ASSISTANT_CLASS_NAMES.editButton}
						>
							<Icon as={Pencil} size="sm" className="text-slate-500 dark:text-slate-400" />
						</Pressable>
					) : null}
				</HStack>
			)}
		</Box>
	);
};
