---
tags: [hooks, react, estilo, dados, home, tags, icones]
relacionado: [[Dashboard Home]], [[Sistema de Temas]], [[Componentes UI]], [[Gerenciamento de Tags]]
status: ativo
tipo: componente
versao: 1.5.0
---

# Hooks Customizados

Hooks React personalizados do projeto. Existem hooks centrais para fetching de dados da home, centralização de estilos, resolução de ícones de tags e comportamento de teclado em formulários.

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
2. Usa `useHomeQuery` (TanStack Query), com cache compartilhado por UID e TTL de 10 minutos; foco, reconexão e remount não refazem a consulta
3. Chama `getHomeSnapshotFirebase(personId)` somente em cache miss, expiração ou `reload()` explícito
4. Cada seção atualiza seu próprio estado de loading/error independentemente
5. Se `personId` for null/undefined, reseta todas as seções com mensagem de erro
6. Expõe `reload()` para pull-to-refresh/recarga manual, sem duplicar a lógica de busca

`overview.data.upcomingMandatoryItems` contém os próximos ciclos pendentes de gastos e ganhos obrigatórios para a Home Web. A seleção é feita no agregador, mantendo a tela sem consultas Firebase próprias.

No caminho legado, o agregador também consulta tags e sincronizações de investimentos para montar a timeline e o heatmap. A consulta dos compromissos obrigatórios é tolerante a falha e retorna uma lista vazia sem invalidar o restante do `overview`.

### Arquivo
- `hooks/useHomeScreenData.ts`

### Types exportados
- `HomeOverviewState`, `HomeMovementsState`, `HomeInvestmentsState`

---

## `useScreenStyles()`

> **Atenção:** O nome da função exportada é `useScreenStyles` (com 's'), embora o arquivo se chame `useScreenStyle.ts`.

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
| `fieldContainerClassName` | `string` | Classe de container de campo (h-10, bordas, foco amarelo) |
| `fieldBankContainerClassName` | `string` | Classe de container para seletores de banco com ícone e texto auxiliar, usando altura mínima maior que inputs simples |
| `fieldContainerClassNameNotSpace` | `string` | Idem sem altura fixa |
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

- `useScreenStyles` é a principal abstração de estilos do projeto — alterações aqui afetam todas as telas
- O foco amarelo (`#FFE000` / `yellow-300`) é o padrão visual principal do sistema para estados ativos
- Estados visuais de checkbox selecionado expõem `style` e classes juntos para garantir amarelo acima do estilo base do Gluestack
- Quando uma tela repetir estruturas de tabela, paginação ou larguras utilitárias, a preferência é promover as classes para `useScreenStyles` em vez de duplicá-las
- `useHomeScreenData` centraliza o fetching para evitar lógica complexa dentro de `HomeScreen.tsx`
- `useHomeScreenData` usa `useFocusEffect`, não `useEffect` — dados são recarregados a cada foco
- Nenhum estado global (Redux/Zustand) — app usa Context API + hooks locais para estado
- `useTagIcons` mantém o catálogo em `useMemo` para evitar recriação a cada render
