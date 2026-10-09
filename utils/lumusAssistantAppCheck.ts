type AppCheckTokenProvider = {
	getToken(): Promise<unknown>;
};

/** Returns whether App Check can issue a token without exposing it to UI state. */
export const canObtainAssistantAppCheckToken = async (
	appCheck: AppCheckTokenProvider,
	onFailure?: (error: unknown) => void,
) => {
	try {
		const result = await appCheck.getToken();
		const token = typeof result === 'string'
			? result
			: result && typeof result === 'object' && 'token' in result
				? result.token
				: undefined;
		if (typeof token === 'string' && token.trim().length > 0) return true;
		onFailure?.(new Error('App Check retornou um token vazio ou em formato inválido.'));
		return false;
	} catch (error) {
		onFailure?.(error);
		return false;
	}
};

export const getAssistantAppCheckErrorCode = (error: unknown) => {
	if (!error || typeof error !== 'object') return null;
	if ('code' in error && typeof error.code === 'string' && error.code.trim()) return error.code.trim();
	if ('name' in error && typeof error.name === 'string' && error.name.trim()) return error.name.trim();
	return null;
};
