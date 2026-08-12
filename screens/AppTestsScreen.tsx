import React from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Bot, Route, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react-native';

import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import Navigator from '@/components/uiverse/navigator';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { assistantAiGateway } from '@/services/lumusAssistant/assistantPlatform';
import { sendLocalNotificationTest } from '@/utils/localNotifications';
import {
	APP_ROUTE_PATHS,
	navigateToHomeConfigurations,
	navigateToRoute,
	redirectToHomeDashboard,
} from '@/utils/navigation';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import TestsScreenIllustration from '@/assets/UnDraw/testsScreen.svg';

export default function AppTestsScreen() {
	const [isSendingTestNotification, setIsSendingTestNotification] = React.useState(false);
	const [isLoadingAssistantDiagnostics, setIsLoadingAssistantDiagnostics] = React.useState(false);
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		notTintedCardClassName,
		accordionSectionButtonClassName,
		heroHeight,
		insets,
	} = useScreenStyles();

	const handleNavigationTest = React.useCallback(() => {
		redirectToHomeDashboard();
	}, []);

	const handleBackToConfigurations = React.useCallback(() => {
		navigateToHomeConfigurations();
		return true;
	}, []);

	const handleNotificationTest = React.useCallback(async () => {
		if (isSendingTestNotification) return;

		setIsSendingTestNotification(true);
		try {
			const result = await sendLocalNotificationTest();
			showNotifierAlert({
				title: result.success ? 'Notificação enviada' : 'Não foi possível testar',
				description: result.success
					? 'A notificação foi enviada agora. Verifique a bandeja do aparelho caso ela não apareça sobre o app.'
					: result.message,
				type: result.success ? 'success' : 'warn',
				isDarkMode,
				duration: 5000,
			});
		} finally {
			setIsSendingTestNotification(false);
		}
	}, [isDarkMode, isSendingTestNotification]);

	const handleAssistantTest = React.useCallback(async () => {
		if (isLoadingAssistantDiagnostics) return;

		setIsLoadingAssistantDiagnostics(true);
		try {
			const [availability, config] = await Promise.all([
				assistantAiGateway.getAvailability(),
				assistantAiGateway.getConfig(true),
			]);
			const status = availability.available ? 'disponível' : 'indisponível';
			showNotifierAlert({
				title: `Lumus IA ${status}`,
				description: availability.available
					? `Modelo ${config.model}; App Check e configuração remota validados.`
					: availability.reason ?? 'Verifique a build nativa, o App Check, a autenticação e o Remote Config.',
				type: availability.available ? 'success' : 'warn',
				isDarkMode,
				duration: 6000,
			});
		} catch (error) {
			console.error('Erro ao verificar o Lumus IA:', error);
			showNotifierAlert({
				title: 'Falha no teste do Lumus IA',
				description: 'Não foi possível consultar a configuração do assistente neste aparelho.',
				type: 'error',
				isDarkMode,
				duration: 5000,
			});
		} finally {
			setIsLoadingAssistantDiagnostics(false);
		}
	}, [isDarkMode, isLoadingAssistantDiagnostics]);

	const handleOpenTransactionForm = React.useCallback((kind: 'expense' | 'gain') => {
		const isExpense = kind === 'expense';
		navigateToRoute(isExpense ? APP_ROUTE_PATHS.addRegisterExpenses : APP_ROUTE_PATHS.addRegisterGain, {
			templateName: isExpense ? 'Teste de despesa' : 'Teste de ganho',
			templateDescription: 'Rascunho aberto pela central de testes. Salve somente se desejar criar este lançamento.',
			templateValueInCents: '1',
		});
	}, []);

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className={`absolute left-0 right-0 top-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background da tela de testes do aplicativo"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>

					<VStack className="h-full w-full items-center justify-start gap-4 px-6" style={{ paddingTop: insets.top + 24 }}>
						<Heading size="xl" className="text-center text-white">
							Testes do aplicativo
						</Heading>
						<TestsScreenIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<ScrollView
					contentInsetAdjustmentBehavior="automatic"
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					showsVerticalScrollIndicator={false}
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
					contentContainerStyle={{ paddingBottom: 48 }}
				>
					<VStack className="mt-4 gap-4">
						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-3">
								<ShieldCheck size={24} color={isDarkMode ? '#E2E8F0' : '#334155'} />
								<Heading size="md" className={bodyText}>
									Central segura
								</Heading>
								<Text className={`${helperText} text-sm leading-5`}>
									Os testes são manuais: a notificação usa o canal existente, o Lumus só verifica a configuração e os formulários só gravam após sua confirmação.
								</Text>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="gap-1">
									<Heading size="md" className={bodyText}>
										Notificação local
									</Heading>
									<Text className={`${helperText} text-sm leading-5`}>
										Envia um aviso imediato pelo canal existente de lembretes de pagamentos. Não agenda lembretes nem cria um canal de testes.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={handleNotificationTest}
									isDisabled={isSendingTestNotification}
									accessibilityLabel="Enviar notificação local de teste"
								>
									{isSendingTestNotification ? <ButtonSpinner /> : <ButtonIcon as={BellRing} size="md" />}
									<ButtonText>{isSendingTestNotification ? 'Enviando...' : 'Testar notificação'}</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="gap-1">
									<Heading size="md" className={bodyText}>
										Lumus IA
									</Heading>
									<Text className={`${helperText} text-sm leading-5`}>
										Verifica disponibilidade, App Check e configuração remota. Não envia mensagens ao modelo, dados financeiros nem altera o Firestore.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={handleAssistantTest}
									isDisabled={isLoadingAssistantDiagnostics}
									accessibilityLabel="Verificar disponibilidade do Lumus IA"
								>
									{isLoadingAssistantDiagnostics ? <ButtonSpinner /> : <ButtonIcon as={Bot} size="md" />}
									<ButtonText>{isLoadingAssistantDiagnostics ? 'Verificando...' : 'Testar Lumus IA'}</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="gap-1">
									<Heading size="md" className={bodyText}>
										Formulários de lançamentos
									</Heading>
									<Text className={`${helperText} text-sm leading-5`}>
										Abre o formulário correspondente com um rascunho de R$ 0,01. Nenhuma despesa ou ganho é criado até você tocar em salvar.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={() => handleOpenTransactionForm('expense')}
									accessibilityLabel="Abrir formulário de teste de despesa"
								>
									<ButtonIcon as={TrendingDown} size="md" />
									<ButtonText>Testar despesa</ButtonText>
								</Button>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={() => handleOpenTransactionForm('gain')}
									accessibilityLabel="Abrir formulário de teste de ganho"
								>
									<ButtonIcon as={TrendingUp} size="md" />
									<ButtonText>Testar ganho</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="gap-1">
									<Heading size="md" className={bodyText}>
										Navegação automática
									</Heading>
									<Text className={`${helperText} text-sm leading-5`}>
										Executa o mesmo retorno seguro ao Dashboard usado pelos fluxos pós-salvamento, sem persistir dados.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={handleNavigationTest}
									accessibilityLabel="Testar retorno seguro para o Dashboard"
								>
									<ButtonIcon as={Route} size="md" />
									<ButtonText>Testar retorno ao Dashboard</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-1">
								<Heading size="md" className={bodyText}>
									Validação automatizada
								</Heading>
								<Text selectable className={`${helperText} text-sm leading-5`}>
									Para validar regras sem alterar dados, execute `npm test -- --runInBand` no projeto. A suíte usa mocks locais e não grava no Firebase.
								</Text>
							</VStack>
						</Box>
					</VStack>
				</ScrollView>

				<View style={{ marginHorizontal: -18, paddingBottom: 0, flexShrink: 0 }}>
					<Navigator defaultValue={2} onHardwareBack={handleBackToConfigurations} />
				</View>
			</View>
		</SafeAreaView>
	);
}
