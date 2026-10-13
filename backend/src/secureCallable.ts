import { defineBoolean } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

// [[Remediação da Auditoria de Segurança]]: ligar em homologação antes de produção.
const enforceAppCheck = defineBoolean('LUMUS_ENFORCE_APP_CHECK', { default: false });

export function assertCallableAppCheck(request: Pick<CallableRequest, 'app'>, enforce: boolean) {
  if (enforce && !request.app) {
    throw new HttpsError('unauthenticated', 'A integridade do aplicativo não pôde ser validada.');
  }
}

export function secureOnCall<T = any, Return = any>(handler: (request: CallableRequest<T>) => Return) {
  // O SDK verifica a assinatura antes de preencher request.app. O parâmetro é
  // avaliado por requisição, permitindo a implantação gradual sem ler params no deploy.
  return onCall<T, Return>({ region: 'southamerica-east1' }, request => {
    assertCallableAppCheck(request, enforceAppCheck.value());
    return handler(request);
  });
}
