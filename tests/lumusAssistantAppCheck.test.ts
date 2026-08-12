import { canObtainAssistantAppCheckToken } from '@/utils/lumusAssistantAppCheck';

describe('Lumus Assistant App Check preflight', () => {
	it('accepts a provider that can issue a token', async () => {
		const getToken = jest.fn(async () => ({ token: 'not-rendered' }));

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(true);
		expect(getToken).toHaveBeenCalledTimes(1);
	});

	it('keeps the assistant unavailable when token issuance fails', async () => {
		const getToken = jest.fn(async () => {
			throw new Error('token rejected');
		});

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(false);
		expect(getToken).toHaveBeenCalledTimes(1);
	});

	it.each([{ token: '' }, {}, { token: 42 }])('rejects an invalid token response: %p', async result => {
		const getToken = jest.fn(async () => result);

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(false);
	});
});
