import React from 'react';
import { ASSISTANT_CLASS_NAMES } from '@/design-system/assistant';

const mockHost = (name: string) => {
	const Host = ({ children, ...props }: Record<string, any>) => React.createElement(name, props, children);
	Host.displayName = `Mock${name}`;
	return Host;
};

const mockView = mockHost('View');
const mockText = mockHost('Text');
const mockPressable = ({ children, disabled, accessibilityState, ...props }: Record<string, any>) => React.createElement('Pressable', {
	...props,
	disabled,
	accessible: props.accessible ?? Boolean(props.accessibilityLabel || props.accessibilityRole),
	accessibilityRole: props.accessibilityRole ?? (props.accessibilityLabel ? 'button' : undefined),
	accessibilityState: { ...accessibilityState, ...(disabled !== undefined ? { disabled } : {}) },
}, children);
const mockTextInput = ({ disabled, accessibilityState, ...props }: Record<string, any>) => React.createElement('TextInput', {
	...props,
	disabled,
	accessible: props.accessible ?? Boolean(props.accessibilityLabel),
	accessibilityState: { ...accessibilityState, ...(disabled !== undefined ? { disabled } : {}) },
});
const mockScrollToEnd = jest.fn();
const mockScrollView = React.forwardRef(({ children, ...props }: Record<string, any>, ref) => {
	React.useImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }), []);
	return React.createElement('ScrollView', { ...props, testID: props.onContentSizeChange ? 'conversation-scroll' : props.testID }, children);
});
const mockActivityIndicator = mockHost('ActivityIndicator');

const mockAssistantTextBubble = jest.fn(({ message }: Record<string, any>) =>
	React.createElement('Text', {
		className: message.role === 'user' ? ASSISTANT_CLASS_NAMES.userBubbleText : 'leading-5 text-slate-800 dark:text-slate-200',
	}, message.text),
);
const mockReadAudioFile = jest.fn(async () => ({ base64: 'encoded-audio', mimeType: 'audio/mp4' }));
const mockDeleteTemporaryAudio = jest.fn();
const mockRequestRecordingPermissions = jest.fn(async () => ({ granted: false }));
const mockSetAudioMode = jest.fn(async () => undefined);

let mockShouldHideValues = false;
let mockRecorderState = { isRecording: false, mediaServicesDidReset: false, durationMillis: 0, url: null as string | null };
let mockRecorder: Record<string, any>;
let mockAssistant: Record<string, any>;

const createAssistant = (overrides: Record<string, any> = {}) => ({
	isBootstrapping: false,
	consentGranted: true,
	revocationEpoch: 0,
	isSending: false,
	isRefreshingAvailability: false,
	availability: { available: true, reason: undefined, runtime: 'web' },
	messages: [],
	drafts: [],
	catalog: {},
	speakingMessageId: null,
	sendingProgress: null,
	autoReadEnabled: false,
	sendMessage: jest.fn(async () => undefined),
	grantConsent: jest.fn(async () => undefined),
	revokeConsent: jest.fn(async () => undefined),
	clearConversation: jest.fn(),
	refreshAvailability: jest.fn(async () => undefined),
	transcribeAudio: jest.fn(async () => 'Transcrição de teste'),
	speak: jest.fn(async () => undefined),
	stopSpeaking: jest.fn(async () => undefined),
	retryNotification: jest.fn(async () => undefined),
	answerQuestion: jest.fn(async () => undefined),
	editDraft: jest.fn(async () => undefined),
	beginConfirmation: jest.fn(),
	cancelConfirmation: jest.fn(),
	executeDraft: jest.fn(async () => true),
	cancelDraft: jest.fn(),
	setAutoReadEnabled: jest.fn(),
	...overrides,
});

