export function nativeAppCheckToken(token: string, now = Date.now()) {
  try {
    const segment = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '='))) as { exp?: unknown };
    const expireTimeMillis = typeof payload.exp === 'number' ? payload.exp * 1000 : NaN;
    if (!Number.isSafeInteger(expireTimeMillis) || expireTimeMillis <= now) throw new Error();
    // A decodificação só informa o cache do SDK; a assinatura é verificada no servidor.
    return { token, expireTimeMillis };
  } catch {
    throw new Error('Token nativo do App Check inválido ou expirado.');
  }
}
