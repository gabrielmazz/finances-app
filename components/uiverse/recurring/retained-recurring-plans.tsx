import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import React from 'react';

import { LUMUS_CLASS_NAMES,LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

export type RetainedRecurringPlan = { id: string; name: string };

export default function RetainedRecurringPlans({ plans, recurringType, onChanged }: {
  plans: RetainedRecurringPlan[]; recurringType: 'expense' | 'gain'; onChanged: () => Promise<unknown>;
}) {

  const [busy] = React.useState<string | null>(null), [error] = React.useState<string | null>(null);
  if (!plans.length) return null;
  return <VStack className="gap-3 py-4">
    <Text className={LUMUS_FORM_CLASS_NAMES.label}>Recorrências arquivadas</Text>
    <Text className={LUMUS_CLASS_NAMES.helper}>Restaurar conserva os pagamentos e as parcelas concluídas. Nenhum valor é lançado nesta ação.</Text>
    {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
    {plans.map(plan => <HStack key={plan.id} className="items-center justify-between gap-3">
      <Text className="min-w-0 flex-1" numberOfLines={2}>{plan.name}</Text>
      <Button variant="outline" action="secondary" isDisabled={busy !== null} accessibilityLabel={`Restaurar ${plan.name}`} onPress={() => showFeatureUnavailable()}>
        {busy === plan.id && <ButtonSpinner />}<ButtonText>Restaurar</ButtonText>
      </Button>
    </HStack>)}
  </VStack>;
}
