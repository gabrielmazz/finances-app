type AppCheckTokenProvider = {
	getToken(): Promise<{ token?: unknown }>;
};

/** Returns whether App Check can issue a token without exposing it to UI state. */
export const canObtainAssistantAppCheckToken = async (appCheck: AppCheckTokenProvider) => {
	try {
		const result = await appCheck.getToken();
		return typeof result.token === 'string' && result.token.trim().length > 0;
	} catch {
		return false;
	}
};
