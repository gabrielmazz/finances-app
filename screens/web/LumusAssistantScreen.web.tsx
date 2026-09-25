import React from 'react';
import {
	ActivityIndicator,
	Image as RNImage,
	Pressable,
	ScrollView,
	StatusBar,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
	CircleArrowRight,
	CircleStop,
	Info,
	Lightbulb,
	Mic,
	Send,
	Settings2,
	ShieldCheck,
	ShieldOff,
	Sparkles,
	Trash2,
	TriangleAlert,
	X,
} from 'lucide-react-native';
import {
	RecordingPresets,
	requestRecordingPermissionsAsync,
	setAudioModeAsync,
	useAudioRecorder,
	useAudioRecorderState,
} from 'expo-audio';
import '@mantine/core/styles.css';
import { MantineProvider, Textarea as MantineTextarea } from '@mantine/core';

import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import {
	Drawer,
	DrawerBackdrop,
	DrawerBody,
	DrawerCloseButton,
	DrawerContent,
	DrawerHeader,
} from '@/components/ui/drawer';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Icon } from '@/components/ui/icon';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import {
	Conversation,
	ConversationContent,
	Message,
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTools,
} from '@/components/ui/chatAi';
import {
	AssistantQuestionCard,
	AssistantReportCard,
	AssistantTextBubble,
} from '@/components/uiverse/assistant/assistant-cards';
import { AssistantActivityTrace } from '@/components/uiverse/assistant/assistant-activity-trace';
import { AssistantComposerFrame } from '@/components/uiverse/assistant/assistant-composer-frame';
import { AssistantDraftPages, AssistantPaginationDock } from '@/components/uiverse/assistant/assistant-draft-pages';
import Navigator from '@/components/uiverse/navigation/navigator';
import AnimatedContent from '@/components/web/motion/AnimatedContent';
import Grainient from '@/components/web/visuals/Grainient';
import StrokeText from '@/components/web/visuals/StrokeText';
import { useAppTheme } from '@/contexts/ThemeContext';
import { useLumusAssistant } from '@/contexts/LumusAssistantContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import { orderAssistantMessagesForDisplay } from '@/utils/lumusAssistant';
import { MANTINE_ASSISTANT_TEXTAREA_CLASS_NAMES } from '@/design-system/mantine';
import {
	LUMUS_CLASS_NAMES,
	LUMUS_FONT_STACKS,
	LUMUS_HERO_COLORS,
	LUMUS_LAYOUT_TOKENS,
	LUMUS_RUNTIME_COLORS,
} from '@/design-system/tokens';
import { WEB_DASHBOARD_CLASS_NAMES } from '@/design-system/web-dashboard';
import { isFirebaseEmulatorRuntime } from '@/utils/firebaseRuntime';
import { ASSISTANT_MAX_INPUT_CHARACTERS } from '@/utils/lumusAssistant';
import {
	deleteAssistantTemporaryAudio,
	readAssistantAudioFile,
} from '@/utils/lumusAssistantAudio';
import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import LumusAssistantIllustration from '@/assets/UnDraw/lumusAssistantScreen.svg';

const QUICK_PROMPTS = [
	'Como foi o meu mês até agora?',
	'Quais gastos obrigatórios ainda estão pendentes?',
	'Quero registrar uma transferência entre bancos.',
	'Gastei R$ 50 no mercado ontem.',
] as const;

const CONSENT_ITEMS = [
	{
		icon: Mic,
		title: 'Microfone sob seu controle',
		description: 'A gravação começa somente com seu clique e termina em até 60 segundos.',
	},
	{
		icon: Trash2,
		title: 'Conversa temporária',
		description: 'Áudio e conversa não são salvos no Firestore e são limpos ao sair da conta.',
	},
	{
		icon: ShieldCheck,
		title: 'Confirmação antes de salvar',
		description: 'O Lumus prepara cartões. Cada alteração financeira exige sua confirmação individual.',
	},
	{
		icon: Info,
		title: 'Uso de dados no nível gratuito',
		description: 'O Google pode usar o conteúdo enviado para melhorar produtos no nível gratuito da Gemini Developer API.',
	},
] as const;

