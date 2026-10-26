---
tags: [hooks, react, estilo, dados, home, tags, icones]
relacionado: [[Dashboard Home]], [[Sistema de Temas]], [[Componentes UI]], [[Gerenciamento de Tags]]
status: ativo
tipo: componente
versao: 1.7.0
spark_module: F10
spark_progress: 78
spark_reviewed_at: 2026-10-23
---

# Hooks Customizados

Continuação de 20/10/2026: `useSparkMovementForm` compartilha carregamento, intenção/reenvio e invalidação financeira entre os quatro formulários de despesa/receita. Sequência de carregamento descarta respostas substituídas, mudança de UID impede feedback/navegação e falha de invalidação não converte commit confirmado em erro financeiro. O estado da intenção permanece em memória; reload/desmontagem não é recuperação persistente de uma resposta incerta. Fluxos especiais e assistente continuam pendentes em [[Status da Implementação Spark]].

<!-- spark-progress:start -->
## Progresso Spark — 23/10/2026

**F10 — Home, extrato e análise por categoria: 78% implementado / 22% restante.** Notas P/I/D/E: **100/75/50/50**; cálculo e evidências em [[Status da Implementação Spark]].

O percentual corresponde ao módulo completo, incluindo integração e dados, e não somente ao serviço descrito nesta página. **Próxima entrega:** Completar ações especiais de referências/importados, medir leituras e homologar Web/aparelhos. Home usa projeção CDI somente com proveniência completa.

Esta revisão prevalece sobre listas de pendências datadas das entregas anteriores abaixo. Implementação local e logs não aprovam publicação nem migração real.
<!-- spark-progress:end -->

Hooks React personalizados do projeto. Existem hooks centrais para fetching de dados da home, centralização de estilos, resolução de ícones de tags e comportamento de teclado em formulários.

As classes estruturais das composições Web ficam em `design-system/web-dashboard.ts` e `design-system/web-forms.ts`. `useScreenStyles()` reexporta esses contratos somente para compatibilidade com consumidores existentes.

---

## `useHomeScreenData(personId)`

### O que faz
Busca e agrega todos os dados necessários para o [[Dashboard Home]] de forma assíncrona, com estados de loading e erro **individuais por seção**.

### Retorna
```typescript
{
  overview: HomeSectionState<HomeOverviewData>,
  movements: HomeSectionState<HomeMovementsData>,
  investments: HomeSectionState<HomeInvestmentsData>,
  reload: () => Promise<void>,
}

// Onde cada seção segue:
type HomeSectionState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
};
```

> **Nota:** Diferente de um estado flat com `isLoading` global, cada seção (overview, movements, investments) tem seu próprio `loading` e `error`. Isso permite que partes da tela carreguem independentemente.

### Como funciona
1. Recebe `personId` do usuário autenticado
2. Usa `useHomeQuery` (TanStack Query), com cache por UID. Caminhos anteriores conservam TTL de dez minutos e sem refetch automático em foco/reconexão/remount; Spark opta por revalidação nesses eventos
3. Chama `getHomeSnapshotFirebase(personId)` nas condições do transporte. Spark também agenda a conferência no primeiro vencimento de conta ativa; o prazo no cache não é autoridade para ler/escrever no servidor
4. Cada seção atualiza seu próprio estado de loading/error independentemente
5. Se `personId` for null/undefined, reseta todas as seções com mensagem de erro
6. Expõe `reload()` para pull-to-refresh/recarga manual, sem duplicar a lógica de busca

`overview.data.upcomingMandatoryItems` contém os próximos ciclos pendentes de gastos e ganhos obrigatórios para a Home Web. A seleção é feita no agregador, mantendo a tela sem consultas Firebase próprias.

No caminho legado, o agregador também consulta tags e sincronizações de investimentos para montar a timeline e o heatmap. Consultas auxiliares de compromissos, histórico e heatmap são tolerantes a falha e retornam listas vazias sem invalidar bancos, saldos e totais mensais do `overview`.

