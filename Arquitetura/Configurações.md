---
tags: [configuracoes, tema, usuario, settings]
relacionado: [[Sistema de Temas]], [[Privacidade de Valores]], [[Comportamento Pós-Registro]], [[Visibilidade de Rotas]], [[Autenticação]], [[Perfil do Usuário]], [[Gerenciamento de Usuários]], [[Gerenciamento de Tags]], [[Componentes UI]], [[Assistente Lumus]]
status: ativo
tipo: feature
versao: 1.13.0
---

# Configurações

Tela de configurações do app, acessível pela aba "Settings" na navegação principal. Centraliza as preferências do usuário e os cadastros compartilhados de bancos e categorias.

## Como funciona

1. `ConfigurationsScreen.tsx` é renderizado na aba 2 do container mobile; `ConfigurationsScreen.web.tsx` é a composição independente selecionada pelo container Web.
2. Organiza os accordions em dois headings:
   - **Relações dentro do Aplicativo**: **Bancos** e **Categorias**, com ações inline de edição, exclusão e navegação, disponíveis para usuários padrão
   - **Configurações avançadas**: **Preferências de valores financeiros**, **Configurações das telas** e **Tema do aplicativo**
   - O e-mail, o ID compartilhável e a ação para relacionar usuários ficam em [[Perfil do Usuário]]; a tabela administrativa de usuários não aparece nesta tela
3. As ações principais de cadastro usam `Button` do Gluestack no mesmo padrão visual das telas de registro, reaproveitando tokens de `useScreenStyle()` e ocupando a largura inteira disponível dentro do accordion
4. As tabelas administrativas reservam uma coluna fixa de ações à direita, com botões compactos por ícone centralizados e sem depender de rolagem horizontal para acessar as ações
5. Os classnames compartilhados das tabelas desta tela são centralizados em `useScreenStyle.ts` para evitar duplicação na screen
6. Quando uma listagem ultrapassa 5 registros, a tabela passa a exibir paginação numérica abaixo da listagem
   O [[Assistente Lumus]] adota a seleção numérica para mostrar um cartão por vez quando uma resposta prepara várias ações; o estado e a confirmação continuam individuais por cartão.
7. Todo feedback in-app desta tela usa `components/uiverse/feedback/notifier-alert.tsx`, incluindo erros operacionais e confirmações de exclusão
8. A tela usa modais de confirmação para ações destrutivas; a edição de categorias abre diretamente o formulário canônico pelo `tagId`
9. Os cards de tema e privacidade mantêm o popover inline ao lado do título, helper contextual abaixo do label e o switch alinhado à direita para seguir o mesmo padrão de toggles usado nas telas de cadastro
10. Ações que abrem formulários de cadastro/edição usam rotas de `APP_ROUTE_PATHS`; o destino depois de salvar é definido por [[Comportamento Pós-Registro]]
11. A seção administrativa de categorias usa nomenclatura visual "categoria" por padrão. **Adicionar categoria** abre todos os objetivos de disponibilidade, incluindo todas as despesas e todos os ganhos; a tabela resume a disponibilidade em linguagem natural, filtra pelos quatro contextos e abre a edição diretamente.
12. Ao pedir exclusão de uma categoria, a tela consulta os lançamentos e recorrências. Havendo referências, mostra a contagem por tipo e bloqueia a remoção; antes de excluir uma categoria livre, consulta novamente para evitar apagar uma categoria recém-referenciada.
13. A tabela de bancos exibe ativos e desativados e oferece uma ação reversível para desativar/reativar o banco; desativar preserva o cadastro e o histórico, mas remove o banco dos seletores operacionais.
14. Os atalhos Novo banco, Nova categoria e Config. das telas não aparecem no navigator; seus acessos internos permanecem. A seção avançada inclui a opção **Configurações das telas**, com ilustração `screenConfigurationsSettings.svg`, que abre `ScreenSettingsScreen.tsx` para configurar o pós-submit por formulário.
15. Todos os accordions da seção avançada começam com um card de apresentação usando ilustração contextual da tela/fluxo relacionado em uma moldura quadrada fixa, título, descrição e ação principal quando existir; tabelas, filtros e switches ficam abaixo ou dentro desse mesmo padrão visual.
16. `ScreenSettingsScreen.tsx` organiza as telas em cards transparentes por categoria, oferece busca por nome e mostra cada opção em accordion com a ilustração do formulário. Cadastros e edições podem escolher a tela de retorno; edições não exibem limpeza de campos.
17. Cada configuração também tem o switch **Mostrar no app**, que controla a [[Visibilidade de Rotas|visibilidade local da rota]] no navigator e no guard de navegação. **Assistente Lumus** e **Anotações** seguem o mesmo padrão em accordions ilustrados. Em Anotações, o switch **Em desenvolvimento** começa ligado e mantém a rota oculta; desligá-lo libera o acesso de teste e abre um modal informativo.

