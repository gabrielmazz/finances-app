import { defineBoolean } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { AUTH_SESSION_MAX_AGE_MS } from '../../utils/authSessionPolicy';

// [[Remediação da Auditoria de Segurança]]: ligar em homologação antes de produção.
const enforceAppCheck = defineBoolean('LUMUS_ENFORCE_APP_CHECK', { default: false });

export function assertCallableAppCheck(request: Pick<CallableRequest, 'app'>, enforce: boolean) {
  if (enforce && !request.app) {
    throw new HttpsError('unauthenticated', 'A integridade do aplicativo não pôde ser validada.');
  }
}

export function assertCallableSession(request: Pick<CallableRequest, 'auth'>, now = Date.now()) {
  const authTime = request.auth?.token.auth_time;
  if (typeof authTime !== 'number' || !Number.isInteger(authTime) || authTime <= 0 ||
      authTime * 1000 > now || now - authTime * 1000 >= AUTH_SESSION_MAX_AGE_MS) {
    throw new HttpsError('unauthenticated', 'Sua sessão expirou. Entre novamente com email e senha.');
  }
}

export function secureOnCall<T = any, Return = any>(handler: (request: CallableRequest<T>) => Return) {
  // O SDK verifica a assinatura antes de preencher request.app. O parâmetro é
  // avaliado por requisição, permitindo a implantação gradual sem ler params no deploy.
  return onCall<T, Return>({ region: 'southamerica-east1' }, request => {
    assertCallableAppCheck(request, enforceAppCheck.value());
    assertCallableSession(request);
    return handler(request);
  });
}
