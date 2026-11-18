import React from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Modal, ModalBackdrop, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '@/components/ui/modal';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import BankOpeningBalanceFields from './bank-opening-balance-fields';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { formatCents } from '@/domain/money';
import { useBankReference } from '@/hooks/useBankReference';
import type { BankAccount, BankMetadata } from '@/domain/banks';
import DatePickerField from '@/components/uiverse/shared/date-picker';
import { Input, InputField } from '@/components/ui/input';

export default function BankReferenceControls({ bank, metadata }: { bank: BankAccount | null; metadata: BankMetadata }) {
	const state = useBankReference(bank, metadata);
	if (!state.available) return null;
	return <VStack className="gap-3">
		{!state.editing ? <Button variant="outline" onPress={() => state.setEditing(true)}><ButtonText>Definir saldo de referência</ButtonText></Button> : <>
			<BankOpeningBalanceFields valueInCents={state.balance} onValueChange={state.setBalance} reason={state.reason} onReasonChange={state.setReason} disabled={state.busy} />
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Data do saldo no banco</Text>
			<DatePickerField value={state.referenceDate} onChange={state.setReferenceDate} accessibilityLabel="Selecionar data da referência" triggerClassName={LUMUS_FORM_CLASS_NAMES.input} inputClassName={LUMUS_CLASS_NAMES.inputText} isDisabled={state.busy} />
			<Text className={LUMUS_FORM_CLASS_NAMES.label}>Horário do saldo no banco</Text>
			<Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={state.busy}>
				<InputField value={state.referenceTime} onChangeText={value => {
					const digits = value.replace(/\D/g, '').slice(0, 4);
					state.setReferenceTime(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
				}} accessibilityLabel="Horário da referência" placeholder="HH:MM" keyboardType="numeric" maxLength={5} className={LUMUS_CLASS_NAMES.inputText} />
			</Input>
			<Text className={LUMUS_CLASS_NAMES.helper}>Informe a data e a hora registradas pelo banco, no horário de São Paulo.</Text>
			<Text className={LUMUS_CLASS_NAMES.helper}>Confira o saldo atual no banco e revise as operações pendentes. O histórico anterior será preservado.</Text>
			{state.error && <Text className={LUMUS_CLASS_NAMES.errorText} accessibilityRole="alert">{state.error}</Text>}
			<Button variant="outline" isDisabled={state.busy} onPress={state.simulate}><ButtonText>Simular referência</ButtonText></Button>
		</>}
		<Modal isOpen={!!state.preview} onClose={() => !state.busy && state.setPreview(null)} size="md">
			<ModalBackdrop /><ModalContent><ModalHeader><ModalTitle>Confirmar saldo de referência?</ModalTitle></ModalHeader>
				<ModalBody><Text>Conta: {bank?.name} ({bank?.institutionName}). Saldo: {state.preview ? formatCents(state.preview.initialBalanceCents) : ''}. Referência: {state.preview ? state.preview.referenceAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}.</Text>
					<Text>Confirme que o saldo está correto para esse instante e que todas as operações pendentes e posteriores foram conferidas. Novos lançamentos só poderão ter data posterior ao dia da referência em UTC.</Text>
					{!state.writable && <Text>Simulação somente leitura. A associação e a ativação ainda precisam ser verificadas e autorizadas; nenhuma alteração será feita.</Text>}</ModalBody>
				<ModalFooter><Button variant="outline" action="secondary" isDisabled={state.busy} onPress={() => state.setPreview(null)}><ButtonText>Cancelar</ButtonText></Button>
					{state.writable && <Button isDisabled={state.busy} onPress={state.confirm}><ButtonText>Confirmar referência</ButtonText></Button>}</ModalFooter>
			</ModalContent>
		</Modal>
	</VStack>;
}