## Arquivos principais

- `screens/mobile/ConfigurationsScreen.tsx` — Composição Android/iOS
- `screens/web/ConfigurationsScreen.web.tsx` — Composição exclusiva do navegador, com o `Navigator` Web compartilhado (rail desktop ou navegação compacta)
- `screens/mobile/ScreenSettingsScreen.tsx` / `screens/web/ScreenSettingsScreen.web.tsx` — Configuração de comportamento pós-registro e visibilidade de rotas por tela, com composição independente por plataforma
- `app/mobile/home.tsx` — Container de abas que inclui Configurações como tab 2
- `app/mobile/screen-settings.tsx` / `app/web/screen-settings.tsx` — Rotas da tela de configurações das telas por plataforma
- `hooks/useScreenStyle.ts` — Estilos da tela
- `utils/navigation.ts` — Registro central de rotas e saída explícita para Home após formulários derivados

## Integrações

- [[Sistema de Temas]] — Toggle consome `toggleThemeMode()` do `ThemeContext`
- [[Privacidade de Valores]] — Toggle consome `toggleShouldHideValues()` do `ValueVisibilityContext`
- [[Autenticação]] — A sessão autenticada delimita os cadastros carregados nesta tela
- [[Perfil do Usuário]] — Exibe tipo de acesso e cadastros monitorados
- [[Gerenciamento de Usuários]] — O vínculo de usuários continua acessível pelo [[Perfil do Usuário]]; a administração de contas não está disponível nesta tela
- [[Gerenciamento de Bancos]] — Link para cadastro de bancos
- [[Gerenciamento de Tags]] — Seletor inicial, tabela, edição e exclusão segura de categorias
- [[Componentes UI]] — Reutiliza `tag-actionsheet-selector.tsx` no filtro de categorias
- [[Comportamento Pós-Registro]] — Define retorno e limpeza de campos dos formulários
- [[Visibilidade de Rotas]] — Define a exibição local e o acesso às rotas configuráveis

## Configuração

- Sem configuração especial — consume contextos existentes

## Observações importantes

