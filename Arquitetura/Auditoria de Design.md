# Auditoria e padronização de design — Lumus Finanças

> Documento vivo. Cada fase registra evidências, alterações, validações e limitações para que a auditoria possa ser retomada sem perder contexto.

## Escopo e linha de base

- **Aplicação:** Expo Router 6, React Native 0.81, React 19.1, Gluestack UI 3, NativeWind 4.2.1 e Tailwind CSS 3.4.18.
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
| Investimento | mobile/web fallback | `/mobile/add-finance`, `/web/add-finance` | `screens/mobile/AddFinanceScreen.tsx` | formulário financeiro, seletores | `useScreenStyles`, NativeWind | Variante web não dedicada | P2 |
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
| contraste de ação primária | amarelo com `lumus-on-accent` escuro | corrigido |
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
| amarelo + texto branco na ação primária | amarelo + texto slate escuro com estados compartilhados |
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
