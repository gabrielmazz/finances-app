import React from 'react';
import { useFocusEffect } from 'expo-router';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import BankBalanceAttachedPanel from '@/components/uiverse/banks/bank-balance-attached-panel';
import { useValueVisibility, HIDDEN_VALUE_PLACEHOLDER } from '@/contexts/ValueVisibilityContext';
import { auth } from '@/FirebaseConfig';
import { getBankCurrentBalanceInCentsFirebase } from '@/functions/BankFirebase';
import { LUMUS_CLASS_NAMES } from '@/design-system/tokens';

type Props = { bankId: string };
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BankCurrentBalanceAttachedPanel({ bankId }: Props) {
	const { shouldHideValues } = useValueVisibility();
	const [balanceInCents, setBalanceInCents] = React.useState<number | null>(null);
	const [status, setStatus] = React.useState<'loading' | 'ready' | 'error'>('loading');
	const [retryKey, retry] = React.useReducer(value => value + 1, 0);

	useFocusEffect(React.useCallback(() => {
		let isActive = true;
		setStatus('loading');
		setBalanceInCents(null);

		const loadBalance = async () => {
			const personId = auth.currentUser?.uid;
			if (!personId) {
				if (isActive) setStatus('error');
				return;
			}

			try {
				const result = await getBankCurrentBalanceInCentsFirebase(personId, bankId);
				if (!isActive) return;
				if (!result.success) throw result.error;
				setBalanceInCents(typeof result.data === 'number' ? result.data : null);
				setStatus('ready');
			} catch (error) {
				if (!isActive) return;
				console.error('Erro ao carregar saldo atual do banco:', error);
				setStatus('error');
			}
		};

		void loadBalance();
		return () => { isActive = false; };
	}, [bankId, retryKey]));

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
