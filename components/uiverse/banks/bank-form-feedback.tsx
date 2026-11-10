import React from 'react';
import { View } from 'react-native';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { LUMUS_CLASS_NAMES as ui } from '@/design-system/tokens';
import { APP_ROUTE_PATHS, navigateToRoute } from '@/utils/navigation';
import type { BankAccount } from '@/domain/banks';
import { formatCents } from '@/domain/money';
export default function BankFormFeedback({
	error,
	saved,
	isEditing,
	busy,
	onAnother,
	canWrite,
}: {
	error: string | null;
	saved: BankAccount | null;
	isEditing: boolean;
	busy: boolean;
	onAnother(): void;
	canWrite: boolean;
}) {
	return (
		<View className="gap-3">
			{!canWrite && (
				<Text accessibilityRole="alert" className={ui.helper}>
					Você pode consultar este contexto. Apenas o administrador pode alterar contas do grupo.
				</Text>
			)}
			{error && (
				<Text accessibilityRole="alert" className={ui.errorText}>
					{error} Se o envio foi interrompido, tente novamente nesta tela: o mesmo cadastro será conferido
					antes de gravar.
				</Text>
			)}
			{saved && (
				<>
					<Text accessibilityRole="text" accessibilityLiveRegion="polite" className={ui.successText}>
						{isEditing
							? 'Cadastro atualizado. Os saldos e o histórico não foram alterados.'
							: `Conta ${saved.name} salva com abertura de ${saved.balanceInCents === null ? 'valor em revisão' : formatCents(saved.balanceInCents)}.`}
					</Text>
					<Button
						variant="outline"
						onPress={() =>
							navigateToRoute(APP_ROUTE_PATHS.bankMovements, {
								bankId: saved.id,
								bankSource: saved.source,
								bankName: encodeURIComponent(saved.name),
							})
						}
					>
						<ButtonText>Ver conta salva</ButtonText>
					</Button>
					{!isEditing && (
						<Button variant="outline" isDisabled={busy} onPress={onAnother}>
							<ButtonText>Cadastrar outra conta</ButtonText>
						</Button>
					)}
				</>
			)}
		</View>
	);
}