const AssistantBootstrappingView = () => (
	<Box className="flex-1 items-center justify-center px-6 py-10">
		<VStack className={`${ASSISTANT_CLASS_NAMES.consentCard} items-center`} space="md">
			<Box className={ASSISTANT_CLASS_NAMES.emptyMark}>
				<ActivityIndicator size="large" color={LUMUS_RUNTIME_COLORS.light.accentStrong} />
			</Box>
			<Heading size="lg" className={`text-center ${LUMUS_CLASS_NAMES.heading}`}>
				Preparando o Lumus IA
			</Heading>
			<Text className={`max-w-xl text-center leading-6 ${LUMUS_CLASS_NAMES.helper}`}>
				Verificando privacidade, configuração e disponibilidade. A conversa ficará pronta em instantes.
			</Text>
		</VStack>
	</Box>
);

const ConsentView = ({
	onAccept,
	isLoading,
}: {
	onAccept(): Promise<void>;
	isLoading: boolean;
}) => (
	<ScrollView className="flex-1" contentContainerClassName="min-h-full items-center justify-center px-5 py-8">
		<VStack className={ASSISTANT_CLASS_NAMES.consentCard} space="lg">
			<VStack space="xs">
				<Text className="text-xs font-bold uppercase tracking-widest text-yellow-700 dark:text-yellow-300">
					Privacidade primeiro
				</Text>
				<Heading size="xl" className={LUMUS_CLASS_NAMES.heading}>
					Antes da primeira conversa
				</Heading>
				<Text className={`leading-6 ${LUMUS_CLASS_NAMES.helper}`}>
					O Lumus envia ao Gemini somente o texto, áudio e contexto financeiro necessários para interpretar seu pedido.
				</Text>
			</VStack>
			<VStack space="sm">
				{CONSENT_ITEMS.map(({ icon, title, description }) => (
					<HStack key={title} className={ASSISTANT_CLASS_NAMES.consentItem}>
						<Box className="h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-yellow-100 dark:bg-yellow-950">
							<Icon as={icon} size="md" className="text-yellow-700 dark:text-yellow-300" />
						</Box>
						<VStack className="min-w-0 flex-1" space="xs">
							<Text bold className={LUMUS_CLASS_NAMES.heading}>{title}</Text>
							<Text size="sm" className={`leading-5 ${LUMUS_CLASS_NAMES.helper}`}>{description}</Text>
						</VStack>
					</HStack>
				))}
			</VStack>
			<a
				href="https://ai.google.dev/gemini-api/docs/pricing"
				target="_blank"
				rel="noreferrer"
				className="self-start rounded-lg text-sm font-bold text-yellow-700 underline decoration-yellow-400 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumus-focus dark:text-yellow-300"
			>
				Ver preços e política de uso de dados
			</a>
			<Button
				size="md"
				className={`${LUMUS_CLASS_NAMES.primaryButton} w-full`}
				isDisabled={isLoading}
				onPress={() => void onAccept()}
			>
				{isLoading ? <ButtonSpinner /> : <ButtonText className={LUMUS_CLASS_NAMES.primaryButtonText}>Aceitar e começar</ButtonText>}
			</Button>
		</VStack>
	</ScrollView>
);

