---
tags: [autenticacao, firebase, seguranca, contexto]
relacionado: [[Segurança de Login]], [[Navegação]], [[Gerenciamento de Usuários]], [[Firebase Config]]
status: ativo
tipo: feature
versao: 1.4.0
---

# Autenticação

Gerencia o estado de autenticação do usuário via Firebase Auth, expondo o contexto para toda a aplicação e controlando o redirecionamento de rotas com base no estado de login.

## Como funciona

```mermaid
sequenceDiagram
    participant Entry as expo-router/entry
    participant Layout as _layout.tsx
    participant AC as AuthContext
    participant FA as Firebase Auth
    participant LS as LoginScreen

    Entry->>Layout: monta root layout
    Layout->>AC: AuthProvider inicializa
    AC->>FA: onAuthStateChanged(listener)
    FA-->>AC: user = null (primeira carga)
    AC->>AC: isAuthReady = true
    Layout->>Layout: Stack.Protected libera o entrypoint e o login da plataforma atual
    LS->>FA: signInWithEmailAndPassword
    FA-->>AC: onAuthStateChanged(user)
    AC->>AC: candidate.reload() + classifica falha + setUser
    Layout->>Layout: Stack.Protected remove Login e libera rotas autenticadas
    Layout->>Layout: Home é a primeira rota autenticada disponível
```

1. `AuthContext.tsx` registra um listener `onAuthStateChanged` do Firebase ao montar. O contexto não usa `onIdTokenChanged`, pois chamar `candidate.reload()` dentro de um listener de token pode disparar um novo evento e criar um loop de renovação
2. Quando um usuário é detectado por uma mudança de autenticação, chama `candidate.reload()` antes de propagar. Cada callback recebe uma versão monotônica; somente a resolução mais recente e cujo UID ainda coincide com `auth.currentUser` pode atualizar o contexto. Erros de token expirado/inválido, usuário desabilitado ou inexistente limpam a sessão; falhas transitórias de rede/serviço preservam o usuário atual para não transformar uma oscilação em logout
3. Atualiza `user` (Firebase User completo) e marca `isAuthReady = true`
4. `_layout.tsx` (Expo Router 6) consome `useAuth()` e mantém um único `Stack` com guards declarativos:
   - `Stack.Protected guard={!isAuthenticated}` contém `index` (`/`) e o login da plataforma atual (`/web` ou `/mobile`)
   - `Stack.Protected guard={isAuthenticated}` contém as rotas da plataforma atual registradas em `APP_ROUTE_PATHS`, com `home` primeiro
   - Quando o guard muda, rotas agora protegidas são retiradas do histórico pelo próprio Router; não há `Redirect` ou ação imperativa concorrendo com a desmontagem
5. Durante a inicialização (`!isAuthReady || isLoadingTheme`), exibe o `AuthBootstrapScreen` com `<Loader />`
6. `LoginScreen.tsx` chama `signInWithEmailAndPassword` com proteção de throttle via [[Segurança de Login]]
7. A tela de login aceita pull-to-refresh para limpar erros locais e reconsultar o cooldown de tentativas do email digitado
8. A interface tem implementações por plataforma: a partir de 768px, o navegador preenche toda a coluna esquerda com o painel de identidade em gradiente e o texto SVG animado **Finances**, na fonte padrão do sistema, centralizado sobre ele, enquanto centraliza verticalmente o conteúdo de acesso na coluna direita. Nessa composição desktop, a rolagem permanece disponível quando o formulário excede a altura útil; abaixo disso, os blocos se empilham e conservam a rolagem e o comportamento de teclado do mobile. Android e iOS preservam a composição mobile histórica com wallpaper, logo adaptado ao tema e cartão sobreposto, sem remover a proteção do teclado

## Acesso, cadastro e recuperação no mesmo painel

`LoginScreen.web.tsx` e `LoginScreen.tsx` alternam entre `login`, `register` e `reset` por estado local, compartilhado pelo hook `useAccountAccess`. Nenhuma rota ou tela nova é criada. `HomeScreen.web.tsx` e `HomeTabsScreen.tsx` continuam sendo o dashboard e seu contêiner autenticado, sem campos de acesso.