No Spark, `useHomeScreenData` oculta snapshot em cache durante a revalidação, após erro da consulta ou quando seu prazo de atualidade venceu. Cada seção conserva seu resultado/erro independente em uma fotografia vigente. `homeSnapshotFreshness` determina expiração e intervalo limitado do timer; sem abertura futura, não agenda polling. `FinanceDataContext` liga AppState ao `focusManager` do React Query no nativo, mantendo os defaults anteriores das outras consultas. Ver [[Dashboard Home]] para o leitor novo e suas limitações.

### Arquivo
- `hooks/useHomeScreenData.ts`

### Types exportados
- `HomeOverviewState`, `HomeMovementsState`, `HomeInvestmentsState`

---

## `useScreenStyles()`

> **Atenção:** O nome da função exportada é `useScreenStyles` (com 's'), embora o arquivo se chame `useScreenStyle.ts`. Desde a auditoria de 11/09/2026 ele é uma fachada de migração, não a fonte canônica de estilo.

### O que faz
Retorna constantes de estilo centralizadas que se adaptam ao modo dark/light. Elimina a duplicação de estilos condicionais em cada tela.

### Dependências internas
- `useAppTheme()` do [[Sistema de Temas|ThemeContext]] — detecta `isDarkMode`
- `useSafeAreaInsets()` — insets de área segura
- `useWindowDimensions()` — altura da janela para cálculo do hero

### Retorna (principais)

| Propriedade | Tipo | Descrição |
|---|---|---|
| `isDarkMode` | `boolean` | Modo escuro ativo |
| `headingText` | `string` | Classe de texto para títulos |
| `surfaceBackground` | `string` | Cor de fundo da tela (hex) |
| `cardBackground` | `string` | Classe bg de cards |
| `bodyText` | `string` | Classe de texto corpo |
| `helperText` | `string` | Classe de texto auxiliar |
| `inputField` | `string` | Classe de texto + placeholder para inputs |
| `labelText` | `string` | Classe de texto para labels |
| `fieldContainerClassName` | `string` | Fachada compatível para `LUMUS_FORM_CLASS_NAMES.input`: altura mínima `min-h-control` (48px), altura Web `h-control` (48px), padding e estados de foco compartilhados |
| `fieldBankContainerClassName` | `string` | Classe de container para seletores de banco com ícone e texto auxiliar, usando altura mínima maior que inputs simples |
| `fieldContainerClassNameNotSpace` | `string` | Idem sem altura fixa |
| `textareaContainerClassName` | `string` | Fachada compatível para `LUMUS_FORM_CLASS_NAMES.textarea`, incluindo texto, altura de 112px e foco compartilhados |

Novos formulários devem importar `LUMUS_FORM_CLASS_NAMES.label`/`inlineLabel` e aplicar `input`, `textarea` ou `select` conforme o controle. `labelText` permanece como token de cor legado para consumidores que ainda não migraram; não é o contrato tipográfico dos novos campos.
| `sectionCardClassName` | `string` | Classe de card de seção (rounded-3xl) |
| `tintedCardClassName` | `string` | Card com fundo sutil |
| `modalContentClassName` | `string` | Classe do conteúdo de modais |
| `drawerContentClassName` | `string` | Classe do conteúdo de drawers |
| `submitButtonClassName` | `string` | Botão de ação principal (amarelo) |
| `submitButtonCancelClassName` | `string` | Botão de cancelar |
| `submitButtonTextClassName` | `string` | Texto do botão submit |
| `accordionSectionButtonClassName` | `string` | Botão dentro de accordion (full-width) |
| `heroHeight` | `number` | Altura calculada do hero (28% da tela + inset) |
| `infoCardStyle` | `ViewStyle` | Estilo memoizado para info cards |
| `insets` | `Insets` | Safe area insets |
| `webDashboardPalette` | `object` | Tokens de superfície, borda, texto e acento para o dashboard Web, adaptados ao tema |
| `webDashboardClassNames` | `object` | Classes Tailwind estruturais compartilhadas pela `HomeScreen.web.tsx` |
| `webSelectClassNames` | `object` | Tokens de classes do select Web reutilizável: trigger, valor, placeholder, seta, menu, opção, seleção e estado desabilitado |
| `webTimePickerClassNames` | `object` | Tokens do campo Web de horário: trigger, seta, menu, colunas, títulos, lista rolável, opção e seleção; reaproveita a base do select |
| `WEB_DASHBOARD_DOM_STYLES` | `object` | Dimensões fixas serializadas para os componentes Expo DOM dos gráficos da Home Web |

