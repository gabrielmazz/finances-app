import React from 'react';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Input, InputField, InputSlot } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import BankActionsheetSelector from '@/components/uiverse/banks/bank-actionsheet-selector';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { formatAdjustmentMoney, useBankBalanceAdjustmentForm } from '@/hooks/useBankBalanceAdjustmentForm';
import type { TextInput } from 'react-native';

type Props = {
	form: ReturnType<typeof useBankBalanceAdjustmentForm>;
	valueRef?: React.RefObject<TextInput | null>;
	descriptionRef?: React.RefObject<TextInput | null>;
	onFocus?: (field: 'value' | 'description') => void;
};

export default function BankBalanceAdjustmentForm({ form, valueRef, descriptionRef, onFocus }: Props) {
	const { isDarkMode } = useAppTheme();
	const { shouldHideValues } = useValueVisibility();
	const money = (cents: number) => shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : formatAdjustmentMoney(cents);
	const bank = form.banks.find(item => item.id === form.bankId);
	if (form.loading) return <Text className={LUMUS_CLASS_NAMES.helper} aria-live="polite">Carregando bancos e ajuste…</Text>;
	if (form.error) return <VStack space="md"><Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.error}</Text><Button onPress={form.retry}><ButtonText>Tentar novamente</ButtonText></Button></VStack>;
	return <VStack space="lg">
		<Text className={LUMUS_CLASS_NAMES.body}>Use este ajuste quando o saldo real do banco estiver diferente do Lumus e você não conseguir identificar a origem da diferença. Somente a diferença será registrada.</Text>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
			<BankActionsheetSelector options={form.banks} selectedId={form.bankId} selectedOption={bank} selectedLabel={bank?.name} onSelect={item => form.setBankId(item.id)}
				isDisabled={form.submitting || !!form.adjustmentId || !form.banks.length} isDarkMode={isDarkMode} bodyTextClassName={LUMUS_CLASS_NAMES.body} helperTextClassName={LUMUS_CLASS_NAMES.helper}
				triggerClassName={LUMUS_FORM_CLASS_NAMES.input} placeholder="Selecione o banco" sheetTitle="Qual banco precisa de ajuste?" accessibilityLabel="Selecionar banco do ajuste de saldo" disabledHint={form.adjustmentId ? 'O banco do ajuste é mantido durante a edição.' : 'Cadastre um banco para ajustar o saldo.'} />
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Saldo real do banco</Text>
			<Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={form.submitting || !form.bankId} isInvalid={!!form.valueError}>
				<InputField ref={valueRef} value={form.value} onChangeText={form.onValueChange} keyboardType="number-pad" placeholder="R$ 0,00" aria-label="Saldo real do banco em reais" className={LUMUS_CLASS_NAMES.inputText} editable={!form.submitting && !!form.bankId} onFocus={() => onFocus?.('value')} />
				<InputSlot className={LUMUS_CLASS_NAMES.iconButton} disabled={form.submitting || !form.bankId} accessibilityRole="button" accessibilityLabel="Alternar saldo positivo ou negativo" onPress={() => form.onValueChange(form.value.includes('-') ? form.value.replace('-', '') : `-${form.value}`)}>
					<Text className={LUMUS_CLASS_NAMES.body}>{form.value.includes('-') ? '−' : '+'}</Text>
				</InputSlot>
			</Input>
			{form.valueError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.valueError}</Text>}
			{form.adjustmentId && shouldHideValues && <Text className={LUMUS_FORM_CLASS_NAMES.helper}>Informe o saldo real novamente para editar com os valores ocultos.</Text>}
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data do ajuste</Text>
			<DatePickerField value={form.date} onChange={form.setDate} accessibilityLabel="Selecionar data do ajuste" triggerClassName={LUMUS_FORM_CLASS_NAMES.input} inputClassName={LUMUS_CLASS_NAMES.inputText} placeholder="Selecione a data" isDisabled={form.submitting || !form.bankId} />
			{form.dateError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.dateError}</Text>}
			<Text className={LUMUS_FORM_CLASS_NAMES.helper}>Para uma data anterior, informe o saldo ao final daquele dia. As movimentações posteriores serão mantidas.</Text>
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Descrição {form.target !== null && form.target < 0 ? '(obrigatória)' : '(opcional)'}</Text>
			<Textarea className={LUMUS_FORM_CLASS_NAMES.textarea} isDisabled={form.submitting}>
				<TextareaInput ref={descriptionRef} value={form.description} onChangeText={form.setDescription} maxLength={2000} placeholder="Explique o motivo da diferença" aria-label="Descrição do ajuste de saldo" className={LUMUS_CLASS_NAMES.inputText} onFocus={() => onFocus?.('description')} />
			</Textarea>
			{form.descriptionError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.descriptionError}</Text>}
		</VStack>
		{form.bankId && <Box className={`${LUMUS_CLASS_NAMES.cardTinted} p-4`} aria-live="polite">
			{form.previewLoading ? <Text className={LUMUS_CLASS_NAMES.helper}>Calculando o saldo na data escolhida…</Text> : form.previewError ? <VStack space="sm"><Text className={LUMUS_FORM_CLASS_NAMES.error}>{form.previewError}</Text><Button variant="outline" onPress={form.retry}><ButtonText>Atualizar prévia</ButtonText></Button></VStack> : form.base !== null ? <VStack space="sm">
				<Text className={LUMUS_CLASS_NAMES.body}>{form.adjustmentId ? 'Saldo sem o ajuste anterior' : 'Saldo no Lumus'}: {money(form.base)}</Text>
				{form.target !== null && Number.isSafeInteger(form.target) && <Text className={LUMUS_CLASS_NAMES.body}>Saldo real informado: {money(form.target)}</Text>}
				{form.difference !== null && <Text className="font-bold text-lumus-adjustment-light dark:text-lumus-adjustment-dark">Diferença a registrar: {shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : `${form.difference > 0 ? '+' : ''}${formatAdjustmentMoney(form.difference)}`}</Text>}
				{form.noDifference && <Text className={LUMUS_CLASS_NAMES.helper}>Os saldos já correspondem. Nenhum ajuste é necessário.</Text>}
			</VStack> : null}
		</Box>}
		<Button className={`${LUMUS_FORM_CLASS_NAMES.submit} bg-lumus-accent`} onPress={() => void form.submit()} isDisabled={form.submitDisabled} accessibilityLabel={form.adjustmentId ? 'Salvar edição do ajuste de saldo' : 'Salvar ajuste de saldo'}>
			{form.submitting && <ButtonSpinner className="text-lumus-on-accent" />}
			<ButtonText className="text-lumus-on-accent">{form.submitting ? 'Salvando ajuste…' : form.adjustmentId ? 'Salvar alterações' : 'Ajustar saldo'}</ButtonText>
		</Button>
		<Button variant="outline" onPress={form.back} isDisabled={form.submitting}><ButtonText>Voltar</ButtonText></Button>
	</VStack>;
}
