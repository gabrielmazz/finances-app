---
tags: [usuarios, perfil, firebase, web, mobile]
relacionado: [[Gerenciamento de Usuários]], [[Autenticação]], [[Navegação]], [[Firebase Config]], [[Visibilidade de Rotas]], [[Configurações]]
status: ativo
tipo: feature
versao: 1.2.0
---

# Perfil do Usuário

**Meu perfil** permite consultar a própria conta e editar o nome. O item substitui **Relacionar usuário** no grupo Config dos menus Web e mobile.

## Como funciona

- Rotas autenticadas `/web/profile` e `/mobile/profile`, registradas em `APP_ROUTE_PATHS.profile`. O perfil está sempre disponível para uma sessão autenticada, independentemente da preferência de visibilidade do vínculo.
- Composições independentes: Web usa formulário HTML com labels associados, foco e grid responsivo; Android/iOS usa Gluestack e teclado nativo, com o conteúdo inteiro dentro de um `ScrollView` limitado pelo sheet flexível para alcançar também **Contas vinculadas**. Ambas reutilizam os tokens, o hero e `assets/UnDraw/perfilPersonScreen.svg`.
- O hero acompanha o padrão das demais telas: `max(28% da altura da janela, 250 px) + safe area superior`, com o sheet sobreposto em 64 px. Na Web, shell e hero usam largura de viewport e a imagem React Native declara posição e dimensões para cobrir toda a camada sem expor o fundo lateral.
- O nome é editável, obrigatório ao salvar, aceita nomes internacionais de um único caractere e tem limite de 100 caracteres. Espaços nas extremidades são removidos. Não há exigência de sobrenome.
- O campo Nome conserva o foco padrão dos formulários: borda e anel amarelos na Web, contorno amarelo de 2 px no Android/iOS; o estado de erro mantém a borda vermelha.
- **Informações da conta** mostra tipo de acesso e cadastros monitorados nas duas plataformas. Para administradores, a contagem reúne usuários do grupo, bancos ativos e categorias; para usuários padrão, conta as outras contas vinculadas. Os dados vêm das consultas Firebase já escopadas por usuário e vínculos. Durante a consulta aparece “Carregando…”; em falha, a tela explica o problema e oferece nova tentativa.
- E-mail de acesso vem do Firebase Auth e aparece em um campo somente leitura nas duas plataformas; a aparência atenuada segue o estado desabilitado dos formulários, mantendo o texto selecionável. A data de cadastro vem de `users/{uid}.createdAt` e aparece em campo de data bloqueado com o mesmo tratamento visual. Documentos antigos sem nome usam `displayName` como fallback e datas ausentes são identificadas na interface.
- `updateUserProfileFirebase(uid, name)` confirma a sessão e usa `updateDoc` apenas em `users/{uid}` com `name` e `updatedAt: serverTimestamp()`. O caminho do assistente fornece `{ expectedName }` e revalida esse valor dentro de uma transação; mudança concorrente é recusada e nome já persistido é reconhecido no retry. Não substitui o documento, não altera o e-mail de login, `adminUser`, grupos ou vínculos. Firestore continua sendo a fonte do nome; não há segunda escrita parcial em Auth.
- Salvar mantém a tela aberta, atualiza o nome exibido e confirma o sucesso. Falha preserva o rascunho, permite tentar novamente e não mostra sucesso. Descartar restaura o valor carregado/salvo. Submit possui trava síncrona e respostas obsoletas são ignoradas após unmount/troca de conta.
- O bloco **Contas vinculadas** mostra o UID em um campo somente leitura e um botão de ícone para copiá-lo. A cópia confirmada usa `notifier-alert` como notificação in-app nas duas plataformas; falhas são apresentadas no feedback do perfil. **Relacionar usuário** abre a tela existente com `fromProfile=1`, somente quando `addUserRelation` está visível. O voltar explícito/físico da tela de vínculo retorna ao perfil, preservando o rascunho quando há histórico. Seu pós-submit configurável continua inalterado.
- Na Web, o nome confirmado é passado ao navigator para atualizar imediatamente o rodapé. Recarregar/fechar a página com rascunho aciona o aviso nativo do navegador; a autenticação persiste entre abas e recarregamentos até **Sair** ou invalidação pelo Firebase, mas o rascunho não é salvo.

## Arquivos principais

