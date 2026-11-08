import { showFeatureUnavailable } from '@/components/app/feature-unavailable';
import type {
	AssistantAiAvailability,
	AssistantAiConfig,
	AssistantDraftAction,
	AssistantMessage,
	AssistantResolvedCatalog,
	AssistantSendProgress,
} from '@/types/lumusAssistant';
import { FEATURE_UNAVAILABLE_MESSAGE, unavailableAction } from '@/utils/availability';
type AssistantViewState = {
	messages: AssistantMessage[];
	drafts: AssistantDraftAction[];
	catalog: AssistantResolvedCatalog;
	availability: AssistantAiAvailability | null;
	config: AssistantAiConfig | null;
	isBootstrapping: boolean;
	initializationError: string | null;
	consentError: string | null;
	retryInitialization(): void;
	isRefreshingAvailability: boolean;
	isSending: boolean;
	sendingProgress: AssistantSendProgress | null;
	consentGranted: boolean;
	autoReadEnabled: boolean;
	speakingMessageId: string | null;
	revocationEpoch: number;
	grantConsent(): Promise<void>;
	revokeConsent(): Promise<void>;
	refreshAvailability(): Promise<void>;
	setAutoReadEnabled(value: boolean): void;
	sendMessage(text: string): Promise<void>;
	transcribeAudio(input: { base64Audio: string; mimeType: string; durationMs: number }): Promise<string>;
	retryNotification(actionId: string): Promise<void>;
	clearConversation(): void;
	speak(messageId: string, text: string): Promise<void>;
	stopSpeaking(): Promise<void>;
};

const unavailable = async () => {
	showFeatureUnavailable();
};
const state: AssistantViewState = {
	messages: [],
	drafts: [],
	catalog: {},
	availability: {
		available: false,
		platform: 'unsupported',
		appCheckConfigured: false,
		remoteConfigLoaded: false,
		model: '',
		reason: FEATURE_UNAVAILABLE_MESSAGE,
	},
	config: null,
	isBootstrapping: false,
	initializationError: null,
	consentError: FEATURE_UNAVAILABLE_MESSAGE,
	retryInitialization: showFeatureUnavailable,
	isRefreshingAvailability: false,
	isSending: false,
	sendingProgress: null,
	consentGranted: false,
	autoReadEnabled: false,
	speakingMessageId: null,
	revocationEpoch: 0,
	grantConsent: unavailable,
	revokeConsent: unavailable,
	refreshAvailability: unavailable,
	setAutoReadEnabled: showFeatureUnavailable,
	sendMessage: unavailable,
	transcribeAudio: async () => unavailableAction(),
	retryNotification: unavailable,
	clearConversation: () => {},
	speak: unavailable,
	stopSpeaking: async () => {},
};
export function useAssistantAvailability() {
	return state;
}
