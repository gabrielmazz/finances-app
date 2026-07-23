import React from 'react';
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Linking,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
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
import Navigator from '@/components/uiverse/navigator';
import Loader from '@/components/uiverse/loader';
import {
	AssistantDraftCard,
	AssistantQuestionCard,
	AssistantReportCard,
	AssistantTextBubble,
} from '@/components/uiverse/lumus-assistant/assistant-cards';
import { useLumusAssistant } from '@/contexts/LumusAssistantContext';
import { useValueVisibility } from '@/contexts/ValueVisibilityContext';
import { useScreenStyles } from '@/hooks/useScreenStyle';
import { ASSISTANT_MAX_INPUT_CHARACTERS } from '@/utils/lumusAssistant';
import {
	deleteAssistantTemporaryAudio,
	readAssistantAudioFile,
} from '@/utils/lumusAssistantAudio';

import LoginWallpaper from '@/assets/Background/wallpaper01.png';
import LumusAssistantIllustration from '../assets/UnDraw/lumusAssistantScreen.svg';

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
	const {
		bodyText,
		headingText,
		helperText,
		sectionCardClassName,
		submitButtonClassName,
		submitButtonTextClassName,
	} = useScreenStyles();

	return (
		<ScrollView className="flex-1 px-5">
			<Box className="min-h-full w-full items-center justify-center py-5">
				<VStack className={`${sectionCardClassName} w-full max-w-[680px] rounded-[28px] p-[22px]`} space="lg">
					<VStack space="xs">
						<Heading size="xl" className={headingText}>
							Antes de conversar com o Lumus IA
						</Heading>
						<Text className={`${helperText} leading-5`}>
							Para interpretar seus pedidos, o aplicativo envia ao Gemini o texto ou áudio escolhido e somente o contexto financeiro mínimo necessário.
						</Text>
					</VStack>
				{CONSENT_ITEMS.map(({ icon, title, description }) => (
					<HStack key={title} space="md">
						<Icon as={icon} size="lg" className="text-yellow-500" />
						<VStack className="flex-1" space="xs">
							<Text bold className={bodyText}>{title}</Text>
							<Text className={`${helperText} leading-5`}>{description}</Text>
						</VStack>
					</HStack>
				))}
				<Pressable onPress={() => void Linking.openURL('https://ai.google.dev/gemini-api/docs/pricing')}>
					<Text bold className="text-yellow-600">Ler a tabela oficial de preços e uso de dados</Text>
				</Pressable>
				<Button size="md" className={`${submitButtonClassName} w-full`} isDisabled={isLoading} onPress={() => void onAccept()}>
					{isLoading ? <ButtonSpinner /> : <ButtonText className={submitButtonTextClassName}>Entendi e quero usar</ButtonText>}
				</Button>
				</VStack>
			</Box>
		</ScrollView>
	);
};