jest.doMock('react-native', () => ({
	Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: jest.fn() }) },
	ActivityIndicator: mockActivityIndicator,
	AppState: { currentState: 'active', addEventListener: () => ({ remove: jest.fn() }) },
	Image: mockHost('Image'),
	KeyboardAvoidingView: mockView,
	Linking: { openURL: jest.fn(async () => undefined) },
	Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
	Pressable: mockPressable,
	ScrollView: mockScrollView,
	StyleSheet: { flatten: (style: unknown) => style ?? {} },
	StatusBar: () => null,
	Text: mockText,
	TextInput: mockTextInput,
	View: mockView,
	useWindowDimensions: () => ({ height: 1_000, width: 1_200 }),
}));

jest.doMock('react-native-safe-area-context', () => ({
	SafeAreaView: mockView,
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.doMock('lucide-react-native', () => Object.fromEntries([
	'CircleArrowRight', 'CircleStop', 'Info', 'Lightbulb', 'Mic', 'Send', 'Settings2',
	'ShieldCheck', 'ShieldOff', 'Sparkles', 'Trash2', 'TriangleAlert', 'X',
].map(name => [name, mockHost(name)])));

jest.doMock('expo-audio', () => ({
	RecordingPresets: { HIGH_QUALITY: {} },
	requestRecordingPermissionsAsync: mockRequestRecordingPermissions,
	setAudioModeAsync: mockSetAudioMode,
	useAudioRecorder: () => mockRecorder,
	useAudioRecorderState: () => mockRecorderState,
}));

jest.doMock('@/components/ui/box', () => ({ Box: mockView }));
jest.doMock('@/components/ui/heading', () => ({ Heading: mockText }));
jest.doMock('@/components/ui/hstack', () => ({ HStack: mockView }));
jest.doMock('@/components/ui/vstack', () => ({ VStack: mockView }));
jest.doMock('@/components/ui/text', () => ({ Text: mockText }));
jest.doMock('@/components/ui/icon', () => ({ Icon: () => null }));
jest.doMock('@/components/ui/image', () => ({ Image: mockHost('Image') }));
jest.doMock('@/components/ui/switch', () => ({
	Switch: ({ value, onValueChange, accessibilityLabel }: Record<string, any>) => React.createElement('Switch', {
		accessibilityLabel,
		accessible: true,
		accessibilityRole: 'switch',
		accessibilityState: { checked: value },
		value,
		onValueChange,
	}),
}));

jest.doMock('@/components/ui/button', () => ({
	Button: ({ children, isDisabled, disabled, ...props }: Record<string, any>) => React.createElement(mockPressable, {
		...props,
		accessibilityRole: props.accessibilityRole ?? 'button',
		disabled: isDisabled ?? disabled,
	}, children),
	ButtonIcon: () => null,
	ButtonSpinner: mockActivityIndicator,
	ButtonText: mockText,
}));

const mockOverlay = ({ isOpen, children }: Record<string, any>) => isOpen
	? React.createElement('View', null, children)
	: null;
jest.doMock('@/components/ui/modal', () => ({
	Modal: mockOverlay,
	ModalBackdrop: () => null,
	ModalBody: mockView,
	ModalCloseButton: ({ accessibilityLabel, onPress }: Record<string, any>) => React.createElement(mockPressable, {
		accessibilityLabel, accessibilityRole: 'button', onPress,
	}),
	ModalContent: mockView,
	ModalFooter: mockView,
	ModalHeader: mockView,
	ModalTitle: mockText,
}));
jest.doMock('@/components/ui/drawer', () => ({
	Drawer: mockOverlay,
	DrawerBackdrop: () => null,
	DrawerBody: mockView,
	DrawerCloseButton: ({ accessibilityLabel, onPress, children }: Record<string, any>) => React.createElement(mockPressable, {
		accessibilityLabel, accessibilityRole: 'button', onPress,
	}, children),
	DrawerContent: mockView,
	DrawerHeader: mockView,
}));
jest.doMock('@/components/ui/popover', () => ({
	Popover: () => null,
	PopoverBackdrop: () => null,
	PopoverBody: mockView,
	PopoverContent: mockView,
}));
jest.doMock('@/components/ui/input', () => ({
	Input: ({ children, isDisabled, ...props }: Record<string, any>) => React.createElement('View', props,
		React.Children.map(children, child => {
			if (!React.isValidElement(child)) return child;
			const inputField = child as React.ReactElement<Record<string, any>>;
			const disabled = Boolean(isDisabled || inputField.props.disabled);
			return React.cloneElement(inputField, {
				disabled,
				accessibilityState: { disabled },
			});
		})),
	InputField: (props: Record<string, any>) => React.createElement('TextInput', props),
}));

jest.doMock('@/components/uiverse/assistant/assistant-cards', () => ({
	AssistantTextBubble: mockAssistantTextBubble,
	AssistantQuestionCard: ({ message, onAnswer }: Record<string, any>) => React.createElement('View', null,
		React.createElement('Text', null, message.text),
		React.createElement(mockPressable, { accessibilityRole: 'button', accessibilityLabel: 'Responder pergunta', onPress: () => onAnswer('answer', 'Resposta') }),
	),
	AssistantReportCard: ({ report }: Record<string, any>) => React.createElement('Text', null, report.deterministicSummary ?? 'Relatório'),
	AssistantDraftCard: ({ draft, onReview, onConfirm, onCancel }: Record<string, any>) => React.createElement('View', null,
		React.createElement('Text', null, `Ação ${draft.clientActionId}`),
		React.createElement(mockPressable, { accessibilityRole: 'button', accessibilityLabel: `Revisar ${draft.clientActionId}`, onPress: onReview }),
		React.createElement(mockPressable, { accessibilityRole: 'button', accessibilityLabel: `Confirmar ${draft.clientActionId}`, onPress: onConfirm }),
		React.createElement(mockPressable, { accessibilityRole: 'button', accessibilityLabel: `Cancelar ${draft.clientActionId}`, onPress: onCancel }),
	),
}));
jest.doMock('@/components/uiverse/assistant/assistant-activity-trace', () => ({
	AssistantActivityTrace: () => React.createElement('Text', null, 'Processando pedido'),
}));
jest.doMock('@/components/uiverse/navigation/navigator', () => ({ default: () => null, __esModule: true }));

jest.doMock('@/contexts/LumusAssistantContext', () => ({ useLumusAssistant: () => mockAssistant }));
jest.doMock('@/contexts/ValueVisibilityContext', () => ({ useValueVisibility: () => ({ shouldHideValues: mockShouldHideValues }) }));
jest.doMock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ isDarkMode: false }) }));
jest.doMock('@/hooks/useScreenStyle', () => ({
	useScreenStyles: () => ({
		isDarkMode: false,
		cardBackground: '',
		headingText: '',
		heroHeight: 280,
		insets: { top: 0, right: 0, bottom: 0, left: 0 },
		bodyText: '',
		helperText: '',
		warningTextClassName: '',
		assistantAvailableTextClassName: '',
		assistantUnavailableTextClassName: '',
		drawerContentClassName: '',
		infoCardStyle: {},
		modalContentClassName: '',
		switchTrackColor: {},
		switchThumbColor: '',
		switchIosBackgroundColor: '',
	}),
}));
jest.doMock('@/utils/lumusAssistant', () => ({
	ASSISTANT_MAX_INPUT_CHARACTERS: 4_000,
	orderAssistantMessagesForDisplay: (messages: unknown[]) => messages,
}));
jest.doMock('@/utils/lumusAssistantLayout', () => ({
	getLumusAssistantViewportLayout: () => ({ isCompact: false, heroHeight: 280, panelTopMargin: 0 }),
}));
jest.doMock('@/utils/lumusAssistantAudio', () => ({
	deleteAssistantTemporaryAudio: mockDeleteTemporaryAudio,
	readAssistantAudioFile: mockReadAudioFile,
}));
jest.doMock('@/utils/firebaseRuntime', () => ({ isFirebaseEmulatorRuntime: () => false }));

