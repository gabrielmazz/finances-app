# Auditoria e padronização de design — Lumus Finanças

> Documento vivo. Cada fase registra evidências, alterações, validações e limitações para que a auditoria possa ser retomada sem perder contexto.

## Checkpoint — extrato bancário Web e mobile, 2026-09-24

**Correção complementar do warning React:** quatro textos da timeline Web e dois textos do seletor Web de banco passavam `numberOfLines={1}` ao `Text` Gluestack, que renderiza um `<span>` e encaminha a prop desconhecida ao DOM. Esses seis usos agora recebem `isTruncated`, preservando a intenção de uma linha pelo contrato Web. A variante nativa continua usando `numberOfLines`. `npm run typecheck` e `git diff --check` passaram; `npm run lint:styles` continua limitado às pendências anteriores de Configurações Web e `useScreenStyles`.

**Inventário:** `/web/bank-movements` usa `screens/web/BankMovementsScreen.web.tsx` com Mantine `Tabs`/`TagsInput`, seletores compartilhados, resumo, timeline e PDF; `/mobile/bank-movements` usa `screens/mobile/BankMovementsScreen.tsx` com Gluestack/NativeWind, botões nativos de tipo, categorias em rolagem, resumo, timeline e PDF. Ambas as rotas aceitam banco e período, e a visão de Caixa não requer seleção de banco. Referências: [[Exemplo Home Web]], [[Exemplo Home Mobile]], [[Gerenciamento de Bancos]], [[Sistema de Temas]].

| Severidade | Achado e causa | Correção | Validação | Risco residual |
|---|---|---|---|---|
| P2 | A tab Web ativa projetava sombra amarela sob o card; ícone e texto selecionados podiam divergir. | Variante das `Tabs` Mantine sem sombra ativa, com ícone, label e variável de texto em branco. | `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. | Branco sobre amarelo tem contraste baixo; conferir leitura em ambos os temas no navegador autenticado. |
| P2 | O campo de categorias Web usava placeholder `slate-500` e padding interno extra, destoando do formulário de despesas. | Token resolvido `#505D74` no adaptador Mantine, sem padding extra; label e altura base seguem os contratos dos inputs Web. | TypeScript e export Web passaram. | Conferir visualmente placeholder, foco, seleção múltipla e conteúdo longo no navegador. |
| P2 | O placeholder do filtro de categorias ficava centralizado horizontalmente; pills encostavam na borda e o menu escuro mantinha ícones apagados. O X de limpar herdava o fundo cinza inline do Mantine. | Placeholder e pills recuados à esquerda e centrados verticalmente; placeholder oculto com seleção; menu e opções `#FACC15` com texto, contagens e ícones brancos; X individuais brancos e botão de limpar transparente. | Inspeção dos estilos Mantine e checagens TypeScript/Web. | Conferir contraste e estados de foco, hover e múltiplas categorias no navegador autenticado. |
| P2 | A busca já ocorria ao entrar e ao mudar banco/período, mas havia outro botão de consulta nas duas telas; a ausência de banco criava um card de erro e o seletor Web podia exibir “Banco selecionado” sem conta escolhida. | Removidos os dois botões. Sem banco, a consulta aguarda a seleção, limpa o erro e mostra o placeholder do seletor; erros reais de data, autenticação e rede continuam visíveis. | Fluxo `useFocusEffect(fetchMovements)` e seletor compartilhado inspecionados; TypeScript passou. | Conferir troca rápida de banco/período com sessão real. |
| P2 | Textos da tela, detalhes e PDF alternavam “tag” e “categoria”. | Terminologia visível padronizada em “categoria”; `tagId` e consultas Firestore permanecem no contrato de dados. | Busca textual e TypeScript passaram. | Nomes de campos internos ainda usam `tag` por compatibilidade. |
| P2 | Os três botões de tipo no mobile tinham `maxWidth: 104` e, após a equalização da largura, ficaram sem separação horizontal; no tema escuro o selecionado não exibia texto/ícone brancos. | Cada botão ocupa uma fração igual da largura com `gap-1` entre eles; conteúdo selecionado branco e estado `selected` acessível. | TypeScript passou. | Conferir fonte ampliada e largura estreita em aparelho. |
| P3 | Erros assíncronos e categorias nativas não indicavam todos os estados ao leitor de tela. | Erros anunciam mudanças de forma educada; tipos e categorias nativos expõem nome e estado selecionado/desabilitado. | Revisão estática de estados e TypeScript passaram. | TalkBack/VoiceOver e teclado Web não puderam ser exercitados nesta execução. |

**Estados revisados:** normal, carregando, lista vazia, falha, período inválido, seleção desabilitada durante consulta, categoria sem opções, foco/pressionado, movimento expandido, exportação e texto extenso. O loading permanece na timeline após a remoção do botão. O novo estado Mantine e o token do placeholder foram registrados na linha de base de estilos; `npm run lint:styles` segue bloqueado somente por `ConfigurationsScreen.web.tsx` e pela linha de base global de `useScreenStyles` (55/54). O Chrome DevTools MCP não está disponível, então não houve captura autenticada ou medição de Core Web Vitals; Android/iOS também não foram renderizados em aparelho.

## Checkpoint — timeline de movimentos bancários Web, 2026-09-24

| Severidade | Achado e causa | Correção | Validação | Risco residual |
|---|---|---|---|---|
| P2 | `BankMovementsScreen.web.tsx` tinha um card de movimento com hierarquia e expansão diferentes das listas Web de despesas obrigatórias e investimentos. | A lista passou a usar os contratos de trilho, cabeçalho, identidade, valor/data e painel expansível de `WEB_DASHBOARD_CLASS_NAMES`, com `AnimatedContent` e `Grainient`; paletas, filtros, metadados e ações financeiras foram preservados. A variante mobile permaneceu intacta. | `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` não apontou nova dívida no extrato, mas ainda falha por ocorrências existentes em `ConfigurationsScreen.web.tsx` e pela linha de base de `useScreenStyles`. | A inspeção visual com movimentos reais requer sessão autenticada no navegador, indisponível nesta execução. |

## Checkpoint — remoção do card bancário mobile, 2026-09-24

| Severidade | Achado e causa | Correção | Validação | Risco residual |
|---|---|---|---|---|
| P2 | `BankMovementsScreen.tsx` mostrava um card colorido com banco, período, saldo e totais gerais antes dos filtros, duplicando contexto já indicado pelo título e pelo resumo do extrato. | Removido o card e sua coluna responsiva; os filtros ocupam a largura disponível, o resumo filtrado continua na tela e os totais gerais continuam no PDF. | `npm run typecheck` e `git diff --check` passaram. `npm run lint:styles` não apontou nova dívida nessa tela, mas segue falhando pelas ocorrências preexistentes em `ConfigurationsScreen.web.tsx` e pela linha de base de `useScreenStyles`. | Não houve inspeção visual em aparelho nesta execução. |

## Checkpoint — seletor de banco no extrato mobile, 2026-09-24

| Severidade | Achado e causa | Correção | Validação | Risco residual |
|---|---|---|---|---|
| P2 | `BankMovementsScreen.tsx` dependia do `bankId` da rota, impedindo escolher ou trocar de conta sem sair da tela. | Reutilizado `BankActionsheetSelector` antes dos filtros de período. A rota mantém o banco inicial; sem `bankId`, o seletor permite escolher uma conta ativa. A troca atualiza o título e recarrega o extrato, preservando período/tipo e zerando a tag selecionada. Caixa continua sem seletor. | `npm run typecheck` e `git diff --check` passaram. `npm run lint:styles` continua bloqueado por dívidas em `design-system/mantine.ts`, `design-system/tokens.ts`, `ConfigurationsScreen.web.tsx` e pelo limite global de `useScreenStyles`; nenhum desses arquivos foi alterado nesta correção. | A inspeção visual em aparelho não foi feita nesta execução. |

