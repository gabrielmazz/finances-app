import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icon';
import { useScreenStyles } from '@/hooks/useScreenStyle';

export type WebSelectOption = {
	value: string;
	label: string;
	disabled?: boolean;
};

type WebSelectFieldProps = {
	options: readonly WebSelectOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	isDisabled?: boolean;
	accessibilityLabel: string;
};

type WebPressableProps = React.ComponentProps<typeof Pressable> & {
	onKeyDown?: (event: unknown) => void;
};

const WebPressable = Pressable as React.ComponentType<WebPressableProps>;

export default function WebSelectField({
	options,
	value,
	onChange,
	placeholder = 'Escolha uma opção…',
	isDisabled = false,
	accessibilityLabel,
}: WebSelectFieldProps) {
	const { webSelectClassNames } = useScreenStyles();
	const [isOpen, setIsOpen] = React.useState(false);
	const selectedOption = options.find(option => option.value === value);

	React.useEffect(() => {
		if (isDisabled) {
			setIsOpen(false);
		}
	}, [isDisabled]);

	const handleTriggerKeyDown = (event: unknown) => {
		const keyboardEvent = event as { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void };
		const key = keyboardEvent.key ?? keyboardEvent.nativeEvent?.key;
		if (key === 'Enter' || key === ' ') {
			keyboardEvent.preventDefault?.();
			setIsOpen(current => !current);
		} else if (key === 'Escape') {
			setIsOpen(false);
		}
	};

	return (
		<View className="relative z-30 w-full">
			<WebPressable
				onPress={() => !isDisabled && setIsOpen(current => !current)}
				onKeyDown={handleTriggerKeyDown}
				disabled={isDisabled}
				accessibilityRole="combobox"
				accessibilityLabel={accessibilityLabel}
				accessibilityState={{ disabled: isDisabled, expanded: isOpen }}
				style={webSelectClassNames.triggerStyle}
				className={`${webSelectClassNames.trigger} ${isDisabled ? 'opacity-40' : ''}`}
			>
				<Text className={selectedOption ? webSelectClassNames.value : webSelectClassNames.placeholder} numberOfLines={1}>
					{selectedOption?.label ?? placeholder}
				</Text>
				{isOpen ? (
					<ChevronUpIcon className={webSelectClassNames.icon} style={webSelectClassNames.iconStyle} aria-hidden />
				) : (
					<ChevronDownIcon className={webSelectClassNames.icon} style={webSelectClassNames.iconStyle} aria-hidden />
				)}
			</WebPressable>

			{isOpen ? (
				<View className={webSelectClassNames.menu}>
					{options.map(option => {
						const isSelected = option.value === value;
						return (
							<WebPressable
								key={option.value}
								onPress={() => {
									if (option.disabled) {
										return;
									}
									onChange(option.value);
									setIsOpen(false);
								}}
								disabled={option.disabled}
								accessibilityRole="button"
								accessibilityLabel={option.label}
								accessibilityState={{ disabled: option.disabled, selected: isSelected }}
								className={`${webSelectClassNames.option} ${isSelected ? webSelectClassNames.optionSelected : ''} ${option.disabled ? webSelectClassNames.optionDisabled : ''}`}
							>
								<Text className={webSelectClassNames.optionText}>{option.label}</Text>
							</WebPressable>
						);
					})}
				</View>
			) : null}
		</View>
	);
}
