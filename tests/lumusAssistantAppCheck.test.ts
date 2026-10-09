import { canObtainAssistantAppCheckToken } from '@/utils/lumusAssistantAppCheck';

describe('Lumus Assistant App Check preflight', () => {
	it('accepts a provider that can issue a token', async () => {
		const getToken = jest.fn(async () => ({ token: 'not-rendered' }));

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(true);
		expect(getToken).toHaveBeenCalledTimes(1);
	});

	it('accepts a provider that returns the token string directly', async () => {
		const getToken = jest.fn(async () => 'not-rendered');

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(true);
	});

	it('keeps the assistant unavailable when token issuance fails', async () => {
		const getToken = jest.fn(async () => {
			throw Object.assign(new Error('token rejected'), { code: 'appCheck/recaptcha-error' });
		});
		const onFailure = jest.fn();

		await expect(canObtainAssistantAppCheckToken({ getToken }, onFailure)).resolves.toBe(false);
		expect(getToken).toHaveBeenCalledTimes(1);
		expect(onFailure.mock.calls[0][0]).toMatchObject({ code: 'appCheck/recaptcha-error' });
	});

	it.each([{ token: '' }, {}, { token: 42 }])('rejects an invalid token response: %p', async result => {
		const getToken = jest.fn(async () => result);

		await expect(canObtainAssistantAppCheckToken({ getToken })).resolves.toBe(false);
	});
});