- **Criar conta** substitui o formulário de login por nome, email e senha. Exige nome, email válido e senha com pelo menos seis caracteres; políticas adicionais são validadas pelo Firebase. A conta pública sempre recebe `adminUser: false`.
- O cadastro usa `secondaryAuth` e salva `users/{uid}` via `secondaryDb`, autenticado pelo mesmo app secundário. Assim a regra de criação pelo próprio UID é respeitada sem autenticar a sessão primária. Se o perfil for rejeitado, tenta remover apenas a conta Auth recém-criada; falha nessa compensação informa cadastro incompleto. O `finally` encerra a sessão secundária.
- Após o cadastro, o painel volta ao login, limpa a senha e mantém o email e a confirmação de sucesso. Apenas **Entrar** autentica a sessão primária e libera a Home.
- **Esqueci minha senha** mostra somente o campo de email e envia `sendPasswordResetEmail` em português. A resposta é neutra, inclusive para `auth/user-not-found`; a nova senha é definida no link hospedado pelo Firebase. A solicitação permanece nesta tela.
- Um envio concluído desabilita nova solicitação para o mesmo email enquanto esse for o último endereço enviado na instância montada; mudar de modo preserva esse estado. Isso evita repetições acidentais e não substitui os limites de abuso do Firebase.
- **Voltar para entrar** retorna ao login localmente. Trocar de modo limpa senha/erros; pedidos pendentes bloqueiam troca e submissão concorrente. O throttle existente aplica-se somente ao login.
- Web usa `UnstyledButton` do Mantine para as ações secundárias, labels HTML associados, nomes acessíveis explícitos no `InputField`, descrições de erro, título focado ao alternar e feedback anunciado. Mobile usa `Pressable`, mantém o teclado/rolagem e intercepta o voltar físico nos modos de cadastro/recuperação.
- O tema e a identidade atuais permanecem; ações amarelas destes formulários usam texto escuro `lumus-on-accent`. A Web permite rolar em alturas pequenas e zoom para manter cadastro, erros e retorno acessíveis.

## AuthContext API

```typescript
type AuthContextValue = {
  user: User | null;       // Firebase User completo ou null
  isAuthReady: boolean;    // true após primeira resolução do auth
  isAuthenticated: boolean; // Boolean(user)
};
```

- `useAuth()` — hook para consumir o contexto (lança erro se fora do `AuthProvider`)

## Arquivos principais

- `contexts/AuthContext.tsx` — Provider e hook `useAuth()`
- `app/_layout.tsx` — Root layout com `Stack.Protected` e `AuthBootstrapScreen`
- `screens/mobile/LoginScreen.tsx` — Interface mobile histórica para Android e iOS, com wallpaper, logo adaptado ao tema e cartão de formulário sobreposto
- `screens/web/LoginScreen.web.tsx` — Interface de login e painel de identidade responsivo do navegador
- `app/index.tsx` — Entry `/` que redireciona para o login da plataforma atual
- `app/web/index.web.tsx` / `app/mobile/index.native.tsx` — Login Web e Android/iOS
- `hooks/useAccountAccess.ts` — Estado local, validação e envio de cadastro/recuperação
- `design-system/auth.ts` — Contratos visuais das ações e feedback
- `functions/RegisterUserFirebase.ts` — Cadastro e solicitação de recuperação
- `utils/authSession.ts` — Classifica os códigos definitivos do Firebase Auth que exigem encerrar a sessão local
- `utils/firebaseAuthStorage.ts` — Persistência segura para o app secundário

## Integrações

- [[Firebase Config]] — `auth` instance usada para `onAuthStateChanged` e `signInWithEmailAndPassword`; o navegador compartilha a sessão entre abas da mesma origem
- [[Segurança de Login]] — Throttle de tentativas antes de chamar Firebase
- [[Navegação]] — `_layout.tsx` usa `useAuth()` para controlar a disponibilidade das rotas via `Stack.Protected`
- [[Gerenciamento de Usuários]] — `user.uid` é o `personId` usado em todas as queries
- [[Notificações]] — Ativa/reconcilia a agenda do UID autenticado; troca de conta e logout explícito limpam o UID anterior

## Configuração

