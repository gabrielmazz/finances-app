import { Button,ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import BankBalanceAttachedPanel from '@/components/uiverse/banks/bank-balance-attached-panel';
import { HIDDEN_VALUE_PLACEHOLDER,useValueVisibility } from '@/contexts/ValueVisibilityContext';
import React from 'react';

import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

type Props = { bankId: string };
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BankCurrentBalanceAttachedPanel({ bankId }: Props) {
	const { shouldHideValues } = useValueVisibility();
	const [balanceInCents] = React.useState<number | null>(null);
	const [status] = React.useState<'loading' | 'ready' | 'error'>('loading');
	const [, retry] = React.useReducer(value => value + 1, 0);

	return (
		<BankBalanceAttachedPanel>
			{status === 'loading' ? (
				<Text className={`${LUMUS_CLASS_NAMES.helper} text-center text-sm`}>Carregando saldo atual…</Text>
			) : status === 'error' ? (
				<VStack space="sm" className="items-center">
					<Text className={`${LUMUS_CLASS_NAMES.errorText} text-center text-sm`} role="alert">
						Não foi possível carregar o saldo atual. Verifique sua conexão.
					</Text>
					<Button variant="outline" className="min-h-touch" onPress={retry}>
						<ButtonText>Tentar novamente</ButtonText>
					</Button>
				</VStack>
			) : balanceInCents === null ? (
				<Text className={`${LUMUS_CLASS_NAMES.helper} text-center text-sm`}>
					Saldo atual indisponível. Informe o novo saldo abaixo.
				</Text>
			) : (
				<Text className={`${LUMUS_CLASS_NAMES.body} text-center text-sm`}>
					Saldo atual do banco: {shouldHideValues
						? HIDDEN_VALUE_PLACEHOLDER
						: currencyFormatter.format(balanceInCents / 100)}
				</Text>
			)}
		</BankBalanceAttachedPanel>
	);
}
