import React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/FirebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { assertClientActionId } from '@/utils/financialLedger';
import { acknowledgeSparkRecoveryFirebase, cancelSparkRecoveryFirebase, parseSparkRecoveryIntent, readSparkRecoveryFirebase,
  sparkRecoveryIsVisible, subscribeSparkRecoverySession, type SparkRecoveryEntry } from '@/functions/SparkOperationRecoveryFirebase';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

/** Compartilhado por Web/mobile: não repete dinheiro nem restaura autorização conversacional. */
export default function SparkOperationRecoveryNotice() {
  const { user, isAuthReady } = useAuth(), client = useQueryClient();
  const [entry, setEntry] = React.useState<SparkRecoveryEntry | null>(null);
  const [verified, setVerified] = React.useState(false), [busy, setBusy] = React.useState(false), [confirmCancel, setConfirmCancel] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null), [, setVersion] = React.useState(0);
  const generation = React.useRef(0), lock = React.useRef<number | null>(null);
  const scopedActor = React.useRef<string | null>(null);
  React.useEffect(() => subscribeSparkRecoverySession(db, () => setVersion(value => value + 1)), []);
  React.useEffect(() => {
    const current = ++generation.current, actorId = user?.uid;
    scopedActor.current = actorId ?? null;
    setEntry(null); setVerified(false); setError(null); setBusy(false); setConfirmCancel(false);
    if (!isAuthReady || !actorId) return;
    const valid = () => generation.current === current && auth.currentUser?.uid === actorId;
    const fail = () => { if (valid()) { setVerified(false); setError('Não foi possível conferir o envio anterior. Conecte-se e verifique novamente.'); } };
    let unsubscribeIntent = () => {}, selection = 0;
    const unsubscribeIndex = onSnapshot(doc(db, 'sparkOperationRecovery', actorId), { includeMetadataChanges: true }, snapshot => {
      if (!valid()) return;
      const selected = ++selection;
      unsubscribeIntent(); unsubscribeIntent = () => {}; setVerified(false);
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      if (!snapshot.exists()) { setEntry(null); setError(null); setVerified(true); return; }
      try {
        const index = snapshot.data(); assertClientActionId(index.operationId);
        unsubscribeIntent = onSnapshot(doc(snapshot.ref, 'intents', index.operationId), { includeMetadataChanges: true }, record => {
          if (!valid() || selected !== selection) return;
          setVerified(false);
          if (record.metadata.fromCache || record.metadata.hasPendingWrites) return;
          try {
            const intent = parseSparkRecoveryIntent(record.data() ?? {});
            if (intent.groupId !== index.groupId) throw new Error('Identificação inválida.');
            setEntry({ ...intent, operationId: index.operationId }); setVerified(true); setError(null);
          } catch { fail(); }
        }, () => { if (selected === selection) fail(); });
      } catch { fail(); }
    }, fail);
    return () => { generation.current += 1; unsubscribeIndex(); unsubscribeIntent(); };
  }, [isAuthReady, user?.uid]);
  React.useEffect(() => { setConfirmCancel(false); }, [entry?.operationId, entry?.status]);
  const act = async (action: 'read' | 'cancel' | 'acknowledge') => {
    const actorId = user?.uid, current = generation.current;
    if (!actorId || scopedActor.current !== actorId || lock.current === current || !isAuthReady) return;
    if (action !== 'read' && (!entry || !verified)) return;
    const identity = entry ? { actorId, groupId: entry.groupId, clientActionId: entry.operationId } : null;
    lock.current = current; setBusy(true); setError(null);
    try {
      if (action === 'cancel' && identity) await cancelSparkRecoveryFirebase(db, identity);
      if (action === 'acknowledge' && identity) await acknowledgeSparkRecoveryFirebase(db, identity);
      const latest = await readSparkRecoveryFirebase(db, actorId);
      if (auth.currentUser?.uid !== actorId || generation.current !== current) return;
      setEntry(latest); setVerified(true); setConfirmCancel(false);
      if (latest?.status !== 'pending') void client.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' }).catch(() => {});
    } catch (cause) {
      if (auth.currentUser?.uid === actorId && generation.current === current) {
        setVerified(false); setError(cause instanceof Error ? cause.message : 'Não foi possível conferir o envio anterior.');
      }
    } finally { if (lock.current === current) lock.current = null; if (generation.current === current) setBusy(false); }
  };
  const visible = !!entry && !!user?.uid && sparkRecoveryIsVisible(db,
    { actorId: user.uid, groupId: entry.groupId, clientActionId: entry.operationId }, entry.status);
  if (!isAuthReady || !user?.uid || scopedActor.current !== user.uid || !visible && !error) return null;
  return <SafeAreaView edges={['top']} className={LUMUS_CLASS_NAMES.surfaceFill}>
    <VStack className={`${LUMUS_CLASS_NAMES.surface} gap-2 px-4 py-3`}>
      <Text className={LUMUS_FORM_CLASS_NAMES.label}>{entry?.status === 'committed' ? 'Envio anterior confirmado' : 'Conferência do envio anterior'}</Text>
      {entry?.status === 'committed' ? <Text className={LUMUS_CLASS_NAMES.helper}>O registro foi confirmado. Confira o resultado no aplicativo antes de iniciar outro envio.</Text>
        : <Text className={LUMUS_CLASS_NAMES.helper}>Um envio anterior ainda precisa de conferência. Verifique o resultado ou cancele esse envio antes de iniciar outra operação.</Text>}
      {confirmCancel && <Text className={LUMUS_CLASS_NAMES.helper}>Cancelar impede a confirmação atrasada deste envio. Se o registro já tiver sido confirmado, ele será preservado e o resultado será exibido.</Text>}
      {!verified && <Text className={LUMUS_CLASS_NAMES.helper}>Aguardando conferência com o servidor.</Text>}
      {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
      <HStack className="flex-wrap gap-3">
        <Button isDisabled={busy} onPress={() => void act(entry?.status === 'committed' && verified ? 'acknowledge' : 'read')}>
          {busy && <ButtonSpinner />}<ButtonText>{entry?.status === 'committed' && verified ? 'Entendido' : 'Verificar resultado'}</ButtonText>
        </Button>
        {entry?.status === 'pending' && <Button action="secondary" variant="outline" isDisabled={busy || !verified}
          onPress={() => confirmCancel ? void act('cancel') : setConfirmCancel(true)}><ButtonText>{confirmCancel ? 'Confirmar cancelamento' : 'Cancelar envio'}</ButtonText></Button>}
        {confirmCancel && <Button action="secondary" variant="outline" isDisabled={busy} onPress={() => setConfirmCancel(false)}><ButtonText>Voltar</ButtonText></Button>}
      </HStack>
    </VStack>
  </SafeAreaView>;
}
