import React from 'react';
import { Input, InputField, InputSlot } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';
import type { BankBalanceAdjustmentValueInputProps } from './bank-balance-adjustment-value-input.types';

export default function BankBalanceAdjustmentValueInput({
	value,
	onValueChange,
	onToggleSign,
	isNegative,
	isDisabled,
	isInvalid,
	className,
	inputRef,
	onFocus,
}: BankBalanceAdjustmentValueInputProps) {
	return (
		<Input className={className} isDisabled={isDisabled} isInvalid={isInvalid}>
			<InputField
				ref={inputRef}
				value={value}
				onChangeText={onValueChange}
				keyboardType="number-pad"
				placeholder="R$ 0,00"
				aria-label="Saldo real do banco em reais"
				className={LUMUS_CLASS_NAMES.inputText}
				editable={!isDisabled}
				onFocus={onFocus}
			/>
			<InputSlot
				className={LUMUS_CLASS_NAMES.iconButton}
				disabled={isDisabled}
				accessibilityRole="button"
				accessibilityLabel="Alternar saldo positivo ou negativo"
				onPress={onToggleSign}
			>
				<Text className={LUMUS_CLASS_NAMES.body}>{isNegative ? '−' : '+'}</Text>
			</InputSlot>
		</Input>
	);
}