- Configurações de tema e privacidade são persistidas automaticamente via AsyncStorage pelos respectivos contextos
- A tela combina contextos globais com estado local para tabelas, filtros e confirmações
- Novas ações principais desta tela devem reutilizar `Button` + `useScreenStyle()` para manter o mesmo padrão visual das demais telas de cadastro
- Os botões principais renderizados dentro do conteúdo dos accordions devem preencher toda a largura útil da seção
- Cada accordion avançado deve exibir um card inicial com imagem contextual de `assets/UnDraw`, mantendo o mesmo padrão visual de **Configurações por tela** e o mesmo tamanho de moldura para todas as ilustrações
- Ações dentro das tabelas devem priorizar ícones em uma coluna dedicada à direita para economizar espaço horizontal no mobile
- A tabela de bancos deve reservar uma coluna de ações suficiente para editar, desativar/reativar e excluir; bancos desativados permanecem visíveis na administração para permitir reativação
- As tabelas administrativas devem permanecer contidas no card e evitar `ScrollView` horizontal; o conteúdo textual deve truncar quando necessário para preservar a coluna de ações visível
- Estrutura de linhas, cabeçalhos, captions, larguras mínimas e largura da coluna de ações das tabelas deve ser consumida via `useScreenStyle()`
- A paginação das tabelas deve aparecer apenas quando houver mais de 5 itens na coleção visível, incluindo listas filtradas como a de tags
- O filtro da tabela de categorias deve usar o ActionSheet compartilhado de categorias, não o `Select` genérico, e consumir `fieldContainerCardClassName` para acomodar ícone, nome e helper sem ultrapassar o card
- O filtro de categorias deve refletir os quatro contextos de uso: despesas do dia a dia, despesas recorrentes, ganhos do dia a dia e ganhos recorrentes
- O cadastro iniciado em Configurações deve abrir o seletor completo de disponibilidade antes do formulário; a edição recebe somente `tagId` e não apresenta confirmação intermediária
- A exclusão de categorias deve consultar `expenses`, `gains`, `mandatoryExpenses` e `mandatoryGains` antes da confirmação e imediatamente antes da remoção. Com qualquer referência, deve orientar a reclassificação e nunca excluir
- Para manter consistência com o restante do app, esta tela deve continuar usando `notifier-alert.tsx` como canal padrão de feedback in-app
- Formulários derivados das tabelas administrativas não devem usar `router.back()` após salvar; o pós-submit deve passar por [[Comportamento Pós-Registro]]
- Ações administrativas devem apontar para `APP_ROUTE_PATHS`, não strings livres de rota
- A opção **Configurações das telas** deve apontar para `APP_ROUTE_PATHS.screenSettings` e permanecer acessível para usuários padrão
- Na tela de configurações por formulário, as categorias devem ser separadas com `notTintedCardClassName`; os accordions precisam manter a ilustração contextual, nome e resumo pesquisáveis de cada tela, com o resumo alinhado diretamente abaixo do nome — nunca abaixo da ilustração
- O campo **Tela de retorno** deve abrir um `Actionsheet` próprio, no padrão da escolha de ícone de [[Gerenciamento de Tags]], com busca, ilustração contextual, descrição de cada destino e destaque da opção selecionada; não usar o seletor nativo do Android nem numeração como identificador visual nesse fluxo
- Configurações de edição não devem expor controle de limpeza: podem escolher o mesmo destino alternativo dos cadastros e, ao permanecer, conservam os valores editados
- O switch **Mostrar no app** é uma preferência deste aparelho, começa habilitado salvo as exceções deliberadas **Anotações**; deve ocultar o destino do navigator e bloquear a rota, sem ser persistido no perfil Firebase do usuário.
- Os accordions de bancos e categorias ficam sob **Relações dentro do Aplicativo**; preferências de valores, configurações das telas e tema ficam sob **Configurações avançadas**.
- O vínculo de outro usuário é iniciado no [[Perfil do Usuário]] e continua respeitando a preferência `addUserRelation` de [[Visibilidade de Rotas]].
- Os toggles "Modo escuro" e "Ocultar valores" devem manter o switch preso ao extremo direito da linha mesmo quando houver texto auxiliar
- O toggle "Modo escuro" deve explicar no popover que a preferência altera toda a interface e persiste entre sessões
- O toggle "Ocultar valores" deve explicitar no popover que a ocultação é apenas visual
- As tabelas de bancos e categorias devem carregar somente quando o accordion correspondente estiver aberto.

## Ajuste de saldo — 2026-09-30

**Ajuste de saldo** integra **Relações dentro do Aplicativo** em ambas as plataformas, com a ilustração `bankBalanceAdjustmentScreen.svg` e ação **Ajustar saldo do banco**. Abre o formulário de conferência descrito em [[Ajuste de Saldo]].