### Estilos de Tabelas Administrativas

Classes compartilhadas para tabelas da [[Configurações]] e outras telas:

| Propriedade | Descrição |
|---|---|
| `tableBaseClassName` | Container base da tabela |
| `tableHeaderRowClassName` | Linha de cabeçalho |
| `tableRowClassName` | Linha de conteúdo |
| `tableHeadTextClassName` | Texto do header |
| `tableContentCellClassName` | Célula de conteúdo |
| `tableCaptionClassName` | Legenda da tabela |
| `tableActionsHeaderClassName` | Header da coluna de ações |
| `tableActionsCellClassName` | Célula de ações |
| `tableSingleActionColumnClassName` | Largura coluna 1 ação (76px) |
| `tableDoubleActionColumnClassName` | Largura coluna 2 ações (112px) |
| `tableIconButtonClassName` | Botão de ícone na tabela |
| `tablePrimaryIconClassName` | Cor de ícone principal (amarelo) |
| `tablePagination*` | Classes de paginação numérica |

### Estilos de Checkbox e Radio

| Propriedade | Descrição |
|---|---|
| `checkboxClassName` | Container do checkbox |
| `checkboxIndicatorClassName` | Indicador base |
| `checkboxIndicatorCheckedClassName` | Indicador checked (data-[checked]) |
| `checkboxIndicatorCheckedStyle` | Style object memoizado (amarelo) |
| `checkboxIconClassName` | Ícone do check |
| `switchRadioClassName` | Container do radio |
| `switchRadioIndicatorClassName` | Indicador radio checked |
| `switchTrackColor` | Cores do track do Switch |
| `switchThumbColor` | Cor do thumb do Switch |
| `switchActiveThumbColor` | Cor exclusiva da bolinha quando o Switch está ativo |

### Estilos de Skeleton

| Propriedade | Descrição |
|---|---|
| `skeletonBaseColor` | Cor base do skeleton |
| `skeletonHighlightColor` | Cor de highlight do skeleton |
| `skeletonMutedBaseColor` | Skeleton suave — base |
| `skeletonMutedHighlightColor` | Skeleton suave — highlight |

### Arquivo
- `hooks/useScreenStyle.ts`

---

## `useTagIcons()`

### O que faz
Hook centralizado para resolução, renderização e serialização de ícones de tags. Expõe o catálogo completo de ícones disponíveis e utilitários para lookup.

### Retorna
```typescript
{
  iconOptions: TagIconOption[];        // Catálogo completo (sorted por label pt-BR)
  defaultTagIcon: TagIconOption;       // Ícone padrão ("Categoria" / pricetag)
  resolveTagIcon(selection?): TagIconOption;   // Resolve seleção → opção completa
  getTagIconLabel(selection?): string;         // Retorna label do ícone
  serializeTagIcon(selection?): { iconFamily, iconName, iconStyle }; // Para persistir
}
```

### Famílias de Ícones Suportadas

| Família (valor) | Biblioteca React Native | Quantidade aprox. |
|---|---|---|
| `ionicons` | `@expo/vector-icons/Ionicons` | ~90 ícones |
| `material-community` | `@expo/vector-icons/MaterialCommunityIcons` | ~40 ícones |
| `font-awesome-6` | `@expo/vector-icons/FontAwesome6` | ~40 ícones (brands + solid) |

> **Importante:** A documentação anterior referenciava `MaterialIcons` e `FontAwesome`. O código real usa `MaterialCommunityIcons` e `FontAwesome6`.

### Componente `TagIcon`

