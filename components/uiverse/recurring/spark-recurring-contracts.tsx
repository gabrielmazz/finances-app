import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { auth, db } from '@/FirebaseConfig';
import { getSparkContextFirebase } from '@/functions/SparkContextFirebase';
import { readSparkRecurringPlansFirebase } from '@/functions/SparkRecurringReadFirebase';
import { submitSparkRecurringReplanFormFirebase, type SparkRecurringReplanFormState } from '@/functions/SparkRecurringFormFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import type { SparkRecurringReadModel } from '@/utils/sparkRecurringReadModel';
import { getMandatoryInstallmentRemainingValueInCents } from '@/utils/mandatoryInstallments';
import { getCycleKeyFromDate } from '@/utils/mandatoryExpenses';
import { toFinancialCivilDate } from '@/utils/financialCivilDate';
import { synchronizeMandatoryReminderAccount } from '@/utils/mandatoryReminderAccountSync';
import { useKeyboardAwareScroll } from '@/hooks/useKeyboardAwareScroll';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Modal, ModalBackdrop, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

type Field = 'amount' | 'count' | 'cycle' | 'reason';

/** [[Recorrências Spark]]: revisão do saldo negociado antes do único commit de substituição. */
export default function SparkRecurringContracts({ recurringType, onChanged }: { recurringType: 'expense' | 'gain'; onChanged: () => Promise<unknown> }) {
  const { user } = useAuth(), { shouldHideValues } = useValueVisibility(), client = useQueryClient(), actorId = user?.uid;
  const [selected, setSelected] = React.useState<SparkRecurringReadModel | null>(null);
  const [amount, setAmount] = React.useState(''), [count, setCount] = React.useState(''), [cycle, setCycle] = React.useState(''), [reason, setReason] = React.useState('');
  const [reviewing, setReviewing] = React.useState(false), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null), [message, setMessage] = React.useState<string | null>(null);
  const state = React.useRef<SparkRecurringReplanFormState>({}), lock = React.useRef(false), generation = React.useRef(0);
  const refs = { amount: React.useRef<TextInput>(null), count: React.useRef<TextInput>(null), cycle: React.useRef<TextInput>(null), reason: React.useRef<TextInput>(null) };
  const getInputRef = React.useCallback((field: Field) => refs[field], []);
  const keyboard = useKeyboardAwareScroll<Field>({ getInputRef });
  const plans = useQuery({ queryKey: ['finance', actorId, 'spark-recurring-contracts', recurringType], enabled: !!actorId,
    queryFn: async () => {
      const context = await getSparkContextFirebase(db, actorId!);
      if (!context) return [];
      return (await readSparkRecurringPlansFirebase(db, actorId!, context.groupId, new Date())).filter(plan => plan.actorId === actorId
        && plan.recurringType === recurringType && plan.installmentTotal !== null && !plan.replanCancelled
        && (plan.active && plan.installmentsCompleted < plan.installmentTotal || !!plan.successorPlanId));
    } });
  React.useEffect(() => {
    generation.current += 1; state.current = {}; setSelected(null); setBusy(false); setError(null); setMessage(null); lock.current = false;
    return () => { generation.current += 1; };
  }, [actorId]);
  const format = (cents: number) => shouldHideValues ? HIDDEN_VALUE_PLACEHOLDER : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  const change = (set: React.Dispatch<React.SetStateAction<string>>) => (value: string) => { set(value); setReviewing(false); setError(null); };
  const open = (plan: SparkRecurringReadModel) => {
    if (busy || state.current.intent?.status === 'uncertain') return;
    state.current = {}; setSelected(plan); setError(null); setMessage(null); setReviewing(false); setReason('');
    const now = toFinancialCivilDate(new Date()), currentCycle = getCycleKeyFromDate(now);
    const first = plan.completedCycles.includes(currentCycle) ? getCycleKeyFromDate(new Date(now.getFullYear(), now.getMonth() + 1, 1)) : currentCycle;
    const remaining = getMandatoryInstallmentRemainingValueInCents({ installmentTotal: plan.installmentTotal, installmentsCompleted: plan.installmentsCompleted,
      installmentValueInCents: plan.valueInCents, installmentTotalValueInCents: plan.contractTotalInCents })!;
    setAmount((remaining / 100).toFixed(2).replace('.', ',')); setCount(String(plan.installmentTotal! - plan.installmentsCompleted)); setCycle(first);
  };
  const undo = !!selected?.successorPlanId;
  // Texto decimal estrito e aritmética inteira: nenhuma fração extra é arredondada silenciosamente.
  const money = /^(\d+)(?:,(\d{1,2}))?$/.exec(amount.trim());
  const amountInCents = money ? Number(money[1]) * 100 + Number((money[2] ?? '').padEnd(2, '0')) : NaN;
  const quantity = /^\d{1,3}$/.test(count) ? Number(count) : NaN;
  const valid = reason.trim().length > 0 && reason.trim().length <= 2000 && (undo || Number.isSafeInteger(amountInCents)
    && amountInCents >= quantity && amountInCents <= 1e12 && quantity >= 1 && quantity <= 360 && /^(19[7-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/.test(cycle));
  const close = () => {
    if (busy || state.current.intent?.status === 'uncertain') return;
    setSelected(null); state.current = {}; setError(null);
  };
  const submit = async () => {
    if (!selected || !actorId || lock.current || !valid) return;
    if (!reviewing) { setReviewing(true); return; }
    lock.current = true; setBusy(true); setError(null); const current = generation.current;
    try {
      await submitSparkRecurringReplanFormFirebase(db, state.current, { actorId, plan: selected, reason,
        ...(undo ? { action: 'undo' as const } : { action: 'replan' as const, installmentTotal: quantity, contractTotalInCents: amountInCents, startCycle: cycle }) },
      () => createFinancialClientActionId('recurring_replan'));
      if (current !== generation.current || auth.currentUser?.uid !== actorId) return;
      setSelected(null); state.current = {}; setMessage(undo ? 'Contrato anterior reativado. O histórico foi preservado.' : 'Contrato renegociado. As parcelas anteriores foram preservadas.');
      void client.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' }).catch(() => {});
      try {
        await onChanged();
        await synchronizeMandatoryReminderAccount(actorId, () => current === generation.current && auth.currentUser?.uid === actorId);
      } catch {
        if (current === generation.current && auth.currentUser?.uid === actorId) setMessage('Contrato salvo. Reabra a lista para atualizar os dados e os lembretes.');
      }
    } catch (cause) {
      if (current === generation.current && auth.currentUser?.uid === actorId) setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o contrato.');
    } finally { if (current === generation.current) { lock.current = false; setBusy(false); } }
  };
  const uncertain = state.current.intent?.status === 'uncertain';
  if (!actorId) return null;
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
          <Button isDisabled={busy || !valid} onPress={() => void submit()}>{busy && <ButtonSpinner />}<ButtonText>{reviewing ? 'Confirmar' : 'Revisar'}</ButtonText></Button></ModalFooter>
      </ModalContent>
    </Modal>
  </VStack>;
}
