import React from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { SPARK_MAX_CENTS } from '@/functions/sparkFinancialProtocol';

type Props = {
  valueInCents: number;
  onValueChange: (value: number) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  disabled?: boolean;
};

/** [[Versão Usável por Telas]]: saldo existente na criação é referência, nunca uma receita. */
export default function BankOpeningBalanceFields({ valueInCents, onValueChange, reason, onReasonChange, disabled }: Props) {
  const isValid = Number.isSafeInteger(valueInCents) && Math.abs(valueInCents) <= SPARK_MAX_CENTS;
  const display = isValid ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInCents / 100) : String(valueInCents);
  return (
    <VStack className="gap-3">
      <Text className={LUMUS_FORM_CLASS_NAMES.label}>Saldo inicial disponível</Text>
      <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={disabled} isInvalid={!isValid}>
        <InputField
          value={display}
          onChangeText={input => {
            const digits = input.replace(/\D/g, '');
            onValueChange((digits ? Number(digits) : 0) * (input.includes('-') || valueInCents < 0 ? -1 : 1));
          }}
          keyboardType="numeric"
          autoCorrect={false}
          accessibilityLabel="Saldo inicial disponível"
          className={LUMUS_CLASS_NAMES.inputText}
          maxLength={24}
        />
      </Input>
      <Text className={LUMUS_CLASS_NAMES.helper}>
        Informe o valor que já está no banco agora. Não entra como receita. Use zero para uma conta sem saldo.
      </Text>
      {!isValid ? <Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">Saldo fora do limite permitido.</Text> : null}
      <Button action="secondary" variant="outline" isDisabled={disabled || !isValid || valueInCents === 0}
        onPress={() => { onValueChange(-valueInCents); onReasonChange(''); }}>
        <ButtonText>{valueInCents < 0 ? 'Usar saldo positivo' : 'Usar saldo negativo'}</ButtonText>
      </Button>
      {valueInCents < 0 ? (
        <VStack className="gap-2">
          <Text className={LUMUS_FORM_CLASS_NAMES.label}>Motivo do saldo negativo</Text>
          <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={disabled}>
            <InputField value={reason} onChangeText={onReasonChange} maxLength={500}
              placeholder="Explique o saldo negativo" accessibilityLabel="Motivo do saldo inicial negativo" className={LUMUS_CLASS_NAMES.inputText} />
          </Input>
          <Text className={LUMUS_CLASS_NAMES.helper}>Informe uma justificativa com pelo menos 3 caracteres.</Text>
        </VStack>
      ) : null}
    </VStack>
  );
}
