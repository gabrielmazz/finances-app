import type { RefObject } from 'react';
import type { TextInput } from 'react-native';

export type BankBalanceAdjustmentValueInputProps = {
	value: string;
	targetInCents: number | null;
	onValueChange: (input: string) => void;
	onToggleSign: () => void;
	isNegative: boolean;
	isDisabled: boolean;
	isInvalid: boolean;
	className: string;
	inputRef?: RefObject<TextInput | null>;
	onFocus?: () => void;
};
