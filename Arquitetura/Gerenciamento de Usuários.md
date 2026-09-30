---
tags: [usuarios, cadastro, relacionamentos, firebase-auth]
relacionado: [[Autenticação]], [[Firebase Config]], [[Dashboard Home]], [[Comportamento Pós-Registro]]
status: ativo
tipo: feature
versao: 1.4.0
---

# Gerenciamento de Usuários

Módulo responsável pelo cadastro de novos usuários no sistema e pelo estabelecimento de relacionamentos entre usuários, permitindo visibilidade compartilhada de dados financeiros.

## Como funciona

### Cadastro público

A tela inicial de [[Autenticação]] oferece **Criar conta** no próprio painel, com nome, email e senha. `useAccountAccess` chama `registerUserFirebase`, que usa `secondaryAuth` e `secondaryDb` para criar `users/{uid}` sem alterar a sessão primária. A conta pública recebe `adminUser: false`. O sucesso volta ao login local, mantém o email e limpa a senha. Se a gravação de perfil falhar, a função tenta remover a conta recém-criada e sempre encerra a sessão secundária; uma compensação malsucedida é informada como cadastro incompleto.

O formulário administrativo de cadastro foi removido. A tabela administrativa de contas existentes também foi retirada de [[Configurações]]; a tela não oferece mais consulta ou exclusão de contas.

### Relacionamento entre Usuários
1. `AddUserRelationScreen.tsx` permite vincular um usuário a outro pelo email ou ID
2. `RegisterUserFirebase.ts` salva a relação no Firestore
3. Usuários relacionados compartilham visibilidade das transações no [[Dashboard Home]]
4. O `HomeFirebase.ts` busca os `personIds` de usuários relacionados para agregar os dados
5. Após salvar um vínculo, `AddUserRelationScreen.tsx` aplica [[Comportamento Pós-Registro]] após o feedback de sucesso

## Por que dois apps Firebase?

Criar um usuário com Firebase Auth desloga o usuário atual. O app usa um **segundo app Firebase** (`secondaryApp` / `secondaryAuth`, identificado como "SECONDARY") exclusivamente para operações de criação de conta, mantendo a sessão do usuário logado intacta.

## Arquivos principais

- `screens/mobile/LoginScreen.tsx` / `screens/web/LoginScreen.web.tsx` — Cadastro público integrado ao painel de acesso
- `hooks/useAccountAccess.ts` — Validação e envio do cadastro público
- `screens/mobile/AddUserRelationScreen.tsx` / `screens/web/AddUserRelationScreen.web.tsx` — Vinculação de usuários por plataforma, com label, popover e campo alinhados ao padrão Web de despesas
- `functions/RegisterUserFirebase.ts` — CRUD de usuários e relacionamentos
- `FirebaseConfig.ts` — Instância secundária do Firebase (`secondaryApp`, `secondaryAuth`)
- `app/mobile/add-user-relation.tsx` — Rota de relacionamento
- `utils/navigation.ts` — Saída explícita para Home pelo voltar físico/navigator
- `hooks/usePostSubmitBehavior.ts` — Aplica retorno/limpeza após salvar vínculo

## Integrações

- [[Autenticação]] — `user.uid` é o `personId` base; app secundário evita logout
- [[Firebase Config]] — Exporta `secondaryApp`/`secondaryAuth` para uso em cadastro
- [[Dashboard Home]] — Dados de usuários relacionados são agregados na home
- [[Configurações]] — Preferências e cadastros do aplicativo; o vínculo de usuários continua acessível pelo [[Perfil do Usuário]]
- [[Notificações]] — Feedback via `notifier-alert.tsx`
- [[Comportamento Pós-Registro]] — Define retorno/limpeza após salvar usuários e vínculos

## Configuração

- O seed do Firebase Emulator cria a conta `usuario@demo.lumus.local` com `adminUser: true`, permitindo testar os fluxos administrativos localmente.
- Relacionamento é bidirecional no Firestore

## Observações importantes

- O cadastro público no painel de [[Autenticação]] cria exclusivamente uma conta padrão (`adminUser: false`), sem vínculos ou campos de autorização do razão.
- O app secundário Firebase é inicializado com as mesmas credenciais do app principal
- Após criar o usuário no Firebase Auth via app secundário, o usuário precisa fazer login pela tela de [[Autenticação|Login]]
- No Android/iOS, o app secundário usa persistência SecureStore (via `firebaseAuthStorage`), diferente do app primário em memória. Na Web, o secundário usa memória e o primário persiste a sessão entre abas; ver [[Firebase Config]].
- Vínculos devem passar por [[Comportamento Pós-Registro]] após sucesso; o cadastro público volta ao login local.
- O vínculo limpa campos somente quando a preferência da tela manda permanecer e limpar; o cadastro público bloqueia envios concorrentes pelo hook de acesso.

## Perfil pessoal

[[Perfil do Usuário]] oferece Meu perfil em `/web/profile` e `/mobile/profile`, com telas independentes, nome editável no Firestore, e-mail de acesso/data de cadastro e ID copiável. O menu Config abre o perfil no lugar de Relacionar usuário; a ação de vínculo fica dentro dele e respeita `addUserRelation`. As telas de vínculo oferecem Voltar ao perfil, enquanto o pós-submit configurado permanece preservado.

**Limitação anterior:** as regras versionadas bloqueiam alterações client-side de `relatedIdUsers` e leituras de usuários não relacionados. A função legada de vínculo bidirecional não funciona sob essas regras; mover o acesso ao perfil não modifica esse contrato de segurança.
