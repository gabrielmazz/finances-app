import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { useBankAccounts } from '@/contexts/BankAccountsContext';
import { LUMUS_CLASS_NAMES as ui } from '@/design-system/tokens';
import { formatCents } from '@/domain/money';
import { ACCOUNT_TYPES } from '@/domain/banks';
import { BankIcon } from '@/hooks/useBankIcons';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';

export default function BankAccountsPanel() {
	const accounts = useBankAccounts(),
		{ shouldHideValues } = useValueVisibility();
	const [showArchived, setShowArchived] = React.useState(false);
	const page = showArchived ? accounts.archived : accounts.active;
	const mode = showArchived ? 'archived' : 'active';
	return (
		<View className="gap-4 py-4" testID="bank-accounts-panel">
			<Heading className={ui.heading}>Bancos e saldo inicial</Heading>
			<Text className={ui.helper}>
				Contas arquivadas ficam fora do total. Nesta etapa, as novas contas têm apenas a abertura; ela não é
				receita.
			</Text>
			<Text accessibilityLiveRegion="polite" className={ui.heading}>
				Saldo total das contas ativas:{' '}
				{shouldHideValues ? '••••' : accounts.total === null ? 'Indisponível' : formatCents(accounts.total)}
			</Text>
			{accounts.total === null && !accounts.active.loading && (
				<Text className={ui.helper}>
					O total exige todas as páginas carregadas e saldos confirmados. Contas antigas podem precisar de
					conciliação.
				</Text>
			)}
			<View className="flex-row flex-wrap gap-3">
				<Button onPress={() => navigateToRoute(APP_ROUTE_PATHS.addRegisterBank)}>
					<ButtonText>Cadastrar conta</ButtonText>
				</Button>
				<Button
					variant="outline"
					onPress={() => {
						const next = !showArchived;
						setShowArchived(next);
						if (next && !accounts.archived.loaded) void accounts.load('archived');
					}}
				>
					<ButtonText>{showArchived ? 'Ver contas ativas' : 'Ver contas arquivadas'}</ButtonText>
				</Button>
				<Button variant="outline" isDisabled={page.loading} onPress={() => void accounts.load(mode)}>
					<ButtonText>Atualizar contas</ButtonText>
				</Button>
			</View>
			{accounts.scopeError && (
				<Text accessibilityRole="alert" className={ui.errorText}>
					{accounts.scopeError}
				</Text>
			)}
			{page.loading && (
				<Text accessibilityRole="progressbar" className={ui.helper}>
					Carregando contas…
				</Text>
			)}
			{page.error && (
				<Text accessibilityRole="alert" className={ui.errorText}>
					{page.error} Os valores anteriores não confirmam o saldo atual.
				</Text>
			)}
			{page.issues > 0 && (
				<Text accessibilityRole="alert" className={ui.errorText}>
					Há {page.issues} registro(s) incompatível(is). O total foi bloqueado e nenhum dado foi alterado.
				</Text>
			)}
			{page.loaded && !page.loading && !page.error && page.items.length === 0 && (
				<Text className={ui.helper}>
					{showArchived
						? 'Nenhuma conta arquivada.'
						: 'Nenhuma conta cadastrada neste contexto. Cadastre sua primeira conta.'}
				</Text>
			)}
			{page.items.map((bank) => (
				<View
					key={bank.source + ':' + bank.id}
					className={`${ui.card} gap-3 p-4`}
					testID={'account-row-' + bank.source + '-' + bank.id}
				>
					<View className="flex-row items-center gap-3">
						<BankIcon iconKey={bank.institutionKey} name={bank.institutionName} colorHex={bank.colorHex} />
						<View className="min-w-0 flex-1">
							<Text className={ui.heading}>{bank.name}</Text>
							<Text className={ui.helper}>
								{bank.institutionName} ·{' '}
								{ACCOUNT_TYPES.find((type) => type.value === bank.accountType)?.label || 'Tipo não informado'}{' '}
								· {bank.status === 'archived' ? 'Arquivada' : 'Ativa'}
							</Text>
						</View>
					</View>
					<Text className={ui.heading}>
						{shouldHideValues
							? '••••'
							: bank.balanceInCents === null
								? 'Saldo em conciliação'
								: formatCents(bank.balanceInCents)}
					</Text>
					{bank.issue && <Text className={ui.helper}>{bank.issue}</Text>}
					<Button
						variant="outline"
						accessibilityLabel={`Consultar conta ${bank.name}`}
						onPress={() =>
							navigateToRoute(APP_ROUTE_PATHS.bankMovements, {
								bankId: bank.id,
								bankSource: bank.source,
								bankName: encodeURIComponent(bank.name),
							})
						}
					>
						<ButtonText>Consultar conta</ButtonText>
					</Button>
				</View>
			))}
			{page.loaded && !page.complete && (
				<Button variant="outline" isDisabled={page.loading} onPress={() => void accounts.load(mode, true)}>
					<ButtonText>Carregar mais contas</ButtonText>
				</Button>
			)}
		</View>
	);
}
