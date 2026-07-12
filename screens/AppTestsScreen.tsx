import React from 'react';
import Constants from 'expo-constants';
import { Linking, Platform, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Route, Settings, TrendingDown, TrendingUp } from 'lucide-react-native';

import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { sendLocalNotificationTest } from '@/utils/localNotifications';
import {
	APP_ROUTE_PATHS,
	navigateToHomeConfigurations,
	navigateToRoute,
	redirectToHomeDashboard,
} from '@/utils/navigation';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import TestsScreenIllustration from '../assets/UnDraw/testsScreen.svg';

const APP_TESTS_ILLUSTRATION_SIZE = 86;
const ANDROID_APP_NOTIFICATION_SETTINGS_ACTION = 'android.settings.APP_NOTIFICATION_SETTINGS';
const ANDROID_APP_PACKAGE_EXTRA = 'android.provider.extra.APP_PACKAGE';
const TEST_TRANSACTION_VALUE_IN_CENTS = '1';

export default function AppTestsScreen() {
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
	const [isSendingTestNotification, setIsSendingTestNotification] = React.useState(false);

	const androidPackageName = React.useMemo(() => {
		const expoAndroidConfig = Constants.expoConfig?.android;
		return expoAndroidConfig?.package ?? 'com.gabrielmazz.lumusfinances';
	}, []);

	const showTestAlert = React.useCallback(
		({
			title,
			description,
			type,
			duration = 5000,
		}: {
			title: string;
			description: string;
			type: 'error' | 'warn' | 'info' | 'success';
			duration?: number;
		}) => {
			showNotifierAlert({
				title,
				description,
				type,
				isDarkMode,
				duration,
			});
		},
		[isDarkMode],
	);

	const handleSendTestNotification = React.useCallback(async () => {
		if (isSendingTestNotification) {
			return;
		}

		setIsSendingTestNotification(true);

		try {
			const result = await sendLocalNotificationTest();

			if (result.success) {
				showTestAlert({
					title: 'Notificação enviada',
					description: 'Verifique a bandeja de notificações do Android ou o banner do sistema.',
					type: 'success',
					duration: 6000,
				});
				return;
			}

			showTestAlert({
				title:
					result.reason === 'permissions-denied'
						? 'Permissão bloqueada'
						: result.reason === 'unavailable'
							? 'Ambiente sem suporte'
							: 'Falha no disparo',
				description: result.message,
				type: result.reason === 'permissions-denied' || result.reason === 'unavailable' ? 'warn' : 'error',
				duration: 7000,
			});
		} finally {
			setIsSendingTestNotification(false);
		}
	}, [isSendingTestNotification, showTestAlert]);

	const handleOpenNotificationSettings = React.useCallback(async () => {
		try {
			if (Platform.OS === 'android') {
				try {
					await Linking.sendIntent(ANDROID_APP_NOTIFICATION_SETTINGS_ACTION, [
						{ key: ANDROID_APP_PACKAGE_EXTRA, value: androidPackageName },
					]);
				} catch {
					await Linking.openSettings();
				}

				showTestAlert({
					title: 'Configurações abertas',
					description: 'Ative as notificações do Lumus Finanças e volte para disparar o teste novamente.',
					type: 'info',
					duration: 7000,
				});
				return;
			}

			await Linking.openSettings();
			showTestAlert({
				title: 'Configurações abertas',
				description: 'Ative as notificações do Lumus Finanças e volte para disparar o teste novamente.',
				type: 'info',
				duration: 7000,
			});
		} catch (error) {
			console.error('Erro ao abrir configurações de notificação:', error);
			showTestAlert({
				title: 'Não foi possível abrir',
				description: 'Abra as configurações do Android manualmente e habilite as notificações do Lumus Finanças.',
				type: 'error',
				duration: 7000,
			});
		}
	}, [androidPackageName, showTestAlert]);

	const handleOpenTestTransaction = React.useCallback((kind: 'expense' | 'gain') => {
		const isExpense = kind === 'expense';
		navigateToRoute(isExpense ? APP_ROUTE_PATHS.addRegisterExpenses : APP_ROUTE_PATHS.addRegisterGain, {
			templateName: isExpense ? 'Teste de despesa' : 'Teste de ganho',
			templateDescription: 'Lancamento de teste criado pela tela Testes do aplicativo.',
			templateValueInCents: TEST_TRANSACTION_VALUE_IN_CENTS,
		});
	}, []);

	const handleAutomaticNavigationTest = React.useCallback(() => {
		redirectToHomeDashboard();
	}, []);

	const handleBackToConfigurations = React.useCallback(() => {
		navigateToHomeConfigurations();
		return true;
	}, []);

	return (
		<SafeAreaView className="flex-1" edges={['left', 'right', 'bottom']} style={{ backgroundColor: surfaceBackground }}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View className="flex-1" style={{ backgroundColor: surfaceBackground }}>
				<View className={`absolute top-0 left-0 right-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background da tela de testes do aplicativo"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>

					<VStack
						className="h-full w-full items-center justify-start gap-4 px-6"
						style={{ paddingTop: insets.top + 24 }}
					>
						<Heading size="xl" className="text-center text-white">
							Testes do aplicativo
						</Heading>
						<TestsScreenIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</View>

				<ScrollView
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="on-drag"
					nestedScrollEnabled
					showsVerticalScrollIndicator={false}
					className={`flex-1 rounded-t-3xl ${cardBackground} px-6 pb-1`}
					style={{ marginTop: heroHeight - 64 }}
					contentContainerStyle={{ paddingBottom: 48 }}
				>
					<VStack className="mt-4 gap-4">
						<Heading className="text-lg uppercase tracking-widest" size="lg">
							Fluxos de produção
						</Heading>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="min-w-0 gap-1">
									<Text className={`${bodyText} text-base font-semibold`}>
										Navegação automática
									</Text>
									<Text className={`${helperText} text-sm leading-5`}>
										Executa o mesmo redirect seguro usado após salvar formulários. A Home deve abrir sem tela cinza.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={handleAutomaticNavigationTest}
									accessibilityLabel="Testar navegação automática para a Home"
									accessibilityHint="Executa o redirect de produção e deve abrir a Home sem tela cinza"
								>
									<ButtonIcon as={Route} size="md" />
									<ButtonText>Testar redirect para Home</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Heading className="text-lg uppercase tracking-widest" size="lg">
							Recursos nativos
						</Heading>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<HStack className="items-center gap-4">
									<VStack className="min-w-0 flex-1 gap-1">
										<Text className={`${bodyText} text-base font-semibold`}>
											Notificação local
										</Text>
										<Text className={`${helperText} text-sm leading-5`}>
											Valida permissão, canal Android e handler global de notificações locais.
										</Text>
									</VStack>
								</HStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={() => {
										void handleSendTestNotification();
									}}
									isDisabled={isSendingTestNotification}
									accessibilityLabel="Disparar notificação local de teste"
									accessibilityHint="Solicita permissão quando necessário e envia uma notificação local imediata"
								>
									{isSendingTestNotification ? (
										<ButtonSpinner color={isDarkMode ? '#111827' : '#0F172A'} />
									) : (
										<>
											<ButtonIcon as={BellRing} size="md" />
											<ButtonText>Disparar notificação</ButtonText>
										</>
									)}
								</Button>

								<Button
									size="md"
									variant="outline"
									action="secondary"
									className={accordionSectionButtonClassName}
									onPress={() => {
										void handleOpenNotificationSettings();
									}}
									accessibilityLabel="Abrir configurações de notificação do Android"
									accessibilityHint="Abre as configurações do aplicativo para ativar as permissões de notificação"
								>
									<ButtonIcon as={Settings} size="md" className="text-black" />
									<ButtonText className="text-black">Abrir configurações de notificação</ButtonText>
								</Button>
							</VStack>
						</Box>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<HStack className="items-center gap-4">
									<VStack className="min-w-0 flex-1 gap-1">
										<Text className={`${bodyText} text-base font-semibold`}>
											Lançamento financeiro
										</Text>
										<Text className={`${helperText} text-sm leading-5`}>
											Abre um cadastro de despesa ou ganho de teste com valor inicial de R$ 0,01.
										</Text>
									</VStack>
								</HStack>

								<Button
									size="md"
									variant="solid"
									action="negative"
									className={accordionSectionButtonClassName}
									onPress={() => handleOpenTestTransaction('expense')}
									accessibilityLabel="Criar despesa de teste"
									accessibilityHint="Abre a tela de despesa com valor inicial de um centavo"
								>
									<ButtonIcon as={TrendingDown} size="md" />
									<ButtonText>Criar despesa de teste</ButtonText>
								</Button>

								<Button
									size="md"
									variant="solid"
									action="positive"
									className={accordionSectionButtonClassName}
									onPress={() => handleOpenTestTransaction('gain')}
									accessibilityLabel="Criar ganho de teste"
									accessibilityHint="Abre a tela de ganho com valor inicial de um centavo"
								>
									<ButtonIcon as={TrendingUp} size="md" />
									<ButtonText>Criar ganho de teste</ButtonText>
								</Button>
							</VStack>
						</Box>
					</VStack>
				</ScrollView>

				<View
					style={{
						marginHorizontal: -18,
						paddingBottom: 0,
						flexShrink: 0,
					}}
				>
					<Navigator defaultValue={2} onHardwareBack={handleBackToConfigurations} />
				</View>
			</View>
		</SafeAreaView>
	);
}