## Checkpoint — Home Web e inventário Mobile, 2026-09-24

| Severidade | Achado e causa | Correção | Validação | Risco residual |
|---|---|---|---|---|
| P2 | `design-system/web-dashboard.ts`: os três blocos de gráficos/compromissos tinham `px-3` ou `px-4`, estreitando o conteúdo em relação a bancos e movimentações. | Removido apenas o padding horizontal de `expenseChartSection`, `activityHeatmapSection` e `mandatorySection`; largura total e molduras internas preservadas. | `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. | Gráfico e heatmap podem precisar de rolagem própria em larguras estreitas; confirmar no navegador autenticado. |
| P2 | `screens/mobile/HomeScreen.tsx`: três ícones de ajuda anunciavam “formato de pagamento”, texto sem relação com a seção. | Rótulos específicos de bancos, investimentos e movimentações. | `npm run typecheck` passou; leitura com TalkBack/VoiceOver pendente. | Alvos de ajuda de 14 px mais `hitSlop={8}` podem ficar abaixo de 44 px. |
| P2 | `screens/mobile/HomeScreen.tsx`: banco, gráfico e expansão da timeline não expunham ação/estado suficiente ao leitor de tela. | Adicionados papel, nome e estado expandido onde aplicável. | `npm run typecheck` passou; leitura com TalkBack/VoiceOver pendente. | Cabeçalho expansível ainda contém um popover aninhado; conferir ordem de foco e ativação. |

As referências reutilizáveis desta fase estão em [[Exemplo Home Web]] e [[Exemplo Home Mobile]]. A Home não contém inputs de texto; a padronização dos campos de formulário usa [[Componentes UI]].

`npm run lint:styles` continua bloqueado pelas alterações já presentes em `ConfigurationsScreen.web.tsx` e pela linha de base global de `useScreenStyles` (55 consumidores contra 54). O Chrome DevTools MCP não está configurado nesta sessão; não foram medidos Core Web Vitals.

## Checkpoint — Home Web sem cards externos, 2026-09-19

- **Achado:** `Gastos por dia`, `Atividade no ano` e `Próximos compromissos` ainda apresentavam uma moldura externa, embora os gráficos, labels e cards internos já expressassem a hierarquia necessária.
- **Correção:** `HomeScreen.web.tsx` mantém os conteúdos e estados originais e remove somente `border`/`rounded-section` dos três wrappers; o padding estrutural permanece, e os cards de cada coluna de compromissos não foram alterados.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` continua falhando por dívidas já existentes no dashboard/configurações e na linha de base de `useScreenStyles`.
- **Risco residual:** não houve sessão autenticada disponível para inspeção visual com dados reais nem medição de Core Web Vitals; o Chrome DevTools MCP não está configurado.

## Checkpoint — padronização dos labels de seção Web, 2026-09-19

- **Achado:** os títulos da Home Web e o label **Rentabilidade por período** usavam combinações diferentes de tamanho, peso e espaçamento, enquanto **Calendário de Vencimentos** já estabelecia uma hierarquia clara para cabeçalhos de seção.
- **Correção:** `WEB_DASHBOARD_CLASS_NAMES.sectionHeadingText` agora centraliza `text-lg font-bold uppercase tracking-widest`; a Home aplica o contrato às seis seções citadas, a carteira aplica-o em **Rentabilidade por período** e `date-calendar.web.tsx` explicita o mesmo contrato no cabeçalho de referência. Nenhum conteúdo, estado, ação ou fluxo financeiro foi alterado.
- **Validação:** `npm run typecheck`, `npm run typecheck:backend`, `npm run test -- --runInBand` (38 suítes/222 testes), `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` e o gate `npm run check` continuam bloqueados somente pela dívida preexistente de `ConfigurationsScreen.web.tsx` e pela linha de base de `useScreenStyles`.
- **Risco residual:** não há Chrome DevTools MCP disponível para captura autenticada, medição de Core Web Vitals ou inspeção visual em runtime; a revisão desta fase fica limitada ao código e ao build estático.

## Checkpoint — separação do cabeçalho da carteira Web, 2026-09-19

- **Achado:** o cabeçalho recolhido da timeline de investimentos agrupava visualmente valor, liquidez e chevron, reduzindo a separação entre identidade e metadados observada na timeline de gastos obrigatórios.
- **Correção:** `FinancialListScreen.web.tsx` passou a usar uma linha de largura total, com identidade flexível à esquerda e `movementAmount` ancorado à direita; liquidez e chevron ficam juntos na linha inferior do bloco de valor.
- **Validação:** `npm run typecheck` e `git diff --check` passaram. `npm run lint:styles` continua limitado às dívidas preexistentes de `ConfigurationsScreen.web.tsx` e da linha de base de `useScreenStyles`.
- **Risco residual:** não houve sessão autenticada nem Chrome DevTools MCP disponível para inspeção visual com dados reais.

## Checkpoint — tamanho responsivo dos modais da carteira Web, 2026-09-19

- **Achado:** os oito modais de `FinancialListScreen.web.tsx` recebiam `max-w-[360px]` diretamente em `ModalContent`, comprimindo formulários longos e ignorando o tamanho responsivo do componente compartilhado.
- **Correção:** a variante Web passou a declarar `Modal size="md"` e usa somente `modalContentClassName`; os diálogos ocupam aproximadamente 80% da viewport, limitados a 510px, enquanto Android/iOS continuam com a composição nativa compacta.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` continua limitado às dívidas preexistentes em `ConfigurationsScreen.web.tsx` e na linha de base de `useScreenStyles`.
- **Risco residual:** não houve sessão autenticada nem Chrome DevTools MCP disponível para inspeção visual e medição de Core Web Vitals.

## Checkpoint — gráfico sem moldura externa na carteira Web, 2026-09-19

- **Achado:** o gráfico de evolução ainda carregava um `Box` externo, um título com ícone e um subtítulo que duplicavam a informação visual e mantinham uma moldura desnecessária ao redor do `AreaChart`.
- **Correção:** `FinancialListScreen.web.tsx` mantém o gráfico em sua linha exclusiva, mas renderiza somente a superfície transparente do `InvestmentEvolutionChart`; o `AreaChart`, suas séries, legenda, tooltip, privacidade e rolagem horizontal permanecem inalterados.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` continua condicionado à dívida preexistente de `screens/web/ConfigurationsScreen.web.tsx` e da linha de base de `useScreenStyles`; o Chrome DevTools MCP segue indisponível para Core Web Vitals.
- **Risco residual:** não houve sessão autenticada disponível para inspeção visual com dados reais.

## Checkpoint — label utilitário do gráfico da carteira Web, 2026-09-19

- **Achado:** após retirar o cabeçalho descritivo do gráfico, faltava a identificação compacta usada pelos gráficos da lista de despesas obrigatórias.
- **Correção:** `FinancialListScreen.web.tsx` adicionou o label **Evolução da carteira** com `helperText`, caixa alta e `mt-1`, seguido por `gap-2`, no mesmo formato de `MandatoryExpensesListScreen.web.tsx`. O gráfico continua sem card externo e sem subtítulo.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram; `npm run lint:styles` permanece limitado à dívida preexistente da central de configurações e da linha de base de `useScreenStyles`.
- **Risco residual:** não houve sessão autenticada disponível para inspeção visual com dados reais.

## Checkpoint — hierarquia vertical da carteira Web, 2026-09-18