jest.doMock('@mantine/core', () => ({
	MantineProvider: ({ children }: Record<string, any>) => React.createElement(React.Fragment, null, children),
	Textarea: ({ value, onChange, onFocus, onBlur, placeholder, disabled, 'aria-label': ariaLabel }: Record<string, any>) => React.createElement(mockTextInput, {
		accessibilityLabel: ariaLabel,
		value,
		disabled,
		placeholder,
		onFocus,
		onBlur,
		onChangeText: (next: string) => onChange({ currentTarget: { value: next } }),
	}),
}));
jest.doMock('@/components/web/motion/AnimatedContent', () => ({ default: mockView, __esModule: true }));
jest.doMock('@/components/web/visuals/Grainient', () => ({ default: () => null, __esModule: true }));
jest.doMock('@/components/web/visuals/StrokeText', () => ({ default: () => null, __esModule: true }));
// Web consent contains a text-bearing anchor; allow that host tag in the native test renderer.
jest.doMock('test-renderer', () => {
	const actual = jest.requireActual('test-renderer') as typeof import('test-renderer');
	return {
		createRoot: (options: Record<string, any>) => actual.createRoot({
			...options,
			textComponentTypes: [...(options.textComponentTypes ?? []), 'a'],
		}),
	};
});

const testingLibrary = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
const { render, fireEvent, act } = testingLibrary;
const screen = new Proxy({}, { get: (_target, property) => (testingLibrary.screen as any)[property] }) as typeof testingLibrary.screen;
const MobileScreen = require('@/screens/mobile/LumusAssistantScreen').default as React.ComponentType;
const WebScreen = require('@/screens/web/LumusAssistantScreen.web').default as React.ComponentType;