- `screens/mobile/PerfilPersonScreen.tsx`
- `screens/web/PerfilPersonScreen.web.tsx`
- `hooks/useUserProfile.ts`
- `functions/UserProfileFirebase.ts`
- `functions/RegisterUserFirebase.ts`, `functions/BankFirebase.ts` e `functions/TagFirebase.ts` — consultas escopadas para o resumo de acesso
- `app/mobile/profile.tsx` / `profile.native.tsx` e `app/web/profile.tsx` / `profile.web.tsx`
- `components/mobile/navigation/navigator.native.tsx` e `components/web/navigation/navigator.web.tsx`
- `tests/userProfile.test.ts`, `tests/userProfileFirebase.test.ts`, `backend/tests/userProfile.rules.test.ts`

## Integrações

[[Autenticação]] fornece o UID e e-mail; [[Gerenciamento de Usuários]] mantém o cadastro e vínculo; [[Visibilidade de Rotas]] controla o acesso à tela de vínculo. [[Comportamento Pós-Registro]] permanece responsável pelo pós-submit do vínculo; a edição de perfil permanece na própria tela.

## Configuração

Reutiliza o Firebase já configurado. Nenhuma dependência, índice, coleção, serviço de IA, Remote Config, API Route ou Worker novo. Os campos são atualizados ao salvar; não há migração em lote nem necessidade de implantar novas regras para a edição do nome.

## Observações importantes

- Os documentos `users` já são legíveis por usuários relacionados. Esta entrega não coleta telefone, nascimento ou outros dados pessoais adicionais sem necessidade de produto.
- Documento ausente é erro com retry: a tela não recria um cadastro com permissões incompletas.
- As regras continuam impedindo escrita de `relatedIdUsers` pelo cliente. As telas e o assistente usam a operação confiável documentada em [[Gerenciamento de Usuários]], com preview mínimo, fingerprint e transação; o fluxo não altera papéis ou grupos nem implementa convites.
- Validação nativa de teclado, leitor de tela e aparelho continua necessária; export Android não equivale à execução instalada.

## Validação

- 26 testes passaram nas suítes de perfil, persistência e navegação; typecheck do app/backend e diff-check aprovados.
- `npm --prefix backend run test:profile:rules` passou contra o Firestore Emulator em `demo-lumus-profile-tests`, sem alterar contas reais. Integrado a `test:emulator`.
- Smoke test Playwright autenticado em conta temporária local: salvar e ler novamente no Firestore, preservar permissões/vínculos, abrir vínculo e retornar com rascunho preservado, descartar e viewport de 390 px sem overflow horizontal. Temas claro/escuro inspecionados e nome vazio validado com foco no campo. Nenhum erro JavaScript de página observado. Conta e documento temporários removidos ao final.
- Exports Web e Android aprovados. Lint bloqueado somente por dívida anterior em Configurações Web e limite global do hook legado. Não houve execução instalada Android/iOS, teste com leitor de tela nem medição de Core Web Vitals.

## Conversa e atualização de leitura — 2026-10-02

O [[Assistente Lumus]] consulta nome e informações de acesso por `getUserProfileFirebase`. Pedidos explícitos pelo email/ID próprios retornam esses dados somente ao chat local, excluído do histórico do modelo; a consulta geral não os inclui. Data de cadastro usa o dia civil em São Paulo. A pergunta pelo número de contas vinculadas consulta somente vínculos, inclusive para admin; `getUserProfileAccessSummaryFirebase` compartilha com a tela a contagem de cadastros monitorados acessíveis (usuários/bancos/categorias para admin). A cópia do próprio ID é uma ação local da área de transferência, sem inserir esse ID no histórico. “Mude meu nome para Maria” prepara o nome atual, apresenta o efeito e aceita confirmação natural da versão ativa. `updateUserProfileFirebase` revalida o nome esperado dentro de uma transação CAS e rejeita mudança concorrente ou sessão revogada; um resultado já persistido é reconhecido no retry. Listar/desvincular contas usa o serviço confiável de vínculos.

Após perfil/vínculos confirmados, o contexto invalida as leituras financeiras escopadas pelo UID. `useUserProfile` recarrega ao recuperar foco e preserva um rascunho de nome que ainda não foi salvo; respostas de uma conta anterior continuam descartadas. O primeiro foco não duplica a leitura inicial.

`tests/lumusAssistantContextIntegration.test.ts` verifica confirmação após consulta paralela, retomada, invalidação, memória entre rotas, TTS mascarado e revogação; `tests/userProfile.test.ts` cobre o refresh com rascunho preservado. Esses testes usam seams dos serviços/sistema e não são evidência de clipboard ou leitor de tela em aparelho. A suíte de perfil mantém uma falha preexistente: expectativa de feedback “ID copiado.” no hook, embora a notificação de sucesso seja emitida pela tela.