- **Achado:** no desktop, o resumo de indicadores e o card de evolução ocupavam colunas lado a lado, reduzindo a largura disponível para o gráfico e enfraquecendo a leitura sequencial da carteira.
- **Correção:** `FinancialListScreen.web.tsx` passou a manter os indicadores — patrimônio estimado, rendimento acumulado, aplicado líquido e próximo dia — e as tabs de rentabilidade acima; o gráfico de evolução agora ocupa uma linha exclusiva abaixo. A alteração é estrutural apenas: dados, privacidade, série Expo DOM, cálculos em centavos e ações Firebase permanecem iguais.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` continua falhando somente pela dívida preexistente de `screens/web/ConfigurationsScreen.web.tsx` e da linha de base de `useScreenStyles`; a carteira não adicionou ocorrências. A medição de Core Web Vitals não foi feita porque o Chrome DevTools MCP não está configurado neste ambiente.
- **Risco residual:** não houve sessão autenticada para inspeção visual com dados reais; a avaliação fica limitada ao código e ao export Web.

## Checkpoint — carteira Web, 2026-09-18

- **Achado:** a timeline de investimentos preservava a estrutura de toque e o gradiente estático da composição mobile, enquanto os formulários dos modais não consumiam o contrato de labels Web. Isso deixava foco de teclado, expansão e hierarquia visual diferentes das demais listas convertidas.
- **Correção:** `FinancialListScreen.web.tsx` passou a reutilizar o trilho, a superfície expansível `Grainient`, a entrada/saída `AnimatedContent`, o foco `lumus-focus` e o alvo de 44 px da timeline Web de despesas obrigatórias. A rolagem passou para o contêiner externo e a `sheet` é uma `View`, replicando o encaixe imediato entre hero e formulário de `AddRegisterExpensesScreen.web.tsx` e `AddRegisterGainScreen.web.tsx`; o bloco interno usa `pt-4`, equivalente aos 16px do encaixe de `MandatoryGainsListScreen.web.tsx`, sem o excesso de `pt-7`. Os campos reutilizáveis dos modais recebem `WEB_EXPENSE_CLASS_NAMES`; loaders Firebase, privacidade, cálculos em centavos e os sete fluxos operacionais foram preservados.
- **Validação:** `npm run typecheck`, `npm run web:export` e `git diff --check` passaram. `npm run lint:styles` não introduz dívida na carteira; o comando ainda falha pela variante pré-existente `screens/web/ConfigurationsScreen.web.tsx`, fora deste escopo.
- **Risco residual:** não houve sessão autenticada disponível para inspeção visual dos dados reais ou medição de Core Web Vitals; o ambiente não expõe o MCP Chrome DevTools requerido para a coleta.

## Checkpoint — Configurações Web e carregamento contextual, 2026-09-18

- **Achado:** `/web/home?tab=2` reutilizava a tela mobile; além disso, a consulta de `adminUser` substituía toda a central por um skeleton, embora apenas a seção de usuários dependa dessa permissão.
- **Correção:** criada `screens/web/ConfigurationsScreen.web.tsx` e selecionada explicitamente por `HomeTabsScreen.web.tsx`. A variante Web não monta o navigator inferior nativo. Nas duas plataformas, a central permanece disponível durante a checagem de administrador e os carregamentos das coleções permanecem no accordion correspondente.
- **Validação:** lint de estilos identificou a nova variante como dívida a registrar/refatorar por ter partido da composição canônica. A referência preexistente a `TouchableOpacity` na carteira foi substituída durante a padronização seguinte; `npm run typecheck` e `npm run web:export` passam.
- **Risco residual:** a composição Web ainda compartilha contratos visuais legados da central (uso da fachada `useScreenStyles` e estilos de fronteira React Native Web); uma redução dessa dívida requer extrair os contratos de tabela/shell, fora desta correção funcional.

## Checkpoint — ações primárias com texto branco, 2026-09-14

- **Achado:** o amarelo claro `#FACC15` com texto branco tem contraste de 1,53:1.
- **Correção:** conforme a preferência visual definida para os botões primários, o fundo mantém exatamente `lumus-accent` (`#FACC15`) e texto/ícones ficam brancos nos temas claro/escuro. O estilo sólido foi separado das cores amarelas específicas de links/contornos para que `dark:text-yellow-300` não sobrescreva o branco.
- **Validação:** `npm run lint:styles`, `npm run check` (38 suítes/222 testes), `npm run web:export` e `git diff --check` passaram; export Web contém `bg-lumus-accent` e `text-white`.
- **Risco residual:** contraste reduzido permanece por decisão visual; sem captura visual autenticada ou renderização em Android/iOS nesta execução.

## Checkpoint — foco dos campos, 2026-09-14

- **Achado:** o anel compartilhado usava `lumus-focus` a 35% e os campos do login Web removiam o anel com `ring-0`; o `Select` arredondado também desviava para o azul `primary`.
- **Correção:** os campos Gluestack usam o anel sólido `lumus-accent` com borda `lumus-focus`; `Select` mantém o amarelo, adaptadores Mantine usam o mesmo anel e o login herda o estilo compartilhado. Estados inválidos continuam vermelhos.
- **Validação:** lint de estilos, type-check do app/backend e 38 suítes/222 testes aprovados em `npm run check`; `npm run web:export` compilou e incluiu as classes do anel.
- **Risco residual:** não houve smoke visual em navegador nem conferência em dispositivos Android/iOS nesta execução.

## Checkpoint — foco mobile e bordas neutras dos campos, 2026-09-14

- **Achado:** os estados `focus` sem escopo se propagavam a contêineres e cards; ao remover o contorno amarelo indevido, a borda neutra dos campos nativos também havia sido removida, dificultando identificar inputs em repouso.
- **Correção:** estados pseudo de foco ficaram restritos à Web; inputs nativos usam borda neutra em repouso e contorno `lumus-accent` de 2 px ao focar. Selects e campos de data/horário/banco/categoria indicam quando estão abertos, e cards estáticos mantêm somente sua borda neutra.
- **Validação:** `npm run check` (38 suítes/222 testes), lint de estilos, export Web, export Android e `git diff --check` passaram.
- **Risco residual:** Android/iOS não foram renderizados em aparelho ou simulador neste host.

## Escopo e linha de base

- **Aplicação:** Expo Router 57, React Native 0.86, React 19.2.3, Gluestack UI 3, NativeWind 4.2.1 e Tailwind CSS 3.4.18.
- **Plataformas:** web responsiva, Android e iOS.
- **Princípio de migração:** Tailwind/NativeWind é a fonte canônica de apresentação. Objetos nativos e CSS permanecem apenas em fronteiras que não aceitam `className`, com registro na seção de exceções.
- **Compatibilidade:** a atualização para NativeWind 5/Tailwind 4 permanece fora do escopo porque o histórico do projeto registra tela branca nessa combinação. A padronização usa a base estável instalada.
- **Validação final em 11/09/2026:** type-check do app e backend aprovados, 38 suítes/222 testes aprovados, export web aprovado e lint de arquitetura de estilos aprovado. A inspeção visual cobriu o login público em viewport móvel e desktop; as limitações de plataforma estão registradas abaixo.

## Checkpoint — Fase 1: inventário completo

**Status:** concluída antes da primeira alteração de código.

### Rotas e telas

As 24 rotas funcionais são prefixadas por plataforma (`/mobile` ou `/web`): login, home, Lumus IA, análise por categoria, previsão financeira, anotações, cadastros de banco/usuário/despesa/ganho/categoria, gastos e ganhos obrigatórios, investimento, saque, vínculo de usuário, testes, configuração de telas, saldo mensal, movimentos bancários, resumo bancário, lista financeira e transferência. `bank-summary` é um redirecionamento; os adaptadores de `app/` permanecem finos.

