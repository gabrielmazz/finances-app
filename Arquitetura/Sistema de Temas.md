---
tags: [tema, dark-mode, ui, contexto]
relacionado: [[Configurações]], [[Componentes UI]], [[Hooks Customizados]], [[Privacidade de Valores]]
status: ativo
tipo: feature
versao: 1.1.0
---

# Sistema de Temas

Gerencia a alternância entre modo claro e escuro em todo o app, com persistência da preferência do usuário via AsyncStorage.

## Como funciona

1. `ThemeContext.tsx` inicializa lendo o tema salvo no `AsyncStorage`
2. Expõe `useAppTheme()` com: `themeMode`, `isDarkMode`, `toggleThemeMode()`
3. `toggleThemeMode()` alterna o tema e persiste a nova preferência no AsyncStorage
4. O tema é aplicado via:
   - `GluestackUIProvider` — adapta os componentes Gluestack ao tema
   - `design-system/tokens.ts` — fonte canônica de tokens semânticos, contratos de classes e valores resolvidos para APIs externas
   - `useScreenStyles()` — fachada de compatibilidade que fornece estado de tema/layout e tokens resolvidos exigidos por APIs sem `className`
   - Classes NativeWind `dark:` — estilos Tailwind condicionais ao tema
   - `webDashboardPalette` de `useScreenStyles()` — tokens do dashboard Web, evitando decisão claro/escuro dentro da tela
   - `navigator.web.tsx` → `StaggeredMenu` — passa `themeMode` e seleciona a paleta Web correspondente para a rail/painel
5. As versões `LoginScreen.tsx` e `.web.tsx` consomem os tokens de `useScreenStyles()`. Na Web, o painel em gradiente mantém a marca institucional independente do tema; no Android/iOS, o wallpaper é combinado ao logo claro/escuro. Conteúdo, campos, bordas e textos acompanham a preferência claro/escuro nas duas plataformas
6. Na tela de `Configurações`, o card do toggle exibe helper text, status da preferência e um popover inline ao lado do título para explicar o alcance da mudança

## Arquivos principais

- `contexts/ThemeContext.tsx` — Provider, estado e toggle
- `design-system/tokens.ts` — tokens semânticos, classes base e paletas resolvidas
- `design-system/web-dashboard.ts` / `web-forms.ts` / `mantine.ts` — contratos Web compartilhados
- `hooks/useScreenStyle.ts` — estado/layout em runtime e fachada temporária para consumidores existentes
- `components/ui/gluestack-ui-provider/` — Integração Gluestack com tema
- `global.css` — Entrada mínima das camadas Tailwind
- `tailwind.config.js` — Tokens do Gluestack, preset NativeWind e classes preservadas pela safelist

## Integrações

- [[Configurações]] — Toggle de tema na tela de configurações
- [[Componentes UI]] — Gluestack UI Provider consome o tema
- [[Hooks Customizados]] — `useScreenStyle` consome `isDarkMode`
- Todas as telas — consomem estilos via `useScreenStyle()`

## Configuração

- `global.css`: importa Geist e as camadas Tailwind 3; também define `color-scheme`, fundo base e redução de movimento para o navegador
- `tailwind.config.js`: usa `nativewind/preset`, `darkMode: 'class'` e tokens CSS do Gluestack
- Cores customizadas no Tailwind: escalas Gluestack e tokens semânticos `lumus-accent`, `lumus-accent-dark`, `lumus-accent-soft`, `lumus-on-accent`, `lumus-focus`, `lumus-surface-hover-dark`, `lumus-income-*` e `lumus-expense-*`; o contrato base de Tabs Mantine usa `shadow-lumus-accent`, enquanto o filtro de tipo do extrato bancário neutraliza essa sombra, fixa o fundo selecionado em `lumus-accent` (`#FACC15`) nos dois temas e usa texto branco. O placeholder do campo Mantine de categorias usa o token resolvido `#505D74`.
- Persistência via `@react-native-async-storage/async-storage` com chave dedicada

## Observações importantes

- O seletor Android de horários mantém o amarelo padrão do sistema em seus recursos nativos claro e escuro. Como é um diálogo do sistema, essa paleta é aplicada pelo plugin datetimepicker no build e não pelo NativeWind em tempo de execução; em projetos com diretório `android/` já gerado, rode o prebuild antes de recompilar para materializar `android:timePickerStyle`.
- O app não declara `userInterfaceStyle` nativo nem instala `expo-system-ui`; a preferência visual é controlada pelo próprio `ThemeContext`/Gluestack, evitando uma configuração nativa redundante
- NativeWind + Gluestack UI precisam estar sincronizados — mudança de tema reaplica classes Tailwind
- Quando uma tela depender de classes retornadas por `useScreenStyle()`, as classes completas precisam aparecer literalmente em arquivos cobertos por `content` ou na `safelist` do Tailwind; concatenar fragmentos arbitrários impede sua geração.
- A composição Web da Home mantém as classes Tailwind fixas em `design-system/web-dashboard.ts`; `useScreenStyles()` apenas reexporta o contrato durante a migração dos consumidores.
- `WEB_DASHBOARD_CLASS_NAMES.sectionHeadingText` é o contrato Web para títulos de seção: `text-lg font-bold uppercase tracking-widest`, alinhado ao cabeçalho do calendário recorrente e reutilizado na Home e na carteira.
- A ação primária sólida mantém o amarelo `lumus-accent` (`#FACC15`) e usa texto branco nos dois temas, conforme a preferência visual atual. Essa combinação mede 1,53:1 de contraste e tem legibilidade reduzida; os demais usos de `lumus-accent` preservam o foreground escuro `lumus-on-accent`. Na Web, inputs usam borda e anel `lumus-accent` ao receber foco; no Android/iOS, os campos mantêm borda neutra em repouso e mostram contorno `lumus-accent` de 2 px somente enquanto focados. Estados inválidos continuam com contorno vermelho, e cards preservam bordas neutras sem herdar o foco dos campos.
- `script/check_style_architecture.js` bloqueia crescimento de estilos inline, cores brutas, valores arbitrários, novos consumidores do hook, CSS isolado, `StyleSheet.create`, `!important`, `transition-all` e utilitários Tailwind com prefixo `!`.
- O `styles` prop do Mantine aceita estilos inline simples, sem pseudo-seletores; estados internos de Tabs e TagsInput usam `classNames` com variantes `data-*` no adaptador `design-system/mantine.ts`.
- Os estados selecionados de checkbox que representam ação principal devem manter o amarelo padrão do sistema, mesmo quando o componente base do Gluestack usar a cor `primary` do tema
- O toggle de tema em `Configurações` deve manter o mesmo alinhamento estrutural do toggle de privacidade, com label e popover no bloco esquerdo e `Switch` fixo à direita
