import { nativeAppCheckToken } from '@/utils/firebaseAppCheckToken';

const token = (payload: unknown) => `header.${btoa(JSON.stringify(payload)).replace(/=/g, '')}.signature`;
describe('native App Check cache bridge', () => {
  it('uses the native token expiration instead of extending its life', () => {
    const jwt = token({ exp: 120 });
    expect(nativeAppCheckToken(jwt, 100_000)).toEqual({ token: jwt, expireTimeMillis: 120_000 });
  });
  it.each([token({ exp: 100 }), token({}), token({ exp: '120' }), 'malformed'])('rejects expired or invalid tokens', jwt => {
    expect(() => nativeAppCheckToken(jwt, 100_000)).toThrow('inválido ou expirado');
  });
});
