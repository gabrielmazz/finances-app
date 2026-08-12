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
	| 'configuration'
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

type AssistantErrorDetails = {
	code: string;
	status?: number;
	text: string;
};

const toLowerCaseText = (value: unknown) => String(value ?? '').toLocaleLowerCase('pt-BR');

const stringifyErrorDetail = (detail: unknown) => {
	try {
		return JSON.stringify(detail) ?? String(detail);
	} catch {
		return String(detail);
	}
};

const getErrorDetails = (error: unknown): AssistantErrorDetails => {
	if (typeof error === 'string') {
		return { code: '', text: toLowerCaseText(error) };
	}
	if (!error || typeof error !== 'object') {
		return { code: '', text: '' };
	}

	const record = error as Record<string, unknown>;
	const customErrorData = record.customErrorData && typeof record.customErrorData === 'object'
		? record.customErrorData as Record<string, unknown>
		: {};
	const errorDetails = Array.isArray(customErrorData.errorDetails)
		? customErrorData.errorDetails.map(stringifyErrorDetail).join(' ')
		: '';
	const statusValue = customErrorData.status ?? record.status ?? record.statusCode;
	const status = typeof statusValue === 'number'
		? statusValue
		: typeof statusValue === 'string' && /^\d{3}$/.test(statusValue) ? Number(statusValue) : undefined;

	return {
		code: toLowerCaseText(record.code),
		status,
		text: [
			error instanceof Error ? error.name : '',
			record.code,
			record.message,
			customErrorData.statusText,
			errorDetails,
		].map(toLowerCaseText).join(' '),
	};
};

const AUTHENTICATION_ERROR_CODES = new Set([
	'auth/user-token-expired',
	'auth/invalid-user-token',
	'auth/id-token-expired',
	'auth/invalid-id-token',
	'auth/credential-expired',
	'auth/user-disabled',
	'auth/user-not-found',
]);

const CONFIGURATION_ERROR_CODES = new Set([
	'ai/api-not-enabled',
	'api-not-enabled',
	'ai/no-api-key',
	'no-api-key',
	'ai/no-app-id',
	'no-app-id',
	'ai/no-project-id',
	'no-project-id',
]);

const isExplicitAuthenticationFailure = ({ code, text }: AssistantErrorDetails) =>
	AUTHENTICATION_ERROR_CODES.has(code)
	|| /auth\/(user-token-expired|invalid-user-token|id-token-expired|invalid-id-token|credential-expired|user-disabled|user-not-found)/.test(text);

export const mapAssistantError = (error: unknown): AssistantFriendlyError => {
	if (error instanceof AssistantFriendlyError) {
		return error;
	}
	const details = getErrorDetails(error);
	const { code, status, text } = details;

	if (text.includes('assistantedisablederror')) {
		return new AssistantFriendlyError('disabled', 'O Lumus IA está temporariamente desativado. O restante do aplicativo continua disponível.');
	}
	if (text.includes('assistantbusyerror')) {
		return new AssistantFriendlyError('busy', 'Ainda estou concluindo a resposta anterior. Aguarde um instante.', true);
	}
	if (text.includes('assistantauthenticationerror')) {
		return new AssistantFriendlyError('authentication', 'Sua sessão precisa ser renovada. Entre novamente para usar o Lumus IA.');
	}
	if (text.includes('assistantratelimiterror') || text.includes('429') || text.includes('resource_exhausted') || text.includes('quota')) {
		return new AssistantFriendlyError('quota', 'O limite gratuito do assistente foi atingido por enquanto. Seus outros recursos continuam funcionando.', true);
	}
	if (text.includes('503') || text.includes('unavailable') || text.includes('overloaded')) {
		return new AssistantFriendlyError('unavailable', 'O assistente está indisponível neste momento. Tente novamente mais tarde.', true);
	}
	if (
		text.includes('app-check')
		|| text.includes('appcheck')
		|| text.includes('recaptcha')
		|| text.includes('play integrity')
		|| text.includes('attestation')
		|| text.includes('app check token')
	) {
		return new AssistantFriendlyError('app-check', 'Não foi possível validar a integridade deste aplicativo com o Firebase App Check.', true);
	}
	if (isExplicitAuthenticationFailure(details)) {
		return new AssistantFriendlyError('authentication', 'Sua sessão precisa ser renovada. Entre novamente para usar o Lumus IA.');
	}
	if (
		CONFIGURATION_ERROR_CODES.has(code)
		|| text.includes('api key')
		|| text.includes('service_disabled')
		|| status === 401
		|| status === 403
	) {
		return new AssistantFriendlyError(
			'configuration',
			'O Lumus IA não pôde ser autorizado. Verifique a configuração do Firebase e do App Check; sua sessão do aplicativo continua ativa.',
			true,
		);
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
