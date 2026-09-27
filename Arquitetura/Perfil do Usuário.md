---
tags: [usuarios, perfil, firebase, web, mobile]
relacionado: [[Gerenciamento de Usuários]], [[Autenticação]], [[Navegação]], [[Firebase Config]], [[Visibilidade de Rotas]]
status: ativo
tipo: feature
versao: 1.0.0
---

# Perfil do Usuário

**Meu perfil** permite consultar a própria conta e editar o nome. O item substitui **Relacionar usuário** no grupo Config dos menus Web e mobile.

## Como funciona

- Rotas autenticadas `/web/profile` e `/mobile/profile`, registradas em `APP_ROUTE_PATHS.profile`. O perfil está sempre disponível para uma sessão autenticada, independentemente da preferência de visibilidade do vínculo.
- Composições independentes: Web usa formulário HTML com labels associados, foco e grid responsivo; Android/iOS usa Gluestack, teclado e rolagem nativos. Ambas reutilizam os tokens, o hero e `assets/UnDraw/perfilPersonScreen.svg`.
- O hero acompanha o padrão das demais telas: `max(28% da altura da janela, 250 px) + safe area superior`, com o sheet sobreposto em 64 px. Na Web, shell e hero usam largura de viewport e a imagem React Native declara posição e dimensões para cobrir toda a camada sem expor o fundo lateral.
- O nome é editável, obrigatório ao salvar, aceita nomes internacionais de um único caractere e tem limite de 100 caracteres. Espaços nas extremidades são removidos. Não há exigência de sobrenome.
- E-mail de acesso vem do Firebase Auth e aparece em um campo somente leitura nas duas plataformas; a aparência atenuada segue o estado desabilitado dos formulários, mantendo o texto selecionável. A data de cadastro vem de `users/{uid}.createdAt` e aparece em campo de data bloqueado com o mesmo tratamento visual. Documentos antigos sem nome usam `displayName` como fallback e datas ausentes são identificadas na interface.
- `updateUserProfileFirebase(uid, name)` confirma a sessão e usa `updateDoc` apenas em `users/{uid}` com `name` e `updatedAt: serverTimestamp()`. Não substitui o documento, não altera o e-mail de login, `adminUser`, grupos ou vínculos. Firestore continua sendo a fonte do nome; não há segunda escrita parcial em Auth.
- Salvar mantém a tela aberta, atualiza o nome exibido e confirma o sucesso. Falha preserva o rascunho, permite tentar novamente e não mostra sucesso. Descartar restaura o valor carregado/salvo. Submit possui trava síncrona e respostas obsoletas são ignoradas após unmount/troca de conta.
- O bloco **Contas vinculadas** mostra o UID selecionável e **Copiar meu ID**, com feedback de sucesso/falha. **Relacionar usuário** abre a tela existente com `fromProfile=1`, somente quando `addUserRelation` está visível. O voltar explícito/físico da tela de vínculo retorna ao perfil, preservando o rascunho quando há histórico. Seu pós-submit configurável continua inalterado.
- Na Web, o nome confirmado é passado ao navigator para atualizar imediatamente o rodapé. Recarregar/fechar a página com rascunho aciona o aviso nativo do navegador; a sessão continua memory-only.

## Arquivos principais

- `screens/mobile/PerfilPersonScreen.tsx`
- `screens/web/PerfilPersonScreen.web.tsx`
- `hooks/useUserProfile.ts`
- `functions/UserProfileFirebase.ts`
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
- Limitação anterior confirmada no código: `AddUserRelationScreen` consulta um usuário ainda não relacionado e grava `relatedIdUsers` pelo cliente, mas as regras versionadas só permitem leituras próprias/relacionadas e bloqueiam mudanças desse campo. O acesso à tela foi movido; esta entrega não amplia permissões nem implementa um novo protocolo de convite/vínculo. A correção desse fluxo exige uma operação confiável separada.
- Validação nativa de teclado, leitor de tela e aparelho continua necessária; export Android não equivale à execução instalada.

## Validação

- 26 testes passaram nas suítes de perfil, persistência e navegação; typecheck do app/backend e diff-check aprovados.
- `npm --prefix backend run test:profile:rules` passou contra o Firestore Emulator em `demo-lumus-profile-tests`, sem alterar contas reais. Integrado a `test:emulator`.
- Smoke test Playwright autenticado em conta temporária local: salvar e ler novamente no Firestore, preservar permissões/vínculos, abrir vínculo e retornar com rascunho preservado, descartar e viewport de 390 px sem overflow horizontal. Temas claro/escuro inspecionados e nome vazio validado com foco no campo. Nenhum erro JavaScript de página observado. Conta e documento temporários removidos ao final.
- Exports Web e Android aprovados. Lint bloqueado somente por dívida anterior em Configurações Web e limite global do hook legado. Não houve execução instalada Android/iOS, teste com leitor de tela nem medição de Core Web Vitals.
