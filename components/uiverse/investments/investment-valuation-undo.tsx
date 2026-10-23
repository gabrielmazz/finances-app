import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/FirebaseConfig';
import { useSparkInvestmentForm } from '@/hooks/useSparkInvestmentForm';
import { VStack } from '@/components/ui/vstack';
import { Text } from '@/components/ui/text';
import { Input, InputField } from '@/components/ui/input';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Modal, ModalBackdrop, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

/** [[Investimentos]]: confirmação explícita e preparação antes de corrigir a referência vigente. */
export default function InvestmentValuationUndo({ accountId, referenceOperationId, revision, onChanged }: {
  accountId: string; referenceOperationId: string; revision: number; onChanged: () => Promise<unknown>;
}) {
  const spark = useSparkInvestmentForm(), { user } = useAuth();
  const [open, setOpen] = React.useState(false), [busy, setBusy] = React.useState(false), [reason, setReason] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null), [preparing, setPreparing] = React.useState(false);
  const lock = React.useRef<number | null>(null), generation = React.useRef(0);
  const target = React.useRef({ referenceOperationId, revision });
  React.useEffect(() => {
    generation.current += 1; setOpen(false); setBusy(false); setReason(''); setFeedback(null); setPreparing(false);
    return () => { generation.current += 1; };
  }, [user?.uid, accountId]);
  const close = () => { if (!busy && !spark.hasUncertainResult()) setOpen(false); };
  const confirm = async () => {
    const actorId = user?.uid, current = generation.current;
    if (!actorId || auth.currentUser?.uid !== actorId || lock.current === current || !reason.trim()) return;
    lock.current = current; setBusy(true); setFeedback(null);
    try {
      const result = await spark.undoValuation(accountId, reason, target.current.referenceOperationId, target.current.revision);
      if (generation.current !== current || auth.currentUser?.uid !== actorId) return;
      if (!result?.success) {
        setPreparing(!!result && 'preparing' in result && result.preparing === true);
        setFeedback(result && 'error' in result ? result.error : 'Não foi possível desfazer a avaliação.');
      } else {
        setOpen(false);
        try { await onChanged(); } catch { if (generation.current === current && auth.currentUser?.uid === actorId) setFeedback('Avaliação desfeita. Reabra a carteira para atualizar os dados.'); }
      }
    } finally { if (lock.current === current) lock.current = null; if (generation.current === current) setBusy(false); }
  };
  return <>
    <Button variant="outline" action="secondary" onPress={() => { spark.reset(); target.current = { referenceOperationId, revision }; setFeedback(null); setPreparing(false); setReason(''); setOpen(true); }}><ButtonText>Desfazer avaliação vigente</ButtonText></Button>
    {!open && feedback && <Text className={LUMUS_CLASS_NAMES.helper}>{feedback}</Text>}
    <Modal isOpen={open} onClose={close} avoidKeyboard><ModalBackdrop /><ModalContent className={LUMUS_CLASS_NAMES.modal}>
      <ModalHeader><Text className={LUMUS_FORM_CLASS_NAMES.label}>Desfazer avaliação vigente</Text></ModalHeader>
      <ModalBody><VStack className="gap-3">
        <Text className={LUMUS_CLASS_NAMES.helper}>O histórico será recalculado sem esta avaliação. Aportes, resgates, principal e bancos serão preservados. A observação e sua correção continuarão no histórico.</Text>
        <Text className={LUMUS_FORM_CLASS_NAMES.label}>Motivo</Text>
        <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || spark.hasUncertainResult() || preparing}><InputField accessibilityLabel="Motivo para desfazer a avaliação" maxLength={2000} value={reason} onChangeText={setReason} /></Input>
        {feedback && <Text className={preparing ? LUMUS_CLASS_NAMES.helper : LUMUS_FORM_CLASS_NAMES.error} role="alert">{feedback}</Text>}
        {spark.hasUncertainResult() && <Text className={LUMUS_CLASS_NAMES.helper}>Repita a mesma confirmação para conferir o resultado antes de fechar.</Text>}
      </VStack></ModalBody>
      <ModalFooter><Button variant="outline" action="secondary" isDisabled={busy || spark.hasUncertainResult()} onPress={close}><ButtonText>{preparing ? 'Pausar' : 'Cancelar'}</ButtonText></Button>
        <Button isDisabled={busy || !reason.trim()} onPress={() => void confirm()}>{busy && <ButtonSpinner />}<ButtonText>{preparing ? 'Continuar conferência' : 'Confirmar desfazimento'}</ButtonText></Button></ModalFooter>
    </ModalContent></Modal>
  </>;
}
