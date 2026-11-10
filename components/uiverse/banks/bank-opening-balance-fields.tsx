import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import React from 'react';
import { formatCents, reaisToCents, validCents } from '@/domain/money';

type Props = {
	valueInCents: number;
	onValueChange: (value: number) => void;
	reason: string;
	onReasonChange: (value: string) => void;
	disabled?: boolean;
};

/** [[Versão Usável por Telas]]: saldo existente na criação é referência, nunca uma receita. */
export default function BankOpeningBalanceFields({
	valueInCents,
	onValueChange,
	reason,
	onReasonChange,
	disabled,
}: Props) {
	const isValid = validCents(valueInCents);
	const [focused, setFocused] = React.useState(false);
	const [display, setDisplay] = React.useState(() => (isValid ? formatCents(valueInCents) : ''));
	React.useEffect(() => {
		if (!focused && isValid) setDisplay(formatCents(valueInCents));
	}, [valueInCents, focused]);
	return (
		<VStack className="gap-3">
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Saldo inicial disponível</Text>
			<Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={disabled} isInvalid={!isValid}>
				<InputField
					value={display}
					onChangeText={(input) => {
						setDisplay(input);
						try {
							onValueChange(reaisToCents(input));
						} catch {
							onValueChange(Number.NaN);
						}
					}}
					onFocus={() => {
						setFocused(true);
						if (valueInCents === 0) setDisplay('');
					}}
					onBlur={() => setFocused(false)}
					keyboardType="decimal-pad"
					autoCorrect={false}
					accessibilityLabel="Saldo inicial disponível"
					className={LUMUS_CLASS_NAMES.inputText}
					maxLength={24}
				/>
			</Input>
			<Text className={LUMUS_CLASS_NAMES.helper}>
				Informe o valor que já existe na conta, como 1.500,00. Não entra como receita. Use zero para uma conta
				sem saldo.
			</Text>
			{!isValid ? (
				<Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">
					Saldo fora do limite permitido.
				</Text>
			) : null}
			<Button
				action="secondary"
				variant="outline"
				isDisabled={disabled || !isValid || valueInCents === 0}
				onPress={() => {
					onValueChange(-valueInCents);
					onReasonChange('');
				}}
			>
				<ButtonText>{valueInCents < 0 ? 'Usar saldo positivo' : 'Usar saldo negativo'}</ButtonText>
			</Button>
			{valueInCents < 0 ? (
				<VStack className="gap-2">
					<Text className={LUMUS_FORM_CLASS_NAMES.label}>Motivo do saldo negativo</Text>
					<Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={disabled}>
						<InputField
							value={reason}
							onChangeText={onReasonChange}
							maxLength={500}
							placeholder="Explique o saldo negativo"
							accessibilityLabel="Motivo do saldo inicial negativo"
							className={LUMUS_CLASS_NAMES.inputText}
						/>
					</Input>
					<Text className={LUMUS_CLASS_NAMES.helper}>
						Informe uma justificativa com pelo menos 3 caracteres.
					</Text>
				</VStack>
			) : null}
		</VStack>
	);
}
