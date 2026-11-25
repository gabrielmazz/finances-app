import { useLinkedFinancialContexts } from '@/hooks/useUserProfile';
import { View } from 'react-native';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { LUMUS_CLASS_NAMES as ui } from '@/design-system/tokens';
import { cn } from '@/lib/utils';

export default function LinkedFinancialContexts() {
	const { uid, groupId, groups, loadError, selectError, switching, select, reload } = useLinkedFinancialContexts();

	return <View className="mt-2 gap-3">
		{loadError ? (
			<>
				<Text accessibilityRole="alert" className={ui.errorText}>Não foi possível consultar os grupos compartilhados.</Text>
				<Button variant="outline" onPress={reload} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12')}>
					<ButtonText className={ui.body}>Tentar novamente</ButtonText>
				</Button>
			</>
		) : groups === null ? <Text accessibilityLiveRegion="polite" className={ui.helper}>Carregando contas vinculadas…</Text>
			: !groups.length ? <Text className={ui.helper}>Nenhum grupo financeiro autorizado.</Text>
				: groups.map(group => {
					const selected = group.groupId === groupId;
					return <View key={group.groupId} className="gap-2">
						<Text className={ui.body}>{group.name}</Text>
						<Text className={ui.helper}>{group.role === 'admin' ? 'Administrador do grupo' : 'Participante · somente consulta'}{selected ? ' · Contexto atual' : ''}</Text>
						{selected && group.participantIds.length > 0 && <View className="gap-1">
							<Text className={ui.helper}>Participantes informados</Text>
							{group.participantIds.map(id => <Text key={id} className={ui.body}>{id === uid ? 'Você' : `ID ${id}`}</Text>)}
						</View>}
						{!selected && <Button variant="outline" onPress={() => void select(group.groupId)} isDisabled={switching}
							accessibilityLabel={`Abrir grupo ${group.name}`} className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12')}>
							<ButtonText className={ui.body}>Abrir grupo</ButtonText>
						</Button>}
					</View>;
				})}
		{groupId && <Button variant="outline" onPress={() => void select(null)} isDisabled={switching}
			className={cn(ui.secondaryButton, ui.focusRing, 'min-h-12')}>
			<ButtonText className={ui.body}>Voltar às contas pessoais</ButtonText>
		</Button>}
		{selectError && <Text accessibilityRole="alert" className={ui.errorText}>O grupo não pôde ser aberto. Confira se o acesso continua ativo.</Text>}
	</View>;
}
