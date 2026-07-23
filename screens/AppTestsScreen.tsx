import React from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, Bot, ChartNoAxesCombined, Clock, FileCheck2, ListChecks, Mic, Route, Settings, TrendingDown, TrendingUp, Volume2 } from 'lucide-react-native';
import {
	RecordingPresets,
	requestRecordingPermissionsAsync,
	setAudioModeAsync,
	useAudioRecorder,
	useAudioRecorderState,
} from 'expo-audio';
import * as Speech from 'expo-speech';

import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { showNotifierAlert } from '@/components/uiverse/notifier-alert';
import Navigator from '@/components/uiverse/navigator';
import { useAuth } from '@/contexts/AuthContext';
import { useLumusAssistant } from '@/contexts/LumusAssistantContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { assistantAiGateway } from '@/services/lumusAssistant/assistantPlatform';
import { assistantReportService } from '@/services/lumusAssistant/assistantReportService';
import {
	getLocalNotificationDiagnostics,
	openLocalNotificationSettings,
	scheduleLocalNotificationTest,
	sendLocalNotificationTest,
} from '@/utils/localNotifications';
import { getMandatoryReminderCapacityDiagnostics } from '@/utils/mandatoryReminderNotifications';
import {
	buildAssistantDraft,
	parseSimpleExpenseExample,
} from '@/utils/lumusAssistant';
import {
	deleteAssistantTemporaryAudio,
	readAssistantAudioFile,
} from '@/utils/lumusAssistantAudio';
import {
	APP_ROUTE_PATHS,
	navigateToHomeConfigurations,
	navigateToRoute,
	redirectToHomeDashboard,
} from '@/utils/navigation';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import TestsScreenIllustration from '../assets/UnDraw/testsScreen.svg';

const APP_TESTS_ILLUSTRATION_SIZE = 86;
const TEST_TRANSACTION_VALUE_IN_CENTS = '1';
const SCHEDULED_NOTIFICATION_TEST_DELAY_SECONDS = 15;

