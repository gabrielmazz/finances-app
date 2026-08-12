const TERMINAL_FIREBASE_SESSION_ERROR_CODES = new Set([
	'auth/user-token-expired',
	'auth/invalid-user-token',
	'auth/id-token-expired',
	'auth/invalid-id-token',
	'auth/credential-expired',
	'auth/user-disabled',
	'auth/user-not-found',
]);

/**
 * Erros de rede não encerram uma sessão válida. Esta lista é reservada para
 * respostas definitivas do Firebase Auth, nas quais manter o usuário em memória
 * permitiria repetir uma chamada AI com credenciais inválidas.
 */
export const isTerminalFirebaseSessionError = (error: unknown) => {
	if (!error || typeof error !== 'object' || !('code' in error)) return false;
	const code = String((error as { code?: unknown }).code ?? '').toLocaleLowerCase('pt-BR');
	return TERMINAL_FIREBASE_SESSION_ERROR_CODES.has(code);
};