| Tela | Plataforma | Rota | Arquivo principal | Componentes predominantes | Fonte atual de estilização | Inconsistência/impacto | Prioridade |
|---|---|---|---|---|---|---|---|
| Login | mobile | `/mobile/login` | `screens/mobile/LoginScreen.tsx` | Gluestack, formulário, wallpaper | `useScreenStyles`, NativeWind, estilos dinâmicos | Tokens e estados distribuídos | P1 |
| Home | mobile | `/mobile/home` | `screens/mobile/HomeScreen.tsx` | cards bancários, gráficos, carrossel, modais | `useScreenStyles`, NativeWind, estilos de gráficos | Paleta paralela e estilos de biblioteca locais | P1 |
| Abas da Home | mobile | `/mobile/home` | `screens/mobile/HomeTabsScreen.tsx` | navegador, dashboard, configurações | NativeWind e navigator | Shell diverge da web | P2 |
| Lumus IA | mobile | `/mobile/lumus-assistant` | `screens/mobile/LumusAssistantScreen.tsx` | chat, drawer, modal, áudio | `useScreenStyles`, NativeWind | Estados extensos sem contrato visual único | P2 |
| Análise por categoria | mobile | `/mobile/category-analysis` | `screens/mobile/CategoryAnalysisScreen.tsx` | filtros, gráfico, seletor | `useScreenStyles`, NativeWind, styles de gráfico | Cores e dimensões de gráfico locais | P2 |
| Previsão financeira | mobile | `/mobile/financial-forecast` | `screens/mobile/FinancialForecastScreen.tsx` | filtros, gráfico, cards | `useScreenStyles`, NativeWind, styles de gráfico | Estados e gráficos parcialmente locais | P2 |
| Anotações | mobile/web fallback | `/mobile/annotations`, `/web/annotations` | `screens/mobile/LocalAnnotationsScreen.tsx` | `FlatList`, editor, modal | `useScreenStyles`, NativeWind | Única lista virtualizada; editor web possui CSS próprio | P2 |
| Registrar banco | mobile/web fallback | `/mobile/add-register-bank`, `/web/add-register-bank` | `screens/mobile/AddRegisterBankScreen.tsx` | formulário, seletor de ícone | `useScreenStyles`, NativeWind | Variante web não dedicada | P2 |
| Registrar usuário | mobile | `/mobile/add-register-user` | `screens/mobile/AddRegisterUserScreen.tsx` | formulário, popovers | `useScreenStyles`, NativeWind | Classes repetidas de formulário | P1 |
| Registrar despesa | mobile | `/mobile/add-register-expenses` | `screens/mobile/AddRegisterExpensesScreen.tsx` | formulário financeiro, date picker, seletores | `useScreenStyles`, NativeWind, styles nativos | Contratos de input duplicados | P1 |
| Registrar ganho | mobile | `/mobile/add-register-gain` | `screens/mobile/AddRegisterGainScreen.tsx` | formulário financeiro, date picker, seletores | `useScreenStyles`, NativeWind, styles nativos | Contratos de input duplicados | P1 |
| Registrar categoria | mobile | `/mobile/add-register-tag` | `screens/mobile/AddRegisterTagScreen.tsx` | formulário, busca e grade de ícones | `useScreenStyles`, NativeWind | Estados de seleção locais | P2 |
| Gasto obrigatório | mobile | `/mobile/add-mandatory-expenses` | `screens/mobile/AddMandatoryExpensesScreen.tsx` | formulário, parcelas, lembrete | `useScreenStyles`, NativeWind, estilos de picker | Densidade e estados complexos sem variante única | P1 |
| Ganho obrigatório | mobile | `/mobile/add-mandatory-gains` | `screens/mobile/AddMandatoryGainsScreen.tsx` | formulário, parcelas, lembrete | `useScreenStyles`, NativeWind, estilos de picker | Densidade e estados complexos sem variante única | P1 |
| Investimento | mobile | `/mobile/add-finance` | `screens/mobile/AddFinanceScreen.tsx` | formulário financeiro, seletores | `useScreenStyles`, NativeWind | Contratos de input duplicados | P2 |
| Saque | mobile | `/mobile/add-rescue` | `screens/mobile/AddRescueScreen.tsx` | formulário, banco, data | `useScreenStyles`, NativeWind | Classes de formulário repetidas | P1 |
| Relacionar usuário | mobile | `/mobile/add-user-relation` | `screens/mobile/AddUserRelationScreen.tsx` | formulário, popovers | `useScreenStyles`, NativeWind | Classes de formulário repetidas | P2 |
| Testes do app | mobile/web fallback | `/mobile/app-tests`, `/web/app-tests` | `screens/mobile/AppTestsScreen.tsx` | ações administrativas | `useScreenStyles`, NativeWind | Variante web não dedicada | P3 |
| Configurações | mobile/web fallback | `/mobile/home?tab=2`, `/web/home?tab=2` | `screens/mobile/ConfigurationsScreen.tsx` | tabelas, switches, modais | `useScreenStyles`, NativeWind, styles nativos | Maior concentração de variantes e estados | P1 |
| Configuração das telas | mobile | `/mobile/screen-settings` | `screens/mobile/ScreenSettingsScreen.tsx` | busca, cards, selects | `useScreenStyles`, NativeWind | Tokens locais e conteúdo longo | P2 |
| Saldo mensal | mobile | `/mobile/register-monthly-balance` | `screens/mobile/AddRegisterMonthlyBalanceScreen.tsx` | formulário, banco, data | `useScreenStyles`, NativeWind | Classes repetidas de formulário | P1 |
| Movimentos bancários | mobile | `/mobile/bank-movements` | `screens/mobile/BankMovementsScreen.tsx` | filtros, listas, detalhes, modais | `useScreenStyles`, NativeWind, styles de gráfico | Tela de 4 mil linhas e estilos locais extensos | P1 |
| Lista financeira | mobile | `/mobile/financial-list` | `screens/mobile/FinancialListScreen.tsx` | listas, sete modais, formulários | `useScreenStyles`, NativeWind, styles de gráficos | Tela de 3 mil linhas e variantes duplicadas | P1 |
| Gastos obrigatórios | mobile | `/mobile/mandatory-expenses` | `screens/mobile/MandatoryExpensesListScreen.tsx` | calendário, lista, ações | `useScreenStyles`, NativeWind, styles nativos | Estados complexos e duplicação web/mobile | P1 |
| Ganhos obrigatórios | mobile | `/mobile/mandatory-gains` | `screens/mobile/MandatoryGainsListScreen.tsx` | calendário, lista, ações | `useScreenStyles`, NativeWind, styles nativos | Estados complexos e duplicação web/mobile | P1 |
| Transferência | mobile | `/mobile/transfer-screen` | `screens/mobile/TransferScreen.tsx` | formulário, seletores bancários | `useScreenStyles`, NativeWind | Classes repetidas de formulário | P1 |
| Login | web | `/web/login` | `screens/web/LoginScreen.web.tsx` | formulário, Grainient, StrokeText | NativeWind, CSS de efeitos, styles DOM | Fontes e efeitos fora do tema | P1 |
| Home | web | `/web/home` | `screens/web/HomeScreen.web.tsx` | dashboard, Carousel, Grainient, gráficos | `useScreenStyles`, NativeWind, CSS/JS de efeitos | Mapa de classes centralizado no hook errado | P1 |
| Abas da Home | web | `/web/home` | `screens/web/HomeTabsScreen.web.tsx` | shell e dashboard | NativeWind, navegador web | Breakpoint e shell separados | P2 |
| Registrar usuário | web | `/web/add-register-user` | `screens/web/AddRegisterUserScreen.web.tsx` | formulário, hero | `useScreenStyles`, NativeWind | Repetição com telas de cadastro | P1 |
| Registrar despesa | web | `/web/add-register-expenses` | `screens/web/AddRegisterExpensesScreen.web.tsx` | formulário, hero, select | `useScreenStyles`, NativeWind, styles DOM | Input e tipografia locais | P1 |
| Registrar ganho | web | `/web/add-register-gain` | `screens/web/AddRegisterGainScreen.web.tsx` | formulário, hero, select | `useScreenStyles`, NativeWind, styles DOM | Input e tipografia locais | P1 |
| Investimento | web | `/web/add-finance` | `screens/web/AddFinanceScreen.web.tsx` | formulário, hero, seletor e saldo bancário | tokens Web, NativeWind, animação DOM | Hero e estados de saldo; banco/saldo alinhados em linha no desktop | P2 |
| Registrar categoria | web | `/web/add-register-tag` | `screens/web/AddRegisterTagScreen.web.tsx` | formulário, busca de ícones | `useScreenStyles`, NativeWind | Estados de seleção locais | P2 |
| Gasto obrigatório | web | `/web/add-mandatory-expenses` | `screens/web/AddMandatoryExpensesScreen.web.tsx` | formulário, Mantine, calendário | `useScreenStyles`, NativeWind, Mantine styles | Duas fontes visuais no formulário | P1 |
| Ganho obrigatório | web | `/web/add-mandatory-gains` | `screens/web/AddMandatoryGainsScreen.web.tsx` | formulário, Mantine, calendário | `useScreenStyles`, NativeWind, Mantine styles | Duas fontes visuais no formulário | P1 |
| Saque | web | `/web/add-rescue` | `screens/web/AddRescueScreen.web.tsx` | formulário, hero, select | `useScreenStyles`, NativeWind | Repetição com cadastros | P1 |
| Relacionar usuário | web | `/web/add-user-relation` | `screens/web/AddUserRelationScreen.web.tsx` | formulário, hero | `useScreenStyles`, NativeWind | Repetição com cadastros | P2 |
| Saldo mensal | web | `/web/register-monthly-balance` | `screens/web/AddRegisterMonthlyBalanceScreen.web.tsx` | formulário, hero, select | `useScreenStyles`, NativeWind | Repetição com cadastros | P1 |
| Movimentos bancários | web | `/web/bank-movements` | `screens/web/BankMovementsScreen.web.tsx` | filtros, Mantine, gráficos, modais | `useScreenStyles`, NativeWind, Mantine styles | Quatro mil linhas; paleta de gráficos local | P1 |
| Análise por categoria | web | `/web/category-analysis` | `screens/web/CategoryAnalysisScreen.web.tsx` | filtros e gráficos Mantine | `useScreenStyles`, NativeWind, Mantine styles | Paleta e tipografia de gráfico local | P2 |
| Previsão financeira | web | `/web/financial-forecast` | `screens/web/FinancialForecastScreen.web.tsx` | filtros e gráficos | `useScreenStyles`, NativeWind, Mantine styles | Paleta de gráfico local | P2 |
| Lista financeira | web | `/web/financial-list` | `screens/web/FinancialListScreen.web.tsx` | listas, sete modais, formulários | `useScreenStyles`, NativeWind, styles de biblioteca | Alta duplicação com mobile | P1 |
| Gastos obrigatórios | web | `/web/mandatory-expenses` | `screens/web/MandatoryExpensesListScreen.web.tsx` | calendário, Grainient, modais | `useScreenStyles`, NativeWind, CSS/JS de efeito | Estados complexos e estilos de efeito locais | P1 |
| Ganhos obrigatórios | web | `/web/mandatory-gains` | `screens/web/MandatoryGainsListScreen.web.tsx` | calendário, Grainient, modais | `useScreenStyles`, NativeWind, CSS/JS de efeito | Estados complexos e estilos de efeito locais | P1 |
| Configuração das telas | web | `/web/screen-settings` | `screens/web/ScreenSettingsScreen.web.tsx` | busca, cards, selects | `useScreenStyles`, NativeWind | Conteúdo longo e tokens locais | P2 |
| Transferência | web | `/web/transfer-screen` | `screens/web/TransferScreen.web.tsx` | formulário, seletores bancários | `useScreenStyles`, NativeWind | Repetição com cadastros | P1 |

