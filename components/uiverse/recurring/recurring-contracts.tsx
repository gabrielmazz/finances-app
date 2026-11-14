type RecurringContractSummary = { id: string; name: string; successorPlanId?: string | null };
import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { HIDDEN_VALUE_PLACEHOLDER,useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { useSession } from '@/hooks/useSession';

import React from 'react';
import { KeyboardAvoidingView,Platform,ScrollView,TextInput } from 'react-native';

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input,InputField } from '@/components/ui/input';
import { Modal,ModalBackdrop,ModalBody,ModalContent,ModalFooter,ModalHeader } from '@/components/ui/modal';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES,LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';

type Field = 'amount' | 'count' | 'cycle' | 'reason';

/** Formulário visual preservado; não consulta nem altera contratos. */
export default function RecurringContracts({ recurringType, onChanged }: { recurringType: 'expense' | 'gain'; onChanged: () => Promise<unknown> }) {
  const { user } = useSession(), { shouldHideValues } = useValueVisibility(), actorId = user?.uid;
  const [selected, setSelected] = React.useState<RecurringContractSummary | null>(null);
  const [amount, setAmount] = React.useState(''), [count, setCount] = React.useState(''), [cycle, setCycle] = React.useState(''), [reason, setReason] = React.useState('');
  const [reviewing, setReviewing] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null), [message, setMessage] = React.useState<string | null>(null);
  const refs = { amount: React.useRef<import('react').ComponentRef<typeof TextInput>>(null), count: React.useRef<import('react').ComponentRef<typeof TextInput>>(null), cycle: React.useRef<import('react').ComponentRef<typeof TextInput>>(null), reason: React.useRef<import('react').ComponentRef<typeof TextInput>>(null) };
  const getInputRef = React.useCallback((field: Field) => refs[field], []);
  const keyboard = useKeyboardAwareScroll<Field>({ getInputRef });
  const plans: {data: RecurringContractSummary[]; isError: boolean; refetch: () => Promise<void>} = {data: [], isError: false, refetch: async () => showFeatureUnavailable()};
  const format = (cents: number) => shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  const change = (set: React.Dispatch<React.SetStateAction<string>>) => (value: string) => { set(value); setReviewing(false); setError(null); };
  const open = (plan: RecurringContractSummary) => { setSelected(plan); setAmount(''); setCount(''); setCycle(''); setReason(''); };
  const undo = !!selected?.successorPlanId;
  // Texto decimal estrito e aritmética inteira: nenhuma fração extra é arredondada silenciosamente.
  const money = /^(\d+)(?:,(\d{1,2}))?$/.exec(amount.trim());
  const amountInCents = money ? Number(money[1]) * 100 + Number((money[2] ?? '').padEnd(2, '0')) : NaN;
  const quantity = /^\d{1,3}$/.test(count) ? Number(count) : NaN;
  const valid = reason.trim().length > 0 && reason.trim().length <= 2000 && (undo || Number.isSafeInteger(amountInCents)
    && amountInCents >= quantity && amountInCents <= 1e12 && quantity >= 1 && quantity <= 360 && /^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(cycle));
  const close = () => setSelected(null);
  const uncertain = false;
  return <VStack className="gap-3 py-4">
    {plans.isError && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">Não foi possível conferir os contratos. <Text onPress={() => void plans.refetch()}>Tentar novamente</Text></Text>}
    {message && <Text className={LUMUS_CLASS_NAMES.helper} role="status">{message}</Text>}
    {!!plans.data?.length && <Text className={LUMUS_FORM_CLASS_NAMES.label}>Replanejar parcelas</Text>}
    {plans.data?.map(plan => <HStack key={plan.id} className="items-center justify-between gap-3">
      <Text className="min-w-0 flex-1" numberOfLines={2}>{plan.name}</Text>
      <Button variant="outline" action="secondary" isDisabled={busy || uncertain} onPress={() => open(plan)} accessibilityLabel={`${plan.successorPlanId ? 'Desfazer replanejamento de' : 'Renegociar'} ${plan.name}`}>
        <ButtonText>{plan.successorPlanId ? 'Desfazer replanejamento' : 'Renegociar'}</ButtonText>
      </Button>
    </HStack>)}
    <Modal isOpen={!!selected} onClose={close} avoidKeyboard>
      <ModalBackdrop /><ModalContent className={LUMUS_CLASS_NAMES.modal}>
        <ModalHeader><Text className={LUMUS_FORM_CLASS_NAMES.label}>{undo ? 'Desfazer replanejamento' : 'Renegociar parcelas'} — {selected?.name}</Text></ModalHeader>
        <ModalBody><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={keyboard.scrollViewRef} onScroll={keyboard.handleScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <VStack className="gap-3 pb-6">
              <Text className={LUMUS_CLASS_NAMES.helper}>{undo ? 'O contrato anterior voltará a operar. Primeiro desfaça os pagamentos e replanejamentos do sucessor. Nenhum pagamento será apagado.'
                : 'Informe somente o novo saldo negociado das parcelas restantes. Os pagamentos anteriores permanecem no contrato original. Esta ação não movimenta dinheiro.'}</Text>
              {!undo && <>
                <Text className={LUMUS_FORM_CLASS_NAMES.label}>Total negociado em reais</Text>
                <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || uncertain}><InputField ref={refs.amount} accessibilityLabel="Total negociado em reais" keyboardType="decimal-pad" value={amount} onChangeText={change(setAmount)} onFocus={() => keyboard.handleInputFocus('amount')} /></Input>
                <Text className={LUMUS_FORM_CLASS_NAMES.label}>Quantidade de novas parcelas</Text>
                <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || uncertain}><InputField ref={refs.count} accessibilityLabel="Quantidade de novas parcelas" keyboardType="number-pad" maxLength={3} value={count} onChangeText={change(setCount)} onFocus={() => keyboard.handleInputFocus('count')} /></Input>
                <Text className={LUMUS_FORM_CLASS_NAMES.label}>Primeiro ciclo (AAAA-MM)</Text>
                <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || uncertain}><InputField ref={refs.cycle} accessibilityLabel="Primeiro ciclo no formato ano e mês" maxLength={7} value={cycle} onChangeText={change(setCycle)} onFocus={() => keyboard.handleInputFocus('cycle')} /></Input>
              </>}
              <Text className={LUMUS_FORM_CLASS_NAMES.label}>Motivo</Text>
              <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || uncertain}><InputField ref={refs.reason} accessibilityLabel="Motivo do replanejamento" maxLength={2000} value={reason} onChangeText={change(setReason)} onFocus={() => keyboard.handleInputFocus('reason')} /></Input>
              {reviewing && !undo && <Text className={LUMUS_CLASS_NAMES.helper}>Novo saldo: {format(amountInCents)}, em {quantity} parcela(s), a partir de {cycle}. Valor base: {format(Math.floor(amountInCents / quantity))}. Eventuais centavos restantes ficam na última parcela. O contrato anterior será arquivado.</Text>}
              {uncertain && <Text className={LUMUS_CLASS_NAMES.helper}>O resultado ainda precisa ser conferido. Repita a mesma confirmação antes de fechar.</Text>}
              {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
            </VStack>
          </ScrollView>
        </KeyboardAvoidingView></ModalBody>
        <ModalFooter><Button variant="outline" action="secondary" isDisabled={busy || uncertain} onPress={close}><ButtonText>Cancelar</ButtonText></Button>
          <Button isDisabled={busy || !valid} onPress={() => showFeatureUnavailable()}>{busy && <ButtonSpinner />}<ButtonText>{reviewing ? 'Confirmar' : 'Revisar'}</ButtonText></Button></ModalFooter>
      </ModalContent>
    </Modal>
  </VStack>;
}