export default function LumusAssistantScreen() {
	const {
		isDarkMode,
		cardBackground,
		headingText,
		fieldContainerClassNameNotSpace,
		heroHeight,
		inputField,
		insets,
		submitButtonClassName,
		submitButtonTextClassName,
		bodyText,
		helperText,
		sectionCardClassName,
		dividerClassName,
		warningCardClassName,
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
	const [isQuickPromptsModalOpen, setIsQuickPromptsModalOpen] = React.useState(false);
	const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = React.useState(false);
	const [voiceError, setVoiceError] = React.useState<string | null>(null);
	const [isTranscribing, setIsTranscribing] = React.useState(false);
	const [isAcceptingConsent, setIsAcceptingConsent] = React.useState(false);
	const scrollViewRef = React.useRef<ScrollView | null>(null);
	const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
	const recorderState = useAudioRecorderState(recorder, 200);
	const stopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const stopInFlightRef = React.useRef(false);
	const temporaryUriRef = React.useRef<string | null>(null);
	const wasRecordingRef = React.useRef(false);
	const isMountedRef = React.useRef(true);

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
	const composerControlClassName = 'h-10 w-10 items-center justify-center rounded-2xl';
	const voiceButtonClassName = recorderState.isRecording
		? `${composerControlClassName} bg-error-500`
		: `${fieldContainerClassNameNotSpace} ${composerControlClassName}`;
	const submitButtonControlClassName = `${submitButtonClassName} ${composerControlClassName}`;

	if (assistant.isBootstrapping) {
		return (
			<SafeAreaView className={`flex-1 items-center justify-center ${cardBackground}`}>
				<Loader />
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView className={`flex-1 ${cardBackground}`} edges={['left', 'right', 'bottom']}>
			<StatusBar translucent backgroundColor="transparent" barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
			<Box className={`flex-1 ${cardBackground}`}>
				<Box className={`absolute left-0 right-0 top-0 ${cardBackground}`} style={{ height: heroHeight }}>
					<Image
						source={LoginWallpaper}
						alt="Background amarelo da tela do Lumus IA"
						className="absolute h-full w-full rounded-b-3xl"
						resizeMode="cover"
					/>
					<VStack className="h-full w-full items-center justify-start px-6" space="lg" style={{ paddingTop: insets.top + 24 }}>
						<Heading size="xl" className="text-center text-white">Lumus IA</Heading>
						<LumusAssistantIllustration width="40%" height="40%" className="opacity-90" />
					</VStack>
				</Box>

				<KeyboardAvoidingView
					className="flex-1"
					behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
					keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
				>
					<Box className={`flex-1 rounded-t-3xl ${cardBackground}`} style={{ marginTop: heroHeight - 64 }}>
						{!assistant.consentGranted ? (
							<ConsentView onAccept={acceptConsent} isLoading={isAcceptingConsent} />
						) : (
							<>
								<Box className="w-full max-w-[760px] self-center px-6 pb-2 pt-3.5">
									<HStack className="items-center justify-between">
										<Text size="xs" bold className={assistant.availability?.available ? assistantAvailableTextClassName : assistantUnavailableTextClassName}>
										{assistant.availability?.available ? 'Pronto para ajudar' : 'Configuração pendente'}
										</Text>
										<HStack space="xs">
											<Pressable accessibilityLabel="Limpar conversa" onPress={assistant.clearConversation} className="h-10 w-10 items-center justify-center rounded-2xl">
												<Icon as={Trash2} size="lg" className={helperText} />
											</Pressable>
											<Pressable
												accessibilityLabel="Abrir exemplos de perguntas"
												disabled={!assistant.availability?.available || assistant.isSending}
												onPress={() => setIsQuickPromptsModalOpen(true)}
												className="h-10 w-10 items-center justify-center rounded-2xl disabled:opacity-40"
											>
												<Icon as={Lightbulb} size="lg" className="text-yellow-500" />
											</Pressable>
											<Pressable accessibilityLabel="Abrir configurações do assistente" onPress={() => setIsSettingsDrawerOpen(true)} className="h-10 w-10 items-center justify-center rounded-2xl">
												<Icon as={Settings2} size="lg" className={helperText} />
											</Pressable>
										</HStack>
									</HStack>
								</Box>
								<Conversation className="flex-1">
									<ConversationContent
										ref={scrollViewRef}
										className="flex-1"
										onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
										keyboardShouldPersistTaps="handled"
										keyboardDismissMode="on-drag"
									>
										<VStack className="w-full max-w-[760px] self-center px-6 pb-8 pt-2" space="lg">
										{!assistant.availability?.available ? (
											<HStack className={`${warningCardClassName} p-3`} space="sm">
												<Icon as={TriangleAlert} size="lg" className="text-warning-500" />
												<Text className={`flex-1 ${warningTextClassName}`}>{assistant.availability?.reason ?? 'O assistente ainda não está configurado. O restante do Lumus continua funcionando.'}</Text>
											</HStack>
										) : null}
										{assistant.messages.length === 0 ? (
											<ConversationEmptyState
												title="Conte o que aconteceu"
												description="Pode falar do seu jeito. Toque na lâmpada acima se quiser ver exemplos."
											/>
										) : null}

										{assistant.messages.map((message, index) => {
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
											if (message.type === 'draft') {
												const draft = assistant.drafts.find(item => item.clientActionId === message.actionId);
												const isDependencyPending = Boolean(draft?.dependsOnActionIds.some(dependencyId =>
													assistant.drafts.find(item => item.clientActionId === dependencyId)?.status !== 'succeeded',
												));
												content = draft ? <AssistantDraftCard draft={draft} catalog={assistant.catalog} isDarkMode={isDarkMode} hideValues={shouldHideValues} isDependencyPending={isDependencyPending} onEdit={patch => assistant.editDraft(draft.clientActionId, patch)} onReview={() => assistant.beginConfirmation(draft.clientActionId)} onBack={() => assistant.cancelConfirmation(draft.clientActionId)} onConfirm={() => assistant.executeDraft(draft.clientActionId)} onCancel={() => assistant.cancelDraft(draft.clientActionId)} /> : null;
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
												<HStack className={`${sectionCardClassName} self-start rounded-2xl px-3.5 py-3`} space="sm">
													<ActivityIndicator size="small" color="#eab308" />
													<Text className={helperText}>Organizando com cuidado…</Text>
												</HStack>
											</Message>
										) : null}

										</VStack>
									</ConversationContent>
									<Box className="w-full max-w-[760px] self-center px-6 pb-2">
										<PromptInputProvider
											value={composerText}
											onChangeText={setComposerText}
											isDisabled={!assistant.availability?.available || assistant.isSending}
										>
											<PromptInput onSubmit={({ text }) => void send(text)}>
												<PromptInputFooter className={`mt-1 border-t pt-2.5 ${dividerClassName}`}>
													{recorderState.isRecording ? <Text size="xs" className="mb-1.5 text-center text-error-500">Gravando… {Math.min(60, Math.round(recorderState.durationMillis / 1000))}s de 60s. Toque novamente para parar.</Text> : null}
													{isTranscribing ? <Text size="xs" className={`mb-1.5 text-center ${helperText}`}>Transcrevendo. O texto aparecerá para você revisar antes do envio.</Text> : null}
													{voiceError ? <Text size="xs" className="mb-1.5 text-center text-error-500">{voiceError}</Text> : null}
													<PromptInputTools className="flex-row items-end gap-2">
														<PromptInputButton
															disabled={isVoiceControlDisabled}
															onPress={() => recorderState.isRecording ? void stopRecording() : void startRecording()}
															className={`${voiceButtonClassName} disabled:opacity-40`}
														>
															<Icon as={recorderState.isRecording ? CircleStop : Mic} size="lg" className={recorderState.isRecording ? 'text-white' : 'text-yellow-500'} />
														</PromptInputButton>
														<PromptInputTextarea
															maxLength={ASSISTANT_MAX_INPUT_CHARACTERS}
															multiline
															placeholder="Digite ou use o microfone…"
															containerClassName={`${fieldContainerClassNameNotSpace} min-h-10 max-h-30 flex-1`}
															fieldClassName={inputField}
														/>
														<PromptInputSubmit
															disabled={isSubmitDisabled}
															className={`${submitButtonControlClassName} disabled:opacity-40`}
														>
															<Icon as={Send} size="md" className={submitButtonTextClassName} />
														</PromptInputSubmit>
													</PromptInputTools>
												</PromptInputFooter>
											</PromptInput>
										</PromptInputProvider>
									</Box>
								</Conversation>
							</>
						)}
					</Box>
				</KeyboardAvoidingView>
			</Box>
			<Modal isOpen={isQuickPromptsModalOpen} onClose={() => setIsQuickPromptsModalOpen(false)} size="sm">
				<ModalBackdrop />
				<ModalContent className={modalContentClassName}>
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
									disabled={!assistant.availability?.available || assistant.isSending}
									onPress={() => selectQuickPrompt(prompt)}
									className={`${sectionCardClassName} flex-row items-center rounded-2xl p-3 disabled:opacity-40`}
								>
									<Icon as={CircleArrowRight} size="lg" className="mr-2 text-yellow-500" />
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
							<VStack className={`${sectionCardClassName} rounded-2xl p-4`} space="md">
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

							<VStack className={`${sectionCardClassName} rounded-2xl p-4`} space="md">
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
			<Navigator defaultValue={0} />
		</SafeAreaView>
	);
}
