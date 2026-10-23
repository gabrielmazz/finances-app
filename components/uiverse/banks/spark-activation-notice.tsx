import React from 'react';
import { AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/FirebaseConfig';
import { readSparkPendingActivationsFirebase, advanceSparkPendingActivationFirebase, type SparkPendingActivation } from '@/functions/SparkActivationQueueFirebase';
import { createFinancialClientActionId } from '@/functions/FinancialLedgerFirebase';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { LUMUS_FORM_CLASS_NAMES, LUMUS_CLASS_NAMES } from '@/design-system/tokens';

export default function SparkActivationNotice() {
  const { user, isAuthReady } = useAuth(), client = useQueryClient();
  const [pending, setPending] = React.useState<SparkPendingActivation[]>([]), [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null), [error, setError] = React.useState<string | null>(null);
  const [scanVersion, setScanVersion] = React.useState(0);
  const request = React.useRef<AbortController | null>(null), generation = React.useRef(0), lock = React.useRef<number | null>(null);
  React.useEffect(() => {
    const current = ++generation.current, actorId = user?.uid;
    setPending([]); setMessage(null); setError(null); setBusy(false); request.current?.abort();
    if (!isAuthReady || !actorId) return;
    let cancelled = false;
    const scan = async () => {
      if (lock.current === current || cancelled) return;
      try {
        const rows = await readSparkPendingActivationsFirebase(db, actorId);
        if (!cancelled && current === generation.current && auth.currentUser?.uid === actorId) { setPending(rows); setError(null); }
      } catch (cause) {
        if (!cancelled && current === generation.current && auth.currentUser?.uid === actorId) setError(cause instanceof Error ? cause.message : 'Não foi possível conferir as aberturas mensais.');
      }
    };
    void scan();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void scan(); });
    return () => { cancelled = true; generation.current += 1; request.current?.abort(); subscription.remove(); };
  }, [isAuthReady, user?.uid, scanVersion]);
  const advance = async () => {
    const actorId = user?.uid, account = pending[0], current = generation.current;
    if (!actorId || lock.current === current || !account) return;
    lock.current = current; setBusy(true); setError(null); request.current = new AbortController();
    try {
      const result = await advanceSparkPendingActivationFirebase(db, actorId, account.accountId,
        () => createFinancialClientActionId('monthly_activation'), { signal: request.current.signal });
      if (auth.currentUser?.uid !== actorId || current !== generation.current) return;
      if (result.status === 'preparing') setMessage(`Preparação preservada: ${result.progress.completedPages} etapas concluídas. Continue para atualizar ${account.name}.`);
      else {
        setMessage(null);
        const rows = await readSparkPendingActivationsFirebase(db, actorId);
        if (auth.currentUser?.uid !== actorId || current !== generation.current) return;
        setPending(rows);
        void client.invalidateQueries({ queryKey: ['finance', actorId], refetchType: 'all' }).catch(cause => console.warn('Não foi possível atualizar os saldos.', cause));
      }
    } catch (cause) {
      if (auth.currentUser?.uid === actorId && current === generation.current) setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o saldo.');
    } finally { if (lock.current === current) lock.current = null; if (current === generation.current) setBusy(false); }
  };
  if (!isAuthReady || !user?.uid || !pending.length && !error) return null;
  return <SafeAreaView edges={['top']} className={LUMUS_CLASS_NAMES.surfaceFill}><VStack className={`${LUMUS_CLASS_NAMES.surface} gap-2 px-4 py-3`}>
    <Text className={LUMUS_FORM_CLASS_NAMES.label}>{pending.length ? 'Atualização mensal pendente' : 'Conferência de saldos indisponível'}</Text>
    {!!pending.length && <Text className={LUMUS_CLASS_NAMES.helper}>{pending.length} banco(s) precisam aplicar aberturas já autorizadas. O histórico será conferido antes de liberar seus saldos.</Text>}
    {message && <Text className={LUMUS_CLASS_NAMES.helper}>{message}</Text>}
    {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
    <HStack className="gap-3">
      <Button isDisabled={busy} onPress={() => pending.length ? void advance() : setScanVersion(value => value + 1)}>{busy && <ButtonSpinner />}<ButtonText>{!pending.length ? 'Verificar novamente' : message ? 'Continuar preparação' : 'Atualizar saldos'}</ButtonText></Button>
      {busy && <Button variant="outline" action="secondary" onPress={() => request.current?.abort()}><ButtonText>Pausar</ButtonText></Button>}
    </HStack>
  </VStack></SafeAreaView>;
}