const variants = [
	{
		name: 'mobile',
		Screen: MobileScreen,
		quickPromptsButton: 'Abrir exemplos de perguntas',
		firstPrompt: 'Fui no mercado dois dias seguidos: no dia 18 deste mês gastei 50 reais e no dia 19 gastei 150 reais.',
	},
	{
		name: 'web',
		Screen: WebScreen,
		quickPromptsButton: 'Abrir sugestões de perguntas',
		firstPrompt: 'Como foi o meu mês até agora?',
	},
] as const;

const draftMessage = (actionIds: string[]) => ({
	id: 'draft-group',
	type: 'drafts',
	role: 'assistant',
	actionIds,
	createdAt: '2026-09-26T12:00:00.000Z',
});

const draft = (clientActionId: string, status = 'ready') => ({
	clientActionId,
	status,
	dependsOnActionIds: [],
	kind: 'create_expense',
	payload: {},
});

function resetHarness(overrides: Record<string, any> = {}) {
	mockScrollToEnd.mockClear();
	mockShouldHideValues = false;
	mockRecorderState = { isRecording: false, mediaServicesDidReset: false, durationMillis: 0, url: null };
	mockRecorder = {
		isRecording: false,
		uri: null,
		prepareToRecordAsync: jest.fn(async () => undefined),
		record: jest.fn(),
		stop: jest.fn(async () => undefined),
	};
	mockRequestRecordingPermissions.mockReset().mockResolvedValue({ granted: false });
	mockSetAudioMode.mockClear();
	mockReadAudioFile.mockReset().mockResolvedValue({ base64: 'encoded-audio', mimeType: 'audio/mp4' });
	mockDeleteTemporaryAudio.mockClear();
	mockAssistantTextBubble.mockClear();
	mockAssistant = createAssistant(overrides);
}

if (typeof global.requestAnimationFrame !== 'function') {
	global.requestAnimationFrame = callback => setTimeout(callback, 0) as unknown as number;
	global.cancelAnimationFrame = frame => clearTimeout(frame as unknown as NodeJS.Timeout);
}

