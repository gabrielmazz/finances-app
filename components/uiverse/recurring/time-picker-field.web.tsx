import React from 'react';
import { View } from 'react-native';
import { Clock3 } from 'lucide-react-native';

import { useScreenStyles } from '@/hooks/useScreenStyle';
import { isMandatoryReminderTimeValid } from '@/utils/mandatoryReminderTime';

type TimePickerFieldProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	accessibilityLabel?: string;
	triggerClassName?: string;
	inputClassName?: string;
};

export function TimePickerField({
	value,
	onChange,
	placeholder = 'Selecione o horário',
	isDisabled = false,
	accessibilityLabel = 'Selecionar horário',
	triggerClassName,
	inputClassName,
}: TimePickerFieldProps) {
	const {
		isDarkMode,
		inputField: defaultInputClassName,
		fieldContainerClassName,
	} = useScreenStyles();
	const resolvedTriggerClassName = triggerClassName ?? fieldContainerClassName;
	const resolvedInputClassName = inputClassName ?? defaultInputClassName;
	const inputValue = isMandatoryReminderTimeValid(value) ? value : '';

	return (
		<View className={resolvedTriggerClassName}>
			<input
				type="time"
				value={inputValue}
				onChange={event => onChange(event.currentTarget.value)}
				disabled={isDisabled}
				aria-label={accessibilityLabel}
				className={'h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none ' + resolvedInputClassName}
				style={{
					borderWidth: 0,
					color: isDarkMode ? '#F1F5F9' : '#0F172A',
					fontFamily: 'inherit',
				}}
				placeholder={placeholder}
			/>
			<View pointerEvents="none" className="items-center justify-center pr-3">
				<Clock3 size={18} color={isDarkMode ? '#94A3B8' : '#64748B'} />
			</View>
		</View>
	);
}

export default TimePickerField;
