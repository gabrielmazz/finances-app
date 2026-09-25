import React from 'react';
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Linking,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { Image } from '@/components/ui/image';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalCloseButton,
	ModalContent,
	ModalHeader,
	ModalTitle,
} from '@/components/ui/modal';
import {
	Popover,
	PopoverBackdrop,
	PopoverBody,
	PopoverContent,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	Message,
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputProvider,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from '@/components/ui/chatAi';
import Navigator from '@/components/uiverse/navigation/navigator';
import {
	AssistantQuestionCard,
	AssistantReportCard,
	AssistantTextBubble,
} from '@/components/uiverse/assistant/assistant-cards';
import { AssistantActivityTrace } from '@/components/uiverse/assistant/assistant-activity-trace';
import { AssistantComposerFrame } from '@/components/uiverse/assistant/assistant-composer-frame';
import { AssistantDraftPages, AssistantPaginationDock } from '@/components/uiverse/assistant/assistant-draft-pages';
import { useLumusAssistant } from '@/contexts/LumusAssistantContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { ASSISTANT_MAX_INPUT_CHARACTERS, orderAssistantMessagesForDisplay } from '@/utils/lumusAssistant';
import { isFirebaseEmulatorRuntime } from '@/utils/firebaseRuntime';
import {
	deleteAssistantTemporaryAudio,
	readAssistantAudioFile,
} from '@/utils/lumusAssistantAudio';
import { getLumusAssistantViewportLayout } from '@/utils/lumusAssistantLayout';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import LumusAssistantIllustration from '../../assets/UnDraw/lumusAssistantScreen.svg';

const QUICK_PROMPTS = [
	'Fui no mercado dois dias seguidos: no dia 18 deste mês gastei 50 reais e no dia 19 gastei 150 reais.',
	'Como foi o meu mês até agora?',
	'Quero registrar uma transferência entre bancos.',
	'Quais gastos obrigatórios ainda estão pendentes?',
];

const CONSENT_ITEMS = [
	{
		icon: Mic,
		title: 'Sem escuta em segundo plano',
		description: 'O microfone funciona somente quando você toca para gravar e para ao final de 60 segundos.',
	},
	{
		icon: Trash2,
		title: 'Áudio e conversa temporários',
		description: 'O arquivo de áudio é apagado depois da transcrição. A conversa não é salva no Firestore e é limpa ao sair da conta.',
	},
	{
		icon: ShieldCheck,
		title: 'Você sempre confirma',
		description: 'A IA apenas monta cartões. Nenhuma escrita acontece por texto ou voz; cada cartão exige seu botão de confirmação.',
	},
	{
		icon: Info,
		title: 'Uso de dados no nível gratuito',
		description: 'No nível gratuito da Gemini Developer API, o Google pode usar o conteúdo enviado para melhorar produtos. O nível pago é o que oferece a opção contrária.',
	},
] as const;

const ConsentView = ({
	onAccept,
	isLoading,
}: {
	onAccept(): Promise<void>;
	isLoading: boolean;
}) => {
	const { bodyText, headingText, helperText, submitButtonClassName, submitButtonTextClassName } = useScreenStyles();

	return (
		<ScrollView className="flex-1 px-5">
			<Box className="min-h-full w-full items-center justify-center py-6">
				<VStack className={ASSISTANT_CLASS_NAMES.consentCard} space="lg">
					<VStack space="xs">
						<Text className="text-xs font-bold uppercase tracking-widest text-yellow-700 dark:text-yellow-300">
							Privacidade primeiro
						</Text>
						<Heading size="xl" className={headingText}>
							Antes da primeira conversa
						</Heading>
						<Text className={`${helperText} leading-6`}>
							Para interpretar seus pedidos, o aplicativo envia ao Gemini o texto ou áudio escolhido e somente o contexto financeiro mínimo necessário.
						</Text>
					</VStack>
					<VStack space="sm">
						{CONSENT_ITEMS.map(({ icon, title, description }) => (
							<HStack key={title} className={ASSISTANT_CLASS_NAMES.consentItem}>
								<Box className="h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-yellow-100 dark:bg-yellow-950">
									<Icon as={icon} size="md" className="text-yellow-700 dark:text-yellow-300" />
								</Box>
								<VStack className="min-w-0 flex-1" space="xs">
									<Text bold className={bodyText}>{title}</Text>
									<Text size="sm" className={`${helperText} leading-5`}>{description}</Text>
								</VStack>
							</HStack>
						))}
					</VStack>
					<Pressable
						accessibilityRole="link"
						onPress={() => void Linking.openURL('https://ai.google.dev/gemini-api/docs/pricing')}
						className="min-h-touch self-start justify-center rounded-lg"
					>
						<Text bold size="sm" className="text-yellow-700 dark:text-yellow-300">Ver preços e política de uso de dados</Text>
					</Pressable>
					<Button size="md" className={`${submitButtonClassName} w-full`} isDisabled={isLoading} onPress={() => void onAccept()}>
						{isLoading ? <ButtonSpinner /> : <ButtonText className={submitButtonTextClassName}>Aceitar e começar</ButtonText>}
					</Button>
				</VStack>
			</Box>
		</ScrollView>
	);
};

// [[Assistente Lumus]]: a rota já está aberta enquanto disponibilidade, preferências e Remote Config são resolvidos.
const AssistantBootstrappingView = () => {
	const { headingText, helperText } = useScreenStyles();

	return (
		<Box className="flex-1 px-5 py-6">
			<Box className="flex-1 items-center justify-center">
				<VStack className={`${ASSISTANT_CLASS_NAMES.consentCard} items-center`} space="md">
					<Box className={ASSISTANT_CLASS_NAMES.emptyMark}>
						<ActivityIndicator size="large" color="#eab308" />
					</Box>
					<Heading size="lg" className={`text-center ${headingText}`}>
						Preparando o Lumus IA
					</Heading>
					<Text className={`text-center leading-5 ${helperText}`}>
						Verificando a configuração do assistente. Você já está na tela; o chat ficará disponível assim que essa etapa terminar.
					</Text>
				</VStack>
			</Box>
		</Box>
	);
};

export default function LumusAssistantScreen() {
	const {
		isDarkMode,
		cardBackground,
		headingText,
		heroHeight,
		insets,
		bodyText,
		helperText,
		warningTextClassName,
		assistantAvailableTextClassName,
		assistantUnavailableTextClassName,
		drawerContentClassName,
		infoCardStyle,
		modalContentClassName,
		switchTrackColor,
		switchThumbColor,
		switchIosBackgroundColor,
	} = useScreenStyles();
	const { shouldHideValues } = useValueVisibility();
	const assistant = useLumusAssistant();
	const [composerText, setComposerText] = React.useState('');
	const [isComposerFocused, setIsComposerFocused] = React.useState(false);
	const [selectedDraftActionByGroup, setSelectedDraftActionByGroup] = React.useState<Record<string, string>>({});
	const [isQuickPromptsModalOpen, setIsQuickPromptsModalOpen] = React.useState(false);
	const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = React.useState(false);
	const [voiceError, setVoiceError] = React.useState<string | null>(null);
	const [isTranscribing, setIsTranscribing] = React.useState(false);
	const [isAcceptingConsent, setIsAcceptingConsent] = React.useState(false);
	const [viewportHeight, setViewportHeight] = React.useState(0);
	const [expandedViewportHeight, setExpandedViewportHeight] = React.useState(0);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const shouldAutoScrollRef = React.useRef(true);
	const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
	const recorderState = useAudioRecorderState(recorder, 200);
	const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const stopInFlightRef = React.useRef(false);
	const temporaryUriRef = React.useRef<string | null>(null);
	const wasRecordingRef = React.useRef(false);
	const isMountedRef = React.useRef(true);
	const assistantViewportLayout = React.useMemo(
		() => getLumusAssistantViewportLayout({
			defaultHeroHeight: heroHeight,
			viewportHeight,
			expandedViewportHeight,
		}),
		[expandedViewportHeight, heroHeight, viewportHeight],
	);
	const handleViewportLayout = React.useCallback(({ nativeEvent }: LayoutChangeEvent) => {
		const nextHeight = Math.round(nativeEvent.layout.height);
		if (nextHeight <= 0) return;
		setViewportHeight(current => current === nextHeight ? current : nextHeight);
		setExpandedViewportHeight(current => Math.max(current, nextHeight));
	}, []);
	const scrollConversationToEnd = React.useCallback((animated = true) => {
		scrollViewRef.current?.scrollToEnd({ animated });
	}, []);
	const focusComposer = React.useCallback(() => {
		shouldAutoScrollRef.current = true;
		requestAnimationFrame(() => scrollConversationToEnd());
	}, [scrollConversationToEnd]);

	React.useEffect(() => {
		if (!assistantViewportLayout.isCompact) return;
		shouldAutoScrollRef.current = true;
		const frame = requestAnimationFrame(() => scrollConversationToEnd(false));
		return () => cancelAnimationFrame(frame);
	}, [assistantViewportLayout.isCompact, scrollConversationToEnd]);

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
			// useAudioRecorder releases its native shared object during unmount.
			// Do not call recorder.stop(), recorder.isRecording, or recorder.uri here.
			void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
		};
	}, []);
	React.useEffect(() => { void cleanupRecording(); }, [assistant.revocationEpoch, cleanupRecording]);
	React.useEffect(() => {
		const wasRecording = wasRecordingRef.current;
		wasRecordingRef.current = recorderState.isRecording;
		if (!recorderState.mediaServicesDidReset || (!recorderState.isRecording && !wasRecording)) return;
		setVoiceError('A gravação foi interrompida pelo dispositivo. Tente novamente ou digite a mensagem.');
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
	}, [assistant, recorder, recorderState.durationMillis, recorderState.url]);

	const startRecording = React.useCallback(async () => {
		if (!isMountedRef.current || assistant.isSending || isTranscribing || recorderState.isRecording) return;
		setVoiceError(null);
		try {
			const permission = await requestRecordingPermissionsAsync();
			if (!isMountedRef.current) return;
			if (!permission.granted) {
				setVoiceError('Permita o microfone nas configurações do dispositivo. Você ainda pode digitar.');
				return;
			}
			await setAudioModeAsync({ allowsRecording: true, allowsBackgroundRecording: false });
			if (!isMountedRef.current) return;
			await recorder.prepareToRecordAsync();
			if (!isMountedRef.current) return;
			recorder.record();
			stopTimerRef.current = setTimeout(() => { void stopRecording(); }, 60_000);
		} catch (error) {
			setVoiceError(error instanceof Error ? error.message : 'Este dispositivo não conseguiu iniciar o microfone.');
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

	const acceptConsent = async () => {
		setIsAcceptingConsent(true);
		try { await assistant.grantConsent(); } finally { setIsAcceptingConsent(false); }
	};
	const revokeConsent = React.useCallback(async () => {
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
	const voiceButtonClassName = recorderState.isRecording
		? ASSISTANT_CLASS_NAMES.voiceButtonRecording
		: ASSISTANT_CLASS_NAMES.voiceButton;

	return (
		<SafeAreaView className={ASSISTANT_CLASS_NAMES.screen} edges={['left', 'right', 'bottom']}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<Box className={`flex-1 ${cardBackground}`} onLayout={handleViewportLayout}>
				<Box className={`absolute left-0 right-0 top-0 ${cardBackground}`} style={{ height: assistantViewportLayout.heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background amarelo da tela do Lumus IA"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>
					<VStack
						className="h-full w-full items-center justify-start px-6"
						space={assistantViewportLayout.isCompact ? 'xs' : 'lg'}
						style={{ paddingTop: insets.top + (assistantViewportLayout.isCompact ? 10 : 24) }}
					>
						<Heading size={assistantViewportLayout.isCompact ? 'lg' : 'xl'} className="text-center text-white">Lumus IA</Heading>
						{!assistantViewportLayout.isCompact ? <LumusAssistantIllustration width="40%" height="40%" className="opacity-90" /> : null}
					</VStack>
				</Box>

				<KeyboardAvoidingView
					className="flex-1"
					enabled={Platform.OS === 'ios'}
					behavior="padding"
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
				>
					<Box
						className={`flex-1 rounded-t-3xl ${cardBackground}`}
						style={{ marginTop: assistantViewportLayout.panelTopMargin, minHeight: 0 }}
					>
						{assistant.isBootstrapping ? (
							<AssistantBootstrappingView />
						) : !assistant.consentGranted ? (
							<ConsentView onAccept={acceptConsent} isLoading={isAcceptingConsent} />
						) : (
							<>
								<Box className={`${ASSISTANT_CLASS_NAMES.conversationFrame} px-4 pb-2 pt-3`}>
									<HStack className={ASSISTANT_CLASS_NAMES.toolbar}>
										<HStack className={ASSISTANT_CLASS_NAMES.statusPill}>
											<Box className={assistant.availability?.available ? ASSISTANT_CLASS_NAMES.statusDotAvailable : ASSISTANT_CLASS_NAMES.statusDotUnavailable} />
											<Text size="xs" bold className={assistant.availability?.available ? assistantAvailableTextClassName : assistantUnavailableTextClassName}>
												{assistant.availability?.available ? 'Pronto para ajudar' : 'Configuração pendente'}
											</Text>
										</HStack>
										<HStack className={ASSISTANT_CLASS_NAMES.toolbarActions}>
											<Pressable accessibilityRole="button" accessibilityLabel="Limpar conversa" onPress={assistant.clearConversation} className={ASSISTANT_CLASS_NAMES.iconButton}>
												<Icon as={Trash2} size="lg" className={helperText} />
											</Pressable>
											<Pressable
												accessibilityRole="button"
												accessibilityLabel="Abrir exemplos de perguntas"
												disabled={!assistant.availability?.available || assistant.isSending}
												onPress={() => setIsQuickPromptsModalOpen(true)}
												className={ASSISTANT_CLASS_NAMES.accentIconButton}
											>
												<Icon as={Lightbulb} size="lg" className="text-yellow-700 dark:text-yellow-300" />
											</Pressable>
											<Pressable accessibilityRole="button" accessibilityLabel="Abrir configurações do assistente" onPress={() => setIsSettingsDrawerOpen(true)} className={ASSISTANT_CLASS_NAMES.iconButton}>
												<Icon as={Settings2} size="lg" className={helperText} />
											</Pressable>
										</HStack>
									</HStack>
								</Box>
								<Conversation className="flex-1" style={{ minHeight: 0 }}>
									<ConversationContent
										ref={scrollViewRef}
										className="flex-1"
										onContentSizeChange={() => {
											if (shouldAutoScrollRef.current) scrollConversationToEnd();
										}}
										onScroll={event => {
											const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
											shouldAutoScrollRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 48;
										}}
										scrollEventThrottle={16}
										keyboardShouldPersistTaps="handled"
										keyboardDismissMode="on-drag"
									>
										<VStack className={ASSISTANT_CLASS_NAMES.conversationContent} space="lg">
										{isHybridDevelopment ? (
											<HStack className={ASSISTANT_CLASS_NAMES.infoBanner}>
												<Icon as={Info} size="lg" className="shrink-0 text-blue-600 dark:text-blue-300" />
												<Text size="xs" className="min-w-0 flex-1 leading-5 text-blue-900 dark:text-blue-100">
													Modo de desenvolvimento híbrido: Auth, Firestore e Functions usam o Emulator Suite. Somente AI Logic, App Check e Remote Config acessam o projeto Firebase na nuvem.
												</Text>
											</HStack>
										) : null}
										{!assistant.availability?.available ? (
											<HStack className={ASSISTANT_CLASS_NAMES.warningBanner}>
												<Icon as={TriangleAlert} size="lg" className="shrink-0 text-warning-500" />
												<VStack className="flex-1" space="xs">
													<Text className={warningTextClassName}>{assistant.availability?.reason ?? 'O assistente ainda não está configurado. O restante do Lumus continua funcionando.'}</Text>
													<Pressable
														accessibilityRole="button"
														accessibilityLabel="Tentar verificar a configuração do Lumus IA novamente"
														disabled={assistant.isRefreshingAvailability}
														onPress={() => void assistant.refreshAvailability()}
														className="self-start rounded-xl py-1 disabled:opacity-40"
													>
														<Text bold size="xs" className={warningTextClassName}>
															{assistant.isRefreshingAvailability ? 'Verificando…' : 'Tentar novamente'}
														</Text>
													</Pressable>
												</VStack>
											</HStack>
										) : null}
										{assistant.messages.length === 0 ? (
											<ConversationEmptyState
												title="O que você quer organizar?"
												description="Descreva uma movimentação, peça uma análise ou toque na lâmpada para ver exemplos."
											>
												<Box className={ASSISTANT_CLASS_NAMES.emptyMark}>
													<Icon as={Sparkles} size="xl" className="text-yellow-700 dark:text-yellow-300" />
												</Box>
											</ConversationEmptyState>
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
										<Box className={ASSISTANT_CLASS_NAMES.composerDock}>
										<PromptInputProvider
											value={composerText}
											onChangeText={setComposerText}
											isDisabled={!assistant.availability?.available || assistant.isSending}
										>
										<AssistantComposerFrame
											active={Boolean(isComposerFocused && assistant.availability?.available && !assistant.isSending)}
											theme={isDarkMode ? 'dark' : 'light'}
											className="max-w-3xl self-center"
										>
										<PromptInput className={ASSISTANT_CLASS_NAMES.composerShell} onSubmit={({ text }) => void send(text)}>
											<PromptInputFooter>
													{recorderState.isRecording ? <Text size="xs" className="mb-1.5 text-center text-error-500">Gravando… {Math.min(60, Math.round(recorderState.durationMillis / 1000))}s de 60s. Toque novamente para parar.</Text> : null}
													{isTranscribing ? <Text size="xs" className={`mb-1.5 text-center ${helperText}`}>Transcrevendo. O texto aparecerá para você revisar antes do envio.</Text> : null}
													{voiceError ? <Text size="xs" className="mb-1.5 text-center text-error-500">{voiceError}</Text> : null}
												<PromptInputTools className={ASSISTANT_CLASS_NAMES.composerRow}>
													<PromptInputButton
														accessibilityLabel={recorderState.isRecording ? 'Parar gravação' : 'Gravar mensagem de voz'}
															disabled={isVoiceControlDisabled}
															onPress={() => recorderState.isRecording ? void stopRecording() : void startRecording()}
															className={`${voiceButtonClassName} disabled:opacity-40`}
														>
															<Icon as={recorderState.isRecording ? CircleStop : Mic} size="lg" className={recorderState.isRecording ? 'text-white' : 'text-yellow-500'} />
														</PromptInputButton>
														<PromptInputTextarea
															maxLength={ASSISTANT_MAX_INPUT_CHARACTERS}
															multiline
															textAlignVertical="top"
															onFocus={() => {
																setIsComposerFocused(true);
																focusComposer();
															}}
															onBlur={() => setIsComposerFocused(false)}
															placeholder="Digite ou use o microfone…"
														accessibilityLabel="Mensagem para o Lumus IA"
														containerClassName={ASSISTANT_CLASS_NAMES.composerInput}
														fieldClassName={ASSISTANT_CLASS_NAMES.composerField}
													/>
													<PromptInputSubmit
														accessibilityLabel="Enviar mensagem"
														disabled={isSubmitDisabled}
														className={ASSISTANT_CLASS_NAMES.sendButton}
													>
														<Icon as={Send} size="md" className="text-lumus-on-accent" />
														</PromptInputSubmit>
													</PromptInputTools>
												</PromptInputFooter>
										</PromptInput>
										</AssistantComposerFrame>
										</PromptInputProvider>
									</Box>
								</Conversation>
							</>
						)}
					</Box>
					<Navigator defaultValue={0} />
				</KeyboardAvoidingView>
			</Box>
			<Modal isOpen={isQuickPromptsModalOpen} onClose={() => setIsQuickPromptsModalOpen(false)} size="sm">
				<ModalBackdrop />
				<ModalContent className={`${modalContentClassName} rounded-3xl`}>
					<ModalHeader>
						<VStack className="flex-1" space="xs">
							<ModalTitle className={headingText}>Exemplos para começar</ModalTitle>
							<Text size="xs" className={helperText}>Escolha uma sugestão para enviá-la ao Lumus.</Text>
						</VStack>
						<ModalCloseButton accessibilityLabel="Fechar exemplos de perguntas" />
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
								<Icon as={CircleArrowRight} size="lg" className="shrink-0 text-yellow-700 dark:text-yellow-300" />
									<Text className={`flex-1 ${bodyText}`}>{prompt}</Text>
								</Pressable>
							))}
						</VStack>
					</ModalBody>
				</ModalContent>
			</Modal>
			<Drawer
				isOpen={isSettingsDrawerOpen}
				onClose={() => setIsSettingsDrawerOpen(false)}
				anchor="right"
				size="lg"
			>
				<DrawerBackdrop />
				<DrawerContent className={drawerContentClassName}>
					<DrawerHeader>
						<VStack className="mr-3 flex-1 pt-12" space="xs">
							<Heading size="lg" className={headingText}>Configurações do assistente</Heading>
							<Text size="xs" className={helperText}>Controle a leitura de respostas e suas preferências de privacidade.</Text>
						</VStack>
						<DrawerCloseButton accessibilityLabel="Fechar configurações do assistente" className="h-10 w-10 items-center justify-center rounded-2xl">
							<Icon as={X} size="lg" className={helperText} />
						</DrawerCloseButton>
					</DrawerHeader>
					<DrawerBody className="mb-0">
						<VStack space="lg">
							<VStack className={`${ASSISTANT_CLASS_NAMES.panelMuted} rounded-2xl p-4`} space="md">
								<HStack className="items-center justify-between gap-4">
									<HStack className="ml-1 flex-1 items-center gap-1">
										<Text size="sm" className={bodyText}>Ler respostas automaticamente</Text>
										<Popover
											placement="bottom"
											size="md"
											offset={0}
											shouldFlip
											focusScope={false}
											trapFocus={false}
											trigger={triggerProps => (
												<Pressable
													{...triggerProps}
													hitSlop={8}
													accessibilityRole="button"
													accessibilityLabel="Como funciona a leitura automática"
												>
													<Icon as={Info} size="xs" className={`ml-1 ${helperText}`} />
												</Pressable>
											)}
										>
											<PopoverBackdrop className="bg-transparent" />
											<PopoverContent className="max-w-[260px]" style={infoCardStyle}>
												<PopoverBody className="px-3 py-3">
													<Text className={`${bodyText} text-xs leading-5`}>
														Quando ativada, o Lumus lê as respostas localmente em pt-BR.
													</Text>
												</PopoverBody>
											</PopoverContent>
										</Popover>
									</HStack>
									<Switch
										value={assistant.autoReadEnabled}
										onValueChange={assistant.setAutoReadEnabled}
										trackColor={switchTrackColor}
										thumbColor={switchThumbColor}
										ios_backgroundColor={switchIosBackgroundColor}
										accessibilityLabel="Ler respostas automaticamente"
									/>
								</HStack>
							</VStack>

							<VStack className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950" space="md">
								<HStack className="items-center justify-between gap-4">
									<Text bold className={`flex-1 ${bodyText}`}>Revogar consentimento e limpar conversa</Text>
									<Button
										action="negative"
										variant="outline"
										size="md"
										accessibilityLabel="Revogar consentimento e limpar conversa"
										className="h-10 w-10 rounded-2xl border-error-500 p-0"
										onPress={() => void revokeConsent()}
									>
										<ButtonIcon as={ShieldOff} className="text-error-600" />
									</Button>
								</HStack>
							</VStack>
						</VStack>
					</DrawerBody>
				</DrawerContent>
			</Drawer>
		</SafeAreaView>
	);
}
