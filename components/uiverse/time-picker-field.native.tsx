import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, {
	type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Clock3 } from 'lucide-react-native';

import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import {
	DEFAULT_MANDATORY_REMINDER_HOUR,
	DEFAULT_MANDATORY_REMINDER_MINUTE,
	formatMandatoryReminderTime,
	parseMandatoryReminderTime,
} from '@/utils/mandatoryReminderTime';

type TimePickerFieldProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	accessibilityLabel?: string;
	triggerClassName?: string;
	inputClassName?: string;
};

const getDateFromTime = (value: string) => {
	const parsedTime = parseMandatoryReminderTime(value);
	const date = new Date();
	date.setHours(
		parsedTime?.hour ?? DEFAULT_MANDATORY_REMINDER_HOUR,
		parsedTime?.minute ?? DEFAULT_MANDATORY_REMINDER_MINUTE,
		0,
		0,
	);
	return date;
};

const formatDateToTime = (date: Date) => formatMandatoryReminderTime(date.getHours(), date.getMinutes());

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
		modalContentClassName,
		submitButtonClassName,
		submitButtonCancelClassName,
	} = useScreenStyles();
	const [isPickerOpen, setIsPickerOpen] = React.useState(false);
	const [draftDate, setDraftDate] = React.useState(() => getDateFromTime(value));

	const handleOpen = React.useCallback(() => {
		if (isDisabled) {
			return;
		}

		setDraftDate(getDateFromTime(value));
		setIsPickerOpen(true);
	}, [isDisabled, value]);

	const handleCancel = React.useCallback(() => {
		setIsPickerOpen(false);
	}, []);

	const handleConfirm = React.useCallback(() => {
		onChange(formatDateToTime(draftDate));
		setIsPickerOpen(false);
	}, [draftDate, onChange]);

	const handlePickerChange = React.useCallback(
		(event: DateTimePickerEvent, selectedDate?: Date) => {
			if (Platform.OS === 'android') {
				setIsPickerOpen(false);
				if (event.type === 'set' && selectedDate) {
					onChange(formatDateToTime(selectedDate));
				}
				return;
			}

			if (selectedDate) {
				setDraftDate(selectedDate);
			}
		},
		[onChange],
	);

	const focusedClassName = isPickerOpen ? (isDarkMode ? 'border-yellow-300' : 'border-[#FFE000]') : '';
	const resolvedTriggerClassName = [triggerClassName ?? fieldContainerClassName, focusedClassName]
		.filter(Boolean)
		.join(' ');
	const resolvedInputClassName = inputClassName ?? defaultInputClassName;

	return (
		<>
			<Pressable
				onPress={handleOpen}
				disabled={isDisabled}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={{ disabled: isDisabled, expanded: isPickerOpen }}
			>
				<View pointerEvents="none">
					<Input isDisabled={isDisabled} className={resolvedTriggerClassName}>
						<InputField
							value={value}
							placeholder={placeholder}
							editable={false}
							className={resolvedInputClassName}
						/>
						<InputSlot className="pr-3">
							<InputIcon as={Clock3} />
						</InputSlot>
					</Input>
				</View>
			</Pressable>

			{isPickerOpen && Platform.OS === 'android' ? (
				<DateTimePicker
					value={draftDate}
					mode="time"
					is24Hour
					display="default"
					positiveButton={{ textColor: '#FACC15' }}
					negativeButton={{ textColor: '#FACC15' }}
					onChange={handlePickerChange}
				/>
			) : null}

			{isPickerOpen && Platform.OS === 'ios' ? (
				<Modal isOpen onClose={handleCancel}>
					<ModalBackdrop />
					<ModalContent className={'max-w-[360px] ' + modalContentClassName}>
						<ModalHeader>
							<ModalTitle>Selecionar horário</ModalTitle>
							<ModalCloseButton onPress={handleCancel} />
						</ModalHeader>
						<ModalBody>
							<View className="items-center justify-center py-2">
								<DateTimePicker
									value={draftDate}
									mode="time"
									display="spinner"
									is24Hour
									themeVariant={isDarkMode ? 'dark' : 'light'}
									accentColor="#FACC15"
									onChange={handlePickerChange}
								/>
							</View>
						</ModalBody>
						<ModalFooter className="gap-3">
							<Button variant="outline" onPress={handleCancel} className={submitButtonCancelClassName}>
								<ButtonText>Cancelar</ButtonText>
							</Button>
							<Button variant="solid" onPress={handleConfirm} className={submitButtonClassName}>
								<ButtonText>Confirmar</ButtonText>
							</Button>
						</ModalFooter>
					</ModalContent>
				</Modal>
			) : null}
		</>
	);
}

export default TimePickerField;