- Firebase Auth configurado em `FirebaseConfig.ts`
- Antes de o `AuthProvider` montar, [[Firebase Config]] resolve o alvo a partir de variáveis `EXPO_PUBLIC_*` incorporadas diretamente pelo Metro. Development usa o Emulator; preview e releases usam produção. Uma release local com credenciais completas também infere produção, evitando exceção de bootstrap antes da Login e permanência na splash nativa.
- **App primário nativo usa persistência memory-only** — ao fechar o app Android/iOS, a sessão é encerrada e o usuário volta para a tela de login
- **App primário Web usa `browserLocalPersistence`** — outra aba ou recarregamento da mesma origem restaura o usuário; fechar o navegador também preserva a autenticação até **Sair**, expiração ou invalidação pelo Firebase
- O `user=null` inicial de uma abertura fria não é tratado como logout explícito pelo motor de notificações; isso preserva os alarmes locais do último UID enquanto a sessão precisa ser refeita
- O botão **Sair** bloqueia toques concorrentes, confirma que o UID originador ainda é o usuário do Firebase e chama `clearMandatoryReminderAccount(uid)` antes de `signOut(auth)`. A limpeza é recusada se outra conta já tiver assumido a sessão; ao entrar com outro UID, a ponte de `_layout.tsx` também limpa qualquer agenda anterior
- A limpeza é preparada em duas fases: `clearMandatoryReminderAccount(uid)` cancela alarmes nativos, mas conserva configurações locais sem IDs como snapshot de rollback; somente depois do `signOut` bem-sucedido `finalizeMandatoryReminderAccountCleanup(uid)` apaga esse mapa
- Se a limpeza nativa falhar, o logout não prossegue e a agenda do UID ainda autenticado é reconciliada novamente. Se o `signOut` falhar depois da limpeza, o snapshot local reconstitui a agenda imediatamente, inclusive offline, antes da tentativa complementar de sincronização com Firestore e da mensagem de erro
- Ao autenticar, `_layout.tsx` ativa o UID e chama `loadMandatoryReminderSyncItems()` para restaurar despesas e receitas do Firestore sem depender de abrir as telas recorrentes
- App secundário usa `firebaseAuthStorage` (SecureStore com fallback AsyncStorage) — usado exclusivamente para criação de contas
- Dual app Firebase: app primário para sessão atual, app secundário para criação de usuários sem afetar sessão

## Observações importantes

- A versão Web da tela usa classes Tailwind/NativeWind para a composição estrutural; cores de tema e dimensões responsivas medidas permanecem tokens/valores de runtime.

- `isAuthReady` é false durante a inicialização — telas não devem renderizar dados antes disso
- O guard em `_layout.tsx` também aguarda `isLoadingTheme` do [[Sistema de Temas|ThemeContext]] para evitar flash de tema
- O `user` retornado é o objeto Firebase User completo
- O `reload()` na resolução de uma mudança de autenticação garante que sessões expiradas, revogadas ou inválidas sejam detectadas sem descartar uma sessão por uma falha transitória
- `reload()` não é executado dentro de `onIdTokenChanged`: a combinação criaria um ciclo de evento de token e nova renovação
- Uma resposta atrasada de `reload()` nunca pode republicar um usuário depois de um evento mais novo de logout ou troca de conta
- Login e logout atualizam os guards automaticamente via `onAuthStateChanged`, mantendo o mesmo Stack raiz montado
- Cada plataforma concentra sua interface completa em `LoginScreen.tsx` ou `LoginScreen.web.tsx`. A Web usa o painel de identidade em gradiente; Android/iOS preservam wallpaper e logos claro/escuro. Inputs, teclado, validação, throttle e Firebase Auth permanecem nativos, sem WebGL, canvas, `ogl` ou WebView.
- Todo novo arquivo de rota autenticada deve entrar primeiro em `APP_ROUTE_PATHS`; o layout deriva desse registro os nomes protegidos, e o teste de navegação verifica a paridade com os arquivos planos em `app/`
- A sessão Android/iOS **não persiste** entre reinicializações do app — isso é intencional (memory-only); a sessão Web persiste até o logout explícito ou invalidação pelo Firebase
- Os lembretes locais podem persistir entre reinicializações mesmo sem sessão persistida; eles são isolados pelo último UID ativo e nunca são mesclados com uma conta diferente
- O serviço de notificações mantém um epoch/UID síncrono em memória; callbacks assíncronos de telas antigas são ignorados depois que logout ou troca de conta invalidam a sessão
- A limpeza explícita recebe o UID esperado, varre inclusive alarmes nativos órfãos e não pode apagar a agenda de uma conta que se tornou ativa enquanto o logout anterior aguardava I/O
- A finalização do mapa local só acontece após confirmação do Firebase; nunca antecipar a exclusão do snapshot de rollback
