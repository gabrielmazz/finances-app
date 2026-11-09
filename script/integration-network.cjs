// Load before Firebase SDKs so tests reject accidental external fetches.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
	const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
	if (
		url.protocol !== 'http:' ||
		!['127.0.0.1', 'localhost'].includes(url.hostname) ||
		!['8089', '9098', '4402'].includes(url.port)
	) throw Error('Integration tests may contact only local Firebase emulators');
	return originalFetch(input, options);
};
