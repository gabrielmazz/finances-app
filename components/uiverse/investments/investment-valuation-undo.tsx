import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import React from 'react';

import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { Input,InputField } from '@/components/ui/input';
import { Modal,ModalBackdrop,ModalBody,ModalContent,ModalFooter,ModalHeader } from '@/components/ui/modal';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { LUMUS_CLASS_NAMES,LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

/** [[Investimentos]]: confirmação explícita e preparação antes de corrigir a referência vigente. */
export default function InvestmentValuationUndo({ accountId, referenceOperationId, revision, onChanged }: {
  accountId: string; referenceOperationId: string; revision: number; onChanged: () => Promise<unknown>;
}) {

  const [open, setOpen] = React.useState(false), [busy, setBusy] = React.useState(false), [reason, setReason] = React.useState('');
  const [feedback, setFeedback] = React.useState<string | null>(null), [preparing, setPreparing] = React.useState(false);
  const generation = React.useRef(0);
  React.useEffect(() => {
    generation.current += 1; setOpen(false); setBusy(false); setReason(''); setFeedback(null); setPreparing(false);
    return () => { generation.current += 1; };
  }, [accountId]);
  const close = () => { showFeatureUnavailable(); };
  return <>
    <Button variant="outline" action="secondary" onPress={() => { showFeatureUnavailable(); }}><ButtonText>Desfazer avaliação vigente</ButtonText></Button>
    {!open && feedback && <Text className={LUMUS_CLASS_NAMES.helper}>{feedback}</Text>}
    <Modal isOpen={open} onClose={close} avoidKeyboard><ModalBackdrop /><ModalContent className={LUMUS_CLASS_NAMES.modal}>
      <ModalHeader><Text className={LUMUS_FORM_CLASS_NAMES.label}>Desfazer avaliação vigente</Text></ModalHeader>
      <ModalBody><VStack className="gap-3">
        <Text className={LUMUS_CLASS_NAMES.helper}>O histórico será recalculado sem esta avaliação. Aportes, resgates, principal e bancos serão preservados. A observação e sua correção continuarão no histórico.</Text>
        <Text className={LUMUS_FORM_CLASS_NAMES.label}>Motivo</Text>
        <Input className={LUMUS_FORM_CLASS_NAMES.input} isDisabled={busy || false || preparing}><InputField accessibilityLabel="Motivo para desfazer a avaliação" maxLength={2000} value={reason} onChangeText={setReason} /></Input>
        {feedback && <Text className={preparing ? LUMUS_CLASS_NAMES.helper : LUMUS_FORM_CLASS_NAMES.error} role="alert">{feedback}</Text>}
        {false}
      </VStack></ModalBody>
      <ModalFooter><Button variant="outline" action="secondary" isDisabled={busy || false} onPress={close}><ButtonText>{preparing ? 'Pausar' : 'Cancelar'}</ButtonText></Button>
        <Button isDisabled={busy || !reason.trim()} onPress={() => showFeatureUnavailable()}>{busy && <ButtonSpinner />}<ButtonText>{preparing ? 'Continuar conferência' : 'Confirmar desfazimento'}</ButtonText></Button></ModalFooter>
    </ModalContent></Modal>
  </>;
}