export default function LumusAssistantScreenWeb() {
	const { isDarkMode } = useAppTheme();
	const insets = useSafeAreaInsets();
	const { height: windowHeight } = useWindowDimensions();
	const { shouldHideValues } = useValueVisibility();
	const assistant = useLumusAssistant();
	const [composerText, setComposerText] = React.useState('');
	const [isComposerFocused, setIsComposerFocused] = React.useState(false);
	const [selectedDraftActionByGroup, setSelectedDraftActionByGroup] = React.useState<Record<string, string>>({});
	const [isQuickPromptsModalOpen, setIsQuickPromptsModalOpen] = React.useState(false);
	const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = React.useState(false);
	const [isRevokeModalOpen, setIsRevokeModalOpen] = React.useState(false);
	const [voiceError, setVoiceError] = React.useState<string | null>(null);
	const [isTranscribing, setIsTranscribing] = React.useState(false);
	const [isAcceptingConsent, setIsAcceptingConsent] = React.useState(false);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const shouldAutoScrollRef = React.useRef(true);
	const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
	const recorderState = useAudioRecorderState(recorder, 200);
	const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const stopInFlightRef = React.useRef(false);
	const temporaryUriRef = React.useRef<string | null>(null);
	const wasRecordingRef = React.useRef(false);
	const isMountedRef = React.useRef(true);

	const scrollConversationToEnd = React.useCallback((animated = true) => {
		scrollViewRef.current?.scrollToEnd({ animated });
	}, []);

	const focusComposer = React.useCallback(() => {
		shouldAutoScrollRef.current = true;
		requestAnimationFrame(() => scrollConversationToEnd());
	}, [scrollConversationToEnd]);

	const cleanupRecording = React.useCallback(async () => {
		if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
		stopTimerRef.current = null;
		let uri = temporaryUriRef.current;
		if (isMountedRef.current && recorder.isRecording) {
			await recorder.stop().catch(() => undefined);
			if (isMountedRef.current) uri ??= recorder.uri;
		}
		deleteAssistantTemporaryAudio(uri);
		temporaryUriRef.current = null;
		await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
	}, [recorder]);

	React.useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
			stopTimerRef.current = null;
			deleteAssistantTemporaryAudio(temporaryUriRef.current);
			temporaryUriRef.current = null;
			void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
		};
	}, []);

	React.useEffect(() => { void cleanupRecording(); }, [assistant.revocationEpoch, cleanupRecording]);

	React.useEffect(() => {
		const wasRecording = wasRecordingRef.current;
		wasRecordingRef.current = recorderState.isRecording;
		if (!recorderState.mediaServicesDidReset || (!recorderState.isRecording && !wasRecording)) return;
		setVoiceError('A gravação foi interrompida pelo navegador. Tente novamente ou digite a mensagem.');
		void cleanupRecording();
	}, [cleanupRecording, recorderState.isRecording, recorderState.mediaServicesDidReset]);

	const stopRecording = React.useCallback(async () => {
		if (!isMountedRef.current || stopInFlightRef.current || !recorderState.isRecording) return;
		stopInFlightRef.current = true;
		if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
		stopTimerRef.current = null;
		setVoiceError(null);
		setIsTranscribing(true);
		let uri: string | null = null;
		try {
			await recorder.stop();
			if (!isMountedRef.current) return;
			uri = recorder.uri ?? recorderState.url;
			temporaryUriRef.current = uri;
			if (!uri) throw new Error('O navegador não disponibilizou o arquivo gravado.');
			const audio = await readAssistantAudioFile(uri);
			const transcript = await assistant.transcribeAudio({
				...audio,
				durationMs: Math.min(60_000, recorderState.durationMillis),
			});
			if (isMountedRef.current) setComposerText(transcript);
		} catch (error) {
			if (isMountedRef.current) {
				setVoiceError(error instanceof Error ? error.message : 'Não foi possível transcrever o áudio. Você ainda pode digitar.');
			}
		} finally {
			deleteAssistantTemporaryAudio(uri);
			temporaryUriRef.current = null;
			if (isMountedRef.current) setIsTranscribing(false);
			stopInFlightRef.current = false;
			await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
		}
	}, [assistant, recorder, recorderState.durationMillis, recorderState.isRecording, recorderState.url]);

	const startRecording = React.useCallback(async () => {
		if (!isMountedRef.current || assistant.isSending || isTranscribing || recorderState.isRecording) return;
		setVoiceError(null);
		try {
			const permission = await requestRecordingPermissionsAsync();
			if (!isMountedRef.current) return;
			if (!permission.granted) {
				setVoiceError('Permita o microfone no navegador. Você ainda pode digitar.');
				return;
			}
			await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: false });
			if (!isMountedRef.current) return;
			await recorder.prepareToRecordAsync();
			if (!isMountedRef.current) return;
			recorder.record();
			stopTimerRef.current = setTimeout(() => { void stopRecording(); }, 60_000);
		} catch (error) {
			setVoiceError(error instanceof Error ? error.message : 'O navegador não conseguiu iniciar o microfone.');
			await cleanupRecording();
		}
	}, [assistant.isSending, cleanupRecording, isTranscribing, recorder, recorderState.isRecording, stopRecording]);

	const send = React.useCallback(async (text = composerText) => {
		const trimmed = text.trim();
		if (!trimmed || assistant.isSending || !assistant.availability?.available) return;
		setComposerText('');
		await assistant.sendMessage(trimmed);
	}, [assistant, composerText]);

	const selectQuickPrompt = React.useCallback((prompt: string) => {
		setIsQuickPromptsModalOpen(false);
		void send(prompt);
	}, [send]);

	const acceptConsent = React.useCallback(async () => {
		setIsAcceptingConsent(true);
		try {
			await assistant.grantConsent();
		} finally {
			setIsAcceptingConsent(false);
		}
	}, [assistant]);

	const revokeConsent = React.useCallback(async () => {
		setIsRevokeModalOpen(false);
		setIsSettingsDrawerOpen(false);
		await assistant.revokeConsent();
	}, [assistant]);

	const isVoiceControlDisabled = !assistant.availability?.available || isTranscribing || assistant.isSending;
	const isSubmitDisabled = !composerText.trim() || assistant.isSending || !assistant.availability?.available;
	const isHybridDevelopment = isFirebaseEmulatorRuntime();
	const displayMessages = React.useMemo(
		() => orderAssistantMessagesForDisplay(assistant.messages),
		[assistant.messages],
	);
	const activeQuestion = displayMessages.find(
		message => message.type === 'question' && !message.answeredAt,
	);
	const activeQuestionActionId = activeQuestion?.type === 'question' ? activeQuestion.targetActionIds[0] : undefined;
	const draftGroups = React.useMemo(
		() => displayMessages
			.filter((message): message is Extract<typeof message, { type: 'drafts' }> => message.type === 'drafts')
			.map(message => ({ id: message.id, actionIds: message.actionIds })),
		[displayMessages],
	);
	const selectDraftAction = React.useCallback((groupId: string, actionId: string) => {
		setSelectedDraftActionByGroup(current => ({ ...current, [groupId]: actionId }));
	}, []);
	React.useEffect(() => {
		setSelectedDraftActionByGroup(current => {
			const validGroupIds = new Set(draftGroups.map(group => group.id));
			let next = current;
			for (const groupId of Object.keys(current)) {
				if (!validGroupIds.has(groupId)) {
					if (next === current) next = { ...current };
					delete next[groupId];
				}
			}
			const questionGroup = draftGroups.find(group => group.actionIds.includes(activeQuestionActionId ?? ''));
			if (questionGroup && current[questionGroup.id] !== activeQuestionActionId) {
				if (next === current) next = { ...current };
				next[questionGroup.id] = activeQuestionActionId!;
			}
			return next;
		});
	}, [activeQuestionActionId, draftGroups]);
	const runtimeColors = isDarkMode ? LUMUS_RUNTIME_COLORS.dark : LUMUS_RUNTIME_COLORS.light;
	const heroColors = isDarkMode ? LUMUS_HERO_COLORS.dark : LUMUS_HERO_COLORS.light;
	const heroHeight = Math.max(
		windowHeight * LUMUS_LAYOUT_TOKENS.heroViewportRatio,
		LUMUS_LAYOUT_TOKENS.heroMinimumHeight,
	) + insets.top;

	return (
		<SafeAreaView className={`${ASSISTANT_CLASS_NAMES.screen} w-screen`} edges={['left', 'right', 'bottom']}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<View
				className={`${ASSISTANT_CLASS_NAMES.webLayout} min-w-0 min-h-0 z-0`}
			>
				<View
					className={`${WEB_DASHBOARD_CLASS_NAMES.hero} z-0`}
					style={{ height: heroHeight, paddingTop: insets.top + 24 }}
				>
					<RNImage
						source={LoginWallpaper}
						accessible={false}
						className={`${WEB_DASHBOARD_CLASS_NAMES.heroImage} z-0`}
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							width: '100%',
							height: '100%',
							zIndex: 0,
						}}
						resizeMode="cover"
					/>
					<View
						pointerEvents="none"
						className="absolute inset-0 z-content h-full w-full opacity-hero"
					>
						<Grainient
							className="lumus-assistant-hero-grainient"
							timeSpeed={0.12}
							colorBalance={isDarkMode ? 0.08 : -0.12}
							warpStrength={0.8}
							warpFrequency={3.5}
							warpSpeed={1.8}
							warpAmplitude={100}
							blendSoftness={0.18}
							grainAmount={0.08}
							grainScale={3}
							grainAnimated
							contrast={1.08}
							zoom={0.9}
							color1={heroColors[0]}
							color2={heroColors[1]}
							color3={heroColors[2]}
						/>
					</View>
					<View
						className={`${WEB_DASHBOARD_CLASS_NAMES.heroContent} pointer-events-none z-10`}
					>
						<StrokeText
							text="Lumus IA"
							strokeColor={LUMUS_HERO_COLORS.text}
							fillColor={LUMUS_HERO_COLORS.text}
							strokeWidth={1.5}
							drawDuration={2}
							fillDelay={1}
							fontSize={40}
							fontWeight={600}
							letterSpacing={-0.5}
							fontFamily={LUMUS_FONT_STACKS.sans}
							ease="power3.out"
							trigger="mount"
							className={WEB_DASHBOARD_CLASS_NAMES.heroTitle}
						/>
						<AnimatedContent
							distance={100}
							direction="vertical"
							reverse={false}
							duration={2}
							ease="power3.out"
							initialOpacity={0}
							animateOpacity
							scale={1}
							threshold={0.1}
							delay={0}
							trigger="mount"
							className={WEB_DASHBOARD_CLASS_NAMES.heroIllustrationAnimation}
						>
							<LumusAssistantIllustration width="40%" height="100%" className="opacity-90" aria-hidden />
						</AnimatedContent>
					</View>
				</View>

				<Box
					className={ASSISTANT_CLASS_NAMES.webSheet}
					style={{ marginTop: heroHeight - 64 }}
				>
					<Box className={ASSISTANT_CLASS_NAMES.webWorkspace}>
						{assistant.isBootstrapping ? (
							<AssistantBootstrappingView />
						) : !assistant.consentGranted ? (
							<ConsentView onAccept={acceptConsent} isLoading={isAcceptingConsent} />
						) : (
							<Conversation className="flex-1">
								<Box className={ASSISTANT_CLASS_NAMES.webHeader}>
									<HStack className={`${ASSISTANT_CLASS_NAMES.webHeaderInner} ${ASSISTANT_CLASS_NAMES.toolbar}`}>
										<VStack className="min-w-0 flex-1" space="xs">
											<Heading size="md" className={LUMUS_CLASS_NAMES.heading}>
												Conversa financeira
											</Heading>
											<HStack className="items-center gap-2">
												<Box
													className={assistant.availability?.available
														? ASSISTANT_CLASS_NAMES.statusDotAvailable
														: ASSISTANT_CLASS_NAMES.statusDotUnavailable}
												/>
												<Text
													size="xs"
													className={assistant.availability?.available
														? LUMUS_CLASS_NAMES.successText
														: LUMUS_CLASS_NAMES.warningText}
												>
													{assistant.availability?.available ? 'Pronto para ajudar' : 'Configuração pendente'}
												</Text>
											</HStack>
										</VStack>
										<HStack className={ASSISTANT_CLASS_NAMES.toolbarActions}>
											<Pressable
												accessibilityLabel="Limpar conversa"
												accessibilityRole="button"
												onPress={assistant.clearConversation}
												className={ASSISTANT_CLASS_NAMES.iconButton}
											>
												<Icon as={Trash2} size="md" className={LUMUS_CLASS_NAMES.helper} />
											</Pressable>
											<Pressable
												accessibilityLabel="Abrir sugestões de perguntas"
												accessibilityRole="button"
												disabled={!assistant.availability?.available || assistant.isSending}
												onPress={() => setIsQuickPromptsModalOpen(true)}
												className={ASSISTANT_CLASS_NAMES.accentIconButton}
											>
												<Icon as={Lightbulb} size="md" className="text-yellow-700 dark:text-yellow-300" />
											</Pressable>
											<Pressable
												accessibilityLabel="Abrir configurações do assistente"
												accessibilityRole="button"
												onPress={() => setIsSettingsDrawerOpen(true)}
												className={ASSISTANT_CLASS_NAMES.iconButton}
											>
												<Icon as={Settings2} size="md" className={LUMUS_CLASS_NAMES.helper} />
											</Pressable>
										</HStack>
									</HStack>
								</Box>

							<ConversationContent
								ref={scrollViewRef}
								className="flex-1"
								contentContainerClassName={ASSISTANT_CLASS_NAMES.webConversationContent}
								keyboardShouldPersistTaps="handled"
								onContentSizeChange={() => {
									if (shouldAutoScrollRef.current) scrollConversationToEnd();
								}}
								onScroll={event => {
									const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
									shouldAutoScrollRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 64;
								}}
								scrollEventThrottle={16}
							>
								<VStack className={ASSISTANT_CLASS_NAMES.webConversationFrame} space="lg">
									{isHybridDevelopment ? (
										<HStack className={ASSISTANT_CLASS_NAMES.infoBanner}>
											<Icon as={Info} size="md" className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-300" />
											<Text size="sm" className="min-w-0 flex-1 leading-5 text-blue-900 dark:text-blue-100">
												Modo híbrido: dados financeiros usam o Emulator Suite; AI Logic, App Check e Remote Config usam o projeto remoto.
											</Text>
										</HStack>
									) : null}
									{!assistant.availability?.available ? (
										<HStack className={ASSISTANT_CLASS_NAMES.warningBanner}>
											<Icon as={TriangleAlert} size="md" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
											<VStack className="min-w-0 flex-1" space="xs">
												<Text size="sm" className="leading-5 text-amber-900 dark:text-amber-100">
													{assistant.availability?.reason ?? 'O assistente ainda não está configurado. O restante do Lumus continua funcionando.'}
												</Text>
												<Pressable
													accessibilityRole="button"
													disabled={assistant.isRefreshingAvailability}
													onPress={() => void assistant.refreshAvailability()}
													className="min-h-touch self-start justify-center rounded-xl disabled:opacity-40"
												>
													<Text bold size="sm" className="text-amber-900 dark:text-amber-100">
														{assistant.isRefreshingAvailability ? 'Verificando…' : 'Tentar novamente'}
													</Text>
												</Pressable>
											</VStack>
										</HStack>
									) : null}

									{assistant.messages.length === 0 ? (
										<VStack className={ASSISTANT_CLASS_NAMES.emptyState} space="sm">
											<Box className={ASSISTANT_CLASS_NAMES.emptyMark}>
												<Icon as={Sparkles} size="xl" className="text-yellow-700 dark:text-yellow-300" />
											</Box>
											<Heading size="xl" className={`text-center ${LUMUS_CLASS_NAMES.heading}`}>O que você quer organizar?</Heading>
											<Text className={`max-w-xl text-center leading-6 ${LUMUS_CLASS_NAMES.helper}`}>
												Descreva uma movimentação, peça uma análise ou tire uma dúvida sobre seus dados. O Lumus prepara tudo para sua revisão.
											</Text>
										</VStack>
									) : null}

									{displayMessages.map((message, index) => {
										let content: React.ReactNode = null;
										if (message.type === 'text' || message.type === 'success' || message.type === 'warning' || message.type === 'error') {
											const notificationDraft = 'actionId' in message && message.actionId
												? assistant.drafts.find(item => item.clientActionId === message.actionId && item.result?.notificationWarning)
												: undefined;
											content = <AssistantTextBubble message={message} isDarkMode={isDarkMode} hideValues={shouldHideValues} isSpeaking={assistant.speakingMessageId === message.id} onSpeak={() => void assistant.speak(message.id, message.text)} onStop={() => void assistant.stopSpeaking()} onRetry={notificationDraft ? () => void assistant.retryNotification(notificationDraft.clientActionId) : undefined} />;
										}
										if (message.type === 'question') {
											content = <AssistantQuestionCard message={message} isDarkMode={isDarkMode} hideValues={shouldHideValues} onAnswer={(value, label, apply) => assistant.answerQuestion(message.id, value, label, apply)} />;
										}
										if (message.type === 'drafts') {
										const storedSelection = selectedDraftActionByGroup[message.id];
										const selectedActionId = activeQuestionActionId && message.actionIds.includes(activeQuestionActionId)
											? activeQuestionActionId
											: message.actionIds.includes(storedSelection ?? '') ? storedSelection : message.actionIds[0];
										content = <AssistantDraftPages actionIds={message.actionIds} selectedActionId={selectedActionId} drafts={assistant.drafts} catalog={assistant.catalog} isDarkMode={isDarkMode} hideValues={shouldHideValues} onEdit={assistant.editDraft} onReview={assistant.beginConfirmation} onBack={assistant.cancelConfirmation} onConfirm={assistant.executeDraft} onCancel={assistant.cancelDraft} />;
									}
										if (message.type === 'report') {
											const spokenSummary = [message.report.narrative, message.report.deterministicSummary]
												.filter((value): value is string => Boolean(value))
												.join(' ');
											content = <AssistantReportCard report={message.report} isDarkMode={isDarkMode} hideValues={shouldHideValues} isSpeaking={assistant.speakingMessageId === message.id} onSpeak={() => void assistant.speak(message.id, spokenSummary)} onStop={() => void assistant.stopSpeaking()} />;
										}
										return content ? <Message key={message.id} role={message.role} index={index}>{content}</Message> : null;
									})}

								{assistant.isSending ? (
									<Message role="assistant">
										<AssistantActivityTrace
											progress={assistant.sendingProgress ?? { active: 'loading_data', completed: [] }}
											theme={isDarkMode ? 'dark' : 'light'}
										/>
									</Message>
								) : null}
								</VStack>
							</ConversationContent>
							<AssistantPaginationDock
								groups={draftGroups}
								drafts={assistant.drafts}
								selectedActionByGroup={selectedDraftActionByGroup}
								activeQuestionActionId={activeQuestionActionId}
								onSelect={selectDraftAction}
							/>

			<Box className={ASSISTANT_CLASS_NAMES.webComposerDock}>
				<MantineProvider forceColorScheme={isDarkMode ? 'dark' : 'light'}>
					<PromptInputProvider
						value={composerText}
						onChangeText={setComposerText}
						isDisabled={!assistant.availability?.available || assistant.isSending}
					>
						<AssistantComposerFrame
							active={Boolean(isComposerFocused && assistant.availability?.available && !assistant.isSending)}
							theme={isDarkMode ? 'dark' : 'light'}
							className="max-w-4xl self-center"
						>
						<PromptInput className={ASSISTANT_CLASS_NAMES.webComposer} onSubmit={({ text }) => void send(text)}>
							<PromptInputFooter>
								<PromptInputTools className={ASSISTANT_CLASS_NAMES.composerRow}>
									<PromptInputButton
										accessibilityLabel={recorderState.isRecording ? 'Parar gravação' : 'Gravar mensagem de voz'}
										disabled={isVoiceControlDisabled}
										onPress={() => recorderState.isRecording ? void stopRecording() : void startRecording()}
										className={recorderState.isRecording ? ASSISTANT_CLASS_NAMES.voiceButtonRecording : ASSISTANT_CLASS_NAMES.voiceButton}
									>
										<Icon as={recorderState.isRecording ? CircleStop : Mic} size="md" className={recorderState.isRecording ? 'text-white' : 'text-yellow-700 dark:text-yellow-300'} />
									</PromptInputButton>
									<MantineTextarea
										aria-label="Mensagem para o Lumus IA"
										maxLength={ASSISTANT_MAX_INPUT_CHARACTERS}
										autosize
										minRows={1}
										maxRows={4}
										value={composerText}
										onChange={event => setComposerText(event.currentTarget.value)}
										onFocus={() => {
										setIsComposerFocused(true);
										focusComposer();
										}}
										onBlur={() => setIsComposerFocused(false)}
										placeholder="Descreva o que aconteceu…"
										disabled={!assistant.availability?.available || assistant.isSending}
										classNames={MANTINE_ASSISTANT_TEXTAREA_CLASS_NAMES}
									/>
									<PromptInputSubmit
										accessibilityLabel="Enviar mensagem"
										disabled={isSubmitDisabled}
										className={ASSISTANT_CLASS_NAMES.sendButton}
									>
										<Icon as={Send} size="md" className="text-lumus-on-accent" />
									</PromptInputSubmit>
								</PromptInputTools>
								{recorderState.isRecording ? <Text className={`${ASSISTANT_CLASS_NAMES.composerHint} text-error-600 dark:text-error-400`}>Gravando… {Math.min(60, Math.round(recorderState.durationMillis / 1000))}s de 60s. Clique no microfone para parar.</Text> : null}
								{isTranscribing ? <Text className={ASSISTANT_CLASS_NAMES.composerHint}>Transcrevendo… Revise o texto antes de enviar.</Text> : null}
								{voiceError ? <Text className={`${ASSISTANT_CLASS_NAMES.composerHint} text-error-600 dark:text-error-400`}>{voiceError}</Text> : null}
							</PromptInputFooter>
						</PromptInput>
						</AssistantComposerFrame>
					</PromptInputProvider>
				</MantineProvider>
							</Box>
							</Conversation>
						)}
					</Box>
				</Box>
			</View>
			<Navigator defaultValue={0} />

			<Modal isOpen={isQuickPromptsModalOpen} onClose={() => setIsQuickPromptsModalOpen(false)} size="md">
				<ModalBackdrop />
				<ModalContent className={ASSISTANT_CLASS_NAMES.modal}>
					<ModalHeader>
						<VStack className="min-w-0 flex-1" space="xs">
							<ModalTitle className={LUMUS_CLASS_NAMES.heading}>Sugestões para começar</ModalTitle>
							<Text size="sm" className={LUMUS_CLASS_NAMES.helper}>Escolha uma pergunta pronta ou escreva do seu jeito.</Text>
						</VStack>
						<ModalCloseButton accessibilityLabel="Fechar sugestões" />
					</ModalHeader>
					<ModalBody>
						<VStack className="pb-2" space="sm">
							{QUICK_PROMPTS.map(prompt => (
								<Pressable
									key={prompt}
									accessibilityRole="button"
									disabled={!assistant.availability?.available || assistant.isSending}
									onPress={() => selectQuickPrompt(prompt)}
									className={ASSISTANT_CLASS_NAMES.quickPrompt}
								>
									<Icon as={CircleArrowRight} size="md" className="shrink-0 text-yellow-700 dark:text-yellow-300" />
									<Text className={`min-w-0 flex-1 ${LUMUS_CLASS_NAMES.body}`}>{prompt}</Text>
								</Pressable>
							))}
						</VStack>
					</ModalBody>
				</ModalContent>
			</Modal>

			<Drawer isOpen={isSettingsDrawerOpen} onClose={() => setIsSettingsDrawerOpen(false)} anchor="right" size="md">
				<DrawerBackdrop />
				<DrawerContent className={ASSISTANT_CLASS_NAMES.drawer}>
					<DrawerHeader>
						<VStack className="mr-3 min-w-0 flex-1 pt-8" space="xs">
							<Heading size="lg" className={LUMUS_CLASS_NAMES.heading}>Preferências do Lumus</Heading>
							<Text size="sm" className={LUMUS_CLASS_NAMES.helper}>Ajuste leitura e privacidade da conversa.</Text>
						</VStack>
						<DrawerCloseButton accessibilityLabel="Fechar preferências" className={ASSISTANT_CLASS_NAMES.iconButton}>
							<Icon as={X} size="md" className={LUMUS_CLASS_NAMES.helper} />
						</DrawerCloseButton>
					</DrawerHeader>
					<DrawerBody>
						<VStack className="pb-5" space="md">
							<HStack className={`${ASSISTANT_CLASS_NAMES.panelMuted} items-center justify-between gap-4 rounded-2xl p-4`}>
								<VStack className="min-w-0 flex-1" space="xs">
									<Text bold className={LUMUS_CLASS_NAMES.heading}>Ler respostas automaticamente</Text>
									<Text size="xs" className={`leading-5 ${LUMUS_CLASS_NAMES.helper}`}>A voz é gerada localmente em português do Brasil.</Text>
								</VStack>
								<Switch
									value={assistant.autoReadEnabled}
									onValueChange={assistant.setAutoReadEnabled}
									trackColor={{ false: runtimeColors.controlTrack, true: runtimeColors.accent }}
									thumbColor={runtimeColors.surface}
									accessibilityLabel="Ler respostas automaticamente"
								/>
							</HStack>
							<HStack className="items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
								<VStack className="min-w-0 flex-1" space="xs">
									<Text bold className="text-red-900 dark:text-red-100">Revogar consentimento</Text>
									<Text size="xs" className="leading-5 text-red-700 dark:text-red-300">Interrompe a IA e limpa a conversa desta sessão.</Text>
								</VStack>
								<Button
									action="negative"
									variant="outline"
									accessibilityLabel="Revogar consentimento e limpar conversa"
									className="h-touch w-touch rounded-control border-error-500 p-0"
									onPress={() => setIsRevokeModalOpen(true)}
								>
									<ButtonIcon as={ShieldOff} className="text-error-600" />
								</Button>
							</HStack>
						</VStack>
					</DrawerBody>
				</DrawerContent>
			</Drawer>

			<Modal isOpen={isRevokeModalOpen} onClose={() => setIsRevokeModalOpen(false)} size="sm">
				<ModalBackdrop />
				<ModalContent className={ASSISTANT_CLASS_NAMES.modal}>
					<ModalHeader>
						<ModalTitle className={LUMUS_CLASS_NAMES.heading}>Revogar consentimento?</ModalTitle>
						<ModalCloseButton accessibilityLabel="Fechar confirmação" />
					</ModalHeader>
					<ModalBody>
						<Text className={`leading-6 ${LUMUS_CLASS_NAMES.body}`}>A conversa atual será apagada e qualquer resposta em andamento será interrompida.</Text>
					</ModalBody>
					<ModalFooter className="gap-2">
						<Button variant="outline" className={LUMUS_CLASS_NAMES.secondaryButton} onPress={() => setIsRevokeModalOpen(false)}>
							<ButtonText>Manter consentimento</ButtonText>
						</Button>
						<Button action="negative" onPress={() => void revokeConsent()}>
							<ButtonText>Revogar e limpar</ButtonText>
						</Button>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</SafeAreaView>
	);
}