### Componentes, shells e estados

- **Primitives:** 31 famílias em `components/ui`, geradas sobre Gluestack e `tva`.
- **Componentes de plataforma/domínio:** 110 arquivos em `components/mobile`, `components/web` e `components/uiverse`.
- **Shells:** `AppRoot`, `WebAppShell`, `Navigator`, `HomeTabsScreen`, safe-area/keyboard/scroll definidos nas telas.
- **Overlays:** modais, drawers, action sheets, popovers e tooltips distribuídos pelas telas; `FinancialListScreen` possui sete modais em cada plataforma.
- **Estados observados:** loading/skeleton, vazio, erro/retry, sucesso/toast, inválido, disabled, foco, hover/pressed e detalhes expandidos. A presença é desigual; a validação tela a tela será registrada nas fases 6 e 9.
- **Formulários:** Gluestack no mobile e combinação Gluestack/Mantine no web. `web-select-field`, date picker, time picker e seletores de banco/categoria são abstrações compartilhadas por plataforma.

### Fontes de estilização encontradas

| Fonte | Evidência | Decisão |
|---|---:|---|
| Tailwind/NativeWind em `className` | fonte majoritária em telas e primitives | padrão obrigatório |
| `hooks/useScreenStyle.ts` | 54 consumidores; classes, cores, objetos e layout misturados | dividir fonte visual de informação de layout, mantendo fachada compatível |
| Objetos `style`/callbacks | 1.304 ocorrências lexicais no projeto | migrar valores estáticos; registrar fronteiras nativas/gráficas |
| Literais hexadecimais | 1.322 ocorrências lexicais | substituir por tokens; manter somente APIs que exigem cor resolvida |
| Valores arbitrários Tailwind | mobile 1.080; web 965; UI/shared 997 | promover recorrências a tokens e dimensões nomeadas |
| `StyleSheet.create` | 8 arquivos | migrar shells/estáticos; manter somente adaptadores nativos comprovados |
| CSS global | `global.css` | manter como entrada Tailwind e tokens globais |
| CSS isolado | `StaggeredMenu`, `Carousel`, `Grainient`, `StrokeText`, `Aurora` | migrar estrutura para classes; limitar CSS a APIs DOM/WebGL/SVG |
| Mantine styles/classNames | formulários e gráficos web | centralizar adaptadores de biblioteca |

Contagens são lexicais e incluem propriedades dinâmicas exigidas por gráficos, WebGL, SVG, animações e APIs nativas; portanto não equivalem automaticamente a violações.

### Configuração, tema, assets e ferramentas

