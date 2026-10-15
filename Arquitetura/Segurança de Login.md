---
tags: [seguranca, autenticacao, throttle, storage]
relacionado: [[Autenticação]], [[Firebase Config]]
status: ativo
tipo: feature
versao: 1.1.0
---

# Segurança de Login

Implementa proteção contra força bruta no login via throttling com backoff exponencial e armazenamento seguro de credenciais de sessão.

## Como funciona

### Throttling de Tentativas
1. Cada tentativa de login falha é contabilizada com timestamp
2. Backoff escalonado por número de falhas consecutivas:
   - 1 a 4 falhas → sem cooldown local
   - 5 falhas → 30s de bloqueio
   - 6 falhas → 60s
   - 7 falhas → 120s
   - 8 falhas → 300s
   - 9+ falhas → 900s (15 min)
3. Se ainda em cooldown, login é bloqueado antes de chamar Firebase
4. Após login bem-sucedido, contador de falhas é zerado

### Armazenamento Seguro
- O Auth secundário de cadastro no Android/iOS usa preferencialmente `expo-secure-store` para credenciais temporárias
- Há fallback automático para `AsyncStorage` em caso de indisponibilidade do SecureStore; o Auth primário nativo usa somente memória e o primário Web usa persistência local entre abas, conforme [[Firebase Config]]
- Migração automática de dados do AsyncStorage para SecureStore quando SecureStore fica disponível

## Arquivos principais

- `utils/loginSecurity.ts` — Lógica de throttle e contagem de falhas
- `utils/firebaseAuthStorage.ts` — Persistência dual SecureStore/AsyncStorage
- `screens/mobile/LoginScreen.tsx` — Aplica throttle antes de cada tentativa

## Integrações

- [[Autenticação]] — `LoginScreen` chama funções de `loginSecurity.ts` antes de autenticar
- [[Firebase Config]] — `firebaseAuthStorage` configura a persistência do Firebase Auth

## Configuração

- Sem variáveis de ambiente — lógica 100% local
- `expo-secure-store` listado em `app.json` plugins

## Observações importantes

- Email é normalizado (trim + lowercase) antes de qualquer verificação
- Senha tem limite de 128 caracteres para prevenir ataques de payload longo
- O estado de throttle é persistido no AsyncStorage por email normalizado, com descarte de entradas após 30 dias; reiniciar o app não zera o contador. Esse controle local não substitui os limites do Firebase
- SecureStore não está disponível em todos os dispositivos Android — o fallback é necessário

## Expiração da sessão

Conforme [[Autenticação]], o app exige novo login após **15 minutos sem atividade ou 8 horas desde o login**, o que ocorrer primeiro. `auth_time` do Firebase define o limite absoluto; renovar token não é autenticar novamente. Antes de liberar dados, o provider valida os prazos e reconsulta o Firebase. Erros definitivos, inclusive conta desabilitada ou token revogado, bloqueiam a sessão; rede instável nunca renova seu prazo.

`utils/authSessionPolicy.ts` é compartilhado com `backend/src/secureCallable.ts`; `firestore.rules` espelha o teto de oito horas no servidor usando `request.time`. Mudanças de prazo exigem atualizar ambos e os testes. A inatividade é aplicada no cliente, com atividade compartilhada entre abas da mesma origem, sem guardar senha nem novos tokens.

Falhas de limpeza na saída automática não mantêm sessão expirada aberta. Não há confirmação de saída automática. A confirmação manual de **Sair** continua com seu fluxo próprio e rollback em caso de falha. A proteção de servidor entra em vigor somente após publicar Functions e Rules; clientes antigos deverão entrar novamente quando o login exceder oito horas.

Referências: [Sessões do Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions) e [persistência do Auth Web](https://firebase.google.com/docs/auth/web/auth-state-persistence).
