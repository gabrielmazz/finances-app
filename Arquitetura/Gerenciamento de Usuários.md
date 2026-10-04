---
tags: [usuarios, cadastro, relacionamentos, firebase-auth]
relacionado: [[Autenticação]], [[Firebase Config]], [[Dashboard Home]], [[Comportamento Pós-Registro]]
status: ativo
tipo: feature
versao: 1.5.0
---

# Gerenciamento de Usuários

Módulo responsável pelo cadastro de novos usuários no sistema e pelo estabelecimento de relacionamentos entre usuários, permitindo visibilidade compartilhada de dados financeiros.

## Como funciona

### Cadastro público

A tela inicial de [[Autenticação]] oferece **Criar conta** no próprio painel, com nome, email e senha. `useAccountAccess` chama `registerUserFirebase`, que usa `secondaryAuth` e `secondaryDb` para criar `users/{uid}` sem alterar a sessão primária. A conta pública recebe `adminUser: false`. O sucesso volta ao login local, mantém o email e limpa a senha. Se a gravação de perfil falhar, a função tenta remover a conta recém-criada e sempre encerra a sessão secundária; uma compensação malsucedida é informada como cadastro incompleto.

O formulário administrativo de cadastro foi removido. A tabela administrativa de contas existentes também foi retirada de [[Configurações]]; a tela não oferece mais consulta ou exclusão de contas.

### Relacionamento entre Usuários
1. As telas Web/mobile de vínculo recebem o ID informado pela pessoa. Não oferecem busca de outra conta por email.
2. `UserRelationshipFirebase.ts` chama `userRelationship` no backend. O preview fornece somente nome e fingerprint; link/unlink usam transação bidirecional, receipt idempotente por `clientActionId` e evento de auditoria. `RegisterUserFirebase.ts` adapta os consumidores existentes a esse contrato.
3. Usuários relacionados compartilham visibilidade das transações no [[Dashboard Home]]
4. O `HomeFirebase.ts` busca os `personIds` de usuários relacionados para agregar os dados
5. Após salvar um vínculo, `AddUserRelationScreen.tsx` aplica [[Comportamento Pós-Registro]] após o feedback de sucesso. No [[Assistente Lumus]], o resumo e a confirmação acontecem no chat; o resultado confirmado invalida leituras financeiras.
6. O backend revalida sessão, alvo e fingerprint do par. Vínculos com alvos diferentes podem compartilhar um lote preparado sem invalidar o snapshot dos outros pares. A mesma operação reenviada recupera o receipt; `financialGroupId`, `financialGroupRole` e `adminUser` não são alterados.

## Por que dois apps Firebase?

Criar um usuário com Firebase Auth desloga o usuário atual. O app usa um **segundo app Firebase** (`secondaryApp` / `secondaryAuth`, identificado como "SECONDARY") exclusivamente para operações de criação de conta, mantendo a sessão do usuário logado intacta.

## Arquivos principais

- `screens/mobile/LoginScreen.tsx` / `screens/web/LoginScreen.web.tsx` — Cadastro público integrado ao painel de acesso
- `hooks/useAccountAccess.ts` — Validação e envio do cadastro público
- `screens/mobile/AddUserRelationScreen.tsx` / `screens/web/AddUserRelationScreen.web.tsx` — Vinculação de usuários por plataforma, com label, popover e campo alinhados ao padrão Web de despesas
- `functions/RegisterUserFirebase.ts` — Cadastro público e adaptadores das consultas/vínculos existentes
- `functions/UserRelationshipFirebase.ts` / `backend/src/userRelationships.ts` — Preview mínimo e execução confiável de link/unlink
- `services/lumusAssistant/assistantApplicationService.ts` — Referências por nome/ordinal, preparação, confirmação e lotes locais
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

As regras continuam bloqueando alterações client-side de `relatedIdUsers` e leituras de usuários não relacionados. O novo caminho confiável evita essas operações pelo cliente. Não existe protocolo de convite, edição de papéis/grupos ou CRUD administrativo de contas neste fluxo.

## Integração conversacional — 2026-10-02

“Liste minhas contas vinculadas” devolve nomes numerados, sem UID/email. “Desvincule Maria” resolve somente um nome inequívoco; alternativas são respondidas por nome ou ordinal da lista exibida. “Vincule o usuário ID …” conserva o identificador somente no cliente/backend. Toda mudança de vínculo apresenta seu efeito de compartilhamento no chat e exige confirmação da versão ativa. Consultar outro assunto conserva o pedido, mas exige retomá-lo antes de confirmar.

O executor de lotes prepara todos os pares antes de gravar, aplica uma confirmação agregada quando necessária, executa em sequência e preserva estado por item em memória da sessão. Cancelar para de iniciar itens; retry mantém os sucessos e recupera receipts das operações já persistidas. Logout, revogação e troca de UID limpam checkpoints e referências locais. O lote não altera a atomicidade de cada transação bidirecional.

`tests/userRelationships.test.ts` verifica os adaptadores e a troca de UID; `tests/lumusAssistantApplication.test.ts` verifica referências, privacidade e lote; `backend/tests/userRelationships.emulator.test.ts` usa Auth/Firestore/Functions locais para bidirecionalidade, idempotência, fingerprint stale, pares independentes e Rules. A callable precisa existir no ambiente de execução; nenhum deploy foi feito nesta tarefa. A evidência de Emulator não comprova disponibilidade em produção nem interação em aparelho.
