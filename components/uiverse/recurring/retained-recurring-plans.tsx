import React from 'react';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { useSparkRecurringAction } from '@/hooks/useSparkRecurringForm';
import { LUMUS_CLASS_NAMES, LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

export type RetainedRecurringPlan = { id: string; name: string };

export default function RetainedRecurringPlans({ plans, recurringType, onChanged }: {
  plans: RetainedRecurringPlan[]; recurringType: 'expense' | 'gain'; onChanged: () => Promise<unknown>;
}) {
  const { submit } = useSparkRecurringAction(recurringType);
  const [busy, setBusy] = React.useState<string | null>(null), [error, setError] = React.useState<string | null>(null);
  const lock = React.useRef(false);
  const restore = async (planId: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(planId); setError(null);
    try {
      if (!await submit({ action: 'restore', planId })) throw new Error('Não foi possível restaurar a recorrência.');
      await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar as recorrências.'); }
    finally { lock.current = false; setBusy(null); }
  };
  if (!plans.length) return null;
  return <VStack className="gap-3 py-4">
    <Text className={LUMUS_FORM_CLASS_NAMES.label}>Recorrências arquivadas</Text>
    <Text className={LUMUS_CLASS_NAMES.helper}>Restaurar conserva os pagamentos e as parcelas concluídas. Nenhum valor é lançado nesta ação.</Text>
    {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
    {plans.map(plan => <HStack key={plan.id} className="items-center justify-between gap-3">
      <Text className="min-w-0 flex-1" numberOfLines={2}>{plan.name}</Text>
      <Button variant="outline" action="secondary" isDisabled={busy !== null} accessibilityLabel={`Restaurar ${plan.name}`} onPress={() => void restore(plan.id)}>
        {busy === plan.id && <ButtonSpinner />}<ButtonText>Restaurar</ButtonText>
      </Button>
    </HStack>)}
  </VStack>;
}
