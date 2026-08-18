---
tags: [tema, dark-mode, ui, contexto]
relacionado: [[Configurações]], [[Componentes UI]], [[Hooks Customizados]], [[Privacidade de Valores]]
status: ativo
tipo: feature
versao: 1.0.10
---

# Sistema de Temas

Gerencia a alternância entre modo claro e escuro em todo o app, com persistência da preferência do usuário via AsyncStorage.

## Como funciona

1. `ThemeContext.tsx` inicializa lendo o tema salvo no `AsyncStorage`
2. Expõe `useAppTheme()` com: `themeMode`, `isDarkMode`, `toggleThemeMode()`
3. `toggleThemeMode()` alterna o tema e persiste a nova preferência no AsyncStorage
4. O tema é aplicado via:
   - `GluestackUIProvider` — adapta os componentes Gluestack ao tema
   - `useScreenStyle()` — hook que detecta `isDarkMode` e retorna estilos condicionais
   - Classes NativeWind `dark:` — estilos Tailwind condicionais ao tema
   - `webDashboardPalette` de `useScreenStyles()` — tokens do dashboard Web, evitando decisão claro/escuro dentro da tela
5. As versões `LoginScreen.tsx` e `.web.tsx` consomem os tokens de `useScreenStyles()`. Na Web, o painel em gradiente mantém a marca institucional independente do tema; no Android/iOS, o wallpaper é combinado ao logo claro/escuro. Conteúdo, campos, bordas e textos acompanham a preferência claro/escuro nas duas plataformas
6. Na tela de `Configurações`, o card do toggle exibe helper text, status da preferência e um popover inline ao lado do título para explicar o alcance da mudança

## Arquivos principais

- `contexts/ThemeContext.tsx` — Provider, estado e toggle
- `hooks/useScreenStyle.ts` — Estilos centralizados que reagem ao tema
- `components/ui/gluestack-ui-provider/` — Integração Gluestack com tema
- `global.css` — Entrada mínima das camadas Tailwind
- `tailwind.config.js` — Tokens do Gluestack, preset NativeWind e classes preservadas pela safelist

## Integrações

- [[Configurações]] — Toggle de tema na tela de configurações
- [[Componentes UI]] — Gluestack UI Provider consome o tema
- [[Hooks Customizados]] — `useScreenStyle` consome `isDarkMode`
- Todas as telas — consomem estilos via `useScreenStyle()`

## Configuração

- `global.css`: importa apenas as camadas `base`, `components` e `utilities` do Tailwind 3
- `tailwind.config.js`: usa `nativewind/preset`, `darkMode: 'class'` e tokens CSS do Gluestack
- Cores customizadas no Tailwind: `primary`, `secondary`, `tertiary`, `error`, `success`, `warning`, `info`
- Persistência via `@react-native-async-storage/async-storage` com chave dedicada

## Observações importantes

- O seletor Android de horários mantém o amarelo padrão do sistema em seus recursos nativos claro e escuro. Como é um diálogo do sistema, essa paleta é aplicada pelo plugin datetimepicker no build e não pelo NativeWind em tempo de execução; em projetos com diretório `android/` já gerado, rode o prebuild antes de recompilar para materializar `android:timePickerStyle`.
- O app não declara `userInterfaceStyle` nativo nem instala `expo-system-ui`; a preferência visual é controlada pelo próprio `ThemeContext`/Gluestack, evitando uma configuração nativa redundante
- NativeWind + Gluestack UI precisam estar sincronizados — mudança de tema reaplica classes Tailwind
- Quando uma tela depender de classes retornadas por `useScreenStyle()`, as classes completas precisam aparecer literalmente em arquivos cobertos por `content` ou na `safelist` do Tailwind; concatenar fragmentos arbitrários impede sua geração.
- A composição Web da Home mantém as classes Tailwind fixas em `WEB_DASHBOARD_CLASS_NAMES`, dentro de `hooks/useScreenStyle.ts`, e deixa na tela somente valores dinâmicos de tema ou layout; novos estilos estruturais do dashboard devem seguir esse mesmo ponto de centralização.
- Os estados selecionados de checkbox que representam ação principal devem manter o amarelo padrão do sistema, mesmo quando o componente base do Gluestack usar a cor `primary` do tema
- O toggle de tema em `Configurações` deve manter o mesmo alinhamento estrutural do toggle de privacidade, com label e popover no bloco esquerdo e `Switch` fixo à direita