describe.each(variants)('$name Lumus Assistant screen', ({ Screen, quickPromptsButton, firstPrompt }) => {
	beforeEach(() => resetHarness());

	it('keeps the chat unavailable while the screen is bootstrapping', async () => {
		mockAssistant.isBootstrapping = true;
		mockAssistant.consentGranted = false;

		await render(React.createElement(Screen));

		expect(screen.getByText('Preparando o Lumus IA')).toBeOnTheScreen();
		expect(screen.queryByLabelText('Mensagem para o Lumus IA')).toBeNull();
	});

	it('requires consent and disables the accept action while saving it', async () => {
		let resolveConsent!: () => void;
		mockAssistant.consentGranted = false;
		mockAssistant.grantConsent = jest.fn(() => new Promise<void>(resolve => { resolveConsent = resolve; }));

		await render(React.createElement(Screen));
		expect(screen.getByText('Antes da primeira conversa')).toBeOnTheScreen();
		await fireEvent.press(screen.getByRole('button', { name: 'Aceitar e começar' }));

		expect(mockAssistant.grantConsent).toHaveBeenCalledTimes(1);
		expect(screen.getByRole('button')).toBeDisabled();
		await act(async () => resolveConsent());
		expect(screen.getByRole('button')).toBeEnabled();
	});

	it('trims typed text and never executes an action from a textual confirmation', async () => {
		await render(React.createElement(Screen));
		const input = screen.getByLabelText('Mensagem para o Lumus IA');

		await fireEvent.changeText(input, '   Sim, confirmo   ');
		await fireEvent.press(screen.getByLabelText('Enviar mensagem'));

		expect(mockAssistant.sendMessage).toHaveBeenCalledWith('Sim, confirmo');
		expect(mockAssistant.executeDraft).not.toHaveBeenCalled();
		expect(screen.getByLabelText('Mensagem para o Lumus IA').props.value).toBe('');
	});

	it('keeps blank submissions disabled', async () => {
		await render(React.createElement(Screen));

		expect(screen.getByLabelText('Enviar mensagem')).toBeDisabled();
		await fireEvent.press(screen.getByLabelText('Enviar mensagem'));
		expect(mockAssistant.sendMessage).not.toHaveBeenCalled();
	});

	it('resumes following replies when sending after reading older messages', async () => {
		await render(React.createElement(Screen));
		const conversation = screen.getByTestId('conversation-scroll');
		mockScrollToEnd.mockClear();
		await fireEvent(conversation, 'scroll', { nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 200 } } });
		await fireEvent(conversation, 'contentSizeChange', 390, 1100);
		expect(mockScrollToEnd).not.toHaveBeenCalled();
		await fireEvent.changeText(screen.getByLabelText('Mensagem para o Lumus IA'), 'Qual meu saldo?');
		await fireEvent.press(screen.getByLabelText('Enviar mensagem'));
		await fireEvent(conversation, 'contentSizeChange', 390, 1200);
		expect(mockScrollToEnd).toHaveBeenCalledWith({ animated: false });
	});

	it('shows an unavailable message and retries only when requested', async () => {
		mockAssistant.availability = { available: false, reason: 'App Check indisponível' };
		await render(React.createElement(Screen));

		expect(screen.getByText('App Check indisponível')).toBeOnTheScreen();
		expect(screen.getByLabelText('Mensagem para o Lumus IA')).toBeEnabled();
		expect(screen.getByRole('button', { name: /Tentar verificar|Tentar novamente/ })).toBeEnabled();
		await fireEvent.press(screen.getByRole('button', { name: /Tentar verificar|Tentar novamente/ }));

		expect(mockAssistant.refreshAvailability).toHaveBeenCalledTimes(1);
		expect(mockAssistant.sendMessage).not.toHaveBeenCalled();
	});

	it('keeps the composer available and shows progress while a request is in flight', async () => {
		mockAssistant.isSending = true;
		mockAssistant.sendingProgress = { active: 'prepare_actions', completed: ['loading_data'] };
		await render(React.createElement(Screen));

		expect(screen.getByText('Processando pedido')).toBeOnTheScreen();
		expect(screen.getByLabelText('Mensagem para o Lumus IA')).toBeEnabled();
		expect(screen.getByLabelText('Enviar mensagem')).toBeDisabled();
	});

	it('closes quick prompts and sends the selected prompt through the composer flow', async () => {
		await render(React.createElement(Screen));
		await fireEvent.press(screen.getByRole('button', { name: quickPromptsButton }));
		expect(screen.getByRole('button', { name: firstPrompt })).toBeOnTheScreen();

		await fireEvent.press(screen.getByRole('button', { name: firstPrompt }));

		expect(mockAssistant.sendMessage).toHaveBeenCalledWith(firstPrompt);
		expect(screen.queryByRole('button', { name: firstPrompt })).toBeNull();
	});

	it('accepts cancellation and confirmation through the composer while requests are pending', async () => {
		mockAssistant.drafts = [draft('expense-a'), draft('expense-b')];
		await render(React.createElement(Screen));
		expect(screen.getByLabelText('Mensagem para o Lumus IA')).toBeEnabled();
		expect(screen.getByLabelText('Gravar mensagem de voz')).toBeEnabled();
		expect(screen.queryByRole('button', { name: 'Confirmar expense-a' })).toBeNull();
		await fireEvent.changeText(screen.getByLabelText('Mensagem para o Lumus IA'), 'cancela');
		await fireEvent.press(screen.getByLabelText('Enviar mensagem'));
		expect(mockAssistant.sendMessage).toHaveBeenCalledWith('cancela');
	});

	it('passes hidden-value preference to rendered assistant messages', async () => {
		mockShouldHideValues = true;
		mockAssistant.messages = [{
			id: 'answer-1', type: 'text', role: 'assistant', text: 'Seu saldo é R$ 120,00', createdAt: '2026-09-26T12:00:00.000Z',
		}];
		await render(React.createElement(Screen));

		expect(mockAssistantTextBubble.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
			message: expect.objectContaining({ id: 'answer-1' }),
			hideValues: true,
		}));
	});

	it('renders sent prompt messages using the contrast token for the accent bubble', async () => {
		mockAssistant.messages = [{
			id: 'user-message-1', type: 'text', role: 'user', text: firstPrompt, createdAt: '2026-09-26T12:00:00.000Z',
		}];
		await render(React.createElement(Screen));

		const message = screen.getByText(firstPrompt);
		expect(message.props.className).toContain('text-lumus-on-accent');
	});

	it('routes question answers locally and renders deterministic reports', async () => {
		mockAssistant.messages = [
			{
				id: 'question-1', type: 'text', role: 'assistant', text: 'Qual nome?',
				field: { key: 'name', label: 'Nome', kind: 'text', question: 'Qual nome?' },
				targetActionIds: ['expense-1'], createdAt: '2026-09-26T12:00:00.000Z',
			},
			{
				id: 'report-1', type: 'report', role: 'assistant',
				report: { deterministicSummary: 'Resumo calculado pelo aplicativo.' }, createdAt: '2026-09-26T12:01:00.000Z',
			},
		];
		await render(React.createElement(Screen));

		expect(screen.getByText('Qual nome?')).toBeOnTheScreen();
		expect(screen.getByText('Resumo calculado pelo aplicativo.')).toBeOnTheScreen();
		await fireEvent.changeText(screen.getByLabelText('Mensagem para o Lumus IA'), 'Mercado');
		await fireEvent.press(screen.getByLabelText('Enviar mensagem'));

		expect(mockAssistant.sendMessage).toHaveBeenCalledWith('Mercado');
	});

	it('keeps typed input available when microphone permission is denied', async () => {
		await render(React.createElement(Screen));
		await fireEvent.press(screen.getByLabelText('Gravar mensagem de voz'));

		expect(screen.getByText(/Permita o microfone/)).toBeOnTheScreen();
		expect(screen.getByLabelText('Mensagem para o Lumus IA')).toBeEnabled();
		expect(mockAssistant.transcribeAudio).not.toHaveBeenCalled();
		expect(mockAssistant.sendMessage).not.toHaveBeenCalled();
	});

	it('starts voice capture only after permission and without background recording', async () => {
		mockRequestRecordingPermissions.mockResolvedValue({ granted: true });
		await render(React.createElement(Screen));

		await fireEvent.press(screen.getByLabelText('Gravar mensagem de voz'));

		expect(mockRequestRecordingPermissions).toHaveBeenCalledTimes(1);
		expect(mockSetAudioMode).toHaveBeenCalledWith({ allowsRecording: true, allowsBackgroundRecording: false });
		expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
		expect(mockRecorder.record).toHaveBeenCalledTimes(1);
		expect(mockAssistant.sendMessage).not.toHaveBeenCalled();
	});

	it('shows a transcription in the composer for review without sending it', async () => {
		mockRecorderState = { isRecording: true, mediaServicesDidReset: false, durationMillis: 2_500, url: null };
		mockRecorder.uri = 'file:///temporary-audio.m4a';
		mockAssistant.transcribeAudio = jest.fn(async () => 'Gastei R$ 50 no mercado');
		await render(React.createElement(Screen));

		await fireEvent.press(screen.getByLabelText('Parar gravação'));

		expect(mockAssistant.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 2_500 }));
		expect(screen.getByLabelText('Mensagem para o Lumus IA').props.value).toBe('Gastei R$ 50 no mercado');
		expect(mockDeleteTemporaryAudio).toHaveBeenCalledWith('file:///temporary-audio.m4a');
		expect(mockAssistant.sendMessage).not.toHaveBeenCalled();
	});

	it('updates the local-reading preference from assistant settings', async () => {
		await render(React.createElement(Screen));
		await fireEvent.press(screen.getByRole('button', { name: 'Abrir configurações do assistente' }));

		await fireEvent(screen.getByRole('switch', { name: 'Ler respostas automaticamente' }), 'valueChange', true);

		expect(mockAssistant.setAutoReadEnabled).toHaveBeenCalledWith(true);
	});

	it('clears the in-memory conversation only when the clear control is pressed', async () => {
		await render(React.createElement(Screen));

		await fireEvent.press(screen.getByRole('button', { name: 'Limpar conversa' }));

		expect(mockAssistant.clearConversation).toHaveBeenCalledTimes(1);
		expect(mockAssistant.revokeConsent).not.toHaveBeenCalled();
	});
});

describe('platform-specific consent revocation', () => {
	beforeEach(() => resetHarness());

	it('revokes consent directly from native preferences', async () => {
		await render(React.createElement(MobileScreen));
		await fireEvent.press(screen.getByRole('button', { name: 'Abrir configurações do assistente' }));
		await fireEvent.press(screen.getByRole('button', { name: 'Revogar consentimento e limpar conversa' }));

		expect(mockAssistant.revokeConsent).toHaveBeenCalledTimes(1);
	});

	it('requires a second confirmation before revoking consent on Web', async () => {
		await render(React.createElement(WebScreen));
		await fireEvent.press(screen.getByRole('button', { name: 'Abrir configurações do assistente' }));
		await fireEvent.press(screen.getByRole('button', { name: 'Revogar consentimento e limpar conversa' }));

		expect(screen.getByText('Revogar consentimento?')).toBeOnTheScreen();
		expect(mockAssistant.revokeConsent).not.toHaveBeenCalled();
		await fireEvent.press(screen.getByRole('button', { name: 'Revogar e limpar' }));

		expect(mockAssistant.revokeConsent).toHaveBeenCalledTimes(1);
	});
});
