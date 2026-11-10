import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/button';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { formatCents } from '@/domain/money';
import { LUMUS_CLASS_NAMES as ui } from '@/design-system/tokens';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import BankAccountsPanel from './bank-accounts-panel';
import { useBankAccountDetails } from '@/hooks/useBankAccountDetails';

export default function BankAccountDetails() {
	const {
		id,
		cash,
		current,
		loading,
		error,
		confirm,
		setConfirm,
		busy,
		scopeError,
		canWrite,
		reload,
		archive,
	} = useBankAccountDetails();
	const { shouldHideValues } = useValueVisibility();
	if (cash) return null;
	if (!id) return <BankAccountsPanel />;
	return (
		<View className={`${ui.card} mb-4 gap-4 p-4`} testID="bank-account-details">
			<Heading className={ui.heading}>Dados da conta</Heading>
			{(loading || scopeError) && <Text className={ui.helper}>{scopeError || 'Carregando conta…'}</Text>}
			{error && (
				<Text accessibilityRole="alert" className={ui.errorText}>
					{error}
				</Text>
			)}
			{current && (
				<>
					<Text className={ui.heading}>{current.name}</Text>
					<Text className={ui.body}>
						{current.institutionName} · {current.status === 'archived' ? 'Arquivada' : 'Ativa'}
					</Text>
					<Text className={ui.heading}>
						Saldo atual:{' '}
						{shouldHideValues
							? '••••'
							: current.balanceInCents === null
								? 'Em conciliação'
								: formatCents(current.balanceInCents)}
					</Text>
					{current.openingDate && (
						<Text className={ui.helper}>
							Origem: saldo inicial de {current.openingDate.split('-').reverse().join('/')}. A abertura não é
							receita.
						</Text>
					)}
					{current.issue && <Text className={ui.helper}>{current.issue}</Text>}
					<Text className={ui.helper}>
						Edições cadastrais não alteram a abertura. Correções financeiras exigem uma operação auditável
						específica, ainda indisponível.
					</Text>
					<View className="flex-row flex-wrap gap-3">
						<Button
							variant="outline"
							isDisabled={!canWrite || current.status === 'archived'}
							onPress={() =>
								navigateToRoute(APP_ROUTE_PATHS.addRegisterBank, {
									bankId: current.id,
									bankSource: current.source,
								})
							}
						>
							<ButtonText>Editar conta</ButtonText>
						</Button>
						<Button
							variant="outline"
							isDisabled={
								!canWrite ||
								current.source !== 'new' ||
								current.status === 'archived' ||
								current.balanceInCents !== 0
							}
							onPress={() => setConfirm(true)}
						>
							<ButtonText>Arquivar conta</ButtonText>
						</Button>
					</View>
					{current.source !== 'new' || current.balanceInCents !== 0 ? (
						<Text className={ui.helper}>
							O arquivamento exige saldo zero confirmado. Contas antigas precisam de conciliação.
						</Text>
					) : null}
				</>
			)}
			<Button variant="outline" isDisabled={loading || busy} onPress={() => void reload()}>
				<ButtonText>Atualizar dados da conta</ButtonText>
			</Button>
			<Modal
				isOpen={confirm}
				onClose={() => {
					if (!busy) setConfirm(false);
				}}
			>
				<ModalBackdrop />
				<ModalContent>
					<ModalHeader>
						<ModalTitle>Arquivar conta?</ModalTitle>
					</ModalHeader>
					<ModalBody>
						<Text className={ui.body}>
							A conta ficará fora da lista ativa e do total. O cadastro e a abertura serão preservados.
						</Text>
					</ModalBody>
					<ModalFooter>
						<Button variant="outline" isDisabled={busy} onPress={() => setConfirm(false)}>
							<ButtonText>Cancelar</ButtonText>
						</Button>
						<Button isDisabled={busy} onPress={() => void archive()}>
							<ButtonText>{busy ? 'Arquivando…' : 'Confirmar arquivamento'}</ButtonText>
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</View>
	);
}
