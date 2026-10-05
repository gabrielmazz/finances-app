import React from 'react';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Textarea, TextareaInput } from '@/components/ui/textarea';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import BankActionsheetSelector from '@/components/uiverse/banks/bank-actionsheet-selector';
import BankBalanceAdjustmentValueInput from '@/components/uiverse/banks/bank-balance-adjustment-value-input';
import BankBalanceAttachedPanel from '@/components/uiverse/banks/bank-balance-attached-panel';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { cn } from '@/lib/utils';
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
	const showDifferenceExtension = Boolean(form.bankId && (form.previewLoading || form.previewError || form.difference !== null || form.noDifference));
	if (form.loading) return <Text className={LUMUS_CLASS_NAMES.helper} aria-live="polite">Carregando bancos e ajuste…</Text>;
	if (form.error) return <VStack space="md"><Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.error}</Text><Button onPress={form.retry}><ButtonText>Tentar novamente</ButtonText></Button></VStack>;
	return <VStack space="lg">
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Banco</Text>
			<BankActionsheetSelector options={form.banks} selectedId={form.bankId} selectedOption={bank} selectedLabel={bank?.name} onSelect={item => form.setBankId(item.id)}
				isDisabled={form.submitting || !!form.adjustmentId || !form.banks.length} isDarkMode={isDarkMode} bodyTextClassName={LUMUS_CLASS_NAMES.body} helperTextClassName={LUMUS_CLASS_NAMES.helper}
				triggerClassName={cn(LUMUS_CLASS_NAMES.control, LUMUS_CLASS_NAMES.focusRing, 'relative z-10')} placeholder="Selecione o banco" sheetTitle="Qual banco precisa de ajuste?" accessibilityLabel="Selecionar banco do ajuste de saldo" disabledHint={form.adjustmentId ? 'O banco do ajuste é mantido durante a edição.' : 'Cadastre um banco para ajustar o saldo.'} />
			{form.bankId && form.base !== null && !form.previewLoading && !form.previewError && (
				<BankBalanceAttachedPanel>
					<Text className={`${LUMUS_CLASS_NAMES.body} text-center text-sm`}>
						{form.adjustmentId ? 'Saldo sem o ajuste anterior' : 'Saldo no Lumus'}: {money(form.base)}
					</Text>
				</BankBalanceAttachedPanel>
			)}
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Saldo real do banco</Text>
			<BankBalanceAdjustmentValueInput
				className={cn(LUMUS_FORM_CLASS_NAMES.input, showDifferenceExtension && 'relative z-10')}
				value={form.value}
				targetInCents={form.target}
				onValueChange={form.onValueChange}
				onToggleSign={() => form.onValueChange(form.value.includes('-') ? form.value.replace('-', '') : `-${form.value}`)}
				isNegative={form.value.includes('-')}
				isDisabled={form.submitting || !form.bankId}
				isInvalid={!!form.valueError}
				inputRef={valueRef}
				onFocus={() => onFocus?.('value')}
			/>
			{showDifferenceExtension && (
				<BankBalanceAttachedPanel>
					{form.previewLoading ? (
						<Text className={LUMUS_CLASS_NAMES.helper}>Calculando a diferença…</Text>
					) : form.previewError ? (
						<VStack space="sm">
							<Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.previewError}</Text>
							<Button variant="outline" onPress={form.retry}>
								<ButtonText>Atualizar prévia</ButtonText>
							</Button>
						</VStack>
					) : form.noDifference ? (
						<Text className={LUMUS_CLASS_NAMES.helper}>Os saldos já correspondem. Nenhum ajuste é necessário.</Text>
					) : form.difference !== null ? (
						<Text className={`${LUMUS_CLASS_NAMES.body} text-center text-sm font-bold text-lumus-adjustment-light dark:text-lumus-adjustment-dark`}>
							Diferença a registrar: {shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : `${form.difference > 0 ? '+' : ''}${formatAdjustmentMoney(form.difference)}`}
						</Text>
					) : null}
				</BankBalanceAttachedPanel>
			)}
			{form.valueError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.valueError}</Text>}
			{form.adjustmentId && shouldHideValues && <Text className={LUMUS_FORM_CLASS_NAMES.helper}>Informe o saldo real novamente para editar com os valores ocultos.</Text>}
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data do ajuste</Text>
			<DatePickerField value={form.date} onChange={form.setDate} accessibilityLabel="Selecionar data do ajuste" triggerClassName={LUMUS_FORM_CLASS_NAMES.input} inputClassName={LUMUS_CLASS_NAMES.inputText} placeholder="Selecione a data" isDisabled={form.submitting || !form.bankId} />
			{form.dateError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.dateError}</Text>}
		</VStack>
		<VStack>
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Descrição {form.target !== null && form.target < 0 ? '(obrigatória)' : '(opcional)'}</Text>
			<Textarea className={LUMUS_FORM_CLASS_NAMES.textarea} isDisabled={form.submitting}>
				<TextareaInput ref={descriptionRef} value={form.description} onChangeText={form.setDescription} maxLength={2000} placeholder="Explique o motivo da diferença" aria-label="Descrição do ajuste de saldo" className={LUMUS_CLASS_NAMES.inputText} onFocus={() => onFocus?.('description')} />
			</Textarea>
			{form.descriptionError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{form.descriptionError}</Text>}
		</VStack>
		<Button className={`${LUMUS_FORM_CLASS_NAMES.submit} bg-lumus-accent`} onPress={() => void form.submit()} isDisabled={form.submitDisabled} accessibilityLabel={form.adjustmentId ? 'Salvar edição do ajuste de saldo' : 'Salvar ajuste de saldo'}>
			{form.submitting && <ButtonSpinner className="text-lumus-on-accent" />}
			<ButtonText className={LUMUS_CLASS_NAMES.primaryButtonText}>{form.submitting ? 'Salvando ajuste…' : form.adjustmentId ? 'Salvar alterações' : 'Ajustar saldo'}</ButtonText>
		</Button>
	</VStack>;
}