O arquivo também exporta o componente `<TagIcon />` que renderiza o ícone correto baseado na família:

```typescript
<TagIcon
  iconFamily="ionicons"
  iconName="home-outline"
  size={20}
  color="#0F172A"
/>
```

### Serialização e Lookup

- `buildTagIconKey({iconFamily, iconName, iconStyle})` → chave única `family:name:style`
- `resolveTagIconSelection(selection)` → resolve parcial para opção completa, com fallback para default
- `serializeTagIconSelection(selection)` → formato para persistir no Firestore
- `TAG_ICON_OPTIONS` → lista exportada e ordenada de todos os ícones
- `DEFAULT_TAG_ICON` → "Categoria" (pricetag-outline do Ionicons)

### Arquivo
- `hooks/useTagIcons.tsx`

### Types exportados
- `TagIconFamily` — `'ionicons' | 'material-community' | 'font-awesome-6'`
- `TagIconStyle` — `'brand' | 'regular' | 'solid'`
- `TagIconSelection` — `{ iconFamily?, iconName?, iconStyle? }`
- `TagIconOption` — `{ key, label, iconFamily, iconName, iconStyle? }`

---

## `useKeyboardAwareScroll()`

### O que faz
Centraliza a rotina de foco dos inputs editáveis para manter campos de texto e número acima do teclado em telas com `ScrollView`.

### Como funciona
1. Recebe `getInputRef(key)` e `keyboardScrollOffset(key)` da tela
2. Expõe `scrollViewRef`, `handleInputFocus`, `handleScroll`, `scrollEventThrottle` e `contentBottomPadding`
3. Em Android/iOS, ao focar um campo, usa o scroll nativo até o teclado e faz rechecagens curtas enquanto o teclado abre; no navegador, não chama APIs nativas como `findNodeHandle`, pois o próprio browser mantém o elemento focado visível
4. Quando o teclado informa altura/posição, mede o input na janela e corrige a rolagem caso a borda inferior ainda esteja coberta
5. Todas as rechecagens agendadas ficam registradas; ao mudar o input focado, fechar o teclado, desmontar a tela ou recriar os listeners, o cleanup cancela os timers e limpa a referência obsoleta

### Arquivo
- `hooks/useKeyboardAwareScroll.ts`

### Observações
- Telas com campos editáveis em `ScrollView` devem usar este hook em vez de recriar listeners de teclado localmente.
- Inputs dentro de modais ou action sheets que não usam o `ScrollView` principal devem ser protegidos por `KeyboardAvoidingView` e área rolável própria.
- Timers de foco/medição nunca podem sobreviver ao unmount: callbacks tardios de `measure`, `scrollTo` ou animação não devem concorrer com uma troca de rota.

---

## Arquivos principais

- `hooks/useHomeScreenData.ts` — Fetching agregado setorizado para o Dashboard
- `hooks/useScreenStyle.ts` — Estilos centralizados adaptativos ao tema (exporta `useScreenStyles()`)
- `hooks/useTagIcons.tsx` — Catálogo de ícones, resolução, serialização e componente `<TagIcon />`
- `hooks/useKeyboardAwareScroll.ts` — Scroll/foco compartilhado para manter inputs acima do teclado

## Integrações

- [[Dashboard Home]] — `useHomeScreenData` é o hook principal da tela
- [[Sistema de Temas]] — `useScreenStyles` consome `useAppTheme()`
- [[Gerenciamento de Tags]] — `useTagIcons` fornece catálogo e renderização de ícones
- [[Componentes UI]] — Estilos de `useScreenStyles` são reaproveitados por componentes uiverse
- Telas de formulário — usam `useKeyboardAwareScroll` para campos textuais e numéricos em áreas roláveis
- Todas as telas — consomem `useScreenStyles()` para estilos consistentes
- `functions/HomeFirebase.ts` — Chamado internamente por `useHomeScreenData`

## Configuração

- Sem configuração especial — hooks puros React
- O diretório `hooks/` precisa estar listado no `content` do `tailwind.config.js` para evitar perda de classes NativeWind