const formatScheduledNotificationTime = (date: Date) =>
	new Intl.DateTimeFormat('pt-BR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).format(date);

export default function AppTestsScreen() {
	const {
		isDarkMode,
		surfaceBackground,
		cardBackground,
		bodyText,
		helperText,
		submitButtonTextClassName,
		notTintedCardClassName,
		accordionSectionButtonClassName,
		heroHeight,
		insets,
	} = useScreenStyles();
	const { user } = useAuth();
	const assistant = useLumusAssistant();
	const [isSendingTestNotification, setIsSendingTestNotification] = React.useState(false);
	const [isSchedulingTestNotification, setIsSchedulingTestNotification] = React.useState(false);
	const [isLoadingNotificationDiagnostics, setIsLoadingNotificationDiagnostics] = React.useState(false);
	const [isLoadingAssistantDiagnostics, setIsLoadingAssistantDiagnostics] = React.useState(false);
	const [isLoadingAssistantLocalDataTest, setIsLoadingAssistantLocalDataTest] = React.useState(false);
	const [assistantVoiceTestState, setAssistantVoiceTestState] = React.useState<'idle' | 'recording' | 'transcribing'>('idle');
	const assistantTestRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
	const assistantTestRecorderState = useAudioRecorderState(assistantTestRecorder, 200);
	const assistantVoiceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const assistantVoiceStopRef = React.useRef<(() => Promise<void>) | null>(null);

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
						: result.reason === 'channel-disabled'
							? 'Canal desativado'
						: result.reason === 'unavailable'
							? 'Ambiente sem suporte'
							: 'Falha no disparo',
				description: result.message,
				type:
					result.reason === 'permissions-denied' ||
					result.reason === 'channel-disabled' ||
					result.reason === 'unavailable'
						? 'warn'
						: 'error',
				duration: 7000,
			});
		} finally {
			setIsSendingTestNotification(false);
		}
	}, [isSendingTestNotification, showTestAlert]);

	const handleScheduleTestNotification = React.useCallback(async () => {
		if (isSchedulingTestNotification) {
			return;
		}

		setIsSchedulingTestNotification(true);

		try {
			const result = await scheduleLocalNotificationTest(SCHEDULED_NOTIFICATION_TEST_DELAY_SECONDS);

			if (result.success) {
				const scheduledFor = result.scheduledFor ?? new Date(Date.now() + SCHEDULED_NOTIFICATION_TEST_DELAY_SECONDS * 1000);
				showTestAlert({
					title: 'Notificação agendada',
					description: `Aviso programado para perto de ${formatScheduledNotificationTime(scheduledFor)}. Minimize o aplicativo agora; economia de bateria pode atrasar a entrega além dos ${SCHEDULED_NOTIFICATION_TEST_DELAY_SECONDS} segundos.`,
					type: 'success',
					duration: 9000,
				});
				return;
			}

			showTestAlert({
				title:
					result.reason === 'permissions-denied'
						? 'Permissão bloqueada'
						: result.reason === 'channel-disabled'
							? 'Canal desativado'
						: result.reason === 'unavailable'
							? 'Ambiente sem suporte'
							: 'Falha no agendamento',
				description: result.message,
				type:
					result.reason === 'permissions-denied' ||
					result.reason === 'channel-disabled' ||
					result.reason === 'unavailable'
						? 'warn'
						: 'error',
				duration: 7000,
			});
		} finally {
			setIsSchedulingTestNotification(false);
		}
	}, [isSchedulingTestNotification, showTestAlert]);

	const handleNotificationDiagnostics = React.useCallback(async () => {
		if (isLoadingNotificationDiagnostics) {
			return;
		}

		setIsLoadingNotificationDiagnostics(true);

		try {
			const [diagnostics, capacity] = await Promise.all([
				getLocalNotificationDiagnostics(),
				getMandatoryReminderCapacityDiagnostics(),
			]);
			const permissionLabel = !diagnostics.supported
				? 'Indisponível'
				: diagnostics.permissionGranted
					? 'Concedida'
					: diagnostics.canAskAgain
						? 'Não concedida; pode ser solicitada novamente'
						: 'Bloqueada nas configurações do sistema';
			const channelLabel =
				diagnostics.testChannelEnabled === null
					? 'Não se aplica neste dispositivo'
					: diagnostics.testChannelEnabled
						? 'Ativo'
						: 'Desativado';
			const expenseChannelLabel =
				diagnostics.expenseChannelEnabled === null
					? 'Não se aplica neste dispositivo'
					: diagnostics.expenseChannelEnabled
						? 'Ativo'
						: 'Desativado';
			const gainChannelLabel =
				diagnostics.gainChannelEnabled === null
					? 'Não se aplica neste dispositivo'
					: diagnostics.gainChannelEnabled
						? 'Ativo'
						: 'Desativado';
			const hasDiagnosticBlock =
				!diagnostics.supported ||
				!diagnostics.permissionGranted ||
				diagnostics.expenseChannelEnabled === false ||
				diagnostics.gainChannelEnabled === false ||
				diagnostics.testChannelEnabled === false ||
				capacity.limitedTemplateCount > 0 ||
				capacity.unplannedTemplateCount > 0;

			showTestAlert({
				title: hasDiagnosticBlock ? 'Notificações precisam de atenção' : 'Diagnóstico de notificações',
				description: [
					`Permissão: ${permissionLabel}`,
					`Canal de pagamentos: ${expenseChannelLabel}`,
					`Canal de recebimentos: ${gainChannelLabel}`,
					`Canal de testes: ${channelLabel}`,
					`Total agendado: ${diagnostics.scheduledCount}`,
					`Lembretes obrigatórios: ${diagnostics.mandatoryReminderCount}`,
					`Capacidade segura: ${capacity.plannedCount}/${capacity.scheduleBudget}`,
					`Ocorrências desejadas: ${capacity.desiredCount}`,
					`Templates com agenda reduzida: ${capacity.limitedTemplateCount}`,
					`Templates sem próxima ocorrência: ${capacity.unplannedTemplateCount}`,
				].join('\n'),
				type: hasDiagnosticBlock ? 'warn' : 'info',
				duration: 12000,
			});
		} catch (error) {
			console.error('Erro ao consultar diagnóstico de notificações:', error);
			showTestAlert({
				title: 'Diagnóstico indisponível',
				description: 'Não foi possível consultar o estado das notificações neste dispositivo.',
				type: 'error',
				duration: 7000,
			});
		} finally {
			setIsLoadingNotificationDiagnostics(false);
		}
	}, [isLoadingNotificationDiagnostics, showTestAlert]);

	const handleOpenNotificationSettings = React.useCallback(async () => {
		try {
			const didOpenNotificationSettings = await openLocalNotificationSettings();
			if (!didOpenNotificationSettings) {
				throw new Error('Ambiente sem configurações nativas de notificação.');
			}

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
	}, [showTestAlert]);

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

	const handleAssistantConfigurationDiagnostics = React.useCallback(async () => {
		if (isLoadingAssistantDiagnostics) return;
		setIsLoadingAssistantDiagnostics(true);
		try {
			const [availability, config] = await Promise.all([
				assistantAiGateway.getAvailability(),
				assistantAiGateway.getConfig(true),
			]);
			let liveMessage = assistant.consentGranted
				? 'Teste ao vivo não executado.'
				: 'Conceda o consentimento na tela Lumus IA para testar uma mensagem.';
				if (assistant.consentGranted && availability.available) {
					const response = await assistantAiGateway.converse({
						requestScope: user?.uid,
						text: 'Responda apenas com uma frase curta confirmando que o Lumus IA está conectado. Não crie ações nem relatórios.',
					turns: [],
					catalog: {},
					nowIso: new Date().toISOString(),
					timeZone: 'America/Sao_Paulo',
					config,
				});
				liveMessage = response.text.trim()
					? 'Mensagem simples validada sem dados financeiros.'
					: 'A chamada respondeu sem texto.';
			}
			showTestAlert({
				title: availability.available ? 'Lumus IA configurado' : 'Lumus IA precisa de configuração',
				description: [
					`Plataforma: ${availability.platform}`,
					`App Check: ${availability.appCheckConfigured ? 'configurado' : 'pendente'}`,
					`Remote Config: ${availability.remoteConfigLoaded ? 'atualizado' : 'usando padrões locais'}`,
					`Modelo: ${config.model}`,
					`Kill switch: ${config.enabled ? 'ativado' : 'desativado'}`,
					liveMessage,
					...(availability.reason ? [`Atenção: ${availability.reason}`] : []),
				].join('\n'),
				type: availability.available ? 'success' : 'warn',
				duration: 11000,
			});
		} catch {
			showTestAlert({
				title: 'Diagnóstico da IA indisponível',
				description: 'A configuração, o App Check ou a chamada simples não puderam ser validados. Nenhum dado foi alterado.',
				type: 'error',
				duration: 8000,
			});
		} finally {
			setIsLoadingAssistantDiagnostics(false);
		}
	}, [assistant.consentGranted, isLoadingAssistantDiagnostics, showTestAlert]);

	const handleAssistantLocalDataDiagnostics = React.useCallback(async () => {
		if (isLoadingAssistantLocalDataTest || !user?.uid) return;
		setIsLoadingAssistantLocalDataTest(true);
		try {
			const proposals = parseSimpleExpenseExample(
				'No dia 18 deste mês gastei 50 reais e no dia 19 gastei 150 reais',
				new Date(2026, 6, 20, 12),
			);
			const drafts = proposals.map(proposal => buildAssistantDraft(proposal));
			const report = await assistantReportService.createReport(
				user.uid,
				{ kind: 'monthly_overview' },
				assistant.catalog,
			);
			showTestAlert({
				title: 'Rascunho e relatório validados',
				description: [
					`Rascunhos sem commit: ${drafts.length}`,
					`Pendentes de banco/categoria: ${drafts.filter(draft => draft.status === 'needs_input').length}`,
					`Métricas locais do relatório: ${report.metrics.length}`,
					`Gráfico escolhido pelo aplicativo: ${report.chart?.kind ?? 'sem dados'}`,
					'Nenhuma operação financeira foi gravada.',
				].join('\n'),
				type: 'success',
				duration: 9000,
			});
		} catch {
			showTestAlert({
				title: 'Teste local incompleto',
				description: 'Não foi possível carregar o relatório, mas nenhuma operação financeira foi gravada.',
				type: 'warn',
				duration: 7000,
			});
		} finally {
			setIsLoadingAssistantLocalDataTest(false);
		}
	}, [assistant.catalog, isLoadingAssistantLocalDataTest, showTestAlert, user?.uid]);

	const stopAssistantVoiceTest = React.useCallback(async () => {
		if (assistantVoiceTimerRef.current) clearTimeout(assistantVoiceTimerRef.current);
		assistantVoiceTimerRef.current = null;
		if (!assistantTestRecorder.isRecording) return;
		setAssistantVoiceTestState('transcribing');
		let uri: string | null = null;
		try {
			await assistantTestRecorder.stop();
			uri = assistantTestRecorder.uri ?? assistantTestRecorderState.url;
			if (!uri) throw new Error('Arquivo de áudio indisponível.');
			const audio = await readAssistantAudioFile(uri);
			const transcript = await assistant.transcribeAudio({
				...audio,
				durationMs: Math.min(10_000, assistantTestRecorderState.durationMillis),
			});
			showTestAlert({
				title: 'Microfone e transcrição validados',
				description: `O áudio temporário foi transcrito (${transcript.length} caracteres) e apagado. O conteúdo não foi exibido nem registrado no diagnóstico.`,
				type: 'success',
				duration: 8000,
			});
		} catch {
			showTestAlert({
				title: 'Teste de voz não concluído',
				description: 'Confira o consentimento, a permissão do microfone, o App Check e a disponibilidade da cota.',
				type: 'warn',
				duration: 8000,
			});
		} finally {
			deleteAssistantTemporaryAudio(uri);
			setAssistantVoiceTestState('idle');
			await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
		}
	}, [assistant, assistantTestRecorder, assistantTestRecorderState.durationMillis, assistantTestRecorderState.url, showTestAlert]);

	React.useEffect(() => {
		assistantVoiceStopRef.current = stopAssistantVoiceTest;
	}, [stopAssistantVoiceTest]);

	const cleanupAssistantVoiceTest = React.useCallback(async () => {
		if (assistantVoiceTimerRef.current) clearTimeout(assistantVoiceTimerRef.current);
		assistantVoiceTimerRef.current = null;
		if (assistantTestRecorder.isRecording) await assistantTestRecorder.stop().catch(() => undefined);
		deleteAssistantTemporaryAudio(assistantTestRecorder.uri);
		await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
	}, [assistantTestRecorder]);

	React.useEffect(() => () => { void cleanupAssistantVoiceTest(); }, [cleanupAssistantVoiceTest]);
	React.useEffect(() => { void cleanupAssistantVoiceTest(); }, [assistant.revocationEpoch, cleanupAssistantVoiceTest]);

	const handleAssistantVoiceTest = React.useCallback(async () => {
		if (assistantVoiceTestState === 'recording') {
			await stopAssistantVoiceTest();
			return;
		}
		if (assistantVoiceTestState !== 'idle') return;
		if (!assistant.consentGranted || !assistant.availability?.available) {
			showTestAlert({
				title: 'Ative o Lumus IA primeiro',
				description: 'Abra a tela Lumus IA, leia o aviso e conceda o consentimento antes de enviar áudio ao Gemini.',
				type: 'warn',
			});
			return;
		}
		try {
			const permission = await requestRecordingPermissionsAsync();
			if (!permission.granted) throw new Error('Permissão negada.');
			await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: false });
			await assistantTestRecorder.prepareToRecordAsync();
			assistantTestRecorder.record();
			setAssistantVoiceTestState('recording');
			assistantVoiceTimerRef.current = setTimeout(() => {
				void assistantVoiceStopRef.current?.();
			}, 10_000);
		} catch {
			setAssistantVoiceTestState('idle');
			showTestAlert({
				title: 'Microfone indisponível',
				description: 'Permita o acesso ao microfone nas configurações do dispositivo ou use o teste no navegador compatível.',
				type: 'warn',
			});
		}
	}, [assistant.availability?.available, assistant.consentGranted, assistantTestRecorder, assistantVoiceTestState, showTestAlert, stopAssistantVoiceTest]);

	const handleAssistantTtsTest = React.useCallback(() => {
		void Speech.stop();
		Speech.speak('Teste de leitura do Lumus concluído.', { language: 'pt-BR', rate: 0.95 });
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
							Assistente Lumus
						</Heading>

						<Box className={`${notTintedCardClassName} px-4 py-4`}>
							<VStack className="gap-4">
								<VStack className="min-w-0 gap-1">
									<Text className={`${bodyText} text-base font-semibold`}>
										Diagnósticos seguros da IA
									</Text>
									<Text className={`${helperText} text-sm leading-5`}>
										Valida configuração, App Check, mensagem simples, rascunho sem commit, relatório, voz e leitura. Tokens e conteúdo financeiro não são exibidos.
									</Text>
								</VStack>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={() => void handleAssistantConfigurationDiagnostics()}
									isDisabled={isLoadingAssistantDiagnostics}
									accessibilityLabel="Validar configuração e mensagem simples do Lumus IA"
								>
									{isLoadingAssistantDiagnostics ? (
										<ButtonSpinner color={isDarkMode ? '#111827' : '#0F172A'} />
									) : (
										<><ButtonIcon as={Bot} size="md" /><ButtonText>Configuração e mensagem</ButtonText></>
									)}
								</Button>

								<Button
									size="md"
									variant="outline"
									action="secondary"
									className={accordionSectionButtonClassName}
									onPress={() => void handleAssistantLocalDataDiagnostics()}
									isDisabled={isLoadingAssistantLocalDataTest}
									accessibilityLabel="Validar rascunho e relatório sem gravar"
								>
									{isLoadingAssistantLocalDataTest ? (
										<ButtonSpinner color={isDarkMode ? '#E2E8F0' : '#334155'} />
									) : (
										<><ButtonIcon as={ChartNoAxesCombined} size="md" className={submitButtonTextClassName} /><ButtonText className={submitButtonTextClassName}>Rascunho e relatório sem gravar</ButtonText></>
									)}
								</Button>

								<Button
									size="md"
									variant={assistantVoiceTestState === 'recording' ? 'solid' : 'outline'}
									action={assistantVoiceTestState === 'recording' ? 'negative' : 'secondary'}
									className={accordionSectionButtonClassName}
									onPress={() => void handleAssistantVoiceTest()}
									isDisabled={assistantVoiceTestState === 'transcribing'}
									accessibilityLabel={assistantVoiceTestState === 'recording' ? 'Parar e transcrever teste de voz' : 'Iniciar teste de microfone e transcrição'}
								>
									{assistantVoiceTestState === 'transcribing' ? (
										<ButtonSpinner color={isDarkMode ? '#E2E8F0' : '#334155'} />
									) : (
										<><ButtonIcon as={Mic} size="md" className={assistantVoiceTestState === 'recording' ? undefined : submitButtonTextClassName} /><ButtonText className={assistantVoiceTestState === 'recording' ? undefined : submitButtonTextClassName}>{assistantVoiceTestState === 'recording' ? `Parar gravação (${Math.min(10, Math.round(assistantTestRecorderState.durationMillis / 1000))}s)` : 'Testar microfone e transcrição'}</ButtonText></>
									)}
								</Button>

								<Button
									size="md"
									variant="outline"
									action="secondary"
									className={accordionSectionButtonClassName}
									onPress={handleAssistantTtsTest}
									accessibilityLabel="Ouvir teste de leitura em português"
								>
									<ButtonIcon as={Volume2} size="md" className={submitButtonTextClassName} />
									<ButtonText className={submitButtonTextClassName}>Ouvir teste de leitura</ButtonText>
								</Button>

								<HStack className="items-center gap-2">
									<FileCheck2 size={16} color={isDarkMode ? '#94A3B8' : '#64748B'} />
									<Text className={`${helperText} flex-1 text-xs leading-4`}>
										O teste de voz grava por no máximo 10 segundos e apaga o arquivo após a transcrição.
									</Text>
								</HStack>
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
											Valide o disparo imediato, o agendamento em segundo plano e o estado atual das notificações locais.
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
											<ButtonText>Disparar agora</ButtonText>
										</>
									)}
								</Button>

								<Button
									size="md"
									variant="solid"
									action="primary"
									className={accordionSectionButtonClassName}
									onPress={() => {
										void handleScheduleTestNotification();
									}}
									isDisabled={isSchedulingTestNotification}
									accessibilityLabel="Agendar notificação local para quinze segundos"
									accessibilityHint="Agenda um aviso e permite validar o recebimento com o aplicativo minimizado"
								>
									{isSchedulingTestNotification ? (
										<ButtonSpinner color={isDarkMode ? '#111827' : '#0F172A'} />
									) : (
										<>
											<ButtonIcon as={Clock} size="md" />
											<ButtonText>Agendar para 15 segundos</ButtonText>
										</>
									)}
								</Button>

								<Text className={`${helperText} text-sm leading-5`}>
									Depois de agendar, minimize o aplicativo. O horário é preferido e pode sofrer atraso pelo Android.
								</Text>

								<Button
									size="md"
									variant="outline"
									action="secondary"
									className={accordionSectionButtonClassName}
									onPress={() => {
										void handleNotificationDiagnostics();
									}}
									isDisabled={isLoadingNotificationDiagnostics}
									accessibilityLabel="Consultar diagnóstico de notificações"
									accessibilityHint="Mostra permissão, canal e quantidade de notificações agendadas"
								>
									{isLoadingNotificationDiagnostics ? (
										<ButtonSpinner color={isDarkMode ? '#E2E8F0' : '#334155'} />
									) : (
										<>
											<ButtonIcon as={ListChecks} size="md" className={submitButtonTextClassName} />
											<ButtonText className={submitButtonTextClassName}>Ver diagnóstico</ButtonText>
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
									<ButtonIcon as={Settings} size="md" className={submitButtonTextClassName} />
									<ButtonText className={submitButtonTextClassName}>Abrir configurações de notificação</ButtonText>
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