- `tailwind.config.js` contém as escalas do Gluestack, cinco famílias de fonte, sombras e safelist; faltam tokens Lumus nomeados para conteúdo, controles, foco, elevação, movimento e z-index. A opção `important: 'html'` gera `!important` globalmente e será removida se a exportação continuar estável.
- `global.css` importa Geist e as três camadas Tailwind, mas não define `color-scheme`, foco canônico nem `prefers-reduced-motion`.
- `ThemeContext` mantém o modo claro/escuro e persiste a preferência; não deve conter decisões visuais adicionais.
- Há cinco fontes locais. `App.tsx` legado referencia `Obitron`, enquanto o asset é `Orbitron`; a entrada principal atual é `index.ts`, via Expo Router, e as fontes locais não são carregadas pelo layout ativo.
- Assets incluem logos, wallpaper PNG/SVG, quatro capturas do sistema e ilustrações UnDraw. Três PNGs de marca excedem 1 MB e exigem otimização futura; não há evidência de fallback central para imagens informativas.
- Há testes estruturais de layout/rotas/transição e compatibilidade web. Não há Storybook nem suíte de screenshots versionada.

### Achados priorizados da Fase 1

| ID | Severidade | Arquivo/área | Evidência e causa raiz | Impacto | Correção planejada |
|---|---|---|---|---|---|
| DS-001 | P1 | `hooks/useScreenStyle.ts` | Hook mistura responsividade, tema, classes, cores e objetos nativos | Segunda fonte de verdade e rerenders desnecessários | Extrair design system estático e limitar hook ao estado/layout |
| DS-002 | P1 | `tailwind.config.js` | Ausência de tokens semânticos Lumus e `important: 'html'` | Valores mágicos e especificidade global | Adicionar tokens e remover important global |
| DS-003 | P1 | botões primários | Fundo amarelo com texto branco no tema claro | Contraste insuficiente em ação crítica | Texto `on-accent` escuro e estados canônicos |
| DS-004 | P1 | formulários | Inputs, selects e pickers repetem classes e styles | Divergência de foco, erro, disabled e altura | Variantes compartilhadas e adaptadores centralizados |
| DS-005 | P1 | `StaggeredMenu.css`/navigator | Navegação web possui tema e dimensões próprios | Shell diverge do restante e usa `!important` | Mover tokens e estrutura possível para Tailwind |
| DS-006 | P2 | fontes | `Obitron` aponta para asset inexistente; fontes locais não entram no layout ativo | Tipografia documentada não corresponde ao produto | Corrigir nomenclatura e declarar política canônica |
| DS-007 | P2 | estilos locais | 1.304 ocorrências de `style` e 1.322 hex lexicais | Manutenção e consistência frágeis | Migrar estáticos e registrar exceções por fronteira |
| DS-008 | P2 | listas extensas | Uso dominante de `ScrollView`/`map` em telas de milhares de linhas | Risco de memória e FPS em grandes históricos | Medir e migrar listas de alto volume em tarefa dedicada quando necessário |
| DS-009 | P2 | validação visual | Sem Storybook ou screenshots versionados | Regressões visuais não são detectadas automaticamente | Criar matriz mínima de screenshots web e checklist mobile |
| DS-010 | P3 | efeitos não utilizados | `Aurora` não possui consumidor encontrado | Código/CSS sem proprietário | Confirmar e remover após validação de build |

## Auditoria de `useScreenStyle.ts`

### Responsabilidades atuais

O hook lê tema, safe area e altura da janela, calcula a altura do hero e também fornece paletas, tokens de skeleton, cores de switches, objetos de estilo nativo, classes de formulário, tabela, modal, cards e mapas inteiros para dashboard web. Essa combinação torna o hook uma fonte visual paralela ao Tailwind e recria objetos a cada consumidor.

### Decisão arquitetural

1. Extrair tokens, classes e variantes estáticas para `design-system/`.
2. Manter `useScreenStyles` temporariamente como fachada compatível para os 54 consumidores.
3. Deixar no hook apenas tema, safe area, dimensões e a resolução de tokens exigida por APIs sem `className`.
4. Novos componentes devem importar variantes diretamente do design system; novos consumidores do hook são proibidos.
5. Migrar consumidores por grupos coerentes, sem alterar regras financeiras, contratos, permissões ou navegação.

## Arquitetura-alvo de estilização

1. `tailwind.config.js`: escala e tokens semânticos.
2. `global.css` e provider: tema global, color scheme e acessibilidade web.
3. `components/ui`: primitives e variantes (`tva`).
4. `design-system`: contratos de classe, adaptadores nativos e exceções.
5. componentes compostos e shells.
6. componentes de domínio financeiro.
7. telas, limitadas a composição e conteúdo.

## Registro de exceções ao Tailwind

| Arquivo/fronteira | Motivo e limitação | Risco | Alternativa considerada | Responsável |
|---|---|---|---|---|
| gráficos Mantine/Recharts/Gifted Charts | APIs recebem cores, dimensões e callbacks JS | paleta divergente | adaptador de tokens resolvidos | mantenedores do design system |
| `Grainient.jsx` | WebGL exige uniforms numéricos e canvas DOM | custo de GPU e contraste | classes apenas no container | mantenedores de UI web |
| `StrokeText.jsx` | SVG/GSAP exige medidas e propriedades SVG | movimento excessivo | classes no container + token CSS variável | mantenedores de UI web |
| callbacks de `Pressable.style` estritamente dinâmicos | RN expõe `pressed` pelo callback | duplicação de estados | variantes NativeWind quando o primitive expõe `data-[active]` | mantenedores de primitives |
| safe area, teclado e altura calculada | valores dependem de runtime nativo | salto de layout | classes para toda a geometria estática | mantenedores de layout |

Exceções específicas serão adicionadas após a migração e verificadas pelo lint de arquitetura.

## Checkpoint — Fases 2 a 5: centralização e linguagem canônica

**Status:** concluído para a arquitetura compartilhada e para os P1 identificados.

### Implementação consolidada

- `design-system/tokens.ts` concentra paletas claro/escuro, cores resolvidas para APIs externas, dimensões de layout, gráficos, navegação, hero, alertas e contratos canônicos de classe.
- `tailwind.config.js` agora declara cores semânticas Lumus, tipografia Arimo, escala de controles/toque, larguras de conteúdo, raios, sombras, z-index, durações, curvas e animações nomeadas. `important: 'html'` foi removido.
- `global.css` ficou restrito às camadas Tailwind, base de documento, `color-scheme` e redução de movimento. A importação CSS de Geist foi removida porque o Metro não incorporava os arquivos locais; Arimo, já carregada por Expo Font, tornou-se a fonte sans canônica.
- `design-system/web-dashboard.ts` e `design-system/web-forms.ts` concentram contratos estruturais antes armazenados no hook ou repetidos em telas.
- `design-system/mantine.ts` é a única ponte visual para Tabs, NumberInput, TagsInput e Pill do Mantine.
- `design-system/native-styles.ts` contém somente objetos exigidos por APIs nativas sem `className`.
- `components/ui` recebeu altura mínima de toque, foco visível, erro, disabled e contraste coerente nos primitives Button, Input, Textarea, Select, Switch, Checkbox e Radio.
- o cartão bancário duplicado em web/mobile foi substituído por `components/shared/banks/bank-card-surface.tsx`.
- os `StyleSheet.create` dos shells, loader, calendário, notifier e cartão foram removidos; a geometria estática foi migrada para NativeWind.
- `Aurora.jsx`/`Aurora.css`, sem consumidores, foram removidos.

### Resultado mensurável

| Métrica lexical | Antes | Depois | Controle futuro |
|---|---:|---:|---|
| propriedades `style` | 1.304 | 1.263 | limite global e por arquivo |
| hexadecimais fora das fontes canônicas | 1.322 | 1.275 | limite global e por arquivo |
| `StyleSheet.create` | 8 arquivos | 0 | falha imediata no lint |
| `!important` explícito | presente | 0 | falha imediata no lint |
| `transition-all` | presente | 0 | falha imediata no lint |
| utilitários Tailwind com prefixo `!` | presente | 0 | falha imediata no lint |
| consumidores de `useScreenStyles` | 54 | 54 | nenhum novo consumidor permitido pela linha de dívida por arquivo |

