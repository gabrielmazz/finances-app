---
tags: [seguranca, autenticacao, throttle, storage]
relacionado: [[Autenticação]], [[Firebase Config]]
status: ativo
tipo: feature
versao: 1.0.0
---

# Segurança de Login

Implementa proteção contra força bruta no login via throttling com backoff exponencial e armazenamento seguro de credenciais de sessão.

## Como funciona

### Throttling de Tentativas
1. Cada tentativa de login falha é contabilizada com timestamp
2. Backoff escalonado por número de falhas consecutivas:
   - 1 falha → 30s de bloqueio
   - 2 falhas → 60s
   - 3 falhas → 120s
   - 4 falhas → 300s
   - 5+ falhas → 900s (15 min)
3. Se ainda em cooldown, login é bloqueado antes de chamar Firebase
4. Após login bem-sucedido, contador de falhas é zerado

### Armazenamento Seguro
- Credenciais de sessão Firebase persistidas preferencialmente via `expo-secure-store`
- Fallback automático para `AsyncStorage` em caso de indisponibilidade do SecureStore
- Migração automática de dados do AsyncStorage para SecureStore quando SecureStore fica disponível

## Arquivos principais

- `utils/loginSecurity.ts` — Lógica de throttle e contagem de falhas
- `utils/firebaseAuthStorage.ts` — Persistência dual SecureStore/AsyncStorage
- `screens/LoginScreen.tsx` — Aplica throttle antes de cada tentativa

## Integrações

- [[Autenticação]] — `LoginScreen` chama funções de `loginSecurity.ts` antes de autenticar
- [[Firebase Config]] — `firebaseAuthStorage` configura a persistência do Firebase Auth

## Configuração

- Sem variáveis de ambiente — lógica 100% local
- `expo-secure-store` listado em `app.json` plugins

## Observações importantes

- Email é normalizado (trim + lowercase) antes de qualquer verificação
- Senha tem limite de 128 caracteres para prevenir ataques de payload longo
- O estado de throttle é mantido em memória — reiniciar o app reseta o contador
- SecureStore não está disponível em todos os dispositivos Android — o fallback é necessário