## Observações importantes

- `design-system/` e os primitives `components/ui/` são as principais abstrações visuais. Alterações em `useScreenStyles` devem se limitar a layout/runtime e compatibilidade.
- O foco amarelo (`#FFE000` / `yellow-300`) é o padrão visual principal do sistema para estados ativos
- Estados visuais de checkbox selecionado expõem `style` e classes juntos para garantir amarelo acima do estilo base do Gluestack
- Quando uma tela repetir estruturas de tabela, paginação ou larguras utilitárias, promova as classes para `design-system/` ou para uma variante do primitive correspondente.
- `WEB_DASHBOARD_CLASS_NAMES`, em `design-system/web-dashboard.ts`, mantém a geometria Web compartilhada em `sheet`, `sheetInner`, `contentFrame` e `contentPadding`: gutter e padding de `24px` no mobile Web, `32px` a partir de `1024px`, e frame central de até `1180px`. O mesmo módulo mantém `WEB_DASHBOARD_DOM_STYLES` como exceção serializada para gráficos Expo DOM.
- `WEB_DASHBOARD_CLASS_NAMES.screen`, `.fill` e `.hero` usam `w-screen` para representar `100vw` sem violar `StyleProp<ViewStyle>`; mantenha a largura de viewport nesse mapa compartilhado ao ajustar Home ou o cadastro Web de despesas.
- `webSelectClassNames` deve permanecer no hook para que selects Web reutilizados compartilhem altura, contorno, padding, foco amarelo, hover, seleção e contraste claro/escuro; o componente `web-select-field.tsx` não deve duplicar esses tokens na tela.
- `webTimePickerClassNames` deve permanecer no hook e reaproveitar a base de `webSelectClassNames`; assim, `time-picker-field.web.tsx` mantém o mesmo trigger, seta, padding, menu e estados visuais do select sem espalhar classes específicas pela tela.
- `useHomeScreenData` centraliza o fetching para evitar lógica complexa dentro de `HomeScreen.tsx`
- `useHomeScreenData` usa `useHomeQuery`; foco/retorno e recarga seguem a política por transporte descrita acima, sem `useFocusEffect` local
- Nenhum estado global (Redux/Zustand) — app usa Context API + hooks locais para estado
- `useTagIcons` mantém o catálogo em `useMemo` para evitar recriação a cada render

## `useUserProfile()`

Carrega o documento próprio confirmado no servidor e controla nome/rascunho, validação, salvar/descartar e cópia do UID em [[Perfil do Usuário]]. Recarga manual, foco e retry preservam o rascunho e bloqueiam envio até nova leitura. Salvar compara o nome esperado em transação; conflito mantém a edição e pede atualização. Travas síncronas impedem submit/cópia concorrentes e recarga durante envio. Estado vinculado ao UID, sessão Auth real e geração impedem respostas de outra sessão. Resumo/vínculos falham independentemente. Revisão 24/10/2026; arquivo: `hooks/useUserProfile.ts`.

## `useCategoryAnalysisData(personId)`

Compartilhado pelas variantes Web e mobile da [[Análise por Categoria]]. Mantém o histórico padrão dos três meses fechados, valida datas, recarrega por foco e por mudança válida do intervalo e expõe carregamento, atualização, erro e recarga manual. Um identificador de requisição impede respostas de períodos ou usuários anteriores de substituir os dados atuais, inclusive após sair da tela. O hook não grava dados nem adiciona cache persistente.

- Arquivo: `hooks/useCategoryAnalysisData.ts`.
- Cálculos e limites de período: `utils/categoryAnalysis.ts`.

## useCategoryFormRecord(tagId)

Carregamento canônico compartilhado pelas telas Web/mobile de [[Gerenciamento de Tags]]. Expõe registro, carregamento, erro e reload. Consulta o servidor, confere sessão/proprietário, descarta resposta substituída/desmontada e bloqueia uso do registro anterior durante a recarga pós-edição. Na criação não lê documento. Não grava nem modifica preferências de navegação.