As 1.263 propriedades restantes não são declaradas como “migradas”. Elas formam uma linha de dívida por arquivo em `design-system/style-debt-baseline.json`. O lint impede aumento em qualquer arquivo e impede que um arquivo novo introduza essa dívida. As ocorrências incluem cores/dimensões de dados em gráficos, animações, SVG/WebGL, safe area, teclado, bibliotecas sem `className` e estilos estáticos legados de prioridade P2. A dívida estática restante deve apenas diminuir.

## Checkpoint — Fase 4: decisão final sobre `useScreenStyle.ts`

**Decisão:** manter como fachada de compatibilidade e migrar consumidores gradualmente.

O hook caiu de 583 para uma implementação focada em estado do tema, insets, dimensões, altura do hero e resolução de cores para APIs imperativas. Classes e mapas estruturais passaram a ser importados e reexportados do design system. Isso preserva os 54 contratos existentes e evita uma refatoração simultânea das regras financeiras das telas extensas. O lint fixa a lista atual de consumidores, portanto código novo deve importar classes e variantes diretamente de `design-system/` ou `components/ui/`.

As exceções de runtime do hook são altura calculada do hero, safe area e cores resolvidas para APIs nativas. Layout estático, tipografia, espaçamento, raio, sombra e estados não podem voltar ao hook.

## Checkpoint — Fases 6 a 8: auditoria por tela, formulários e componentes

### Fichas consolidadas por fluxo

| Fluxo/telas | Plataformas e tamanhos analisados | Componentes compartilhados | Padrões corretos | Inconsistências e causa raiz | Correção | Tailwind migrado | Exceções/risco residual |
|---|---|---|---|---|---|---|---|
| Login | código mobile/web; visual web 390×844 e 1440×900 | Input, Button, FormControl, Grainient, StrokeText | labels, senha revelável, disabled, teclado | tipografia quebrada no bundle; cabeçalho encolhia e sobrepunha Email no layout empilhado | Arimo canônica; tokens `login-*`; header `shrink-0`; card mobile `flex-none` | layout, alturas, raios, foco e tipografia | WebGL/SVG permanecem registrados; iOS/Android não renderizados |
| Home/dashboard | código mobile/web; testes de rota, ledger, heatmap e agenda | shell, cartão bancário compartilhado, gráficos, Carousel | loading, privacidade, vazio e dados financeiros preservados | mapa web dentro do hook; cartões duplicados; cores de gráficos dispersas | módulos dashboard/tokens e cartão único | estrutura web, cartões e shells | gráficos/data colors permanecem em APIs JS; tela autenticada sem captura visual |
| Cadastros financeiros | código das variantes web/mobile; testes de pós-envio, mensal, parcelas e categorias | primitives, WebSelectField, date/time picker | validação, loading e submissão já presentes | variantes de input e Mantine repetidas | contratos de formulário e adaptador Mantine | campos, foco, erro, disabled, ação primária | pickers mantêm valores resolvidos; estados não foram exercitados em dispositivo |
| Obrigatórios | código web/mobile; testes de parcelas, lembretes e sugestões | calendário, time picker, gráficos | vazio, carregando, confirmação, erro e lembrete | `StyleSheet` no calendário e styles Mantine locais | calendário em classes; conteúdo do ScrollView e Mantine centralizados | modal, calendário, tabs e NumberInput | APIs de picker/gráfico registradas |
| Listas e movimentos | código web/mobile; testes de ledger, migração e resumo | cards, tabelas/listas, modais, gráficos | retry, loading, vazio, detalhes e privacidade | arquivos grandes e duplicação entre plataformas | tokens, tabs, paletas e cartão compartilhado | shell, tabs, primitives e superfícies críticas | virtualização e estilos estáticos legados são P2; sem captura autenticada |
| Relatórios | código web/mobile; testes de forecast, categoria e investimentos | charts e filtros | números negativos, datas e privacidade | bibliotecas exigem props de cor/tamanho | paleta de gráficos centralizada | containers e estados compartilhados | canvas/SVG continuam como exceção |
| Assistente | código web/mobile; 9 suítes funcionais relacionadas | cards, drawer, áudio, gráficos | erro/retry, confirmação explícita, loading, privacidade | grande volume de estilos de paleta em runtime | tokens globais e primitives corrigidos | controles base | cards do assistente ainda concentram dívida P2 registrada por arquivo |
| Configurações e utilitários | código mobile/web fallback; testes de rotas | switches, selects, modais | disabled e confirmação | variantes locais e tela extensa | primitives canônicos e navegação tokenizada | controles compartilhados | telas fallback não foram renderizadas separadamente |

### Estados e acessibilidade

| Estado/requisito | Evidência | Resultado |
|---|---|---|
| normal/hover/pressed/active | variantes dos primitives e inspeção das classes | padronizado na camada compartilhada |
| foco por teclado | Tab no login web e foco visível no campo | aprovado |
| disabled/loading | botão de login inicia desabilitado; spinner/opacity em primitives | aprovado na camada compartilhada |
| inválido/erro | `FormControlError`, `aria`/labels e tokens de erro | preservado; não submetido contra produção |
| vazio/retry/sucesso | inventário de branches e testes funcionais | presente nas telas principais; sem screenshot autenticada |
| conteúdo longo/valores grandes | código usa wrapping, privacidade e formatadores financeiros | auditado em código; não coberto visualmente em todas as telas |
| toque | tokens `touch=44px` e `control=48px` | aprovado nos primitives migrados |
| contraste de ação primária | amarelo `lumus-accent` com texto branco (1,53:1) | preferência visual atual; legibilidade reduzida |
| reduced motion | media query global e `useReducedMotion`/`matchMedia` nos efeitos | aprovado em código; preferência não emulada visualmente |

## Registro de achados e correções

