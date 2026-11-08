import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import { Button,ButtonSpinner,ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import React from 'react';

import { LUMUS_CLASS_NAMES,LUMUS_FORM_CLASS_NAMES } from '@/design-system/tokens';

type Account = { id: string; name: string; archived?: boolean; isActive?: boolean };

export default function RetainedInvestments({ accounts, onChanged }: { accounts: Account[]; onChanged: () => Promise<unknown> }) {

  const [busy] = React.useState<string | null>(null), [error] = React.useState<string | null>(null);
  if (!accounts.length) return null;
  return <VStack className="gap-3 py-4">
    <Text className={LUMUS_FORM_CLASS_NAMES.label}>Investimentos fora da carteira ativa</Text>
    <Text className={LUMUS_CLASS_NAMES.helper}>O saldo e o histórico estão preservados. Restaurar mantém a atividade anterior da conta.</Text>
    {error && <Text className={LUMUS_FORM_CLASS_NAMES.error} role="alert">{error}</Text>}
    {accounts.map(account => <HStack key={account.id} className="items-center justify-between gap-3">
      <VStack className="min-w-0 flex-1"><Text numberOfLines={2}>{account.name}</Text><Text className={LUMUS_CLASS_NAMES.helper}>{account.archived ? 'Arquivado' : 'Desativado'}</Text></VStack>
      <Button variant="outline" action="secondary" isDisabled={busy !== null} accessibilityLabel={`${account.archived ? 'Restaurar' : 'Ativar'} ${account.name}`} onPress={() => showFeatureUnavailable()}>
        {busy === account.id && <ButtonSpinner />}<ButtonText>{account.archived ? 'Restaurar' : 'Ativar'}</ButtonText>
      </Button>
    </HStack>)}
  </VStack>;
}