## useMovementFormEntry(options)

Compartilhado por [[Transações de Despesas]] e [[Transações de Receitas]] Web/mobile. Na criação aguarda initialize de useSparkMovementForm; na edição aguarda loadSpark e só lê a coleção antiga quando o contexto confirma legado. Expõe record, loading, ready, error e retry. Falha mantém ready falso; chave inclui ID e fonte para descartar respostas substituídas. UID é conferido antes de publicar. O hook prepara a entrada; não grava, não limpa rascunhos financeiros nem altera visibilidade.

## `useBankMovementsRequest(scope)` — 23/10/2026

Compartilhado pelos extratos Web/mobile: observa UID no AuthContext e cria um guard por consulta de banco/Caixa/período. `beginRequest` substitui a geração anterior; `cancelRequest` é usado no cleanup do foco, e desmontagem invalida os guards. Cada continuação assíncrona verifica também o UID atual do Firebase antes de publicar dados/erro/finalização. Não cancela a chamada de rede nem altera protocolo de gravação. UI limpa os valores no início e permite retry em falhas. Ver [[Gerenciamento de Bancos]].

## `useTransferFormData(sourceBankId, targetBankId)` — 23/10/2026

Reutiliza o seletor canônico de bancos, observa UID pelo AuthContext e compartilha os estados do catálogo e dos dois saldos entre os formulários de [[Transferências]]. Cada leitura tem chave por UID/conta/revisão de recarga; resultados de outras seleções/sessões são descartados e o saldo não é apresentado como zero após falha. `reload()` renova catálogo e ambas as posições conservando os campos da tela. Erro explicita retry e seleções que deixaram a lista ativa são recusadas. O hook apenas lê dados: não executa nem repete uma transferência.

## `useRescueFormData(selectedBankId)` — 23/10/2026

Compartilhado por [[Resgate de Caixa]] Web/mobile. Resolve Spark antes do razão anterior e legado, exige o Caixa canônico ativo no Spark e confirma o saldo da origem. Erro não escolhe outra fonte nem produz saldo zero. Chaves por UID, conta e revisão de recarga invalidam respostas antigas; banco que deixa o catálogo ativo é recusado. `reload()` limpa a posição anterior e reconfirma bancos/Caixa/saldo sem escrever dinheiro ou repetir envio. Expõe estados de carregamento, erro, ausência de banco e recarga para MovementFormStatus; o formulário preserva seus campos e sua intenção incerta.

## `useBankBalanceAdjustmentForm()` — revisão de 23/10/2026

Prepara [[Ajuste de Saldo]] nas composições Web/mobile. Chaves por UID/rota e por banco/data/recarga impedem reutilizar base ou preparação de outra seleção. Renovar prévia completa lê outra revisão; preparação parcial conserva o estado para continuar. Retém rascunho em rejeição, captura a fonte e o material de cada tentativa e bloqueia mutadores em envio/resultado incerto. `retryPending`, `fieldsLocked`, `submitError` e `completed` dirigem os estados persistentes do formulário compartilhado. Confirmação anterior independe de nova prévia disponível; falha de cache não reabre a gravação. Não navega nem anuncia resultados de sessão/rota substituída, e respeita foco no retorno ao extrato. IDs/preparação ainda vivem somente em memória.

## Recorrências: entrada e confirmação — 23/10/2026

`useSparkRecurringForm(tipo, formScope?)` acrescenta `initialize` e `isUncertain`. O escopo gerenciado de [[Despesas Fixas]] e [[Receitas Fixas]] aguarda a entrada por `useMovementFormEntry`; demais chamadores preservam a consulta inicial automática. UID/rota invalidam cargas e tentativas anteriores. Reset conserva o identificador do contexto Spark e não descarta definição confirmada com metadados pendentes. Invalidação de cache é separada da confirmação, incluindo falha síncrona.