| ID | Tela/plataforma/viewport | Severidade | Arquivo/componente | Fonte anterior e evidência | Padrão esperado/causa | Impacto | Correção aplicada | Validação | Risco residual/exceção |
|---|---|---|---|---|---|---|---|---|---|
| DS-001 | todas | P1 | `hooks/useScreenStyle.ts` | 583 linhas com tokens, classes e objetos | hook deveria fornecer apenas layout/runtime | segunda fonte visual | extração para `design-system/*`; fachada preservada | type-check + 222 testes | 54 consumidores legados, sem crescimento permitido |
| DS-002 | todas | P1 | `tailwind.config.js`, `global.css` | sem tokens Lumus e `important: html` | Tailwind como fonte canônica | especificidade, magia e divergência | tokens semânticos, escalas, movimento e base global | lint + export web | upgrade Tailwind 4 permanece bloqueado pelo histórico |
| DS-003 | formulários | P1 | Button/Input/Select/etc. | primário amarelo com texto branco; estados divergentes | contraste e foco consistentes | ação crítica pouco legível | `on-accent` escuro, foco, toque, erro e disabled canônicos | inspeção visual + testes | componentes específicos ainda podem compor estados P2 |
| DS-004 | formulários web | P1 | Mantine e campos web | `styles` e classes repetidos nas telas | adaptador único | divergência entre cadastros | `design-system/mantine.ts` e `web-forms.ts` | type-check + testes | slots dependem da API Mantine registrada |
| DS-005 | navegação/shells | P1 | navigator, StaggeredMenu, app shells | cores locais, `StyleSheet`, `!important` | tokens e classes compartilhadas | shell diferente por plataforma | tokens de navegação, classes e remoção de especificidade forçada | lint + export | GSAP/CSS descendente registrado |
| DS-006 | app/login | P2 | `App.tsx`, fonte global | `Obitron` inexistente; Geist não empacotado | fonte local disponível e nome correto | fallback imprevisível | Orbitron corrigida; sans canônica Arimo; import Geist removido | export sem avisos de fonte | fontes decorativas continuam restritas |
| DS-007 | todas | P2 | baseline de dívida | estilos/hex/arbitrários espalhados | dívida monotonicamente decrescente | manutenção frágil | baseline por arquivo e lint bloqueando aumento | `npm run lint:styles` | 1.263 styles e 1.275 hex legados permanecem |
| DS-008 | listas extensas | P2 | telas de lista/movimentos | `ScrollView`/`map` em arquivos extensos | virtualização para grande volume | memória/FPS | sem alteração funcional nesta auditoria | testes funcionais | medir com dataset real antes da migração |
| DS-009 | validação visual | P2 | projeto | sem Storybook/snapshots | smoke visual mínimo | regressão tardia | matriz, inspeção CUA e teste de regressão do login | 390×844 e 1440×900 | telas autenticadas/mobile nativo pendentes |
| DS-010 | efeitos | P3 | Aurora | nenhum consumidor | código com proprietário | peso/manutenção | removido | export web | nenhum |
| DS-011 | login web móvel | P1 | `LoginScreen.web.tsx` | descrição terminava em 502px e Email iniciava em 473px | fluxo empilhado sem shrink | conteúdo sobreposto | tokens `login-card/login-shell/login-form`, `flex-none`, `shrink-0` | após: Email em 542px, 40px de folga, sem overflow | screenshot foi apenas do estado público |
| DS-012 | todas, web/Android/iOS | P1 | tokens e Button Gluestack | no tema escuro, `dark:text-yellow-300` prevalecia sobre `text-white`; `#FACC15`/branco mede 1,53:1 | manter o amarelo vivo e garantir texto branco em botão sólido | rótulos primários pareciam amarelos claros | classes de texto sólido separadas das variantes link/outline; fundo `lumus-accent` inalterado | style lint, `npm run check` (38/222) e export Web aprovados; contraste 1,53:1 registrado | contraste baixo aceito pela preferência visual; renderização nativa e screenshot autenticada não verificadas |
| DS-013 | campos e cards mobile | P1 | tokens, `Input`, `Select`, `Textarea` e seletores nativos | estado `focus` genérico era aplicado também aos contêineres/card; ao conter o amarelo, campos nativos perderam também a borda que os identifica em repouso | limitar foco aos controles, restaurar borda neutra nos campos e reservar o amarelo para foco | campos sem contorno eram difíceis de identificar e cards podiam herdar foco indevido | pseudo-estados de foco limitados à Web; campos nativos com borda neutra em repouso e contorno `lumus-accent` de 2 px no foco; cards preservam contorno neutro; pickers e action sheets indicam abertura com o mesmo amarelo | `npm run check` (38 suítes/222 testes), lint de estilos e exports Web/Android | Android/iOS não renderizados neste host; validar visualmente em aparelho |

## Exceções ao Tailwind

O registro executável está em `design-system/style-exceptions.json` e exige arquivo, motivo, limitação, risco, alternativa e responsável. As exceções aceitas são: variáveis do provider Gluestack; `contentContainerStyle` do calendário; container imperativo do notifier; cor de cartão como dado; WebGL/GSAP/SVG; transformações do Carousel/StaggeredMenu; props de gráficos; slots Mantine; e cores serializadas do DateTimePicker no `app.json`.

Estilos estáticos legados nas telas não são exceções aceitas. Eles aparecem em `style-debt-baseline.json`, têm prioridade P2 e não podem aumentar. Todo novo código visual deve usar Tailwind/NativeWind ou um adaptador central registrado.

## Checkpoint — Fase 9: validação final

### Comandos e resultados

| Verificação | Resultado |
|---|---|
| lint de arquitetura | aprovado: 1.263 `style`, 1.275 hex, 381 valores arbitrários, 54 consumidores; todos dentro do baseline por arquivo |
| type-check do app | aprovado |
| type-check do backend | aprovado |
| Jest | 38 suítes e 222 testes aprovados |
| export web | aprovado, 12.578 módulos; bundle JS principal 22,9 MB |
| console web público | nenhum warning/error capturado após o carregamento |
| mobile web 390×844 | sem overflow horizontal; sobreposição do login corrigida |
| desktop web 1440×900 | split layout, animação final, formulário e foco aprovados |
| teclado web | ordem Email → Senha confirmada; botão disabled não entra como ação inválida |

### Comparação antes/depois

| Antes | Depois |
|---|---|
| hook era uma segunda fonte visual | hook é fachada de runtime; classes ficam no design system |
| amarelo `#FACC15` + texto branco (1,53:1) | ação primária mantém `#FACC15` e texto branco conforme preferência visual atual |
| `StyleSheet.create`, `!important` e CSS sem controle | zero `StyleSheet.create`/`!important`; quatro CSS de efeitos registrados |
| componentes bancários duplicados | implementação compartilhada |
| fontes Orbitron/Geist quebradas ou não empacotadas | nomes válidos e Arimo local canônica |
| login móvel web com descrição sobre o label | 40px de separação medida |
| Jest falhava em UNC e incluía backend indevidamente | descoberta relativa e backend separado; toda a suíte aprovada |

### Plataformas e estados não verificados

- Android: `adb`/SDK não está disponível no host; não houve renderização em emulador ou dispositivo.
- iOS: não há simulador iOS neste host Windows.
- telas autenticadas: não foram abertas contra o projeto Firebase para evitar usar credenciais/dados externos durante uma auditoria visual local. Seus fluxos foram cobertos por inventário de código, testes e export.
- tema escuro, zoom do navegador, fonte ampliada, paisagem e reduced motion: regras foram auditadas no código, mas não foram todas emuladas visualmente nesta sessão.
- performance: o Chrome DevTools MCP exigido pela skill não está disponível. O bundle de 22,9 MB e as listas não virtualizadas permanecem riscos P2; nenhuma pontuação de Core Web Vitals foi inventada.

## Riscos residuais

1. A dívida visual legada ainda é alta nas telas de Home, listas, movimentos, obrigatórios e cards do assistente. O novo baseline impede regressão, mas a redução deve continuar por módulos compartilhados.
2. A falta de execução nativa impede afirmar equivalência pixel a pixel, comportamento do teclado e safe area em Android/iOS.
3. O bundle web principal de 22,9 MB pede divisão por rota e medição em navegador com DevTools.
4. Listas extensas precisam de dataset real e perfil de FPS/memória antes de uma migração segura para virtualização.

## Checklist de conformidade

- [x] 46 arquivos de tela e 24 rotas funcionais inventariados.
- [x] `useScreenStyle.ts`, 54 consumidores e abstrações de layout auditados.
- [x] Tailwind/NativeWind definido e protegido como padrão obrigatório.
- [x] tokens semânticos, primitives, formulários, navegação, cards, gráficos e movimento centralizados na camada compartilhada.
- [x] P0 inexistentes e P1 encontrados corrigidos.
- [x] exceções técnicas registradas com proprietário e risco.
- [x] ausência de novos `StyleSheet.create`, `!important`, `transition-all` e utilitários forçados.
- [x] lint, dois type-checks, testes e export web aprovados.
- [x] login web verificado em tamanhos representativos e com teclado.
- [ ] Android/iOS e telas autenticadas renderizados — indisponíveis nesta execução, conforme limitações acima.
- [ ] dívida P2 de estilos estáticos legados eliminada — baseline criado e redução progressiva exigida.
