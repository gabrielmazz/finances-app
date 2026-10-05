import React from 'react';
import '@mantine/core/styles.css';
import { MantineProvider, NumberInput } from '@mantine/core';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { getMantineNumberInputClassNames } from '@/design-system/mantine';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';
import { useAppTheme } from '@/contexts/ThemeContext';
import type { BankBalanceAdjustmentValueInputProps } from './bank-balance-adjustment-value-input.types';

const toDecimalValue = (cents: number | null) => {
	if (cents === null || !Number.isSafeInteger(cents)) return '';
	const absoluteCents = Math.abs(cents);
	return `${Math.floor(absoluteCents / 100)}.${String(absoluteCents % 100).padStart(2, '0')}`;
};

const toCentsDigits = (decimalValue: string) => {
	if (!decimalValue || decimalValue === '.') return '';
	const [whole = '', fraction = ''] = decimalValue.split('.');
	if (!whole && !fraction) return '';
	return `${whole || '0'}${fraction.padEnd(2, '0').slice(0, 2)}`.replace(/^0+(?=\d)/, '') || '0';
};

export default function BankBalanceAdjustmentValueInput({
	targetInCents,
	onValueChange,
	onToggleSign,
	isNegative,
	isDisabled,
	isInvalid,
	className,
	onFocus,
}: BankBalanceAdjustmentValueInputProps) {
	const { isDarkMode } = useAppTheme();
	const [inputValue, setInputValue] = React.useState(() => toDecimalValue(targetInCents));
	const isEditing = React.useRef(false);
	const baseClassNames = getMantineNumberInputClassNames(className, LUMUS_CLASS_NAMES.inputText);
	const classNames = {
		...baseClassNames,
		root: cn(baseClassNames.root, 'relative z-10'),
		input: cn(baseClassNames.input, isInvalid && 'border-error-600 dark:border-error-400'),
	};

	React.useEffect(() => {
		if (!isEditing.current) setInputValue(toDecimalValue(targetInCents));
	}, [targetInCents, isNegative]);

	return (
		<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
			<NumberInput
				value={inputValue}
				valueIsNumericString
				onValueChange={({ value }) => {
					setInputValue(value);
					const centsDigits = toCentsDigits(value);
					onValueChange(`${isNegative ? '-' : ''}${centsDigits}`);
				}}
				decimalSeparator=","
				thousandSeparator="."
				decimalScale={2}
				allowDecimal
				allowNegative={false}
				hideControls
				isAllowed={({ value }) => {
					const centsDigits = toCentsDigits(value);
					return !centsDigits || Number.isSafeInteger(Number(centsDigits));
				}}
				prefix="R$ "
				placeholder="R$ 0,00"
				aria-label="Saldo real do banco em reais"
				aria-invalid={isInvalid}
				disabled={isDisabled}
				classNames={classNames}
				rightSection={
					<Pressable
						className={LUMUS_CLASS_NAMES.iconButton}
						disabled={isDisabled}
						accessibilityRole="button"
						accessibilityLabel="Alternar saldo positivo ou negativo"
						onPress={onToggleSign}
					>
						<Text className={LUMUS_CLASS_NAMES.body}>{isNegative ? '−' : '+'}</Text>
					</Pressable>
				}
				rightSectionWidth={44}
				rightSectionPointerEvents="all"
				onFocus={() => {
					isEditing.current = true;
					onFocus?.();
				}}
				onBlur={() => {
					isEditing.current = false;
					setInputValue(toDecimalValue(targetInCents));
				}}
			/>
		</MantineProvider>
	);
}