`useSparkRecurringAction` expõe `isUncertain` e `hasPending()` para conservar a mesma confirmação no modal das listas. Troca de UID limpa a tentativa anterior; sucesso invalida consultas sem transformar erro de cache em reenvio financeiro. Cadastro/lista de despesas e receitas recorrentes reutilizam o guard de `useBankMovementsRequest` para categorias e consultas: é o mesmo mecanismo por UID/geração/foco, sem novo escritor ou alteração de protocolo. Intenções dos formulários continuam somente em memória.

## Investimentos: leitura e intenção por UID - 23/10/2026

AddFinance Web/mobile reutiliza `useTransferFormData` com a origem e destino nulo para bancos/saldo canônicos, erro/retry e recarga após sucesso. Não aplica `needsBanks`, pois um banco é suficiente. `useBankMovementsRequest` protege leitura da carteira e ações em escopos independentes.

`useSparkInvestmentForm` conserva trabalho por UID e descarta retornos antigos. `fieldsLocked` cobre envio, preparação parcial e resultado incerto; `isPending`/`hasPending()` mantêm confirmação e impedem reset de material pendente. `retryPending()` reenvia o rascunho capturado com o mesmo estado. A trava síncrona impede dois comandos simultâneos; invalidação de cache não converte sucesso em falha financeira. A identidade/prova geral continua em memória e não restaura todos os campos após reload. Ver [[Investimentos]].

## Análise por categoria: snapshot por consulta - 23/10/2026

`useCategoryAnalysisData(personId)` observa a sessão real via guard de `useBankMovementsRequest`. Estado por UID/período impede expor snapshots anteriores; geração/foco invalidam consultas antigas, inclusive de um mesmo intervalo. O hook captura falhas retornadas e exceções, encerra carregamento/refresh, limpa o relatório e permite retry. `isReady` autoriza exportação e `requestKey` identifica a consulta. Datas recebidas são copiadas. Não grava dados nem faz fallback por erro. As telas recebem o UID reativo do AuthContext e usam um escopo independente para exportar. Ver [[Análise por Categoria]].

## `useFinancialForecastData(personId, periodInMonths)` - 24/10/2026

Compartilhado por [[Previsão de Fluxo de Caixa]] Web/mobile. `useBankMovementsRequest` protege a consulta por UID, horizonte, foco e geração. Estado vinculado à chave impede exibir previsão anterior entre renderização e efeitos. Recarga limpa dados, falha retornada ou lançada encerra loading/refresh e expõe retry; sessão ausente permanece com erro, sem cenário zero. `loadForecast(asRefresh?)` lê somente o horizonte selecionado e não escreve dados nem muda a fonte após falha. As telas mantêm expansão/lista de compromissos como estado de apresentação, reiniciado quando a fotografia muda.

## `useUserRelationships()` - 24/10/2026

Compartilhado pelo formulário Web/mobile de [[Vínculos de Usuários Spark]]. Carrega listas com erro/retry, mantém ID/rascunho e prepara ação/snapshot/ID antes de confirmar. Trava síncrona bloqueia concorrência e mutação dos argumentos durante envio; resultado incerto permite somente a mesma confirmação. Erro definitivo pede nova revisão. UID real/reativo, foco, montagem e geração descartam respostas obsoletas. Blur cancela a continuidade/publicação; refoco destrava a confirmação incerta sem trocar a identidade. Sucesso recarrega a lista; formulário confirma feedback/pós-submit somente na tela focada e sessão atual. Nenhum papel/grupo é alterado.

## Investimentos na demonstração sem bootstrap - 25/10/2026

`useSparkInvestmentForm` reconhece o projeto Firestore `demo-lumus-financas`. Se `submitSparkInvestmentFormFirebase` retornar `null` por ausência de contexto Spark, retorna `{ success: false, error }` com orientação para a conta do seed, evitando que o operador `??` nas telas chame o legado. Essa recusa não cria intenção pendente, não invalida consultas como sucesso e permite fechar o formulário. Contexto nativo válido e retry incerto conservam seu contrato; fora da demonstração, `null` continua distinguindo o legado. Ver [[Investimentos]] e [[Guia de Testes Locais]].
