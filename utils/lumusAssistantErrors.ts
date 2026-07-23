export type AssistantFriendlyErrorCode =
	| 'network'
	| 'app-check'
	| 'authentication'
	| 'quota'
	| 'unavailable'
	| 'invalid-response'
	| 'busy'
	| 'disabled'
	| 'unsupported'
	| 'permission'
	| 'unknown';

export class AssistantFriendlyError extends Error {
	readonly code: AssistantFriendlyErrorCode;
	retryable: boolean;

	constructor(code: AssistantFriendlyErrorCode, message: string, retryable = false) {
		super(message);
		this.name = 'AssistantFriendlyError';
		this.code = code;
		this.retryable = retryable;
	}
}

const getErrorText = (error: unknown) => {
	if (error instanceof Error) {
		return `${error.name} ${error.message}`.toLocaleLowerCase('pt-BR');
	}
	if (typeof error === 'string') {
		return error.toLocaleLowerCase('pt-BR');
	}
	if (error && typeof error === 'object') {
		const record = error as Record<string, unknown>;
		return `${String(record.code ?? '')} ${String(record.message ?? '')}`.toLocaleLowerCase('pt-BR');
	}
	return '';
};

export const mapAssistantError = (error: unknown): AssistantFriendlyError => {
	if (error instanceof AssistantFriendlyError) {
		return error;
	}
	const text = getErrorText(error);

	if (text.includes('assistantedisablederror')) {
		return new AssistantFriendlyError('disabled', 'O Lumus IA está temporariamente desativado. O restante do aplicativo continua disponível.');
	}
	if (text.includes('assistantbusyerror')) {
		return new AssistantFriendlyError('busy', 'Ainda estou concluindo a resposta anterior. Aguarde um instante.', true);
	}
	if (text.includes('assistantratelimiterror') || text.includes('429') || text.includes('resource_exhausted') || text.includes('quota')) {
		return new AssistantFriendlyError('quota', 'O limite gratuito do assistente foi atingido por enquanto. Seus outros recursos continuam funcionando.', true);
	}
	if (text.includes('503') || text.includes('unavailable') || text.includes('overloaded')) {
		return new AssistantFriendlyError('unavailable', 'O assistente está indisponível neste momento. Tente novamente mais tarde.', true);
	}
	if (text.includes('app-check') || text.includes('appcheck') || text.includes('recaptcha') || text.includes('play integrity')) {
		return new AssistantFriendlyError('app-check', 'Não foi possível validar este aplicativo com o Firebase App Check.', true);
	}
	if (text.includes('auth') || text.includes('id-token') || text.includes('login') || text.includes('unauthenticated') || text.includes('401')) {
		return new AssistantFriendlyError('authentication', 'Sua sessão precisa ser renovada. Entre novamente para usar o Lumus IA.');
	}
	if (text.includes('network') || text.includes('fetch') || text.includes('offline') || text.includes('internet')) {
		return new AssistantFriendlyError('network', 'Sem conexão com o assistente. Confira sua internet e tente novamente.', true);
	}
	if (text.includes('permission') || text.includes('microphone') || text.includes('microfone')) {
		return new AssistantFriendlyError('permission', 'O acesso ao microfone não foi permitido. Você ainda pode digitar a mensagem.');
	}
	if (text.includes('unsupported') || text.includes('não suportad') || text.includes('nao suportad')) {
		return new AssistantFriendlyError('unsupported', 'O Lumus IA ainda não está disponível nesta plataforma.');
	}
	if (text.includes('json') || text.includes('response') || text.includes('resposta inválida') || text.includes('resposta invalida')) {
		return new AssistantFriendlyError('invalid-response', 'A resposta da IA não pôde ser validada. Nenhum dado foi gravado.', true);
	}

	return new AssistantFriendlyError('unknown', 'Não foi possível concluir agora. Nenhum dado foi gravado.', true);
};
